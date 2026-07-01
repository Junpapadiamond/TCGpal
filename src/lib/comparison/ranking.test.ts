import { describe, expect, it } from "vitest";
import { demoListingSeeds } from "@/lib/comparison/fixtures";
import {
  calculateEvidenceCompletenessScore,
  calculatePriceComponent,
  calculateSellerTrustScore,
  calculateValueScore,
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

  it("returns distinct, stable role winners, led by Best Value", () => {
    const listings = demoListingSeeds.map((listing) => normalizeListing({ listing, buyer }));
    const choices = rankListings(listings);
    // Best Value leads and consumes one of the three demo listings; with only three
    // eligible listings total, best_condition_evidence has no distinct pick left and
    // is correctly omitted rather than repeating an already-chosen listing.
    expect(choices.map((choice) => choice.role)).toEqual([
      "best_value",
      "lowest_landed_cost",
      "safest_listing",
    ]);
    expect(new Set(choices.map((choice) => choice.listingId)).size).toBe(3);
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
    expect(bestValue?.listingId).not.toBe(cheapest?.listingId);
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

  it("weights the value composite price-first, then safety, then evidence", () => {
    const base = { priceComponent: 100, safetyScore: 0, evidenceCompletenessScore: 0 };
    expect(calculateValueScore(base)).toBe(50); // 100 * 0.5
    expect(calculateValueScore({ ...base, safetyScore: 100 })).toBe(80); // + 100 * 0.3
    expect(calculateValueScore({ ...base, evidenceCompletenessScore: 100 })).toBe(70); // + 100 * 0.2
    expect(calculateValueScore({ priceComponent: 100, safetyScore: 100, evidenceCompletenessScore: 100 })).toBe(100);
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
