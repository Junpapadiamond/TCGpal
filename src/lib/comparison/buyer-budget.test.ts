import { describe, expect, it } from "vitest";
import { normalizeListing, rankListings } from "./ranking";
import { comparisonRequestSchema } from "@/lib/schemas";
import { comparisonCacheKey } from "./report-cache";
import { demoListingSeeds } from "./fixtures";

describe("buyer budget gate", () => {
  const seed = demoListingSeeds[0];
  const request = (max: number) => comparisonRequestSchema.parse({ query: "Charizard", sourceListing: { marketplace: "eBay" }, buyer: { desiredCondition: "Unknown", budget: { max, basis: "pre_tax" } }, cardHint: {} });
  it("rejects an item that only fits before shipping and fees", () => {
    const row = normalizeListing({ listing: { ...seed, price: 145, shipping: 10, buyerFee: 0 }, buyer: request(150).buyer });
    expect(row.eligible).toBe(false);
    expect(row.eligibilityIssues.some((issue) => issue.code === "over_budget")).toBe(true);
    expect(rankListings([row])).toHaveLength(0);
  });
  it("accepts the inclusive budget ceiling and still rejects incomplete costs", () => {
    const buyer = request(150).buyer;
    const within = normalizeListing({ listing: { ...seed, price: 140, shipping: 10, buyerFee: 0 }, buyer: { ...buyer, taxRate: 0.2 } });
    expect(within.eligible).toBe(true);
    expect(rankListings([within]).length).toBeGreaterThan(0);
    expect(normalizeListing({ listing: { ...seed, price: 140, shipping: null }, buyer }).eligible).toBe(false);
    expect(normalizeListing({ listing: { ...seed, price: 140, shipping: 0, buyerFee: null }, buyer }).eligible).toBe(false);
  });
  it("does not share cached winners between different budgets", () => {
    expect(comparisonCacheKey(request(150), "card")).not.toBe(comparisonCacheKey(request(100), "card"));
  });
});
