import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEbaySellerFeedback, resetFeedbackTokenForTests } from "./ebay-feedback";
import { resetEbayTokenCacheForTests } from "./ebay";

const url = "https://www.ebay.com/itm/123456789012";
const distribution = (positive = 17) => [
  { value: "POSITIVE", count: positive }, { value: "NEUTRAL", count: 2 }, { value: "NEGATIVE", count: 1 },
];
const row = (days: number, role = "SELLER") => ({
  userRoleType: role, period: { unit: "DAY", value: days }, feedbackRatingValueDistribution: distribution(),
});
const payload = (rows = [row(30), row(365)]) => ({
  feedbackRatingSummary: [{ ratingType: "OVERALL_EXPERIENCE", ratingSummaryByRatingType: rows }],
});
function mockFetcher(body: unknown = payload()) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const endpoint = new URL(String(input));
    if (endpoint.pathname.endsWith("/oauth2/token")) {
      const scope = new URLSearchParams(String(init?.body)).get("scope");
      return Response.json({ access_token: scope?.endsWith("feedback.readonly") ? "feedback-token" : "browse-token", expires_in: 3600 });
    }
    if (endpoint.pathname.endsWith("/get_item_by_legacy_id")) return Response.json({
      itemId: "v1|123456789012|0", title: "Card", price: { value: "10", currency: "USD" },
      seller: { username: "private-seller-name" },
    });
    if (endpoint.pathname.endsWith("/feedback_rating_summary")) return Response.json(body);
    throw new Error("Unexpected endpoint");
  });
}
beforeEach(() => {
  vi.stubEnv("EBAY_CLIENT_ID", "test"); vi.stubEnv("EBAY_CLIENT_SECRET", "test");
  resetEbayTokenCacheForTests(); resetFeedbackTokenForTests();
});
afterEach(() => vi.unstubAllEnvs());

describe("on-demand eBay seller feedback", () => {
  it("returns only seller-role counts and periods, using an independent read-only scope", async () => {
    const fetcher = mockFetcher(payload([row(7), row(30, "BUYER"), row(30), row(365)]));
    const result = await getEbaySellerFeedback(url, fetcher);
    expect(result.status).toBe("complete");
    expect(result.periods).toEqual([
      { days: 30, positive: 17, neutral: 2, negative: 1 },
      { days: 365, positive: 17, neutral: 2, negative: 1 },
    ]);
    expect(JSON.stringify(result)).not.toContain("private-seller-name");
    const request = fetcher.mock.calls.find(([u]) => String(u).includes("feedback_rating_summary"))!;
    expect(new URL(String(request[0])).searchParams.get("filter")).toBe("ratingType:OVERALL_EXPERIENCE");
    expect(new Headers(request[1]?.headers).get("Authorization")).toBe("Bearer feedback-token");
  });
  it("does not invent missing counts or use combined/buyer-role feedback", async () => {
    const result = await getEbaySellerFeedback(url, mockFetcher(payload([
      row(30, "BUYER"), { ...row(365), feedbackRatingValueDistribution: distribution().slice(0, 2) },
    ])));
    expect(result.status).toBe("no_data"); expect(result.periods).toEqual([]);
  });
  it("preserves explicit zero counts without inventing a percentage", async () => {
    const result = await getEbaySellerFeedback(url, mockFetcher(payload([
      { ...row(30), feedbackRatingValueDistribution: distribution().map(x => ({ ...x, count: 0 })) },
    ])));
    expect(result.periods).toEqual([{ days: 30, positive: 0, neutral: 0, negative: 0 }]);
  });
  it("fails visibly and safely for a malformed provider response", async () => {
    const result = await getEbaySellerFeedback(url, mockFetcher({ feedbackRatingSummary: "bad" }));
    expect(result.status).toBe("unavailable"); expect(result.periods).toEqual([]);
  });
  it("reads only the private seller field without requiring unrelated listing fields", async () => {
    const normal = mockFetcher();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => String(input).includes("get_item_by_legacy_id")
      ? Response.json({ seller: { username: "private-seller-name" } }) : normal(input, init));
    expect((await getEbaySellerFeedback(url, fetcher)).status).toBe("complete");
  });
  it("rejects untrusted URLs without network work", async () => {
    const fetcher = mockFetcher();
    await expect(getEbaySellerFeedback("https://ebay.com.evil.test/itm/123456789012", fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does no acquisition when disabled", async () => {
    vi.stubEnv("EBAY_FEEDBACK_ENABLED", "false"); const fetcher = mockFetcher();
    expect((await getEbaySellerFeedback(url, fetcher)).status).toBe("disabled");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses duplicate periods and negative or incomplete buckets", async () => {
    expect((await getEbaySellerFeedback(url, mockFetcher(payload([row(30), row(30)])))).status).toBe("no_data");
    expect((await getEbaySellerFeedback(url, mockFetcher(payload([
      { ...row(30), feedbackRatingValueDistribution: distribution(-1) },
    ])))).status).toBe("unavailable");
  });
  it("preserves Browse access when feedback authorization fails without retries", async () => {
    const normal = mockFetcher();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (new URLSearchParams(String(init?.body)).get("scope")?.endsWith("feedback.readonly")) return Response.json({}, { status: 403 });
      return normal(input, init);
    });
    expect((await getEbaySellerFeedback(url, fetcher)).status).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect((await getEbaySellerFeedback(url, normal)).status).toBe("complete");
    const browseTokens = normal.mock.calls.filter(([, init]) => new URLSearchParams(String(init?.body)).get("scope") === "https://api.ebay.com/oauth/api_scope");
    expect(browseTokens).toHaveLength(1);
  });
  it("bounds streamed response size and does not log or return raw provider text", async () => {
    const normal = mockFetcher();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => String(input).includes("feedback_rating_summary")
      ? new Response("private-seller-name".repeat(60_000)) : normal(input, init));
    const result = await getEbaySellerFeedback(url, fetcher);
    expect(result.status).toBe("unavailable"); expect(JSON.stringify(result)).not.toContain("private-seller-name");
  });
  it("cancels a slow provider within the overall five-second deadline", async () => {
    vi.useFakeTimers();
    const normal = mockFetcher();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const controller = new AbortController(); setTimeout(() => controller.abort(), ms); return controller.signal;
    });
    try {
      const fetcher = vi.fn<typeof fetch>(async (input, init) => String(input).includes("feedback_rating_summary")
        ? new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }))
        : normal(input, init));
      const pending = getEbaySellerFeedback(url, fetcher);
      await vi.advanceTimersByTimeAsync(5001);
      expect((await pending).status).toBe("unavailable");
    } finally { timeout.mockRestore(); vi.useRealTimers(); }
  });
  it("also cancels a stalled response body within that deadline", async () => {
    vi.useFakeTimers();
    const normal = mockFetcher();
    const cancel = vi.fn();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const controller = new AbortController(); setTimeout(() => controller.abort(), ms); return controller.signal;
    });
    try {
      const fetcher = vi.fn<typeof fetch>(async (input, init) => String(input).includes("feedback_rating_summary")
        ? new Response(new ReadableStream({ cancel })) : normal(input, init));
      let result: Awaited<ReturnType<typeof getEbaySellerFeedback>> | undefined;
      void getEbaySellerFeedback(url, fetcher).then(value => { result = value; });
      await vi.advanceTimersByTimeAsync(5001);
      expect(cancel).toHaveBeenCalledOnce();
      expect(result?.status).toBe("unavailable");
    } finally { timeout.mockRestore(); vi.useRealTimers(); }
  });
});
