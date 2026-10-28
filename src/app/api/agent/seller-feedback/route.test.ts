import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { getEbaySellerFeedback } from "@/lib/external/ebay-feedback";
import { clearLocalCache } from "@/lib/ops/cache";
import { clearLocalRateLimitStore } from "@/lib/ops/rate-limit";

vi.mock("@/lib/external/ebay-feedback", () => ({ getEbaySellerFeedback: vi.fn() }));
const result = { status: "complete", source: "eBay Feedback API", observedAt: "2026-10-28T17:00:00.000Z", periods: [{ days: 30, positive: 20, neutral: 1, negative: 0 }] };
const body = { listingUrl: "https://www.ebay.com/itm/123456789012" };
const request = (input: unknown = body) => new Request("http://localhost/api/agent/seller-feedback", {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.82" }, body: JSON.stringify(input),
});
beforeEach(() => { clearLocalCache(); clearLocalRateLimitStore(); vi.clearAllMocks(); vi.mocked(getEbaySellerFeedback).mockResolvedValue(result as Awaited<ReturnType<typeof getEbaySellerFeedback>>); });
afterEach(() => vi.unstubAllEnvs());

it("validates the URL before acquiring and refuses client-supplied seller IDs", async () => {
  for (const input of [{ listingUrl: "https://evil.test/itm/123456789012" }, { ...body, seller: "untrusted" }]) {
    expect((await POST(request(input))).status).toBe(400);
  }
  expect(getEbaySellerFeedback).not.toHaveBeenCalled();
});
it("coalesces and caches repeated disclosure requests, stripping unexpected provider fields", async () => {
  vi.mocked(getEbaySellerFeedback).mockResolvedValue({ ...result, sellerId: "private" } as never);
  const responses = await Promise.all([POST(request()), POST(request())]);
  expect(await responses[0].json()).toEqual(result);
  expect((await POST(request())).status).toBe(200);
  expect(getEbaySellerFeedback).toHaveBeenCalledTimes(1);
});
it("honors the kill switch even when evidence is cached", async () => {
  await POST(request()); vi.stubEnv("EBAY_FEEDBACK_ENABLED", "false");
  const response = await POST(request());
  expect((await response.json()).status).toBe("disabled");
  expect(getEbaySellerFeedback).toHaveBeenCalledTimes(1);
});
it("limits explicit requests independently of comparisons", async () => {
  for (let i = 0; i < 10; i++) expect((await POST(request())).status).toBe(200);
  const response = await POST(request());
  expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBeTruthy();
});
it("rejects oversized input without making provider calls", async () => {
  expect((await POST(request({ listingUrl: "x".repeat(5000) }))).status).toBe(413);
  expect(getEbaySellerFeedback).not.toHaveBeenCalled();
});
