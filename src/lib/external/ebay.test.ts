import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assessTitleMatch,
  getEbayListingByUrl,
  parseEbayUrl,
  resetEbayTokenCacheForTests,
  searchEbayAlternatives,
} from "@/lib/external/ebay";
import type { CardIdentityCandidate } from "@/lib/schemas";

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

  it("keeps only USD summaries so non-USD prices never rank as $0", async () => {
    const captured: { searchUrl?: string } = {};
    const results = await searchEbayAlternatives(card, buyer, searchFetcher(captured));
    expect(results.map((listing) => listing.id)).toEqual(["ebay-1"]);
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
