import { describe, expect, it, vi } from "vitest";
import {
  getTcgcsvLastUpdated,
  isTcgcsvStale,
  resolveTcgplayerProduct,
  searchTcgplayerListings,
  type TcgplayerProductMatch,
} from "@/lib/external/tcgcsv";
import type { CardIdentityCandidate } from "@/lib/schemas";

const card: CardIdentityCandidate = {
  id: "swsh7-215",
  name: "Umbreon VMAX",
  setName: "Evolving Skies",
  setCode: "SWSH7",
  cardNumber: "215/203",
  language: "English",
  imageUrl: "https://images.pokemontcg.io/swsh7/215_hires.png",
  confidence: "high",
  matchReasons: [],
};

const groupsPayload = {
  results: [
    { groupId: 2848, name: "SWSH07: Evolving Skies", abbreviation: "SWSH07" },
    { groupId: 2948, name: "SWSH09: Brilliant Stars", abbreviation: "SWSH09" },
  ],
};

const productsPayload = {
  results: [
    {
      productId: 246723,
      name: "Umbreon VMAX (Alternate Art Secret)",
      cleanName: "Umbreon VMAX Alternate Art Secret",
      url: "https://www.tcgplayer.com/product/246723",
      extendedData: [{ name: "Number", value: "215/203" }],
    },
    {
      productId: 111111,
      name: "Glaceon VMAX (Alternate Art Secret)",
      cleanName: "Glaceon VMAX Alternate Art Secret",
      url: "https://www.tcgplayer.com/product/111111",
      extendedData: [{ name: "Number", value: "209/203" }],
    },
  ],
};

const pricesPayload = {
  results: [
    {
      productId: 246723,
      lowPrice: 1999.99,
      midPrice: 2500,
      highPrice: 6000,
      marketPrice: 2204.86,
      directLowPrice: 2499.93,
      subTypeName: "Holofoil",
    },
    { productId: 111111, lowPrice: 500, midPrice: 600, highPrice: 900, marketPrice: 540, directLowPrice: null, subTypeName: "Holofoil" },
  ],
};

function tcgcsvFetcher(lastUpdated = "2026-07-02T20:06:28+0000") {
  return vi.fn(async (url: URL | RequestInfo) => {
    const href = String(url);
    if (href.includes("last-updated")) return new Response(lastUpdated);
    if (href.endsWith("/3/groups")) return new Response(JSON.stringify(groupsPayload));
    if (href.endsWith("/3/2848/products")) return new Response(JSON.stringify(productsPayload));
    if (href.endsWith("/3/2848/prices")) return new Response(JSON.stringify(pricesPayload));
    throw new Error(`unexpected fetch ${href}`);
  }) as unknown as typeof fetch;
}

describe("TCGCSV TCGplayer connector", () => {
  it("resolves the crosswalk product by set name and collector number", async () => {
    const product = await resolveTcgplayerProduct(card, tcgcsvFetcher());
    expect(product?.productId).toBe(246723);
    expect(product?.groupId).toBe(2848);
    expect(product?.productUrl).toContain("246723");
  });

  it("returns null for a card missing from the feed instead of failing", async () => {
    const product = await resolveTcgplayerProduct(
      { ...card, name: "Missingmon", cardNumber: "999/203" },
      tcgcsvFetcher(),
    );
    expect(product).toBeNull();
  });

  it("builds listing seeds per priced variant plus a Direct row", async () => {
    const fetcher = tcgcsvFetcher();
    const product = await resolveTcgplayerProduct(card, fetcher);
    const result = await searchTcgplayerListings(card, product as TcgplayerProductMatch, fetcher);

    expect(result.seeds.map((seed) => seed.id)).toEqual([
      "tcgplayer-246723-holofoil-low",
      "tcgplayer-246723-holofoil-direct",
    ]);
    expect(result.seeds[0].price).toBe(1999.99);
    expect(result.seeds[1].price).toBe(2499.93);
    expect(result.seeds.every((seed) => seed.marketplace === "TCGplayer")).toBe(true);
    // Aggregate rows carry no seller track record: unverified, never invented.
    expect(result.seeds.every((seed) => seed.seller.feedbackPercentage === null)).toBe(true);
    expect(result.seeds.every((seed) => seed.seller.buyerProtection === true)).toBe(true);
    // No invented condition claim for aggregate price rows.
    expect(result.seeds.every((seed) => seed.claimedCondition === "Unknown")).toBe(true);
    expect(result.anchor?.mid).toBe(2204.86);
    expect(result.asOf).toBe("2026-07-02T20:06:28.000Z");
  });

  it("degrades to an empty result when the crosswalk has no product", async () => {
    const result = await searchTcgplayerListings(card, null, tcgcsvFetcher());
    expect(result.seeds).toEqual([]);
    expect(result.anchor).toBeNull();
    expect(result.product).toBeNull();
  });

  it("reports freshness and flags >48h-stale data", async () => {
    const asOf = await getTcgcsvLastUpdated(tcgcsvFetcher());
    expect(asOf).toBe("2026-07-02T20:06:28.000Z");
    expect(isTcgcsvStale(asOf, new Date("2026-07-03T12:00:00Z"))).toBe(false);
    expect(isTcgcsvStale(asOf, new Date("2026-07-05T12:00:00Z"))).toBe(true);
    expect(isTcgcsvStale(null)).toBe(false);
  });
});
