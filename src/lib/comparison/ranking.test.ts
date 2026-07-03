import { describe, expect, it } from "vitest";
import { demoListingSeeds } from "@/lib/comparison/fixtures";
import {
  calculateEvidenceCompletenessScore,
  calculateSellerTrustScore,
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

  it("returns distinct, stable role winners", () => {
    const listings = demoListingSeeds.map((listing) => normalizeListing({ listing, buyer }));
    const choices = rankListings(listings);
    expect(choices.map((choice) => choice.role)).toEqual([
      "lowest_landed_cost",
      "safest_listing",
      "best_condition_evidence",
    ]);
    expect(new Set(choices.map((choice) => choice.listingId)).size).toBe(3);
  });

  it("excludes slabs, lots, and low-confidence matches", () => {
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
  });

  it("labels missing seller data as unverified with the platform baseline, not higher risk", () => {
    const noSellerData = {
      feedbackPercentage: null,
      feedbackCount: null,
      returnsAccepted: null,
      topRated: null,
      buyerProtection: true,
    };
    const listing = normalizeListing({
      listing: { ...demoListingSeeds[0], id: "tcgplayer-row", marketplace: "TCGplayer", seller: noSellerData },
      buyer,
    });

    expect(listing.riskLabel).toBe("unverified");
    // TCGplayer's buyer-protection prior keeps the score at a floor instead of ~0.
    expect(listing.sellerTrustScore).toBeGreaterThanOrEqual(50);
    expect(listing.trustNotes.join(" ")).toContain("unverified");
    expect(listing.trustNotes.join(" ")).toContain("TCGplayer");
  });

  it("does not penalize unknown signals when the seller has a real track record", () => {
    const partialData = calculateSellerTrustScore({
      feedbackPercentage: 99.9,
      feedbackCount: 1757,
      returnsAccepted: null,
      topRated: null,
      buyerProtection: true,
    }, "eBay");
    // 40 + 20 + 10 earned; unknown 30% earns at the eBay prior rate, not zero.
    expect(partialData).toBeGreaterThanOrEqual(80);
  });

  it("labels a seller with a strong track record low risk", () => {
    const listing = normalizeListing({ listing: demoListingSeeds[1], buyer });
    expect(listing.riskLabel).toBe("low_risk");
    expect(listing.trustNotes).toEqual([]);
  });

  it("keeps the risk label independent of thin search-API evidence", () => {
    const thinEvidence = {
      photoCount: 1,
      frontBackExplicit: false,
      closeupsExplicit: false,
      surfaceExplicit: false,
      identityExplicit: false,
      substantiveConditionNotes: false,
      missing: ["Search results carry no full photo data."],
    };
    const listing = normalizeListing({
      listing: { ...demoListingSeeds[1], id: "thin", evidence: thinEvidence },
      buyer,
    });
    expect(listing.riskLabel).toBe("low_risk");
    expect(listing.evidenceCompletenessScore).toBeLessThan(50);
  });

  it("states the market context when every pick is above the market reference", () => {
    const listings = demoListingSeeds.map((listing) => normalizeListing({
      listing: { ...listing, demo: false },
      buyer,
    }));
    const choices = rankListings(listings, { marketPrice: 1000 });
    const cheapest = choices.find((choice) => choice.role === "lowest_landed_cost");
    expect(cheapest?.reason).toContain("Supply is thin");
    expect(cheapest?.reason).toMatch(/\+\d+% over the \$1000\.00 TCGplayer market reference/);
  });

  it("adds no market note when the pick is at or under market", () => {
    const listings = demoListingSeeds.map((listing) => normalizeListing({
      listing: { ...listing, demo: false },
      buyer,
    }));
    const choices = rankListings(listings, { marketPrice: 2000 });
    expect(choices.every((choice) => !choice.reason.includes("market reference"))).toBe(true);
  });
});
