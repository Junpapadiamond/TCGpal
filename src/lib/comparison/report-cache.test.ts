import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearComparisonCache,
  comparisonCacheKey,
  getCachedComparison,
  isCacheableRequest,
  runComparisonFlight,
  setCachedComparison,
} from "@/lib/comparison/report-cache";
import { getJsonCache } from "@/lib/ops/cache";
import { comparisonReportSchema, type ComparisonReport, type ComparisonRequest } from "@/lib/schemas";
import { ONE_PIECE_PRINT_METADATA_REVISION } from "@/lib/external/one-piece-print-metadata";
import { ONE_PIECE_CATALOG_REVISION } from "@/lib/external/one-piece-catalog-revision";

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
    identityContractVersion: 4,
    outcome: "next_moves",
    inspectListingId: null,
    demoMode: false,
    generatedAt: "2026-07-03T10:00:00.000Z",
    ...overrides,
  });
}

function platformStub(overrides: Partial<ComparisonReport["platforms"][number]> = {}): ComparisonReport["platforms"][number] {
  return {
    id: "ebay",
    marketplace: "eBay",
    label: "eBay Browse adapter",
    sourceMode: "official_api",
    status: "complete",
    configured: true,
    count: 1,
    detail: "1 live candidate.",
    ...overrides,
  } as ComparisonReport["platforms"][number];
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
    expect(key).toBe(`identity-v4|ranking-v5-market-review|${ONE_PIECE_PRINT_METADATA_REVISION}|${ONE_PIECE_CATALOG_REVISION}|swsh7-215|Near Mint|10001|0.08`);
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

  it("coalesces concurrent cold requests for the same report key", async () => {
    let finish!: (report: ComparisonReport) => void;
    const producer = vi.fn(() => new Promise<ComparisonReport>((resolve) => { finish = resolve; }));

    const first = runComparisonFlight("same-key", producer);
    const second = runComparisonFlight("same-key", producer);
    await vi.waitFor(() => expect(producer).toHaveBeenCalledTimes(1));
    finish(reportStub());

    await expect(first).resolves.toEqual(reportStub());
    await expect(second).resolves.toEqual(reportStub());
    expect(producer).toHaveBeenCalledTimes(1);
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

  // Observed 2026-08-14: one eBay search timed out at 10s while measuring One
  // Piece buy accuracy. The empty "no live row" report it produced was written to
  // the cache, so the next fifteen minutes of searches for Shanks OP09-001 were
  // served a zero-listing result that a cold re-run answered with 50 listings.
  // A configured source that tried and failed must be re-attempted, not frozen.
  it("never caches a report whose configured live source failed", async () => {
    await setCachedComparison("failed", reportStub({
      platforms: [platformStub({ status: "fallback", configured: true, count: 0, detail: "eBay search timed out after 10s." })],
    }));
    expect(await getCachedComparison("failed")).toBeNull();
  });

  // The mirror case: a source that answered honestly with nothing is a real
  // result, and an unconfigured adapter never tried at all. Neither is a reason
  // to re-run the fan-out on every request.
  it("caches a completed search even when it found nothing", async () => {
    await setCachedComparison("empty", reportStub({
      platforms: [
        platformStub({ status: "complete", configured: true, count: 0, detail: "0 live candidates." }),
        platformStub({ id: "mercari", marketplace: "Mercari", label: "Mercari adapter", status: "skipped", configured: false, count: 0, detail: "Not configured (needs MERCARI_PROVIDER_KEY)." }),
      ],
    }));
    expect(await getCachedComparison("empty")).not.toBeNull();
  });
});
