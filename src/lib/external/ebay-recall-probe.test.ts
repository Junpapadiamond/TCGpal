import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeEbayRecall, resetEbayTokenCacheForTests, searchEbayAlternatives } from "./ebay";
import { buyerContextSchema, cardIdentityCandidateSchema, type SearchAttempt } from "@/lib/schemas";

const card = cardIdentityCandidateSchema.parse({ id: "sv4pt5-232", name: "Mew ex", setName: "Paldean Fates", setCode: "sv4pt5", cardNumber: "232/91", language: "English", confidence: "high", matchReasons: [], marketMid: 100 });
const buyer = buyerContextSchema.parse({ postalCode: "10001" });
const item = { itemId: "123456789012", itemWebUrl: "https://www.ebay.com/itm/123456789012", title: "Mew ex 232/091 Near Mint", price: { value: "80", currency: "USD" }, shippingOptions: [{ shippingCost: { value: "0", currency: "USD" } }] };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
let calls: URL[];
let fetcher: typeof fetch;
beforeEach(() => {
  vi.stubEnv("EBAY_CLIENT_ID", "test"); vi.stubEnv("EBAY_CLIENT_SECRET", "test"); vi.stubEnv("EBAY_RECALL_PROBE_ENABLED", "true");
  resetEbayTokenCacheForTests(); calls = [];
  fetcher = vi.fn(async input => {
    const url = new URL(String(input)); calls.push(url);
    return url.pathname.includes("oauth2") ? response({ access_token: "test" }) : response({ itemSummaries: [item] });
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); resetEbayTokenCacheForTests(); });

describe("eBay recall probe acquisition", () => {
  it("records every primary rung and the padded rung, then probes the contributing padded query once", async () => {
    const attempts: SearchAttempt[] = [];
    const baseline = await searchEbayAlternatives(card, buyer, fetcher, undefined, null, 0, attempt => attempts.push(attempt));
    expect(attempts.map(a => [a.kind, a.value, a.returnedCount])).toEqual([["keyword", "Mew ex 232/91", 1], ["padded", "Mew ex 232/091", 1]]);
    const result = await probeEbayRecall({ card, buyer, fetcher }, attempts);
    expect(result).toMatchObject({ status: "complete", returnedCount: 1, seeds: [{ id: baseline[0].id }] });
    const probeCalls = calls.filter(url => url.searchParams.has("sort"));
    expect(probeCalls).toHaveLength(1);
    expect(Object.fromEntries(probeCalls[0].searchParams)).toEqual({ q: "Mew ex 232/091", limit: "10", filter: "buyingOptions:{FIXED_PRICE}", sort: "price" });
    expect(calls.filter(url => url.pathname.includes("/item/"))).toHaveLength(0);
  });
  it("caps results at 10, drops non-USD rows and deduplicates ids", async () => {
    const f: typeof fetch = async input => String(input).includes("oauth2") ? response({ access_token: "t" }) : response({ itemSummaries: [item, item, { ...item, itemId: "eur", price: { value: "1", currency: "EUR" } }, ...Array.from({ length: 15 }, (_, i) => ({ ...item, itemId: String(i) }))] });
    const result = await probeEbayRecall({ card, buyer, fetcher: f }, [{ kind: "epid", value: "123", status: "complete", returnedCount: 50, usdCount: 50 }]);
    expect(result.returnedCount).toBe(10);
    expect(result.seeds).toHaveLength(8);
  });
  it("does not retry a rejected probe and exposes failure", async () => {
    const f: typeof fetch = vi.fn(async input => String(input).includes("oauth2") ? response({ access_token: "t" }) : response({}, 401));
    const result = await probeEbayRecall({ card, buyer, fetcher: f }, [{ kind: "keyword", value: "Mew", status: "complete", returnedCount: 1, usdCount: 1 }]);
    expect(result.status).toBe("failed");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("bounds a hanging response body, not just response headers", async () => {
    vi.useFakeTimers();
    const f: typeof fetch = async input => String(input).includes("oauth2") ? response({ access_token: "t" }) : ({ ok: true, json: () => new Promise(() => {}) } as Response);
    const pending = probeEbayRecall({ card, buyer, fetcher: f }, [{ kind: "keyword", value: "Mew", status: "complete", returnedCount: 1, usdCount: 1 }]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await pending).status).toBe("failed");
  });
  it("makes no extra request when disabled", async () => {
    vi.stubEnv("EBAY_RECALL_PROBE_ENABLED", "false");
    expect((await probeEbayRecall({ card, buyer, fetcher }, [])).status).toBe("disabled");
    expect(calls).toHaveLength(0);
  });
});
