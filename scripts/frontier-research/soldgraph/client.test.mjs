import { afterEach, describe, expect, it, vi } from "vitest";
import { researchListings as researchMercari } from "./client.mjs";

const KEY = "sg_test_only_not_a_real_key";
const NOW = Date.parse("2026-10-03T14:00:00.000Z");
const ID = "00000000-0000-4000-8000-000000000001";
const base = { founderTriggered: true, apiKey: KEY, marketplace: "mercari", query: "Blastoise ex 200/165", now: () => NOW };
const row = { id: "m123", title: "Blastoise ex 200/165", link: "https://www.mercari.com/us/item/m123/",
  displayed_price: { amount: 135, currency: "USD" }, condition: "Like New", seller_text: "PRIVATE_SELLER_ID", image: "https://example.test/image" };
function complete(overrides = {}) {
  return { request_id: ID, status: "complete", credits: 1, cached: false,
    result: { provider: "mercari", country: "us", query: base.query, page: 1, count: 1,
      collected_at: new Date(NOW).toISOString(), schema_version: 2, completeness: "provider_page_only", data: [row], ...overrides } };
}
const pending = { request_id: ID, status: "pending", credits: 0, cached: false, poll_url: `/v1/jobs/${ID}` };
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
afterEach(() => vi.useRealTimers());

describe("isolated Soldgraph marketplace research", () => {
  it("requires the explicit trigger, a key, and a bounded query before any network", async () => {
    const fetcher = vi.fn();
    for (const override of [{ founderTriggered: false }, { apiKey: "" }, { query: "" }, { query: "x".repeat(201) }]) {
      await expect(researchMercari({ ...base, ...override, fetcher })).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("makes one fixed-host page-one three-row search and strips secrets and seller data", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(complete()));
    const report = await researchMercari({ ...base, fetcher });
    const [url, options] = fetcher.mock.calls[0];
    expect(new URL(url).origin).toBe("https://api.soldgraph.com");
    expect(new URL(url).pathname).toBe("/v1/mercari/listings");
    expect(new URL(url).searchParams.get("count")).toBe("3");
    expect(new URL(url).searchParams.get("page")).toBe("1");
    expect(options).toMatchObject({ redirect: "error", headers: { Authorization: `Bearer ${KEY}` } });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(report).toMatchObject({ label: "frontier-research", productionReady: false, status: "complete",
      observations: [{ verifiedForRanking: false, identityChecked: false, fields: {
        itemPrice: { value: 135 }, shipping: { value: null }, buyerFee: { value: null }, cardCondition: { value: null },
      } }] });
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE_SELLER_ID|sg_test_only|example.test/);
  });
  it("checks one validated job after the advertised delay and never paginates", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(response(pending, 202, { "retry-after": "2" }))
      .mockResolvedValueOnce(response(complete({ next_page: 2, next_cursor: "do-not-follow" })));
    const result = researchMercari({ ...base, fetcher });
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetcher).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect((await result).status).toBe("complete");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe(`https://api.soldgraph.com/v1/jobs/${ID}?wait=20`);
  });
  it("returns pending after the sole job check without further retries", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(async () => response(pending, 202));
    const result = researchMercari({ ...base, fetcher });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toMatchObject({ status: "pending", observations: [] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not forward the key to untrusted or mismatched polling URLs", async () => {
    for (const path of ["https://evil.test/job", "//evil.test/job", "/v1/jobs/other", `/v1/jobs/${ID}?token=secret`]) {
      const fetcher = vi.fn().mockResolvedValue(response({ ...pending, poll_url: path }, 202));
      await expect(researchMercari({ ...base, fetcher })).rejects.toThrow(/schema/);
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });
  it("stops on HTTP errors, blocked jobs, and long Retry-After without a retry", async () => {
    for (const status of [401, 403, 429, 503]) {
      const fetcher = vi.fn().mockResolvedValue(response({ error: KEY }, status));
      await expect(researchMercari({ ...base, fetcher })).rejects.toThrow(`HTTP ${status}`);
      expect(fetcher).toHaveBeenCalledOnce();
    }
    const failed = vi.fn().mockResolvedValue(response({ request_id: ID, status: "failed", credits: 0, cached: false, error: { code: "blocked" } }));
    expect(await researchMercari({ ...base, fetcher: failed })).toMatchObject({ status: "failed", failure: "blocked", observations: [] });
    const delayed = vi.fn().mockResolvedValue(response(pending, 202, { "retry-after": "86400" }));
    expect(await researchMercari({ ...base, fetcher: delayed })).toMatchObject({ status: "pending", observations: [] });
    expect(delayed).toHaveBeenCalledOnce();
  });
  it("rejects oversized, malformed, stale, conflicting and non-USD result contracts", async () => {
    for (const result of [{ data: [row, row, row, row], count: 4 }, { query: "Giratina" }, { country: "jp" },
      { collected_at: "2026-10-03T13:30:00Z" }, { collected_at: "2026-10-03T14:02:00Z" },
      { data: [{ ...row, displayed_price: { amount: 100, currency: "JPY" } }] },
      { data: [{ ...row, link: "https://www.mercari.com/us/item/m999/" }] },
      { data: [{ ...row, link: "https://www.mercari.com.evil.test/us/item/m123/" }] }]) {
      await expect(researchMercari({ ...base, fetcher: vi.fn().mockResolvedValue(response(complete(result))) })).rejects.toThrow(/schema/);
    }
    await expect(researchMercari({ ...base, fetcher: vi.fn().mockResolvedValue(new Response("not json")) })).rejects.toThrow(/schema/);
    const cancel = vi.fn();
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1_000_001)); }, cancel });
    await expect(researchMercari({ ...base, fetcher: vi.fn().mockResolvedValue(new Response(body)) })).rejects.toThrow(/size/);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("bounds a stalled body and sanitizes network errors that contain credentials", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const result = researchMercari({ ...base, fetcher: vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))) });
    const assertion = expect(result).rejects.toThrow(/deadline/);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    await expect(researchMercari({ ...base, fetcher: vi.fn().mockRejectedValue(new Error(KEY)) })).rejects.toThrow("Soldgraph research stopped (network).");
  });
  it("supports Whatnot on the same bounded contract without inferring a price from a variant range", async () => {
    const whatnot = { id: "TGlzdGluZ05vZGU6MTIz==", title: base.query,
      link: "https://www.whatnot.com/listing/TGlzdGluZ05vZGU6MTIz==", displayed_price: null,
      condition: "Near Mint", quantity: 1, grading_service: null, grade: null,
      card_set: "151", card_number: "200/165", language: "English" };
    const fetcher = vi.fn().mockResolvedValue(response(complete({ provider: "whatnot", data: [whatnot] })));
    const report = await researchMercari({ ...base, marketplace: "whatnot", fetcher });
    expect(new URL(fetcher.mock.calls[0][0]).pathname).toBe("/v1/whatnot/listings");
    expect(report.observations[0]).toMatchObject({ verifiedForRanking: false, identityChecked: false,
      fields: { itemPrice: { value: null }, cardNumber: { value: "200/165" }, gradingService: { value: null }, shipping: { value: null } } });
    const unsupported = vi.fn();
    await expect(researchMercari({ ...base, marketplace: "ebay", fetcher: unsupported })).rejects.toThrow();
    expect(unsupported).not.toHaveBeenCalled();
  });
});
