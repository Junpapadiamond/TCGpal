import { describe, expect, it, vi } from "vitest";
import {
  findTcgplayerGroup,
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

const svPromoCard: CardIdentityCandidate = {
  id: "svp-52",
  name: "Mewtwo",
  setName: "Scarlet & Violet Black Star Promos",
  setCode: "SVP",
  cardNumber: "052",
  language: "English",
  imageUrl: "https://images.pokemontcg.io/svp/52_hires.png",
  confidence: "high",
  matchReasons: [],
};

const svPromoGroupsPayload = {
  results: [
    { groupId: 22872, name: "SV: Scarlet & Violet Promo Cards", abbreviation: "SVP" },
    { groupId: 23228, name: "SV: Scarlet & Violet 151", abbreviation: "MEW" },
  ],
};

const svPromoProductsPayload = {
  results: [{
    productId: 518872,
    name: "Mewtwo - 052",
    cleanName: "Mewtwo 052",
    url: "https://www.tcgplayer.com/product/518872/pokemon-sv-scarlet-and-violet-promo-cards-mewtwo-052",
    extendedData: [{ name: "Number", value: "052" }],
  }],
};

function svPromoFetcher() {
  return vi.fn(async (url: URL | RequestInfo) => {
    const href = String(url);
    if (href.endsWith("/3/groups")) return new Response(JSON.stringify(svPromoGroupsPayload));
    if (href.endsWith("/3/22872/products")) return new Response(JSON.stringify(svPromoProductsPayload));
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

  // Every Black Star Promos release is published by TCGplayer under a different
  // name than pokemontcg.io uses, and only the SM alias existed — so a Scarlet &
  // Violet promo silently lost its market anchor, which is also the input the
  // market-floor gate needs to reject replicas.
  it("resolves Scarlet & Violet Black Star Promos through TCGplayer's promo group", async () => {
    const product = await resolveTcgplayerProduct(svPromoCard, svPromoFetcher());

    expect(product).toMatchObject({
      groupId: 22872,
      productId: 518872,
      collectorNumber: "052",
    });
  });

  // Same release, second spelling: pokemontcg.io also serves this set as
  // "Scarlet & Violet Promos" with no release code, and the anchor must survive
  // either name.
  it("resolves the renamed Scarlet & Violet promo set name to the same group", async () => {
    const renamed = { ...svPromoCard, setName: "Scarlet & Violet Promos" };
    const product = await resolveTcgplayerProduct(renamed, svPromoFetcher());

    expect(product?.groupId).toBe(22872);
  });
});

// Every promo release TCGplayer publishes under a name pokemontcg.io does not
// use, plus the neighbours a loose match could stray into. Names and ids are the
// real ones from tcgcsv.com/tcgplayer/3/groups, read 2026-08-21.
const REAL_POKEMON_GROUPS = [
  { groupId: 604, name: "Base Set" },
  { groupId: 1387, name: "XY Base Set" },
  { groupId: 1400, name: "Black and White" },
  { groupId: 1402, name: "HeartGold SoulSilver" },
  { groupId: 1407, name: "Black and White Promos" },
  { groupId: 1418, name: "WoTC Promo" },
  { groupId: 1421, name: "Diamond and Pearl Promos" },
  { groupId: 1423, name: "Nintendo Promos" },
  { groupId: 1451, name: "XY Promos" },
  { groupId: 1453, name: "HGSS Promos" },
  { groupId: 1455, name: "Best of Promos" },
  { groupId: 1540, name: "HGSS Trainer Kit: Gyarados & Raichu" },
  { groupId: 1861, name: "SM Promos" },
  { groupId: 1863, name: "SM Base Set" },
  { groupId: 2545, name: "SWSH: Sword & Shield Promo Cards" },
  { groupId: 2585, name: "SWSH01: Sword & Shield Base Set" },
  { groupId: 22872, name: "SV: Scarlet & Violet Promo Cards" },
  { groupId: 22873, name: "SV01: Scarlet & Violet Base Set" },
  { groupId: 23237, name: "SV: Scarlet & Violet 151" },
  { groupId: 23821, name: "SV: Prismatic Evolutions" },
  { groupId: 24382, name: "SVE: Scarlet & Violet Energies" },
  { groupId: 1663, name: "Base Set (Shadowless)" },
  { groupId: 1842, name: "XY - Evolutions" },
  { groupId: 2948, name: "SWSH09: Brilliant Stars" },
  { groupId: 3020, name: "SWSH09: Brilliant Stars Trainer Gallery" },
];

function realGroupFetcher() {
  return vi.fn(async (url: URL) => {
    expect(url.pathname).toBe("/tcgplayer/3/groups");
    return new Response(JSON.stringify({ results: REAL_POKEMON_GROUPS }));
  }) as unknown as typeof fetch;
}

// The alias table is a list of claims about names TCGplayer actually publishes.
// A claim nobody checks rots: only the SM entry existed for months, so every
// other promo release silently lost its market anchor — and its market-floor
// gate — until a buyer reported a specific card. One case per alias, so a
// renamed group fails here instead of on the result screen.
describe("promo release group aliases", () => {
  const promoReleases: [string, number][] = [
    ["Wizards Black Star Promos", 1418],
    ["Nintendo Black Star Promos", 1423],
    ["DP Black Star Promos", 1421],
    ["HGSS Black Star Promos", 1453],
    ["BW Black Star Promos", 1407],
    ["XY Black Star Promos", 1451],
    ["SM Black Star Promos", 1861],
    ["SWSH Black Star Promos", 2545],
    ["Scarlet & Violet Black Star Promos", 22872],
    ["Scarlet & Violet Promos", 22872],
  ];

  it.each(promoReleases)("maps %s to TCGplayer group %i", async (setName, groupId) => {
    const group = await findTcgplayerGroup(3, setName, realGroupFetcher());

    expect(group?.groupId).toBe(groupId);
  });

  // The HGSS alias is the one a buyer reported: Suicune HGSS21 showed "Exact
  // TCGplayer mapping unavailable" against a TCGplayer market of $60.44. The
  // release also owns a trainer kit and a main set whose names share its prefix,
  // so the alias has to land on the promo group specifically.
  it("keeps the HGSS promo alias off the trainer kit and the main set", async () => {
    const group = await findTcgplayerGroup(3, "HGSS Black Star Promos", realGroupFetcher());

    expect(group?.name).toBe("HGSS Promos");
  });
});

// A base set's name is a prefix of every later release in its era, so the group
// search finds many containment matches and the tie-break decides which one the
// buyer's market anchor comes from. Ranking those ties by shortest name picked
// "SV: Scarlet & Violet 151" for the Scarlet & Violet base set and "XY Promos"
// for XY — and `releaseMatches` then discarded the result, so 722 cards across
// four base sets showed no market reference at all. Verified 2026-08-21 against
// the live product feeds: SV-151 carries 1 of sv1's 250 sampled cards, the base
// set carries 247.
describe("base release group matching", () => {
  const baseReleases: [string, number][] = [
    ["Scarlet & Violet", 22873],
    ["XY", 1387],
    ["Base", 604],
    ["Sword & Shield", 2585],
  ];

  it.each(baseReleases)("matches %s to its own base-set group", async (setName, groupId) => {
    const group = await findTcgplayerGroup(3, setName, realGroupFetcher());

    expect(group?.groupId).toBe(groupId);
  });

  // The other half of the same rule: a release whose name genuinely contains the
  // extra words must still win its own group. "151" is a Scarlet & Violet set
  // whose TCGplayer group carries "Scarlet" and "Violet" as real tokens, and a
  // rule that only punished extra words would send it to the base set.
  const namedReleases: [string, number][] = [
    ["151", 23237],
    ["Evolutions", 1842],
    ["Brilliant Stars", 2948],
    ["Brilliant Stars Trainer Gallery", 3020],
  ];

  it.each(namedReleases)("keeps %s on its own release group", async (setName, groupId) => {
    const group = await findTcgplayerGroup(3, setName, realGroupFetcher());

    expect(group?.groupId).toBe(groupId);
  });
});
