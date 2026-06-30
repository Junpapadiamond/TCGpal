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
});
