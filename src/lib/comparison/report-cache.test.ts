import { beforeEach, describe, expect, it } from "vitest";
import {
  clearComparisonCache,
  comparisonCacheKey,
  getCachedComparison,
  isCacheableRequest,
  setCachedComparison,
} from "@/lib/comparison/report-cache";
import type { ComparisonReport, ComparisonRequest } from "@/lib/schemas";

const pureSearch = {
  sourceListing: { url: "", title: "", price: null },
  buyer: { desiredCondition: "Near Mint", postalCode: "10001", taxRate: 0.08 },
  manualCandidates: [],
} as unknown as ComparisonRequest;

function reportStub(overrides: Partial<ComparisonReport> = {}): ComparisonReport {
  return {
    status: "complete",
    demoMode: false,
    ...overrides,
  } as ComparisonReport;
}

describe("comparison report cache", () => {
  beforeEach(clearComparisonCache);

  it("only treats pure card searches as cacheable", () => {
    expect(isCacheableRequest(pureSearch)).toBe(true);
    expect(isCacheableRequest({
      ...pureSearch,
      sourceListing: { ...pureSearch.sourceListing, url: "https://www.mercari.com/item/1" },
    } as ComparisonRequest)).toBe(false);
    expect(isCacheableRequest({
      ...pureSearch,
      sourceListing: { ...pureSearch.sourceListing, price: 100 },
    } as ComparisonRequest)).toBe(false);
    expect(isCacheableRequest({
      ...pureSearch,
      manualCandidates: [{ marketplace: "Mercari", url: "", title: "x", price: 10, shipping: null, claimedCondition: "Unknown" }],
    } as ComparisonRequest)).toBe(false);
  });

  it("keys by card, condition, and delivery context", () => {
    const key = comparisonCacheKey(pureSearch, "swsh7-215");
    expect(key).toBe("swsh7-215|Near Mint|10001|0.08");
  });

  it("serves within the 15-minute TTL and expires after", () => {
    const at = new Date("2026-07-03T10:00:00Z");
    setCachedComparison("key", reportStub(), at);
    expect(getCachedComparison("key", new Date("2026-07-03T10:14:00Z"))).not.toBeNull();
    expect(getCachedComparison("key", new Date("2026-07-03T10:16:00Z"))).toBeNull();
  });

  it("never caches demo or needs-confirmation reports", () => {
    setCachedComparison("demo", reportStub({ demoMode: true }));
    setCachedComparison("confirm", reportStub({ status: "needs_confirmation" }));
    expect(getCachedComparison("demo")).toBeNull();
    expect(getCachedComparison("confirm")).toBeNull();
  });
});
