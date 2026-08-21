import { afterEach, describe, expect, it } from "vitest";
import { runListingComparison } from "@/lib/ai/listing-compare";
import { clearCrosswalkCache } from "@/lib/comparison/crosswalk";
import { clearComparisonCache } from "@/lib/comparison/report-cache";
import { resetEbayTokenCacheForTests } from "@/lib/external/ebay";
import type { ComparisonRequest } from "@/lib/schemas";

const bubbleMewCard = {
  id: "sv4pt5-232",
  name: "Mew ex",
  number: "232",
  rarity: "Special Illustration Rare",
  set: { id: "sv4pt5", name: "Paldean Fates", printedTotal: 91 },
  images: {
    small: "https://images.pokemontcg.io/sv4pt5/232.png",
    large: "https://images.pokemontcg.io/sv4pt5/232_hires.png",
  },
  tcgplayer: {
    url: "https://prices.pokemontcg.io/tcgplayer/sv4pt5-232",
    prices: { holofoil: { low: 800, mid: 900, high: 1100, market: 900 } },
  },
};

const request: ComparisonRequest = {
  sourceListing: {
    marketplace: "eBay",
    url: "",
    title: "",
    description: "",
    price: null,
    shipping: null,
    claimedCondition: "Unknown",
    active: true,
    seller: {
      feedbackPercentage: null,
      feedbackCount: null,
      returnsAccepted: null,
      topRated: null,
      buyerProtection: null,
      subRatings: null,
    },
    evidence: {
      photoCount: 0,
      frontBackExplicit: false,
      closeupsExplicit: false,
      surfaceExplicit: false,
      identityExplicit: false,
      substantiveConditionNotes: false,
      missing: [],
    },
  },
  buyer: { country: "US", postalCode: "10001", taxRate: 0.08, desiredCondition: "Near Mint" },
  cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
  manualCandidates: [],
  webDiscoveryMode: "off",
  confirmedCardId: "sv4pt5-232",
};

describe("Bubble Mew production-shaped regression", () => {
  afterEach(() => {
    delete process.env.EBAY_CLIENT_ID;
    delete process.env.EBAY_CLIENT_SECRET;
    resetEbayTokenCacheForTests();
    clearCrosswalkCache();
    clearComparisonCache();
  });

  it("keeps 232/091 compatible across enrichment boundaries while independent gates still apply", async () => {
    process.env.EBAY_CLIENT_ID = "test-id";
    process.env.EBAY_CLIENT_SECRET = "test-secret";
    const detailCalls: string[] = [];
    const summaries = Array.from({ length: 13 }, (_, index) => ({
      itemId: `bubble-${String(index + 1).padStart(2, "0")}`,
      title: index === 12
        ? "Mew ex 232/091 Paldean Fates English NM RAW outside enrichment window"
        : `Mew ex 232/091 Paldean Fates NM RAW copy ${index + 1}`,
      condition: "Ungraded",
      price: { value: String(900 + index * 5), currency: "USD" },
      shippingOptions: index === 2 ? [] : [{ shippingCost: { value: "0.00", currency: "USD" } }],
    }));
    summaries[1] = { ...summaries[1], title: "Mew ex 232/091 Paldean Fates English LP", price: { value: "850", currency: "USD" } };
    summaries.push({
      itemId: "wrong-number",
      title: "Mew ex 233/091 Paldean Fates English NM",
      condition: "Ungraded",
      price: { value: "700", currency: "USD" },
      shippingOptions: [{ shippingCost: { value: "0.00", currency: "USD" } }],
    });

    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 7200 }) } as Response;
      }
      if (url.includes("api.pokemontcg.io/v2/cards/sv4pt5-232")) {
        return { ok: true, status: 200, json: async () => ({ data: bubbleMewCard }) } as Response;
      }
      if (url.includes("api.pokemontcg.io")) {
        return { ok: true, status: 200, json: async () => ({ data: [bubbleMewCard], totalCount: 1 }) } as Response;
      }
      if (url.includes("/commerce/catalog/")) {
        return { ok: true, status: 200, json: async () => ({ productSummaries: [] }) } as Response;
      }
      if (url.includes("/item_summary/search")) {
        return { ok: true, status: 200, json: async () => ({ itemSummaries: summaries }) } as Response;
      }
      if (url.includes("/buy/browse/v1/item/")) {
        const itemId = decodeURIComponent(url.split("/item/")[1]?.split("?")[0] ?? "");
        detailCalls.push(itemId);
        const summary = summaries.find((item) => item.itemId === itemId)!;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...summary,
            conditionDescriptors: [{
              name: "Card Condition",
              values: [{ content: itemId === "bubble-02" ? "Lightly played (Excellent)" : "Near Mint" }],
            }],
            localizedAspects: itemId === "bubble-04" ? [] : [
              { name: "Card Number", value: "232/091" },
              { name: "Card Name", value: "Mew Ex" },
              { name: "Set", value: "SV: Paldean Fates" },
              { name: "Rarity", value: "Special Illustration Rare" },
              { name: "Language", value: "English" },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 503, json: async () => ({ results: [] }), text: async () => "" } as Response;
    }) as unknown as typeof fetch;

    const report = await runListingComparison(request, { fetcher });
    const first = report.candidates.find((candidate) => candidate.id === "ebay-bubble-01");
    const withoutSpecifics = report.candidates.find((candidate) => candidate.id === "ebay-bubble-04");
    const outsideWindow = report.candidates.find((candidate) => candidate.id === "ebay-bubble-13");
    const wrongCondition = report.candidates.find((candidate) => candidate.id === "ebay-bubble-02");
    const unknownShipping = report.candidates.find((candidate) => candidate.id === "ebay-bubble-03");
    const wrongNumber = report.candidates.find((candidate) => candidate.id === "ebay-wrong-number");

    expect(detailCalls).toHaveLength(12);
    expect(detailCalls).not.toContain("bubble-13");
    expect(first).toMatchObject({ matchConfidence: "high", printMatch: "compatible", printMatchConfidence: "high", eligible: true });
    expect(first?.printMatchReasons).not.toContain("pokemon_listing_missing_full_collector_number");
    expect(withoutSpecifics).toMatchObject({ printMatch: "compatible", eligible: true });
    expect(outsideWindow).toMatchObject({ printMatch: "compatible", eligible: true });
    expect(wrongCondition?.eligible).toBe(false);
    expect(unknownShipping?.eligible).toBe(false);
    expect(wrongNumber).toMatchObject({
      matchConfidence: "low",
      printMatch: "mismatch",
      printMatchConfidence: "high",
      printMatchReasons: ["listing_names_different_collector_number"],
      eligible: false,
    });
    expect(report.outcome).toBe("best_buy");
  });
});
