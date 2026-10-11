import { afterEach, describe, expect, it, vi } from "vitest";
import { queryMercariResearch } from "./client.mjs";

const input = { founderTriggered: true, apiKey: "test-only-key", query: "Charizard ex 199/165" };
const payload = () => ({ code: 200, msg: "OK", data: { query: input.query, total_results: 1, items: [{
  id: "m12345678900", url: "https://www.mercari.com/us/item/m12345678900", title: input.query,
  price_cents: 4873, seller_id: "must-not-persist", condition_code: 1, updated_at_unix: 1784911712,
}] } });
afterEach(() => vi.useRealTimers());

describe("Crawlora isolated research client", () => {
  it("makes one documented request and preserves unknown currency, activity, charges and card condition", async () => {
    const fetcher = vi.fn(async () => Response.json(payload()));
    const result = await queryMercariResearch(input, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url.origin).toBe("https://api.crawlora.net");
    expect(url.pathname).toBe("/api/v1/mercari/search");
    expect([...url.searchParams]).toEqual([["query", input.query]]);
    expect(init).toMatchObject({ redirect: "error", headers: { "x-api-key": input.apiKey } });
    expect(result.mode).toBe("frontier-research");
    expect(result.observations[0]).toMatchObject({ verifiedForRanking: false, identityChecked: false,
      fields: { priceCents: { value: 4873 }, currency: { value: null }, availability: { value: null },
        conditionClaim: { value: null }, shipping: { value: null }, buyerFee: { value: null } } });
    expect(result.observations[0].fields.priceCents.supportingField).toBe("data.items[0].price_cents");
    expect(JSON.stringify(result)).not.toContain("must-not-persist");
    expect(JSON.stringify(result)).not.toContain(input.apiKey);
    expect(result.observations[0].observedAt).not.toBe(new Date(1784911712 * 1000).toISOString());
  });

  it.each([false, undefined])("requires an explicit research trigger (%s)", async founderTriggered => {
    const fetcher = vi.fn();
    await expect(queryMercariResearch({ ...input, founderTriggered }, { fetcher })).rejects.toThrow(/input/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 502])("stops on HTTP %s without retry or alternate transport", async status => {
    const fetcher = vi.fn(async () => new Response("private provider error", { status }));
    await expect(queryMercariResearch(input, { fetcher })).rejects.toThrow(`HTTP ${status}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["https://example.com/us/item/m12345678900", "https://www.mercari.com/us/item/m99999999999"])("rejects a mismatched listing URL", async url => {
    const value = payload(); value.data.items[0].url = url;
    await expect(queryMercariResearch(input, { fetcher: async () => Response.json(value) })).rejects.toThrow(/schema/);
  });

  it.each([-1, 1.2, Number.MAX_SAFE_INTEGER + 1])("rejects invalid integer-cent amounts (%s)", async price => {
    const value = payload(); value.data.items[0].price_cents = price;
    await expect(queryMercariResearch(input, { fetcher: async () => Response.json(value) })).rejects.toThrow(/schema/);
  });

  it("rejects oversized bodies without content-length", async () => {
    await expect(queryMercariResearch(input, { fetcher: async () => new Response(" ".repeat(1_000_001)) })).rejects.toThrow(/size/);
  });

  it("bounds a stalled response body within the overall deadline", async () => {
    vi.useFakeTimers();
    const response = new Response(new ReadableStream({ start() {} }));
    const result = queryMercariResearch(input, { fetcher: async () => response });
    const assertion = expect(result).rejects.toThrow(/deadline/);
    await vi.advanceTimersByTimeAsync(20_001);
    await assertion;
  });

  it("sanitizes transport errors so they cannot echo credentials", async () => {
    await expect(queryMercariResearch(input, { fetcher: async () => { throw new Error(input.apiKey); } }))
      .rejects.toThrow("Crawlora research stopped (network).");
  });

  it("reports an empty search without inventing inventory", async () => {
    const value = payload(); value.data.items = []; value.data.total_results = 0;
    const result = await queryMercariResearch(input, { fetcher: async () => Response.json(value) });
    expect(result.observations).toEqual([]);
  });
});
