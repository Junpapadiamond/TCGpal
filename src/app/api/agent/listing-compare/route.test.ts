import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { runListingComparison } from "@/lib/ai/listing-compare";
import { clearLocalRateLimitStore } from "@/lib/ops/rate-limit";
import { comparisonReportSchema } from "@/lib/schemas";
import {
  buildStandardComparisonRequest,
  STANDARD_COMPARISON_FLOW_CARDS,
} from "@/lib/testing/standard-comparison-flow";

vi.mock("@/lib/ai/listing-compare", async () => ({
  runListingComparison: vi.fn(async (request) => comparisonReportSchema.parse({
    status: "complete",
    request,
    identityCandidates: [],
    confirmedCard: null,
    candidates: [],
    rankedChoices: [],
    references: [],
    narrative: { summary: "ok", cautions: [] },
    warnings: [],
    trace: [],
    platforms: [],
    webDiscoveries: [],
    demoMode: false,
    generatedAt: "2026-07-05T10:00:00.000Z",
  })),
}));

describe("/api/agent/listing-compare route ops wrapper", () => {
  beforeEach(() => {
    clearLocalRateLimitStore();
    vi.unstubAllEnvs();
    vi.stubEnv("RATE_LIMIT_COMPARE_MAX", "1");
    vi.stubEnv("RATE_LIMIT_COMPARE_WINDOW_MS", "60000");
    vi.stubEnv("RATE_LIMIT_SALT", "route-test-salt");
  });

  it("rate limits repeated comparison requests before running the comparison", async () => {
    const requestBody = buildStandardComparisonRequest(STANDARD_COMPARISON_FLOW_CARDS[0]);
    const requestInit = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.44",
        "x-request-id": "route-test-request",
      },
      body: JSON.stringify(requestBody),
    };

    const first = await POST(new Request("https://tcgpal.test/api/agent/listing-compare", requestInit));
    const second = await POST(new Request("https://tcgpal.test/api/agent/listing-compare", requestInit));

    expect(first.status).toBe(200);
    expect(first.headers.get("x-request-id")).toBe("route-test-request");
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    expect(await second.json()).toEqual({ error: "Too many comparison requests. Please retry shortly." });
    expect(runListingComparison).toHaveBeenCalledTimes(1);
    expect(runListingComparison).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Umbreon VMAX 215/203" }),
      {
        opsContext: { requestId: "route-test-request", route: "listing-compare" },
        signal: expect.any(AbortSignal),
      },
    );
  });
});
