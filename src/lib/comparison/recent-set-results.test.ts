import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runListingComparison } from "@/lib/ai/listing-compare";
import { comparisonRequestSchema } from "@/lib/schemas";
import { clearComparisonCache } from "./report-cache";
import { clearCrosswalkCache } from "./crosswalk";
import { resetEbayTokenCacheForTests } from "@/lib/external/ebay";

// Product names/IDs observed from TCGCSV on 2026-09-06. Inventory, prices and
// seller condition below are hermetic test fixtures, never claims of live stock.
const families = [
  { number: "OP16-001", name: "Portgas.D.Ace", group: 24664, release: "The Time of Battle",
    products: [{ id: 693417, name: "Portgas.D.Ace (001)" }, { id: 693418, name: "Portgas.D.Ace (001) (Alternate Art)" }] },
  { number: "OP17-001", name: "Edward.Newgate", group: 24736, release: "The World's Strongest Warriors",
    products: [{ id: 705925, name: "Edward.Newgate (001)" }, { id: 705924, name: "Edward.Newgate (001) (Alternate Art)" }] },
];

beforeEach(() => {
  clearComparisonCache(); clearCrosswalkCache(); resetEbayTokenCacheForTests();
  vi.stubEnv("EBAY_CLIENT_ID", "test"); vi.stubEnv("EBAY_CLIENT_SECRET", "test");
  vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("PRICECHARTING_API_TOKEN", "");
});
afterEach(() => { vi.unstubAllEnvs(); resetEbayTokenCacheForTests(); });

describe("same-code artwork produces an independent comparison", () => {
  it.each(families)("switches $number base → alternate → base without sharing winners or anchors", async (family) => {
    const queries: string[] = [];
    const items = family.products.map((product, index) => ({
      itemId: `v1|${product.id}|0`, title: `${product.name} ${family.number} ${family.release}`,
      itemWebUrl: `https://www.ebay.com/itm/${product.id}`, condition: "Ungraded",
      conditionDescriptors: [{ name: "Card Condition", values: [{ content: "Near Mint" }] }],
      price: { value: String(index ? 40 : 10), currency: "USD" },
      shippingOptions: [{ shippingCost: { value: "0", currency: "USD" } }],
    }));
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/oauth2/token")) return Response.json({ access_token: "test", expires_in: 7200 });
      if (url.includes("/commerce/catalog/")) return Response.json({ productSummaries: [] });
      if (url.includes("/item_summary/search")) {
        queries.push(new URL(url).searchParams.get("q") ?? "");
        return Response.json({ itemSummaries: items });
      }
      if (url.includes("/buy/browse/v1/item/")) return Response.json(items.find((item) => decodeURIComponent(url).includes(item.itemId)));
      if (url.endsWith("/groups")) return Response.json({ results: [{ groupId: family.group, name: family.release }] });
      if (url.endsWith("/products")) return Response.json({ results: family.products.map((product) => ({
        productId: product.id, name: product.name, url: `https://www.tcgplayer.com/product/${product.id}`,
        extendedData: [{ name: "Number", value: family.number }],
      })) });
      if (url.endsWith("/prices")) return Response.json({ results: family.products.map((product, index) => ({
        productId: product.id, subTypeName: "Normal", marketPrice: index ? 40 : 10,
      })) });
      return new Response("Not configured in this test", { status: 404 });
    };
    const request = comparisonRequestSchema.parse({ sourceListing: { marketplace: "Other" },
      buyer: { desiredCondition: "Near Mint", postalCode: "10001" },
      cardHint: { game: "onePiece", name: family.name, cardNumber: family.number } });
    const reports = [];
    for (const suffix of ["", "_p1", ""]) {
      reports.push(await runListingComparison({ ...request, confirmedCardId: `${family.number}${suffix}` }, { fetcher }));
    }
    for (const [index, report] of reports.entries()) {
      const alt = index === 1;
      expect(report.confirmedCard?.id).toBe(`${family.number}${alt ? "_p1" : ""}`);
      expect(report.confirmedCard?.imageUrl).toContain(`${family.number}${alt ? "_p1" : ""}.png`);
      expect(report.confirmedCard?.tcgplayerProductId).toBe(family.products[alt ? 1 : 0].id);
      expect(report.confirmedCard?.marketMid).toBe(alt ? 40 : 10);
      expect(report.outcome).toBe("best_buy");
      expect(report.rankedChoices.length).toBeGreaterThan(0);
      for (const choice of report.rankedChoices) {
        const winner = report.candidates.find((row) => row.id === choice.listingId)!;
        expect(winner.title).toBe(items[alt ? 1 : 0].title);
      }
    }
    expect(queries.some((query) => /alt/i.test(query))).toBe(true);
  });
});
