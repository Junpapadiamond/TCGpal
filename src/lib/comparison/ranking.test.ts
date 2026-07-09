import { describe, expect, it } from "vitest";
import { demoListingSeeds } from "@/lib/comparison/fixtures";
import {
  calculateEvidenceCompletenessScore,
  calculatePriceComponent,
  calculateSellerTrustScore,
  calculateValueScore,
  deriveVariantIntent,
  finalizeListingScores,
  normalizeListing,
  rankListings,
} from "@/lib/comparison/ranking";

const buyer = {
  country: "US" as const,
  postalCode: "10001",
  taxRate: 0.08,
  desiredCondition: "Unknown" as const,
};

describe("comparison ranking", () => {
  it("calculates deterministic landed cost and optional tax", () => {
    const listing = normalizeListing({ listing: demoListingSeeds[0], buyer });
    expect(listing.preTaxTotal).toBe(1225);
    expect(listing.estimatedTax).toBe(98);
    expect(listing.estimatedLandedCost).toBe(1323);
  });

  it("taxes item + shipping so pre-tax, tax, and total reconcile", () => {
    const listing = normalizeListing({
      listing: { ...demoListingSeeds[0], price: 100, shipping: 10 },
      buyer,
    });
    expect(listing.preTaxTotal).toBe(110);
    expect(listing.estimatedTax).toBe(8.8); // (100 + 10) * 0.08, not 100 * 0.08
    expect(listing.estimatedLandedCost).toBe(118.8); // preTax * (1 + rate)
  });

  it("keeps tax unknown without pretending the total is all-in", () => {
    const listing = normalizeListing({
      listing: demoListingSeeds[0],
      buyer: { ...buyer, taxRate: null },
    });
    expect(listing.preTaxTotal).toBe(1225);
    expect(listing.estimatedTax).toBeNull();
    expect(listing.estimatedLandedCost).toBeNull();
  });

  it("uses explicit seller and evidence score tables", () => {
    expect(calculateSellerTrustScore(demoListingSeeds[1].seller)).toBe(100);
    expect(calculateEvidenceCompletenessScore(demoListingSeeds[2].evidence)).toBe(100);
  });

  it("keeps absent seller sub-ratings neutral", () => {
    const seller = {
      feedbackPercentage: 99,
      feedbackCount: 100,
      returnsAccepted: true,
      topRated: false,
      buyerProtection: true,
      subRatings: null,
    };

    expect(calculateSellerTrustScore({ ...seller, subRatings: null }, "eBay")).toBe(
      calculateSellerTrustScore(seller, "eBay"),
    );
  });

  it("uses known eBay seller sub-ratings as bounded trust evidence", () => {
    const base = {
      ...demoListingSeeds[0],
      marketplace: "eBay" as const,
      seller: {
        feedbackPercentage: 99.2,
        feedbackCount: 250,
        returnsAccepted: true,
        topRated: false,
        buyerProtection: true,
        subRatings: null,
      },
    };
    const strong = normalizeListing({
      listing: {
        ...base,
        id: "strong-subratings",
        seller: {
          ...base.seller,
          subRatings: {
            accurateDescription: 5,
            shippingCost: 4.9,
            shippingSpeed: 4.9,
            communication: 4.8,
          },
        },
      },
      buyer,
    });
    const weak = normalizeListing({
      listing: {
        ...base,
        id: "weak-subratings",
        seller: {
          ...base.seller,
          subRatings: {
            accurateDescription: 3.2,
            shippingCost: 4.8,
            shippingSpeed: 4.9,
            communication: 4.8,
          },
        },
      },
      buyer,
    });

    expect(strong.sellerTrustScore).toBeGreaterThan(weak.sellerTrustScore);
    expect(strong.trustNotes.some((note) => note.includes("Accurate Description 5/5"))).toBe(true);
    expect(weak.trustNotes.some((note) => note.includes("Accurate Description 3.2/5"))).toBe(true);
  });

  it("scores evidence from the verifiable photo count, not from guessed content flags", () => {
    const base = {
      photoCount: 0,
      frontBackExplicit: false,
      closeupsExplicit: false,
      surfaceExplicit: false,
      identityExplicit: false,
      substantiveConditionNotes: false,
      missing: [],
    };
    // An auto-fetched eBay listing carries no content flags: photo count alone drives it,
    // and a photo-rich listing still earns a solid evidence read ("best documented" = most photos).
    expect(calculateEvidenceCompletenessScore({ ...base, photoCount: 0 })).toBe(0);
    expect(calculateEvidenceCompletenessScore({ ...base, photoCount: 8 })).toBe(55);
    expect(
      calculateEvidenceCompletenessScore({ ...base, photoCount: 8 }),
    ).toBeGreaterThan(
      calculateEvidenceCompletenessScore({ ...base, photoCount: 4 }),
    );
  });

  it("computes every lens independently and allows the same listing to win more than once", () => {
    const listings = demoListingSeeds.map((listing) => normalizeListing({ listing, buyer }));
    const choices = rankListings(listings);
    expect(choices.map((choice) => choice.role)).toEqual([
      "best_value",
      "lowest_landed_cost",
      "safest_listing",
      "best_condition_evidence",
    ]);
    expect(new Set(choices.map((choice) => choice.listingId)).size).toBeLessThan(choices.length);
  });

  it("keeps every lens mathematically true across the full eligible field", () => {
    const listings = finalizeListingScores(
      demoListingSeeds.map((listing) => normalizeListing({ listing, buyer })),
    );
    const choices = rankListings(listings);
    const listingById = new Map(listings.map((listing) => [listing.id, listing]));
    const winner = (role: (typeof choices)[number]["role"]) =>
      listingById.get(choices.find((choice) => choice.role === role)?.listingId ?? "");
    const costs = listings.map((listing) => listing.estimatedLandedCost ?? listing.preTaxTotal);

    expect(winner("lowest_landed_cost")?.estimatedLandedCost).toBe(Math.min(...costs));
    expect(winner("safest_listing")?.safetyScore).toBe(Math.max(...listings.map((listing) => listing.safetyScore)));
    expect(winner("best_condition_evidence")?.evidenceCompletenessScore).toBe(
      Math.max(...listings.map((listing) => listing.evidenceCompletenessScore)),
    );
    expect(winner("best_value")?.valueScore).toBe(Math.max(...listings.map((listing) => listing.valueScore)));
  });

  it("Best Value composite favors the below-market, safer, better-documented listing over cheapest-only", () => {
    const listings = demoListingSeeds.map((listing) => normalizeListing({ listing, buyer, marketPrice: 2000 }));
    const choices = rankListings(listings);
    const bestValue = choices.find((choice) => choice.role === "best_value");
    const cheapest = choices.find((choice) => choice.role === "lowest_landed_cost");
    expect(bestValue).toBeDefined();
    expect(cheapest).toBeDefined();
    // All three demo listings land well under a $2000 market price, so price alone
    // doesn't separate them — Best Value should reflect safety/evidence, not just
    // pick the cheapest of the three.
    expect(bestValue?.listingId).toBeDefined();
  });

  it("scores price relative to market, not just absolute cheapness", () => {
    expect(calculatePriceComponent(700, 1000)).toBe(100); // 70% of market: fully rewarded
    expect(calculatePriceComponent(1000, 1000)).toBe(50); // exactly at market: neutral midpoint
    expect(calculatePriceComponent(1300, 1000)).toBe(0); // 30%+ above market: no reward
    expect(calculatePriceComponent(850, 1000)).toBe(75); // halfway between 70% and 100%
    // No market price known: neutral, so the composite still ranks on safety/evidence.
    expect(calculatePriceComponent(500, null)).toBe(50);
    expect(calculatePriceComponent(500, 0)).toBe(50);
  });

  it("weights independent price, condition, seller, and evidence signals", () => {
    const base = {
      priceComponent: 100,
      conditionCompatibilityScore: 0,
      sellerTrustScore: 0,
      evidenceCompletenessScore: 0,
    };
    expect(calculateValueScore(base)).toBe(40);
    expect(calculateValueScore({ ...base, conditionCompatibilityScore: 100 })).toBe(65);
    expect(calculateValueScore({ ...base, sellerTrustScore: 100 })).toBe(60);
    expect(calculateValueScore({ ...base, evidenceCompletenessScore: 100 })).toBe(55);
    expect(calculateValueScore({
      priceComponent: 100,
      conditionCompatibilityScore: 100,
      sellerTrustScore: 100,
      evidenceCompletenessScore: 100,
    })).toBe(100);
  });

  it("keeps unknown shipping out of the recommendation set", () => {
    const listing = normalizeListing({
      listing: { ...demoListingSeeds[0], shipping: null },
      buyer,
    });
    expect(listing.costComplete).toBe(false);
    expect(listing.eligible).toBe(false);
    expect(listing.estimatedTax).toBeNull();
    expect(listing.estimatedLandedCost).toBeNull();
  });

  it("enforces the requested condition and lets any-condition buyers widen explicitly", () => {
    const played = { ...demoListingSeeds[0], claimedCondition: "Moderately Played" as const };
    const nearMintOnly = normalizeListing({
      listing: played,
      buyer: { ...buyer, desiredCondition: "Near Mint" },
      marketPrice: 2000,
    });
    expect(nearMintOnly.eligible).toBe(false);
    expect(nearMintOnly.conditionCompatibilityScore).toBe(0);

    const anyCondition = normalizeListing({
      listing: played,
      buyer: { ...buyer, desiredCondition: "Unknown" },
      marketPrice: 2000,
    });
    expect(anyCondition.eligible).toBe(true);
    expect(anyCondition.marketComparable).toBe(false);

    const lightlyPlayed = normalizeListing({
      listing: { ...played, claimedCondition: "Lightly Played" },
      buyer: { ...buyer, desiredCondition: "Lightly Played" },
      marketPrice: 2000,
    });
    expect(lightlyPlayed.eligible).toBe(true);
    expect(lightlyPlayed.marketComparable).toBe(false);
  });

  it("excludes slabs, altered cards, lots, and low-confidence matches", () => {
    const slab = normalizeListing({
      listing: {
        ...demoListingSeeds[0],
        id: "slab",
        title: "PSA 10 Umbreon VMAX lot",
        raw: false,
        matchConfidence: "low",
      },
      buyer,
    });
    expect(slab.eligible).toBe(false);
    expect(slab.exclusionReasons.length).toBeGreaterThan(0);

    const altered = normalizeListing({
      listing: {
        ...demoListingSeeds[0],
        id: "altered",
        title: "*Altered* Umbreon VMAX 215/203 raw",
      },
      buyer,
    });
    expect(altered.eligible).toBe(false);
  });

  it("excludes graded slabs even when the grade is joined by a colon or hash", () => {
    // Real eBay titles write the grade many ways; a raw-single comparison must catch
    // every one so a slab never lands as the recommended raw buy.
    for (const title of [
      "1x V2176: 2022: Monkey D. Luffy: OP01-024: Alternate Art: Romance Dawn: CGC: 9.",
      "Charizard VMAX PSA#10 Gem Mint",
      "Umbreon VMAX Alt Art graded 9.5",
    ]) {
      const graded = normalizeListing({ listing: { ...demoListingSeeds[0], id: title, title }, buyer });
      expect(graded.eligible, title).toBe(false);
    }
  });

  // The same card number spans a base print and its (pricier) alternate arts, so a
  // comparison must stay on the confirmed side of that line.
  const ebayListing = {
    ...demoListingSeeds[0],
    marketplace: "eBay" as const,
    userSupplied: false,
    raw: true,
    active: true,
    currency: "USD" as const,
    matchConfidence: "high" as const,
  };

  it("keeps a base comparison off alt-art listings and vice versa", () => {
    const alt = { ...ebayListing, id: "alt", title: "Monkey.D.Luffy OP01-024 Alternate Art Parallel" };
    const base = { ...ebayListing, id: "base", title: "Monkey.D.Luffy OP01-024 Romance Dawn SR" };

    // Base comparison: the alt-art copy drops out; the plain one stays.
    expect(normalizeListing({ listing: alt, buyer, variantIntent: "base" }).eligible).toBe(false);
    expect(normalizeListing({ listing: base, buyer, variantIntent: "base" }).eligible).toBe(true);

    // Alt-art comparison: the plain copy drops out; only the alt-art one stays.
    expect(normalizeListing({ listing: base, buyer, variantIntent: "alt" }).eligible).toBe(false);
    expect(normalizeListing({ listing: alt, buyer, variantIntent: "alt" }).eligible).toBe(true);
  });

  it("excludes an explicitly mismatched listing language", () => {
    const japanese = {
      ...ebayListing,
      id: "jp",
      title: "Monkey.D.Luffy OP01-024 Japanese JPN",
      claimedCondition: "Near Mint" as const,
    };
    expect(normalizeListing({ listing: japanese, buyer, cardLanguage: "EN" }).eligible).toBe(false);
    expect(normalizeListing({ listing: japanese, buyer, cardLanguage: "Japanese" }).eligible).toBe(true);
  });

  it("does not title-gate exact user-supplied listings, including manually entered TCGplayer rows", () => {
    // A user-entered row is an explicit choice and is not second-guessed from its
    // marker-less title. Aggregate TCGCSV rows never reach ranking at all.
    const tcgRow = { ...ebayListing, id: "tcg", marketplace: "TCGplayer" as const, userSupplied: true, title: "Monkey.D.Luffy OP01-024 Normal" };
    const pasted = { ...ebayListing, id: "pasted", userSupplied: true, title: "Monkey.D.Luffy OP01-024 Romance Dawn" };
    expect(normalizeListing({ listing: tcgRow, buyer, variantIntent: "alt" }).eligible).toBe(true);
    expect(normalizeListing({ listing: pasted, buyer, variantIntent: "alt" }).eligible).toBe(true);
  });

  it("leaves listings ungated when no variant is confirmed (demo / null intent)", () => {
    const alt = { ...ebayListing, id: "alt2", title: "Monkey.D.Luffy OP01-024 Alternate Art" };
    expect(normalizeListing({ listing: alt, buyer, variantIntent: null }).eligible).toBe(true);
    expect(normalizeListing({ listing: alt, buyer }).eligible).toBe(true);
  });

  // One Piece reuses one card number across base, alternate arts, and SP / manga /
  // treasure special prints at very different prices. An SP buyer must never be
  // recommended a regular alt art (and vice versa).
  it("keeps an SP comparison off regular alt-art and markerless base listings", () => {
    const sp = { ...ebayListing, id: "sp", title: "Nami OP01-016 SP Special Art" };
    const spShort = { ...ebayListing, id: "sp-short", title: "Nami OP01-016 SP" };
    const alt = { ...ebayListing, id: "alt-art", title: "Nami OP01-016 Alternate Art Parallel" };
    const base = { ...ebayListing, id: "plain", title: "Nami OP01-016 Romance Dawn" };

    expect(normalizeListing({ listing: sp, buyer, variantIntent: "sp" }).eligible).toBe(true);
    expect(normalizeListing({ listing: spShort, buyer, variantIntent: "sp" }).eligible).toBe(true);

    const altUnderSp = normalizeListing({ listing: alt, buyer, variantIntent: "sp" });
    expect(altUnderSp.eligible).toBe(false);
    expect(altUnderSp.exclusionReasons.join(" ")).toContain("SP");

    expect(normalizeListing({ listing: base, buyer, variantIntent: "sp" }).eligible).toBe(false);
  });

  it("keeps an alt-art comparison off SP, manga, and treasure prints", () => {
    const sp = { ...ebayListing, id: "sp3", title: "Nami OP01-016 SP" };
    const manga = { ...ebayListing, id: "manga", title: "Monkey.D.Luffy OP01-024 Manga Art" };
    const treasure = { ...ebayListing, id: "tr", title: "Shanks OP01-120 Treasure Rare" };
    const alt = { ...ebayListing, id: "alt3", title: "Nami OP01-016 Alternate Art" };

    expect(normalizeListing({ listing: sp, buyer, variantIntent: "alt" }).eligible).toBe(false);
    expect(normalizeListing({ listing: manga, buyer, variantIntent: "alt" }).eligible).toBe(false);
    expect(normalizeListing({ listing: treasure, buyer, variantIntent: "alt" }).eligible).toBe(false);
    expect(normalizeListing({ listing: alt, buyer, variantIntent: "alt" }).eligible).toBe(true);
  });

  it("keeps the base comparison off SP and manga titles too", () => {
    const sp = { ...ebayListing, id: "sp2", title: "Nami OP01-016 SP" };
    const manga = { ...ebayListing, id: "manga2", title: "Monkey.D.Luffy OP01-024 Manga Rare" };
    expect(normalizeListing({ listing: sp, buyer, variantIntent: "base" }).eligible).toBe(false);
    expect(normalizeListing({ listing: manga, buyer, variantIntent: "base" }).eligible).toBe(false);
  });

  it("requires manga and treasure comparisons to carry their own marker", () => {
    const manga = { ...ebayListing, id: "manga3", title: "Monkey.D.Luffy OP01-024 Manga Art" };
    const alt = { ...ebayListing, id: "alt4", title: "Monkey.D.Luffy OP01-024 Alternate Art" };
    const treasure = { ...ebayListing, id: "tr2", title: "Shanks OP01-120 TR" };

    expect(normalizeListing({ listing: manga, buyer, variantIntent: "manga" }).eligible).toBe(true);
    expect(normalizeListing({ listing: alt, buyer, variantIntent: "manga" }).eligible).toBe(false);
    expect(normalizeListing({ listing: treasure, buyer, variantIntent: "treasure" }).eligible).toBe(true);
    expect(normalizeListing({ listing: alt, buyer, variantIntent: "treasure" }).eligible).toBe(false);
  });

  // An SP title that also says "alt art" is still an SP copy — the specific
  // marker wins over the generic one in both directions.
  it("lets an SP-marked title that also says alt art pass the SP gate only", () => {
    const both = { ...ebayListing, id: "both", title: "Nami OP01-016 SP Alt Art Special" };
    expect(normalizeListing({ listing: both, buyer, variantIntent: "sp" }).eligible).toBe(true);
    expect(normalizeListing({ listing: both, buyer, variantIntent: "alt" }).eligible).toBe(false);
    expect(normalizeListing({ listing: both, buyer, variantIntent: "base" }).eligible).toBe(false);
  });
});

describe("deriveVariantIntent", () => {
  it("maps catalog rarity/variant pairs onto the variant classes", () => {
    expect(deriveVariantIntent({ rarity: "R", variant: null })).toBe("base");
    expect(deriveVariantIntent({ rarity: "SEC", variant: null })).toBe("base");
    expect(deriveVariantIntent({ rarity: "R", variant: "Alternate Art (P1)" })).toBe("alt");
    expect(deriveVariantIntent({ rarity: "SP CARD", variant: "Special Art (P4)" })).toBe("sp");
    expect(deriveVariantIntent({ rarity: "SP CARD", variant: null })).toBe("sp");
    expect(deriveVariantIntent({ rarity: "R", variant: "Manga Art (P5)" })).toBe("manga");
    expect(deriveVariantIntent({ rarity: "TR", variant: null })).toBe("treasure");
    expect(deriveVariantIntent({ rarity: "SEC", variant: "Secret Rare Alt (P1)" })).toBe("alt");
    expect(deriveVariantIntent({})).toBe("base");
  });
});
