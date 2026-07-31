import { beforeEach, describe, expect, it } from "vitest";
import { clearLocalCache } from "@/lib/ops/cache";
import { buildStandardComparisonRequest, STANDARD_COMPARISON_FLOW_CARDS } from "@/lib/testing/standard-comparison-flow";
import type { ComparisonReport } from "@/lib/schemas";
import { getComparisonSnapshot, saveComparisonSnapshot } from "./report-snapshot";

function report(): ComparisonReport {
  const request = buildStandardComparisonRequest(STANDARD_COMPARISON_FLOW_CARDS[0]);
  request.buyer.postalCode = "10001";
  request.buyer.taxRate = 0.08875;
  return {
    status: "complete",
    request,
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
    demoMode: false,
    generatedAt: "2026-07-31T09:54:00.000Z",
  };
}

describe("comparison report snapshots", () => {
  beforeEach(() => clearLocalCache());

  it("stores a validated pure-search snapshot without the buyer ZIP", async () => {
    const saved = await saveComparisonSnapshot(report(), {
      id: "0123456789abcdef0123456789abcdef",
      now: new Date("2026-07-31T10:00:00.000Z"),
    });
    const restored = await getComparisonSnapshot(saved.id, new Date("2026-08-01T10:00:00.000Z"));

    expect(restored?.report.generatedAt).toBe("2026-07-31T09:54:00.000Z");
    expect(restored?.report.request.buyer.postalCode).toBe("");
    expect(restored?.report.request.buyer.taxRate).toBe(0.08875);
    expect(restored?.savedAt).toBe("2026-07-31T10:00:00.000Z");
  });

  it("refuses to publish pasted or manually entered listing facts", async () => {
    const privateReport = report();
    privateReport.request.sourceListing.title = "Seller listing supplied by the buyer";
    privateReport.request.sourceListing.price = 100;

    await expect(saveComparisonSnapshot(privateReport, {
      id: "fedcba9876543210fedcba9876543210",
    })).rejects.toThrow(/pure card searches/i);
  });

  it("rejects malformed snapshot identifiers", async () => {
    await expect(getComparisonSnapshot("../../secret")).resolves.toBeNull();
  });
});
