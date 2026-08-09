import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalCache } from "@/lib/ops/cache";
import { clearLocalRateLimitStore } from "@/lib/ops/rate-limit";
import { comparisonCacheKey, getCachedComparison, setCachedComparison } from "@/lib/comparison/report-cache";
import { buildStandardComparisonRequest, STANDARD_COMPARISON_FLOW_CARDS } from "@/lib/testing/standard-comparison-flow";
import { comparisonReportSchema, type ComparisonReport } from "@/lib/schemas";
import { GET, POST } from "./route";

function report(): ComparisonReport {
  return comparisonReportSchema.parse({
    status: "complete",
    request: buildStandardComparisonRequest(STANDARD_COMPARISON_FLOW_CARDS[0]),
    identityCandidates: [],
    confirmedCard: null,
    candidates: [],
    rankedChoices: [],
    references: [],
    narrative: { summary: "No trustworthy buy yet.", cautions: [] },
    warnings: [],
    trace: [],
    platforms: [],
    webDiscoveries: [],
    identityContractVersion: 4,
    outcome: "next_moves",
    inspectListingId: null,
    demoMode: false,
    generatedAt: "2026-07-31T09:54:00.000Z",
  });
}

describe("/api/comparison-snapshots", () => {
  beforeEach(() => {
    clearLocalCache();
    clearLocalRateLimitStore();
    vi.stubEnv("RATE_LIMIT_COMPARE_MAX", "10");
  });

  it("creates and reads an opaque result snapshot", async () => {
    const verifiedReport = report();
    const confirmedCardId = STANDARD_COMPARISON_FLOW_CARDS[0].expectedCardId;
    const cacheKey = comparisonCacheKey(verifiedReport.request, confirmedCardId);
    await setCachedComparison(cacheKey, verifiedReport);
    expect(await getCachedComparison(cacheKey)).not.toBeNull();
    const created = await POST(new Request("https://tcglens.test/api/comparison-snapshots", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8" },
      body: JSON.stringify({
        request: verifiedReport.request,
        confirmedCardId,
        generatedAt: verifiedReport.generatedAt,
      }),
    }));
    expect(created.status).toBe(201);
    const body = await created.json() as { receiptId: string; durable: boolean };
    expect(body.receiptId).toMatch(/^[a-f0-9]{32}$/);

    const restored = await GET(new Request(`https://tcglens.test/api/comparison-snapshots?id=${body.receiptId}`, {
      headers: { "x-forwarded-for": "203.0.113.8" },
    }));
    expect(restored.status).toBe(200);
    expect((await restored.json()).snapshot.report.generatedAt).toBe("2026-07-31T09:54:00.000Z");

    const latest = await GET(new Request(
      `https://tcglens.test/api/comparison-snapshots?card=${confirmedCardId}&game=pokemon&condition=Near%20Mint`,
      { headers: { "x-forwarded-for": "203.0.113.8" } },
    ));
    expect(latest.status).toBe(200);
    expect((await latest.json()).snapshot.id).toBe(body.receiptId);
  });

  it("refuses to create a receipt from a report that was not produced by the comparison service", async () => {
    const unverifiedReport = report();
    const response = await POST(new Request("https://tcglens.test/api/comparison-snapshots", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({
        request: unverifiedReport.request,
        confirmedCardId: STANDARD_COMPARISON_FLOW_CARDS[0].expectedCardId,
        generatedAt: unverifiedReport.generatedAt,
      }),
    }));

    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown snapshot instead of rerunning a comparison", async () => {
    const response = await GET(new Request("https://tcglens.test/api/comparison-snapshots?id=0123456789abcdef0123456789abcdef"));
    expect(response.status).toBe(404);
  });
});
