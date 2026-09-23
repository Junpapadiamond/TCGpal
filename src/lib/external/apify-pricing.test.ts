import { describe, expect, it, vi } from "vitest";
import { checkApifyPricing } from "./apify-pricing";

const now = new Date("2026-09-23T12:00:00Z");
const events = {
  "apify-actor-start": { eventPriceUsd: 0.00005 },
  "search-request": { eventPriceUsd: 0.04 },
  "apify-default-dataset-item": { eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.00275 } } },
};
const pricing = (actorChargeEvents: unknown = events, startedAt = "2026-09-16T02:13:04.018Z") => ({
  startedAt, pricingModel: "PAY_PER_EVENT", pricingPerEvent: { actorChargeEvents },
});
const input = { actor: "getascraper~mercari-us-scraper", provider: "mercari" as const,
  memoryMbytes: 2048, maxResults: 3, maxChargeUsd: 0.03, now };

describe("Apify price preflight", () => {
  it("stops Mercari's new search fee before a paid start under the old cap", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: { pricingInfos: [pricing()] } }));
    await expect(checkApifyPricing({ ...input, fetcher })).rejects.toThrow(/exceeds.*\$0\.03/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("https://api.apify.com/v2/acts/getascraper~mercari-us-scraper");
    expect(init.method).toBe("GET");
    expect(init.headers).toBeUndefined();
  });
  it("uses the latest effective tariff, FREE price and requested startup memory", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: { pricingInfos: [
      pricing({ ...events, "search-request": { eventPriceUsd: 9 } }, "2026-10-01T00:00:00Z"),
      pricing(), pricing({ "apify-default-dataset-item": { eventPriceUsd: 0.00299 }, "apify-actor-start": { eventPriceUsd: 0.00005 } }, "2026-06-01T00:00:00Z"),
    ] } }));
    await expect(checkApifyPricing({ ...input, maxChargeUsd: 0.05, fetcher })).resolves.toBeCloseTo(0.04835);
  });
  it("retains the existing Whatnot cap and includes all three records", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: { pricingInfos: [pricing({
      "apify-actor-start": { eventPriceUsd: 0.00005 }, item: { eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 0.003 } } },
    })] } }));
    await expect(checkApifyPricing({ ...input, provider: "whatnot", actor: "epicscrapers~whatnot-scraper", memoryMbytes: 256, fetcher })).resolves.toBeCloseTo(0.00905);
  });
  it.each([
    { data: { pricingInfos: [] } },
    { data: { pricingInfos: [{ ...pricing(), pricingModel: "PRICE_PER_DATASET_ITEM" }] } },
    { data: { pricingInfos: [pricing({ ...events, unknown: { eventPriceUsd: 0.001 } })] } },
    { data: { pricingInfos: [pricing({ ...events, toString: { eventPriceUsd: 0.001 } })] } },
    { data: { pricingInfos: [pricing({ ...events, "search-request": {} })] } },
    { data: { pricingInfos: [pricing({ ...events, "search-request": { eventPriceUsd: -1 } })] } },
    { data: { pricingInfos: [pricing({}, "not-a-date")] } },
  ])("fails closed on an unsupported or incomplete tariff", async (payload) => {
    await expect(checkApifyPricing({ ...input, maxChargeUsd: 0.05, fetcher: async () => Response.json(payload) })).rejects.toThrow(/pricing/i);
  });
  it("does not leak provider bodies or silently proceed when pricing is unavailable", async () => {
    await expect(checkApifyPricing({ ...input, fetcher: async () => new Response("private upstream detail", { status: 503 }) })).rejects.toThrow("Paid source paused: current Apify pricing is unavailable.");
  });
});
