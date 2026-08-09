import { describe, expect, it, vi } from "vitest";
import {
  getTcgcsvLastUpdated,
  inferTcgplayerCategoryId,
  isTcgcsvStale,
  resolveTcgplayerProduct,
  resolveTcgplayerProductVariants,
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

const onePieceCard: CardIdentityCandidate = {
  id: "OP01-024",
  name: "Monkey.D.Luffy",
  setName: "Romance Dawn",
  setCode: "OP-01",
  cardNumber: "OP01-024",
  language: "EN",
  imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-024.png",
  confidence: "high",
  matchReasons: [],
};

const onePieceGroupsPayload = {
  results: [
    { groupId: 23293, name: "OP-01: Romance Dawn", abbreviation: "OP-01" },
  ],
};

const onePieceProductsPayload = {
  results: [
    {
      productId: 453508,
      name: "Monkey.D.Luffy (024)",
      cleanName: "MonkeyDLuffy 024",
      url: "https://www.tcgplayer.com/product/453508/one-piece-card-game-romance-dawn-monkeydluffy-024",
      extendedData: [{ name: "Number", value: "OP01-024" }],
    },
    {
      productId: 453509,
      name: "Monkey.D.Luffy (024) (Parallel)",
      cleanName: "MonkeyDLuffy 024 Parallel",
      url: "https://www.tcgplayer.com/product/453509/one-piece-card-game-romance-dawn-monkeydluffy-024-parallel",
      extendedData: [{ name: "Number", value: "OP01-024" }],
    },
  ],
};

const onePiecePricesPayload = {
  results: [
    {
      productId: 453508,
      lowPrice: 1.21,
      midPrice: 2.5,
      highPrice: 8,
      marketPrice: 1.76,
      directLowPrice: null,
      subTypeName: "Normal",
    },
  ],
};

const baseCharizardCard: CardIdentityCandidate = {
  id: "base1-4",
  name: "Charizard",
  setName: "Base",
  setCode: "base1",
  cardNumber: "4/102",
  language: "English",
  imageUrl: "https://images.pokemontcg.io/base1/4_hires.png",
  confidence: "high",
  matchReasons: [],
};

const smPromoCard: CardIdentityCandidate = {
  id: "smp-SM229",
  name: "Venusaur & Snivy GX",
  setName: "SM Black Star Promos",
  setCode: "SMP",
  cardNumber: "SM229",
  language: "English",
  imageUrl: "https://images.pokemontcg.io/smp/SM229_hires.png",
  confidence: "high",
  matchReasons: [],
};

const smPromoGroupsPayload = {
  results: [
    { groupId: 1861, name: "SM Promos", abbreviation: "SMP" },
  ],
};

const smPromoProductsPayload = {
  results: [{
    productId: 205162,
    name: "Venusaur & Snivy GX - SM229",
    cleanName: "Venusaur and Snivy GX SM229",
    url: "https://www.tcgplayer.com/product/205162/pokemon-sm-promos-venusaur-and-snivy-gx-sm229",
    extendedData: [{ name: "Number", value: "SM229" }],
  }],
};

const baseCollisionGroupsPayload = {
  results: [
    { groupId: 20001, name: "SV01: Scarlet & Violet Base Set", abbreviation: "SV01" },
    { groupId: 604, name: "Base Set", abbreviation: "BS" },
  ],
};

const baseSetProductsPayload = {
  results: [{
    productId: 42382,
    name: "Charizard",
    cleanName: "Charizard",
    url: "https://www.tcgplayer.com/product/42382/pokemon-base-set-charizard",
    extendedData: [{ name: "Number", value: "4/102" }],
  }],
};

const scarletVioletBaseProductsPayload = {
  results: [{
    productId: 487833,
    name: "Breloom",
    cleanName: "Breloom",
    url: "https://www.tcgplayer.com/product/487833/pokemon-sv01-scarlet-and-violet-base-set-breloom",
    extendedData: [{ name: "Number", value: "004/198" }],
  }],
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

function mixedTcgcsvFetcher(lastUpdated = "2026-07-02T20:06:28+0000") {
  return vi.fn(async (url: URL | RequestInfo) => {
    const href = String(url);
    if (href.includes("last-updated")) return new Response(lastUpdated);
    if (href.endsWith("/3/groups")) return new Response(JSON.stringify(groupsPayload));
    if (href.endsWith("/3/2848/products")) return new Response(JSON.stringify(productsPayload));
    if (href.endsWith("/3/2848/prices")) return new Response(JSON.stringify(pricesPayload));
    if (href.endsWith("/68/groups")) return new Response(JSON.stringify(onePieceGroupsPayload));
    if (href.endsWith("/68/23293/products")) return new Response(JSON.stringify(onePieceProductsPayload));
    if (href.endsWith("/68/23293/prices")) return new Response(JSON.stringify(onePiecePricesPayload));
    throw new Error(`unexpected fetch ${href}`);
  }) as unknown as typeof fetch;
}

function vintageBaseCollisionFetcher() {
  return vi.fn(async (url: URL | RequestInfo) => {
    const href = String(url);
    if (href.endsWith("/3/groups")) return new Response(JSON.stringify(baseCollisionGroupsPayload));
    if (href.endsWith("/3/604/products")) return new Response(JSON.stringify(baseSetProductsPayload));
    if (href.endsWith("/3/20001/products")) return new Response(JSON.stringify(scarletVioletBaseProductsPayload));
    throw new Error(`unexpected fetch ${href}`);
  }) as unknown as typeof fetch;
}

function unresolvedVintageBaseFetcher() {
  return vi.fn(async (url: URL | RequestInfo) => {
    const href = String(url);
    if (href.endsWith("/3/groups")) {
      return new Response(JSON.stringify({ results: [baseCollisionGroupsPayload.results[0]] }));
    }
    if (href.endsWith("/3/20001/products")) return new Response(JSON.stringify(scarletVioletBaseProductsPayload));
    throw new Error(`unexpected fetch ${href}`);
  }) as unknown as typeof fetch;
}

function smPromoFetcher() {
  return vi.fn(async (url: URL | RequestInfo) => {
    const href = String(url);
    if (href.endsWith("/3/groups")) return new Response(JSON.stringify(smPromoGroupsPayload));
    if (href.endsWith("/3/1861/products")) return new Response(JSON.stringify(smPromoProductsPayload));
    throw new Error(`unexpected fetch ${href}`);
  }) as unknown as typeof fetch;
}

describe("TCGCSV TCGplayer connector", () => {
  it("resolves the crosswalk product by set name and collector number", async () => {
    const product = await resolveTcgplayerProduct(card, tcgcsvFetcher());
    expect(product?.categoryId).toBe(3);
    expect(product?.productId).toBe(246723);
    expect(product?.groupId).toBe(2848);
    expect(product?.productUrl).toContain("246723");
  });

  it("prefers the vintage Base Set group over a newer set that contains the same term", async () => {
    const product = await resolveTcgplayerProduct(baseCharizardCard, vintageBaseCollisionFetcher());

    expect(product).toMatchObject({
      groupId: 604,
      productId: 42382,
      productName: "Charizard",
    });
  });

  it("refuses a prefix-only collector-number collision when the product name disagrees", async () => {
    const product = await resolveTcgplayerProduct(baseCharizardCard, unresolvedVintageBaseFetcher());

    expect(product).toBeNull();
  });

  it("resolves SM Black Star Promos through TCGplayer's SM Promos group", async () => {
    const product = await resolveTcgplayerProduct(smPromoCard, smPromoFetcher());

    expect(product).toMatchObject({
      groupId: 1861,
      productId: 205162,
      collectorNumber: "SM229",
    });
  });

  it("routes One Piece cards through TCGCSV category 68", async () => {
    const fetcher = mixedTcgcsvFetcher();
    const product = await resolveTcgplayerProduct(onePieceCard, fetcher);
    const variants = await resolveTcgplayerProductVariants(onePieceCard, fetcher);
    const result = await searchTcgplayerListings(onePieceCard, product as TcgplayerProductMatch, fetcher);

    expect(inferTcgplayerCategoryId(onePieceCard)).toBe(68);
    expect(variants.map((variant) => variant.productId)).toEqual([453508, 453509]);
    expect(product?.categoryId).toBe(68);
    expect(product?.groupId).toBe(23293);
    expect(product?.productId).toBe(453508);
    expect(result.seeds).toEqual([]);
    expect(result.anchor?.mid).toBe(1.76);
  });

  it("can resolve a requested TCGplayer product variant instead of the base product", async () => {
    const product = await resolveTcgplayerProduct(
      { ...onePieceCard, tcgplayerProductId: 453509 },
      mixedTcgcsvFetcher(),
    );

    expect(product?.productId).toBe(453509);
    expect(product?.productName).toContain("Parallel");
  });

  it("fetches the verified group for a special release whose catalog set name differs", async () => {
    const anniversaryNami: CardIdentityCandidate = {
      ...onePieceCard,
      id: "OP01-016_p7",
      name: "Nami",
      cardNumber: "OP01-016",
      setName: "English Version 1st Anniversary Set",
      variant: "English 1st Anniversary Art",
      tcgplayerProductId: 557286,
      tcgplayerGroupId: 17675,
    };
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      const href = String(url);
      if (href.endsWith("/68/groups")) {
        return new Response(JSON.stringify({ results: [{
          groupId: 17675,
          name: "One Piece Promotion Cards",
          abbreviation: "OP-PR",
        }] }));
      }
      if (href.endsWith("/68/17675/products")) {
        return new Response(JSON.stringify({ results: [{
          productId: 557286,
          name: "Nami (English Version 1st Anniversary Set)",
          cleanName: "Nami English Version 1st Anniversary Set",
          url: "https://www.tcgplayer.com/product/557286",
          extendedData: [{ name: "Number", value: "OP01-016" }],
        }] }));
      }
      throw new Error(`unexpected fetch ${href}`);
    }) as unknown as typeof fetch;

    const variants = await resolveTcgplayerProductVariants(anniversaryNami, fetcher);

    expect(variants).toMatchObject([{
      groupId: 17675,
      groupName: "One Piece Promotion Cards",
      productId: 557286,
    }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns null when a requested TCGplayer product id is absent", async () => {
    const product = await resolveTcgplayerProduct(
      { ...onePieceCard, tcgplayerProductId: 999999 },
      mixedTcgcsvFetcher(),
    );

    expect(product).toBeNull();
  });

  it("anchors a confirmed alternate-art print to the parallel SKU, not the base", async () => {
    // Same card number, different art and price: a confirmed alt-art print (carries a
    // `variant` label) must price against the parallel product, never the cheaper base.
    const altArt = { ...onePieceCard, id: "OP01-024_p1", variant: "Alternate Art (P1)" };
    const product = await resolveTcgplayerProduct(altArt, mixedTcgcsvFetcher());
    expect(product?.productId).toBe(453509);
    expect(product?.productName).toContain("Parallel");

    // And the base print (no variant) still anchors to the base product.
    const base = await resolveTcgplayerProduct(onePieceCard, mixedTcgcsvFetcher());
    expect(base?.productId).toBe(453508);
    expect(base?.productName).not.toContain("Parallel");
  });

  it("returns null for a card missing from the feed instead of failing", async () => {
    const product = await resolveTcgplayerProduct(
      { ...card, name: "Missingmon", cardNumber: "999/203" },
      tcgcsvFetcher(),
    );
    expect(product).toBeNull();
  });

  it("keeps daily aggregate prices as a market reference, never seller inventory", async () => {
    const fetcher = tcgcsvFetcher();
    const product = await resolveTcgplayerProduct(card, fetcher);
    const result = await searchTcgplayerListings(card, product as TcgplayerProductMatch, fetcher);

    expect(result.seeds).toEqual([]);
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
