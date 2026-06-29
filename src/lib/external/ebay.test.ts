import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEbayListingByUrl, parseEbayUrl, searchEbayAlternatives } from "@/lib/external/ebay";
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
  });
  afterEach(() => {
    delete process.env.EBAY_CLIENT_ID;
    delete process.env.EBAY_CLIENT_SECRET;
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
});
