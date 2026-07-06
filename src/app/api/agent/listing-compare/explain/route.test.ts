import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { answerComparisonQuestion } from "@/lib/ai/comparison-qa";
import { clearLocalRateLimitStore } from "@/lib/ops/rate-limit";
import { comparisonReportSchema } from "@/lib/schemas";
import { buildStandardComparisonRequest, STANDARD_COMPARISON_FLOW_CARDS } from "@/lib/testing/standard-comparison-flow";

vi.mock("@/lib/ai/comparison-qa", async () => ({
  answerComparisonQuestion: vi.fn(async () => ({
    answer: "The deterministic trace explains the recommendation.",
    cautions: [],
    usedAi: false,
    webContextChecked: false,
    webCitations: [],
  })),
}));

describe("/api/agent/listing-compare/explain route ops wrapper", () => {
  beforeEach(() => {
    clearLocalRateLimitStore();
    vi.unstubAllEnvs();
    vi.stubEnv("RATE_LIMIT_EXPLAIN_MAX", "1");
    vi.stubEnv("RATE_LIMIT_EXPLAIN_WINDOW_MS", "60000");
    vi.stubEnv("RATE_LIMIT_SALT", "explain-route-test-salt");
  });

  it("rate limits repeated explain requests before asking the assistant", async () => {
    const report = comparisonReportSchema.parse({
      status: "complete",
      request: buildStandardComparisonRequest(STANDARD_COMPARISON_FLOW_CARDS[0]),
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
    });
    const requestInit = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.45",
        "x-request-id": "explain-route-test-request",
      },
      body: JSON.stringify({
        report,
        question: "Why this listing?",
        webContext: "off",
      }),
    };

    const first = await POST(new Request("https://tcgpal.test/api/agent/listing-compare/explain", requestInit));
    const second = await POST(new Request("https://tcgpal.test/api/agent/listing-compare/explain", requestInit));

    expect(first.status).toBe(200);
    expect(first.headers.get("x-request-id")).toBe("explain-route-test-request");
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    expect(await second.json()).toEqual({ error: "Too many assistant requests. Please retry shortly." });
    expect(answerComparisonQuestion).toHaveBeenCalledTimes(1);
  });
});
