import { beforeEach, describe, expect, it } from "vitest";
import {
  clearComparisonCache,
  comparisonCacheKey,
  getCachedComparison,
  isCacheableRequest,
  setCachedComparison,
} from "@/lib/comparison/report-cache";
import { getJsonCache } from "@/lib/ops/cache";
import { comparisonReportSchema, type ComparisonReport, type ComparisonRequest } from "@/lib/schemas";
import { ONE_PIECE_PRINT_METADATA_REVISION } from "@/lib/external/one-piece-print-metadata";

const pureSearch = {
  sourceListing: { marketplace: "Other", url: "", title: "", price: null },
  buyer: { desiredCondition: "Near Mint", postalCode: "10001", taxRate: 0.08 },
  manualCandidates: [],
} as unknown as ComparisonRequest;

function reportStub(overrides: Partial<ComparisonReport> = {}): ComparisonReport {
  return comparisonReportSchema.parse({
    status: "complete",
    request: pureSearch,
    identityCandidates: [],
    confirmedCard: null,
    candidates: [],
    rankedChoices: [],
    references: [],
    narrative: {
      summary: "Summary",
      cautions: [],
    },
    warnings: [],
    trace: [],
    platforms: [],
    webDiscoveries: [],
    identityContractVersion: 3,
    outcome: "next_moves",
    inspectListingId: null,
    demoMode: false,
    generatedAt: "2026-07-03T10:00:00.000Z",
    ...overrides,
  });
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
    expect(key).toBe(`identity-v3|ranking-v3|${ONE_PIECE_PRINT_METADATA_REVISION}|swsh7-215|Near Mint|10001|0.08`);
  });

  it("refuses reports created before the exact-print identity contract", async () => {
    const legacy = reportStub({ identityContractVersion: undefined });
    await setCachedComparison("legacy", legacy);
    expect(await getCachedComparison("legacy")).toBeNull();
  });

  it("serves within the 15-minute TTL and expires after", async () => {
    const at = new Date("2026-07-03T10:00:00Z");
    await setCachedComparison("key", reportStub(), at);
    expect(await getCachedComparison("key", new Date("2026-07-03T10:14:00Z"))).not.toBeNull();
    expect(await getCachedComparison("key", new Date("2026-07-03T10:16:00Z"))).toBeNull();
  });

  it("writes reports through the shared hashed cache adapter", async () => {
    const report = reportStub();

    await setCachedComparison("card|Near Mint|10001|0.08", report, new Date("2026-07-03T10:00:00Z"));

    await expect(getJsonCache("comparison-report", "card|Near Mint|10001|0.08", {
      now: new Date("2026-07-03T10:01:00Z"),
    })).resolves.toMatchObject({ generatedAt: "2026-07-03T10:00:00.000Z" });
  });

  it("never caches demo or needs-confirmation reports", async () => {
    await setCachedComparison("demo", reportStub({ demoMode: true }));
    await setCachedComparison("confirm", reportStub({ status: "needs_confirmation" }));
    expect(await getCachedComparison("demo")).toBeNull();
    expect(await getCachedComparison("confirm")).toBeNull();
  });
});
