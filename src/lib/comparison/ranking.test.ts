import { describe, expect, it } from "vitest";
import { demoListingSeeds } from "@/lib/comparison/fixtures";
import {
  calculateEvidenceCompletenessScore,
  calculatePriceComponent,
  calculateSellerTrustScore,
  calculateValueScore,
  deriveMarketRead,
  deriveVariantIntent,
  finalizeListingScores,
  normalizeListing,
  rankListings,
  titleConditionFloor,
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

  it("uses listing id as the final tie-break so provider order cannot change lens winners", () => {
    const first = normalizeListing({
      listing: { ...demoListingSeeds[0], id: "listing-a" },
      buyer,
    });
    const second = normalizeListing({
      listing: { ...demoListingSeeds[0], id: "listing-b" },
      buyer,
    });

    const forward = rankListings([first, second]).map((choice) => choice.listingId);
    const reverse = rankListings([second, first]).map((choice) => choice.listingId);

    expect(forward).toEqual(reverse);
    expect(forward.every((id) => id === "listing-a")).toBe(true);
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

  it("compares an item-only market reference to item price, not shipping and tax", () => {
    const listing = normalizeListing({
      listing: {
        ...demoListingSeeds[0],
        demo: false,
        price: 380,
        shipping: 12,
        claimedCondition: "Near Mint",
      },
      buyer: { ...buyer, desiredCondition: "Near Mint" },
      marketPrice: 377.63,
    });

    expect(listing.estimatedLandedCost).toBe(423.36);
    expect(listing.priceScore).toBe(calculatePriceComponent(380, 377.63));
    expect(listing.priceScore).not.toBe(calculatePriceComponent(423.36, 377.63));

    const bestValue = rankListings([listing], { marketPrice: 377.63 })
      .find((choice) => choice.role === "best_value");
    expect(bestValue?.reason).not.toContain("costs +12% over");
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

  it("keeps the suspicious-price floor even when a Pokemon print is proven compatible", () => {
    const exactPokemonCard = {
      id: "swsh7-215",
      name: "Umbreon VMAX",
      setName: "Evolving Skies",
      setCode: "SWSH7",
      cardNumber: "215/203",
      language: "English",
      imageUrl: null,
      confidence: "high" as const,
      matchReasons: [],
    };
    const exactBargain = normalizeListing({
      listing: {
        ...demoListingSeeds[0],
        id: "exact-pokemon-bargain",
        title: "Umbreon VMAX 215/203 Evolving Skies Near Mint",
        price: 44,
        shipping: 0,
        claimedCondition: "Near Mint",
      },
      buyer: { ...buyer, desiredCondition: "Near Mint" },
      marketPrice: 100,
      confirmedCard: exactPokemonCard,
    });

    expect(exactBargain.printMatch).toBe("compatible");
    expect(exactBargain.eligible).toBe(false);
    expect(exactBargain.exclusionReasons).toContain(
      "Priced far below market — likely a replica, proxy, or mislabeled item.",
    );

    const unprovenMarketplaceListing = normalizeListing({
      listing: {
        ...demoListingSeeds[0],
        id: "unproven-pokemon-marketplace",
        marketplace: "eBay",
        title: "Umbreon VMAX Evolving Skies Near Mint",
        price: 90,
        shipping: 0,
        claimedCondition: "Near Mint",
      },
      buyer: { ...buyer, desiredCondition: "Near Mint" },
      marketPrice: 100,
      confirmedCard: exactPokemonCard,
    });
    expect(unprovenMarketplaceListing.printMatch).toBe("unknown");
    expect(unprovenMarketplaceListing.eligible).toBe(false);

    const unprovenBargain = normalizeListing({
      listing: {
        ...demoListingSeeds[0],
        id: "unproven-pokemon-bargain",
        title: "Umbreon VMAX card Near Mint",
        price: 20,
        shipping: 0,
        claimedCondition: "Near Mint",
      },
      buyer: { ...buyer, desiredCondition: "Near Mint" },
      marketPrice: 100,
    });
    expect(unprovenBargain.eligible).toBe(false);
    expect(unprovenBargain.exclusionReasons).toContain(
      "Priced far below market — likely a replica, proxy, or mislabeled item.",
    );
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

  it("still reports an item-price read for played conditions, flagged as not condition-matched", () => {
    // TCGCSV has no condition-level SKUs, so its anchor is effectively the NM
    // price. That makes a played copy's delta a real fact ("this is what it
    // costs against the NM reference") but not a bargain verdict. It used to be
    // suppressed entirely, so a buyer who filtered to anything other than Near
    // Mint saw no percentage at all.
    const live = { ...demoListingSeeds[0], demo: false, price: 800, shipping: 0 };
    const nmMatched = normalizeListing({
      listing: { ...live, claimedCondition: "Near Mint" },
      buyer: { ...buyer, desiredCondition: "Near Mint" },
      marketPrice: 1000,
    });
    expect(deriveMarketRead(nmMatched, 1000)).toEqual({ delta: -0.2, conditionMatched: true });

    const played = normalizeListing({
      listing: { ...live, claimedCondition: "Lightly Played" },
      buyer: { ...buyer, desiredCondition: "Lightly Played" },
      marketPrice: 1000,
    });
    expect(played.marketComparable).toBe(false);
    expect(deriveMarketRead(played, 1000)).toEqual({ delta: -0.2, conditionMatched: false });
    // The un-matched read must not leak into the value math as a price reward.
    expect(played.priceScore).toBe(50);

    // Nothing to compare against stays nothing: fabricated demo prices, missing
    // checkout cost, and an absent anchor all abstain.
    expect(deriveMarketRead(played, null)).toBeNull();
    expect(deriveMarketRead(played, 0)).toBeNull();
    expect(deriveMarketRead({ ...played, demo: true }, 1000)).toBeNull();
    expect(deriveMarketRead({ ...played, costComplete: false }, 1000)).toBeNull();
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

  it("keeps singles from Extra Booster sets while still excluding sealed product", () => {
    // "Booster" is part of the set name on every One Piece "Extra Booster: <set>"
    // single, so a bare word filter drops the raw singles it exists to protect.
    // Sealed product names the container; the set name never does.
    for (const title of [
      "Nami (053) Foil SR Extra Booster: One Piece Heroines Edition EB03-053 NM",
      "One Piece TCG Extra Booster: Heroines Edition EB03-053 Nami SR NM English Foil",
      "Nami R Foil Extra Booster: Anime 25th Collection EB02-017 NM One Piece TCG",
    ]) {
      const single = normalizeListing({
        listing: { ...demoListingSeeds[0], id: `single-${title}`, title },
        buyer,
      });
      expect(single.exclusionReasons.join(" "), title).not.toMatch(/sealed item/);
    }

    for (const title of [
      "One Piece OP-09 Booster Box Sealed English",
      "One Piece Emperors in the New World Booster Pack",
      "One Piece OP07 Booster Case",
      "One Piece Romance Dawn Booster Packs x10",
      "One Piece OP05 Booster-Box",
    ]) {
      const sealedProduct = normalizeListing({
        listing: { ...demoListingSeeds[0], id: `sealed-${title}`, title },
        buyer,
      });
      expect(sealedProduct.exclusionReasons.join(" "), title).toMatch(/sealed item/);
    }
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

  it("excludes 'extended art' novelty items however the title phrases them", () => {
    // Neither Pokémon nor One Piece has an "extended art" print class — it is a
    // Magic term. On eBay it always names an aftermarket item: a display case,
    // an acrylic stand, a DIY/custom card, or an art print that carries the real
    // card's name and collector number. The old filter required the exact phrase
    // "extended art case", so every other phrasing reached the buyer as a raw
    // single, sometimes as the recommended buy.
    for (const title of [
      "Umbreon VMAX 215/203 Extended Art Case Custom Display",
      "Umbreon VMAX Evolving Skies 215/203 Extended Art Display Case 3D",
      "Umbreon VMAX 215/203 Extended Art",
      "Pokemon Umbreon VMAX 215/203 Extended-Art Holo",
      "Umbreon VMAX Alt Art 215/203 EXTENDED ART Premium Art Case",
    ]) {
      const novelty = normalizeListing({ listing: { ...demoListingSeeds[0], id: title, title }, buyer });
      expect(novelty.eligible, title).toBe(false);
      expect(novelty.exclusionReasons.join(" "), title).toMatch(/not a raw single|sealed item|novelty/i);
    }

    // The real print classes must survive: "art rare", "alternate art", "full
    // art" and friends are genuine and must not be swept up by the filter.
    for (const title of [
      "Umbreon VMAX Alternate Art Secret Rare 215/203 Evolving Skies NM",
      "Monkey D. Luffy OP01-024 Alternate Art Romance Dawn NM",
      "Umbreon VMAX Full Art 215/203 NM English",
    ]) {
      const real = normalizeListing({ listing: { ...demoListingSeeds[0], id: title, title }, buyer });
      expect(real.exclusionReasons.join(" "), title).not.toMatch(/not a raw single/i);
    }
  });

  it("reports product eligibility before identity for a graded exact-print listing", () => {
    const graded = normalizeListing({
      listing: {
        ...demoListingSeeds[0],
        title: "Trafalgar Law Manga OP10-119 PSA 10",
      },
      buyer,
    });

    expect(graded.eligibilityIssues[0]).toMatchObject({
      category: "product",
      disposition: "exclude",
      code: "not_raw_single",
    });
  });

  it("keeps an unstated language as a review note and excludes only explicit conflicts", () => {
    const unstated = normalizeListing({
      listing: { ...demoListingSeeds[0], title: "Trafalgar Law Manga OP10-119" },
      buyer,
      cardLanguage: "English",
    });
    const japanese = normalizeListing({
      listing: { ...demoListingSeeds[0], title: "Trafalgar Law Manga OP10-119 Japanese card" },
      buyer,
      cardLanguage: "English",
    });
    const brazilian = normalizeListing({
      listing: {
        ...demoListingSeeds[0],
        title: "Mew EX 232/091 Bubble Card Pokemon TCG Brazilian Sv Paldean Fates Pack Fresh NM+",
      },
      buyer,
      cardLanguage: "English",
    });

    expect(unstated.eligibilityIssues).toContainEqual(expect.objectContaining({
      category: "language",
      disposition: "review",
      code: "language_unverified",
    }));
    expect(japanese.eligibilityIssues).toContainEqual(expect.objectContaining({
      category: "language",
      disposition: "exclude",
      code: "language_conflict",
    }));
    expect(brazilian.eligibilityIssues).toContainEqual(expect.objectContaining({
      category: "language",
      disposition: "exclude",
      code: "language_conflict",
    }));
  });

  // Observed 2026-08-14 while adjudicating Roronoa Zoro OP06-118: a $10 listing
  // titled "Roronoa Zoro FanArt SEC OP06-118", whose own Game aspect read "One
  // Piece FanArt", was a Japanese fan-made card stamped NOT FOR SALE. The list
  // already carried "fan made", "custom", and "proxy" — "fan art" fell straight
  // through all three and reached the buyer as a candidate for the real SEC.
  it("excludes fan art sold under a real card's name and number", () => {
    for (const title of [
      "Roronoa Zoro FanArt SEC OP06-118",
      "Roronoa Zoro Fan Art SEC OP06-118",
      "Roronoa Zoro fan-art SEC OP06-118",
    ]) {
      const fanArt = normalizeListing({ listing: { ...demoListingSeeds[0], id: "fan-art", title }, buyer });

      expect(fanArt.eligible, title).toBe(false);
      expect(fanArt.exclusionReasons, title).toContain("Title suggests a slab, lot, sealed item, proxy, or other excluded product.");
    }
  });

  // Observed 2026-08-14: the Best Value recommendation for OP07-053 was
  // "Portgas.D.Ace OP07-053 (Tournament Pack 2024 Oct-Dec) Playset (x4)" at $4.00
  // — four cards, compared against a one-card market anchor, so it also looked
  // like a bargain. "lot" and "N cards" were already filtered; the playset
  // phrasings were not.
  it("excludes multi-card playsets from raw-single ranking", () => {
    for (const title of [
      "Portgas.D.Ace OP07-053 (Tournament Pack 2024 Oct-Dec) Playset (x4)",
      "Portgas.D.Ace OP07-053 Play Set x4",
      "Portgas.D.Ace OP07-053 Tournament Pack (X2)",
    ]) {
      const playset = normalizeListing({ listing: { ...demoListingSeeds[0], id: "playset", title }, buyer });

      expect(playset.eligible, title).toBe(false);
      expect(playset.exclusionReasons, title).toContain("Title suggests a slab, lot, sealed item, proxy, or other excluded product.");
    }
  });

  it("keeps a single card whose title merely contains a number next to an x", () => {
    const single = normalizeListing({
      listing: { ...demoListingSeeds[0], id: "single", title: "Portgas.D.Ace OP07-053 Tournament Pack 2024 NM" },
      buyer,
    });

    expect(single.exclusionReasons).not.toContain("Title suggests a slab, lot, sealed item, proxy, or other excluded product.");
  });

  it("excludes TAG slabs from raw-single ranking", () => {
    const graded = normalizeListing({
      listing: { ...demoListingSeeds[0], id: "tag-slab", title: "Mew ex 232/091 TAG 8.5" },
      buyer,
    });

    expect(graded.raw).toBe(false);
    expect(graded.eligible).toBe(false);
    expect(graded.exclusionReasons).toContain("Title suggests a slab, lot, sealed item, proxy, or other excluded product.");
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

// Sellers routinely state a condition (or a range like "NM-LP") in the title
// while the structured condition field says Near Mint. A stated range counts as
// its worst case: an NM-minimum buyer must never be recommended a title that
// admits LP. Same defect class as the variant gate: title contradicts structure.
describe("title condition floor gate", () => {
  const nmBuyer = { ...buyer, desiredCondition: "Near Mint" as const };
  const lpBuyer = { ...buyer, desiredCondition: "Lightly Played" as const };
  const ebayNm = {
    ...demoListingSeeds[0],
    marketplace: "eBay" as const,
    userSupplied: false,
    raw: true,
    active: true,
    currency: "USD" as const,
    matchConfidence: "high" as const,
    claimedCondition: "Near Mint" as const,
    demo: false,
  };

  const excludedTitles = [
    // The reported bug, verbatim shape: structured NM, title admits LP.
    "Charmander 168/165 Scarlet & Violet 151 Illustration Rare Holo Pokemon NM-LP",
    "Charmander 168/165 NM/LP",
    "Charmander 168/165 LP-NM 151",
    "Charmander 168/165 Near Mint - Lightly Played",
    "Charmander 168/165 Lightly Played",
    "Charmander 168/165 LP",
    "Charmander 168/165 Moderately Played",
    "Charmander 168/165 MP",
    "Charmander 168/165 MP/HP played",
    "Charmander 168/165 Heavily Played",
    "Charmander 168/165 (HP) see photos",
    "Charmander 168/165 damaged see pics",
    "Charmander 168/165 DMG for parts",
    "Charmander 168/165 played condition",
  ];
  for (const title of excludedTitles) {
    it(`keeps an NM-minimum comparison off "${title}"`, () => {
      const listing = normalizeListing({ listing: { ...ebayNm, id: title, title }, buyer: nmBuyer });
      expect(listing.eligible).toBe(false);
      expect(listing.exclusionReasons.join(" ")).toMatch(/worst case|requested Near Mint/);
    });
  }

  const eligibleTitles = [
    // "HP" here is the Pokémon hit-points stat, not Heavily Played.
    "Charmander 70 HP 168/165 NM",
    "Charmander V 110HP Scarlet & Violet",
    "Charmander 168/165 NM",
    "Charmander 168/165 Near Mint Pokemon 151",
    "Charmander 168/165 Illustration Rare Holo",
  ];
  for (const title of eligibleTitles) {
    it(`keeps "${title}" eligible for an NM-minimum buyer`, () => {
      expect(normalizeListing({ listing: { ...ebayNm, id: title, title }, buyer: nmBuyer }).eligible).toBe(true);
    });
  }

  it("treats the floor relative to the buyer's minimum, not absolutely", () => {
    // NM-LP is fine for an LP-minimum buyer; LP/MP is not.
    const nmLp = { ...ebayNm, id: "nm-lp", title: "Charmander 168/165 NM-LP", claimedCondition: "Lightly Played" as const };
    const lpMp = { ...ebayNm, id: "lp-mp", title: "Charmander 168/165 LP/MP", claimedCondition: "Lightly Played" as const };
    expect(normalizeListing({ listing: nmLp, buyer: lpBuyer }).eligible).toBe(true);
    expect(normalizeListing({ listing: lpMp, buyer: lpBuyer }).eligible).toBe(false);
  });

  it("leaves any-condition buyers and user-supplied rows ungated by title condition", () => {
    const rangeTitle = { ...ebayNm, id: "any", title: "Charmander 168/165 NM-LP" };
    expect(normalizeListing({ listing: rangeTitle, buyer }).eligible).toBe(true);
    const pasted = { ...ebayNm, id: "pasted", title: "Charmander 168/165 NM-LP", userSupplied: true };
    expect(normalizeListing({ listing: pasted, buyer: nmBuyer }).eligible).toBe(true);
  });
});

describe("titleConditionFloor", () => {
  it("maps title condition wording onto the worst stated grade", () => {
    expect(titleConditionFloor("Charmander NM-LP")).toBe("Lightly Played");
    expect(titleConditionFloor("Charmander LP/MP")).toBe("Moderately Played");
    expect(titleConditionFloor("Charmander MP-HP")).toBe("Heavily Played");
    expect(titleConditionFloor("Charmander damaged NM")).toBe("Damaged");
    expect(titleConditionFloor("Charmander 70 HP NM")).toBe(null);
    expect(titleConditionFloor("Charmander Near Mint")).toBe(null);
    expect(titleConditionFloor("Charmander 168/165")).toBe(null);
  });
});

// Real eBay sellers frequently leave the TITLE plain (just card name + number)
// while eBay's own structured item specifics (fetched into `matchAspectText`,
// e.g. "Parallel/Variant: Alternate Art") do carry the print info. Requiring a
// marker in the title alone under-counts real matching supply — this is the
// root cause behind "50 listings found, 49 excluded as a different print".
// Widening the gate to read title + aspect text together must never weaken it:
// a foreign marker anywhere still excludes, an own-class marker anywhere still
// admits.
describe("aspect-text widened variant matching", () => {
  const ebayBase = {
    ...demoListingSeeds[0],
    marketplace: "eBay" as const,
    userSupplied: false,
    raw: true,
    active: true,
    currency: "USD" as const,
    matchConfidence: "high" as const,
    demo: false,
  };

  it("admits a plain-titled listing whose item specifics name the confirmed print", () => {
    const listing = {
      ...ebayBase,
      id: "plain-alt",
      title: "Nami OP01-016",
      matchAspectText: "Card Name: Nami. Parallel/Variant: Alternate Art. Rarity: R.",
    };
    expect(normalizeListing({ listing, buyer, variantIntent: "alt" }).eligible).toBe(true);
  });

  it("still excludes a plain-titled listing whose item specifics name a different print class", () => {
    const listing = {
      ...ebayBase,
      id: "plain-sp",
      title: "Nami OP01-016",
      matchAspectText: "Parallel/Variant: Special Art (SP).",
    };
    const result = normalizeListing({ listing, buyer, variantIntent: "alt" });
    expect(result.eligible).toBe(false);
    expect(result.exclusionReasons.join(" ")).toContain("SP");
  });

  it("keeps a base comparison off a plain title whose aspects reveal a secret-rare-alt parallel", () => {
    const listing = {
      ...ebayBase,
      id: "plain-secalt",
      title: "Shanks OP01-120",
      matchAspectText: "Rarity: SEC. Parallel/Variant: Secret Rare Alt.",
    };
    expect(normalizeListing({ listing, buyer, variantIntent: "base" }).eligible).toBe(false);
  });

  it("behaves exactly as before when matchAspectText is absent (no regression)", () => {
    const listing = { ...ebayBase, id: "no-aspect", title: "Nami OP01-016 Alternate Art" };
    expect(normalizeListing({ listing, buyer, variantIntent: "alt" }).eligible).toBe(true);
    expect(normalizeListing({ listing, buyer, variantIntent: "base" }).eligible).toBe(false);
  });

  it("does not let aspect text override an explicit title marker (foreign-in-title still wins over silence-in-aspects)", () => {
    const listing = {
      ...ebayBase,
      id: "title-wins",
      title: "Nami OP01-016 SP Special Art",
      matchAspectText: "Rarity: SP CARD.",
    };
    expect(normalizeListing({ listing, buyer, variantIntent: "sp" }).eligible).toBe(true);
  });

  it("widens the language gate the same way: aspect text can reveal a mismatched language", () => {
    const listing = {
      ...ebayBase,
      id: "jp-aspect",
      title: "Monkey.D.Luffy OP01-024",
      matchAspectText: "Language: Japanese.",
      claimedCondition: "Near Mint" as const,
    };
    expect(normalizeListing({ listing, buyer, cardLanguage: "EN" }).eligible).toBe(false);
    expect(normalizeListing({ listing, buyer, cardLanguage: "Japanese" }).eligible).toBe(true);
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
