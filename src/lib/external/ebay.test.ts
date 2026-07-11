import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assessTitleMatch,
  getEbayListingByUrl,
  parseEbayUrl,
  resetEbayTokenCacheForTests,
  resolveEbayProductForCard,
  searchEbayAlternatives,
} from "@/lib/external/ebay";
import type { CardIdentityCandidate } from "@/lib/schemas";
import { findOnePieceCatalogVariant } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";

describe("eBay URL boundary", () => {
  it("extracts allowlisted eBay item IDs", () => {
    expect(parseEbayUrl("https://www.ebay.com/itm/Umbreon/123456789012").itemId).toBe("123456789012");
  });

  it("rejects arbitrary and lookalike URLs", () => {
    expect(parseEbayUrl("https://evil.example/itm/123456789012").supported).toBe(false);
    expect(parseEbayUrl("https://ebay.com.evil.example/itm/123456789012").supported).toBe(false);
  });

  it("never fetches unsupported URLs", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(getEbayListingByUrl(
      "https://evil.example/itm/123456789012",
      { country: "US", postalCode: "", taxRate: null, desiredCondition: "Unknown" },
      fetcher,
    )).rejects.toThrow("allowlisted eBay URLs");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes structured seller sub-ratings from allowed eBay item responses", async () => {
    process.env.EBAY_CLIENT_ID = "test-id";
    process.env.EBAY_CLIENT_SECRET = "test-secret";
    resetEbayTokenCacheForTests();
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      if (url.includes("/buy/browse/v1/item/get_item_by_legacy_id")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemId: "123456789012",
            title: "Umbreon VMAX 215/203",
            price: { value: "420.00", currency: "USD" },
            seller: {
              feedbackPercentage: "99.4",
              feedbackScore: 350,
              subRatings: {
                accurateDescription: "4.9",
                shippingCost: 4.8,
                shippingSpeed: 4.7,
                communication: 4.9,
              },
            },
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    try {
      const listing = await getEbayListingByUrl(
        "https://www.ebay.com/itm/Umbreon/123456789012",
        { country: "US", postalCode: "", taxRate: null, desiredCondition: "Unknown" },
        fetcher,
      );

      expect(listing.seller.subRatings).toEqual({
        accurateDescription: 4.9,
        shippingCost: 4.8,
        shippingSpeed: 4.7,
        communication: 4.9,
      });
    } finally {
      delete process.env.EBAY_CLIENT_ID;
      delete process.env.EBAY_CLIENT_SECRET;
      resetEbayTokenCacheForTests();
    }
  });

  it("treats a negative eBay feedback sentinel as unknown", async () => {
    process.env.EBAY_CLIENT_ID = "test-id";
    process.env.EBAY_CLIENT_SECRET = "test-secret";
    resetEbayTokenCacheForTests();
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          itemId: "123456789012",
          title: "Venusaur Base Set 15/102",
          price: { value: "80.00", currency: "USD" },
          seller: { feedbackScore: -1 },
        }),
      } as Response;
    }) as unknown as typeof fetch;

    try {
      const listing = await getEbayListingByUrl(
        "https://www.ebay.com/itm/Venusaur/123456789012",
        { country: "US", postalCode: "", taxRate: null, desiredCondition: "Unknown" },
        fetcher,
      );
      expect(listing.seller.feedbackCount).toBeNull();
    } finally {
      delete process.env.EBAY_CLIENT_ID;
      delete process.env.EBAY_CLIENT_SECRET;
      resetEbayTokenCacheForTests();
    }
  });
});

describe("eBay active-listing search", () => {
  beforeEach(() => {
    process.env.EBAY_CLIENT_ID = "test-id";
    process.env.EBAY_CLIENT_SECRET = "test-secret";
    resetEbayTokenCacheForTests();
  });
  afterEach(() => {
    delete process.env.EBAY_CLIENT_ID;
    delete process.env.EBAY_CLIENT_SECRET;
    resetEbayTokenCacheForTests();
  });

  const card = {
    id: "swsh7-215",
    name: "Umbreon VMAX",
    setName: "Evolving Skies",
    setCode: "SWSH7",
    cardNumber: "215/203",
    language: "English",
    imageUrl: null,
    confidence: "high",
    matchReasons: [],
  } as CardIdentityCandidate;

  const buyer = { country: "US" as const, postalCode: "10001", taxRate: 0.08, desiredCondition: "Unknown" as const };

  function searchFetcher(captured: { searchUrl?: string }) {
    return (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 7200 }) } as Response;
      }
      if (!url.includes("/item_summary/search")) {
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }
      captured.searchUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          itemSummaries: [
            { itemId: "1", title: "Umbreon VMAX 215/203", price: { value: "420.00", currency: "USD" } },
            { itemId: "2", title: "Umbreon VMAX 215/203 EU", price: { value: "390.00", currency: "EUR" } },
          ],
        }),
      } as Response;
    }) as unknown as typeof fetch;
  }

  it("does not send a priceCurrency filter alone (eBay returns 400 for that)", async () => {
    const captured: { searchUrl?: string } = {};
    await searchEbayAlternatives(card, buyer, searchFetcher(captured));
    const filter = new URL(captured.searchUrl ?? "").searchParams.get("filter");
    expect(filter).toBe("buyingOptions:{FIXED_PRICE}");
    expect(filter).not.toContain("priceCurrency");
  });

  it("uses ePID Browse search without q when a resolved eBay product is available", async () => {
    const captured: { searchUrl?: string } = {};
    await searchEbayAlternatives(card, buyer, searchFetcher(captured), undefined, {
      epid: "19049841301",
      confidence: "high",
      productTitle: "Umbreon VMAX Evolving Skies 215/203",
      localizedAspects: [{ name: "Card Number", value: "215/203" }],
      matchReasons: ["Catalog product name and collector number match."],
    });

    const url = new URL(captured.searchUrl ?? "");
    expect(url.searchParams.get("epid")).toBe("19049841301");
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.get("filter")).toBe("buyingOptions:{FIXED_PRICE}");
  });

  it("falls back to the keyword query when ePID search returns no USD summaries", async () => {
    const searchUrls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      if (url.includes("/item_summary/search")) {
        searchUrls.push(url);
        const params = new URL(url).searchParams;
        if (params.has("epid")) {
          return { ok: true, status: 200, json: async () => ({ itemSummaries: [] }) } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemSummaries: [{ itemId: "1", title: "Umbreon VMAX 215/203", price: { value: "420.00", currency: "USD" } }],
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    const results = await searchEbayAlternatives(card, buyer, fetcher, undefined, {
      epid: "19049841301",
      confidence: "high",
      productTitle: "Umbreon VMAX Evolving Skies 215/203",
      localizedAspects: [],
      matchReasons: [],
    });

    expect(searchUrls).toHaveLength(2);
    expect(new URL(searchUrls[0] ?? "").searchParams.get("epid")).toBe("19049841301");
    expect(new URL(searchUrls[1] ?? "").searchParams.get("q")).toBe("Umbreon VMAX 215/203");
    expect(results.map((listing) => listing.id)).toEqual(["ebay-1"]);
  });

  it("keeps only USD summaries so non-USD prices never rank as $0", async () => {
    const captured: { searchUrl?: string } = {};
    const results = await searchEbayAlternatives(card, buyer, searchFetcher(captured));
    expect(results.map((listing) => listing.id)).toEqual(["ebay-1"]);
  });

  // One Piece special prints share their card number with the (far cheaper) base
  // and alt-art copies, so recall depends on the variant token being in the query.
  const spCard = {
    id: "OP01-016_p4",
    name: "Nami",
    setName: "Romance Dawn",
    setCode: "OP-01",
    cardNumber: "OP01-016",
    language: "EN",
    imageUrl: null,
    rarity: "SP CARD",
    variant: "Special Art (P4)",
    confidence: "high",
    matchReasons: [],
  } as CardIdentityCandidate;

  it("searches a One Piece SP print with the variant token first", async () => {
    const captured: { searchUrl?: string } = {};
    await searchEbayAlternatives(spCard, buyer, searchFetcher(captured));
    expect(new URL(captured.searchUrl ?? "").searchParams.get("q")).toBe("Nami OP01-016 P4 SP");
  });

  it.each([
    ["OP11-118_p2", "Monkey.D.Luffy OP11-118 P2 manga"],
    ["OP05-119_p7", "Monkey.D.Luffy OP05-119 P7 silver"],
    ["OP05-119_p8", "Monkey.D.Luffy OP05-119 P8 gold"],
    ["OP13-118_p4", "Monkey.D.Luffy OP13-118 P4 wanted poster"],
    ["OP11-119_p2", "Koby OP11-119 P2 treasure cup"],
    ["ST01-012_p6", "Monkey.D.Luffy ST01-012 P6 tournament winner"],
    ["OP01-016_p2", "Nami OP01-016 P2 premium collection"],
  ])("uses verified semantic aliases in the exact-print query for %s", async (printId, expectedQuery) => {
    const print = findOnePieceCatalogVariant(printId);
    if (!print) throw new Error(`Missing bundled print ${printId}.`);
    const exactCard = mapOnePieceCardToIdentity(print, { confidence: "high", matchReasons: [] });
    const captured: { searchUrl?: string } = {};

    await searchEbayAlternatives(exactCard, buyer, searchFetcher(captured));

    expect(new URL(captured.searchUrl ?? "").searchParams.get("q")).toBe(expectedQuery);
  });

  it("continues to a semantic fallback when the first query returns only a sibling print", async () => {
    const print = findOnePieceCatalogVariant("ST01-012_p6")!;
    const winner = mapOnePieceCardToIdentity(print, { confidence: "high", matchReasons: [] });
    const searchQueries: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      if (url.includes("/item_summary/search")) {
        const query = new URL(url).searchParams.get("q") ?? "";
        searchQueries.push(query);
        const exact = !query.includes(" P6 ");
        return { ok: true, status: 200, json: async () => ({ itemSummaries: [{
          itemId: exact ? "winner" : "pack",
          title: exact ? "Luffy ST01-012 3rd Anniversary Winner" : "Luffy ST01-012 3rd Anniversary Tournament Pack",
          price: { value: "100.00", currency: "USD" },
        }] }) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    const results = await searchEbayAlternatives(winner, buyer, fetcher);
    expect(searchQueries.length).toBeGreaterThan(1);
    expect(results.map((listing) => listing.id)).toContain("ebay-winner");
  });

  it("broadens to the plain card query when the variant-token search finds no USD listings", async () => {
    const searchUrls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      if (url.includes("/item_summary/search")) {
        searchUrls.push(url);
        const q = new URL(url).searchParams.get("q") ?? "";
        if (q.endsWith(" P4 SP") || q.endsWith(" SP")) {
          return { ok: true, status: 200, json: async () => ({ itemSummaries: [] }) } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemSummaries: [{ itemId: "9", title: "Nami OP01-016 SP Special Art", price: { value: "300.00", currency: "USD" } }],
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    const results = await searchEbayAlternatives(spCard, buyer, fetcher);
    expect(searchUrls.map((url) => new URL(url).searchParams.get("q"))).toEqual([
      "Nami OP01-016 P4 SP",
      "Nami OP01-016 SP",
      "Nami OP01-016",
    ]);
    expect(results.map((listing) => listing.id)).toEqual(["ebay-9"]);
  });

  it("keeps the plain query for base One Piece prints and marks query overrides too", async () => {
    const baseCard = { ...spCard, id: "OP01-016", rarity: "R", variant: null } as CardIdentityCandidate;
    const captured: { searchUrl?: string } = {};
    await searchEbayAlternatives(baseCard, buyer, searchFetcher(captured));
    expect(new URL(captured.searchUrl ?? "").searchParams.get("q")).toBe("Nami OP01-016");

    // The crosswalk's deterministic query template arrives as an override; the
    // variant token still leads, with the raw override as the fallback attempt.
    const overridden: { searchUrl?: string } = {};
    await searchEbayAlternatives(spCard, buyer, searchFetcher(overridden), "Nami OP01-016 custom");
    expect(new URL(overridden.searchUrl ?? "").searchParams.get("q")).toBe("Nami OP01-016 custom P4 SP");
  });

  it("uses the cheapest shipping option, not the first, so landed cost matches the listing", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          itemSummaries: [
            {
              itemId: "1",
              title: "Umbreon VMAX 215/203",
              price: { value: "420.00", currency: "USD" },
              // Expedited listed first, free standard second: taking [0] would overstate.
              shippingOptions: [
                { shippingCost: { value: "24.99", currency: "USD" } },
                { shippingCost: { value: "0.0", currency: "USD" } },
              ],
            },
          ],
        }),
      } as Response;
    }) as unknown as typeof fetch;

    const results = await searchEbayAlternatives(card, buyer, fetcher);
    expect(results[0]?.shipping).toBe(0);
  });

  it("uses the item-detail Card Condition descriptor instead of treating Ungraded as unknown", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      if (url.includes("/item_summary/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemSummaries: [{
              itemId: "v1|123|0",
              title: "Umbreon VMAX 215/203 Evolving Skies",
              condition: "Ungraded",
              price: { value: "420.00", currency: "USD" },
              shippingOptions: [{ shippingCost: { value: "8.00", currency: "USD" } }],
            }],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          itemId: "v1|123|0",
          title: "Umbreon VMAX 215/203 Evolving Skies",
          condition: "Ungraded",
          conditionDescriptors: [{
            name: "Card Condition",
            values: [{
              content: "Lightly played (Excellent)",
              additionalInfo: ["Moderate surface scuffing"],
            }],
          }],
          localizedAspects: [{ name: "Language", value: "English" }],
          price: { value: "420.00", currency: "USD" },
          shippingOptions: [{ shippingCost: { value: "8.00", currency: "USD" } }],
        }),
      } as Response;
    }) as unknown as typeof fetch;

    const results = await searchEbayAlternatives(card, buyer, fetcher);

    expect(results[0]?.claimedCondition).toBe("Lightly Played");
    expect(results[0]?.listingLanguage).toBe("English");
    expect(results[0]?.evidence.substantiveConditionNotes).toBe(true);
  });

  // Real sellers often leave the title plain while eBay's own item specifics do
  // name the print — the enriched item-detail localizedAspects become
  // matchAspectText so the deterministic variant gate can read them too,
  // instead of undercounting real matching supply from title text alone.
  it("carries the item-detail localizedAspects into matchAspectText for the variant gate", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      if (url.includes("/item_summary/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemSummaries: [{
              itemId: "v1|456|0",
              title: "Umbreon VMAX 215/203",
              condition: "Ungraded",
              price: { value: "95.00", currency: "USD" },
              shippingOptions: [{ shippingCost: { value: "4.00", currency: "USD" } }],
            }],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          itemId: "v1|456|0",
          title: "Umbreon VMAX 215/203",
          condition: "Ungraded",
          localizedAspects: [
            { name: "Card Name", value: "Umbreon VMAX" },
            { name: "Parallel/Variant", value: "Alternate Art" },
          ],
          price: { value: "95.00", currency: "USD" },
          shippingOptions: [{ shippingCost: { value: "4.00", currency: "USD" } }],
        }),
      } as Response;
    }) as unknown as typeof fetch;

    const results = await searchEbayAlternatives(card, buyer, fetcher);

    expect(results[0]?.matchAspectText).toContain("Parallel/Variant: Alternate Art");
  });

  it("defaults matchAspectText to empty when the item has no localizedAspects", async () => {
    const captured: { searchUrl?: string } = {};
    const results = await searchEbayAlternatives(card, buyer, searchFetcher(captured));
    expect(results[0]?.matchAspectText).toBe("");
  });

  it("caches the OAuth token across requests instead of refetching it every time", async () => {
    let tokenCalls = 0;
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        tokenCalls += 1;
        return { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 7200 }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ itemSummaries: [] }) } as Response;
    }) as unknown as typeof fetch;

    await searchEbayAlternatives(card, buyer, fetcher);
    await searchEbayAlternatives(card, buyer, fetcher);

    expect(tokenCalls).toBe(1);
  });
});

describe("eBay catalog ePID resolution", () => {
  beforeEach(() => {
    process.env.EBAY_CLIENT_ID = "test-id";
    process.env.EBAY_CLIENT_SECRET = "test-secret";
    resetEbayTokenCacheForTests();
  });
  afterEach(() => {
    delete process.env.EBAY_CLIENT_ID;
    delete process.env.EBAY_CLIENT_SECRET;
    resetEbayTokenCacheForTests();
  });

  const card = {
    id: "swsh7-215",
    name: "Umbreon VMAX",
    setName: "Evolving Skies",
    setCode: "SWSH7",
    cardNumber: "215/203",
    language: "English",
    imageUrl: null,
    confidence: "high",
    matchReasons: [],
  } as CardIdentityCandidate;

  const buyer = { country: "US" as const, postalCode: "", taxRate: null, desiredCondition: "Unknown" as const };

  it("accepts a catalog ePID only when name and collector number match", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      if (url.includes("/commerce/catalog/") && url.includes("/product_summary/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            productSummaries: [{
              epid: "19049841301",
              title: "Umbreon VMAX Evolving Skies 215/203",
              localizedAspects: [
                { name: "Game", value: "Pokemon TCG" },
                { name: "Set", value: "Evolving Skies" },
                { name: "Card Number", value: "215/203" },
                { name: "Language", value: "English" },
              ],
            }],
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const result = await resolveEbayProductForCard(card, buyer, fetcher);

    expect(result?.epid).toBe("19049841301");
    expect(result?.confidence).toBe("high");
    expect(result?.localizedAspects).toContainEqual({ name: "Card Number", value: "215/203" });
  });

  it("returns null for wrong-number catalog hits instead of guessing an ePID", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      if (url.includes("/commerce/catalog/") && url.includes("/product_summary/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            productSummaries: [{
              epid: "wrong",
              title: "Umbreon VMAX Evolving Skies 209/203",
              localizedAspects: [
                { name: "Set", value: "Evolving Skies" },
                { name: "Card Number", value: "209/203" },
              ],
            }],
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await expect(resolveEbayProductForCard(card, buyer, fetcher)).resolves.toBeNull();
  });

  it("rejects an ePID whose catalog aspects identify a sibling Nami print", async () => {
    const selected = {
      id: "OP01-016_p4",
      name: "Nami",
      setName: "Awakening Of The New Era",
      setCode: "OP-05",
      cardNumber: "OP01-016",
      language: "EN",
      imageUrl: null,
      rarity: "SP CARD",
      variant: "Special Art (P4)",
      confidence: "high",
      matchReasons: [],
    } as CardIdentityCandidate;
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      if (url.includes("/commerce/catalog/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            productSummaries: [{
              epid: "wrong-alt",
              title: "Nami OP01-016 Alternate Art P2",
              localizedAspects: [
                { name: "Parallel/Variant", value: "Alternate Art (P2)" },
                { name: "Card Number", value: "OP01-016" },
              ],
            }],
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await expect(resolveEbayProductForCard(selected, buyer, fetcher)).resolves.toBeNull();
  });

  it("does not synthesize an ePID from Browse-title consensus when Catalog aspects are unavailable", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      if (url.includes("/commerce/catalog/") && url.includes("/product_summary/search")) {
        return { ok: false, status: 403, json: async () => ({}) } as Response;
      }
      if (url.includes("/buy/browse/v1/item_summary/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemSummaries: [
              { itemId: "1", epid: "24048923237", title: "Umbreon VMAX 215/203 Evolving Skies", price: { value: "420.00", currency: "USD" } },
              { itemId: "2", epid: "24048923237", title: "Umbreon VMAX 215/203 Evolving Skies NM", price: { value: "425.00", currency: "USD" } },
              { itemId: "3", epid: "noise", title: "Umbreon plush toy", price: { value: "10.00", currency: "USD" } },
            ],
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await expect(resolveEbayProductForCard(card, buyer, fetcher)).resolves.toBeNull();
  });

  it("rejects a title-only Catalog ePID when no localized aspects prove the print", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      if (url.includes("/commerce/catalog/") && url.includes("/product_summary/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            productSummaries: [{
              epid: "title-only",
              title: "Umbreon VMAX Evolving Skies 215/203",
              localizedAspects: [],
            }],
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await expect(resolveEbayProductForCard(card, buyer, fetcher)).resolves.toBeNull();
  });

  it("does not infer a Browse ePID when high-confidence listings disagree", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t" }) } as Response;
      }
      if (url.includes("/commerce/catalog/") && url.includes("/product_summary/search")) {
        return { ok: false, status: 403, json: async () => ({}) } as Response;
      }
      if (url.includes("/buy/browse/v1/item_summary/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemSummaries: [
              { itemId: "1", epid: "a", title: "Umbreon VMAX 215/203 Evolving Skies", price: { value: "420.00", currency: "USD" } },
              { itemId: "2", epid: "b", title: "Umbreon VMAX 215/203 Evolving Skies NM", price: { value: "425.00", currency: "USD" } },
            ],
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await expect(resolveEbayProductForCard(card, buyer, fetcher)).resolves.toBeNull();
  });
});

describe("assessTitleMatch (listing-title identity confidence)", () => {
  const card = { name: "Umbreon VMAX", setName: "Evolving Skies", setCode: "SWSH7", cardNumber: "215/203" };

  it("rates a clean name + full collector number as high", () => {
    expect(assessTitleMatch("Umbreon VMAX 215/203 Evolving Skies NM", card).confidence).toBe("high");
  });

  it("tolerates zero-padded collector numbers", () => {
    const padded = { ...card, cardNumber: "4/102" };
    expect(assessTitleMatch("Charizard Holo 004/102 Base Set", { ...padded, name: "Charizard" }).confidence).toBe("high");
  });

  it("tolerates reordered and re-spaced name tokens", () => {
    expect(assessTitleMatch("VMAX Umbreon 215/203 raw", card).confidence).toBe("high");
    expect(assessTitleMatch("Umbreon V MAX 215/203", card).confidence).toBe("high");
  });

  it("keeps a bare '#215' with the right name as medium (comparable, not top confidence)", () => {
    expect(assessTitleMatch("Umbreon VMAX #215 Evolving Skies", card).confidence).toBe("medium");
    expect(assessTitleMatch("Umbreon VMAX 215 NM/M", card).confidence).toBe("medium");
  });

  it("accepts the set code in place of the set name", () => {
    expect(assessTitleMatch("Umbreon VMAX SWSH7 alt art", card).confidence).toBe("medium");
  });

  it("rates number + set without the card name as medium", () => {
    expect(assessTitleMatch("Evolving Skies 215/203 Alt Art NM", card).confidence).toBe("medium");
  });

  it("still rejects unrelated listings as low", () => {
    expect(assessTitleMatch("Pikachu VMAX 044/185 Vivid Voltage", card).confidence).toBe("low");
    expect(assessTitleMatch("Umbreon plush toy", card).confidence).toBe("low");
  });

  it("never matches a collector number inside a larger number", () => {
    const base = { name: "Charizard", setName: "Base Set", setCode: "BS", cardNumber: "4/102" };
    // "14/102" contains "4/102" as a substring — must not read as the confirmed number.
    expect(assessTitleMatch("Charizard 14/102 holo", base).confidence).toBe("low");
    expect(assessTitleMatch("Charizard 004/102 holo", base).confidence).toBe("high");
  });

  it("does not match a prefix code inside a longer code", () => {
    const promo = { name: "Greninja", setName: "SWSH Black Star Promos", setCode: "SWSHP", cardNumber: "SWSH14" };
    expect(assessTitleMatch("Greninja SWSH144 Gold Star", promo).confidence).toBe("low");
  });

  it("rejects a same-promo-series sibling when both use compact promo codes", () => {
    const promo = { name: "Greninja", setName: "SWSH Black Star Promos", setCode: "SWSHP", cardNumber: "SWSH305" };
    expect(assessTitleMatch("Greninja Star SWSH144 Black Star Promo", promo).confidence).toBe("low");
    expect(assessTitleMatch("Greninja SWSH305 Black Star Promo", promo).confidence).toBe("high");
  });

  it("requires set corroboration for short bare numerators (cross-set collision guard)", () => {
    const pikachu = { name: "Pikachu", setName: "Vivid Voltage", setCode: "SWSH4", cardNumber: "025/185" };
    expect(assessTitleMatch("Pikachu 25 NM", pikachu).confidence).toBe("low");
    expect(assessTitleMatch("Pikachu 25 Vivid Voltage NM", pikachu).confidence).toBe("medium");
  });

  it("handles prefix-code games (One Piece) with hyphen/space variance", () => {
    const op = { name: "Monkey.D.Luffy", setName: "Romance Dawn", setCode: "OP-01", cardNumber: "OP01-003" };
    expect(assessTitleMatch("Monkey D Luffy OP01-003 Romance Dawn", op).confidence).toBe("high");
    expect(assessTitleMatch("One Piece Luffy OP01 003 alt", op).confidence).toBe("high");
  });

  it("rejects a same-name sibling that spells out a different collector number", () => {
    // A set holds many cards of one character. An OP01-024 search must not accept an
    // OP01-003 listing on the strength of name + set alone (the old medium path).
    const luffy024 = { name: "Monkey.D.Luffy", setName: "Romance Dawn", setCode: "OP-01", cardNumber: "OP01-024" };
    expect(assessTitleMatch("Monkey.D.Luffy (003) OP01-003 Romance Dawn", luffy024).confidence).toBe("low");
    // The correct number still matches, and a number-less title stays comparable.
    expect(assessTitleMatch("Monkey.D.Luffy OP01-024 Romance Dawn SR", luffy024).confidence).toBe("high");
    expect(assessTitleMatch("Monkey.D.Luffy Romance Dawn SR Foil", luffy024).confidence).toBe("medium");

    // Same guard for fraction-numbered games (Pokémon 215/203 vs 209/203).
    const umbreon = { name: "Umbreon VMAX", setName: "Evolving Skies", setCode: "SWSH7", cardNumber: "215/203" };
    expect(assessTitleMatch("Umbreon VMAX 209/203 Evolving Skies", umbreon).confidence).toBe("low");
  });
});
