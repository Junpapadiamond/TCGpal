import { describe, expect, it } from "vitest";
import { selectExactTcgplayerProduct } from "@/lib/comparison/crosswalk";
import { findOnePieceCatalogVariant } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";
import type { TcgplayerProductMatch } from "@/lib/external/tcgcsv";

const p4 = mapOnePieceCardToIdentity(findOnePieceCatalogVariant("OP01-016_p4")!, {
  confidence: "high",
  matchReasons: ["selected"],
});
const p2 = mapOnePieceCardToIdentity(findOnePieceCatalogVariant("OP01-016_p2")!, {
  confidence: "high",
  matchReasons: ["selected"],
});
const goldGearFive = mapOnePieceCardToIdentity(findOnePieceCatalogVariant("OP05-119_p8")!, {
  confidence: "high",
  matchReasons: ["selected"],
});

const researchedSpecialReleases = [
  {
    id: "OP01-016_p7",
    productId: 557286,
    groupId: 17675,
    groupName: "One Piece Promotion Cards",
    productName: "Nami (English Version 1st Anniversary Set)",
  },
  {
    id: "OP11-119_p2",
    productId: 646747,
    groupId: 17675,
    groupName: "One Piece Promotion Cards",
    productName: "Koby (Treasure Cup August 2025)",
  },
  {
    id: "ST01-012_p5",
    productId: 661882,
    groupId: 24498,
    groupName: "Carrying On His Will: 3rd Anniversary Tournament Cards",
    productName: "Monkey.D.Luffy - ST01-012 (3rd Anniversary Tournament 3 Brothers Pack)",
  },
  {
    id: "ST01-012_p6",
    productId: 657798,
    groupId: 17675,
    groupName: "One Piece Promotion Cards",
    productName: "Monkey.D.Luffy - ST01-012 (3rd Anniversary Winner)",
  },
] as const;

function product(overrides: Partial<TcgplayerProductMatch>): TcgplayerProductMatch {
  return {
    categoryId: 68,
    groupId: 1,
    groupName: "Awakening Of The New Era",
    productId: 1,
    productName: "Nami (SP)",
    collectorNumber: "OP01-016",
    productUrl: "https://www.tcgplayer.com/product/1/nami-sp",
    imageUrl: null,
    ...overrides,
  };
}

describe("exact TCGplayer print crosswalk", () => {
  // `releaseMatches` used to demand the group name equal or END WITH the set
  // name, which no base set satisfies: TCGplayer writes "SV01: Scarlet & Violet
  // Base Set" and pokemontcg.io writes "Scarlet & Violet". So the group search
  // found the right group and the crosswalk threw it away, and 722 cards across
  // four base sets showed no market reference. The extra words are what decide:
  // "Base Set" restates the release, "151" and "Promos" name a different one.
  it("accepts a base-set group whose extra words only restate the release", () => {
    const scarletViolet = {
      ...p4,
      id: "sv1-245",
      name: "Miriam",
      setName: "Scarlet & Violet",
      setCode: "SV1",
      cardNumber: "245/198",
      artworkClass: undefined,
      treatments: undefined,
    };
    const baseSet = product({
      categoryId: 3,
      groupId: 22873,
      groupName: "SV01: Scarlet & Violet Base Set",
      productId: 476544,
      productName: "Miriam (Full Art)",
      collectorNumber: "245/198",
      productUrl: "https://www.tcgplayer.com/product/476544/miriam",
    });

    expect(selectExactTcgplayerProduct(scarletViolet, [baseSet])?.productId).toBe(476544);
  });

  it("still rejects a sibling release that merely contains the set name", () => {
    const scarletViolet = {
      ...p4,
      id: "sv1-245",
      name: "Miriam",
      setName: "Scarlet & Violet",
      setCode: "SV1",
      cardNumber: "245/198",
      artworkClass: undefined,
      treatments: undefined,
    };
    const otherRelease = product({
      categoryId: 3,
      groupId: 23237,
      groupName: "SV: Scarlet & Violet 151",
      productId: 517000,
      productName: "Miriam",
      collectorNumber: "245/198",
      productUrl: "https://www.tcgplayer.com/product/517000/miriam",
    });

    expect(selectExactTcgplayerProduct(scarletViolet, [otherRelease])).toBeNull();
  });

  it("accepts an authoritative Pokémon product whose fraction is zero padded", () => {
    const bubbleMew = {
      ...p4,
      id: "sv4pt5-232",
      name: "Mew ex",
      setName: "Paldean Fates",
      setCode: "SV4PT5",
      cardNumber: "232/91",
      tcgplayerProductId: 535065,
      artworkClass: undefined,
      treatments: undefined,
    };
    const exact = product({
      categoryId: 3,
      groupId: 22873,
      groupName: "Paldean Fates",
      productId: 535065,
      productName: "Mew ex",
      collectorNumber: "232/091",
      productUrl: "https://www.tcgplayer.com/product/535065/mew-ex",
    });

    expect(selectExactTcgplayerProduct(bubbleMew, [exact])?.productId).toBe(535065);
  });

  it("accepts an exact-release SP product for the selected Nami P4 print", () => {
    expect(selectExactTcgplayerProduct(p4, [product({})])?.productId).toBe(1);
  });

  it("returns null instead of falling back to a same-number sibling product", () => {
    const base = product({
      productId: 2,
      groupName: "Romance Dawn",
      productName: "Nami",
      productUrl: "https://www.tcgplayer.com/product/2/nami",
    });
    expect(selectExactTcgplayerProduct(p4, [base])).toBeNull();
  });

  it("returns null when multiple products remain plausible for one selected print", () => {
    expect(selectExactTcgplayerProduct(p4, [
      product({ productId: 3, productUrl: "https://www.tcgplayer.com/product/3/nami-sp" }),
      product({ productId: 4, productUrl: "https://www.tcgplayer.com/product/4/nami-sp" }),
    ])).toBeNull();
  });

  it("returns null when an authoritative product id is absent instead of using a sibling", () => {
    expect(selectExactTcgplayerProduct(
      { ...p4, tcgplayerProductId: 999 },
      [product({ productId: 1 })],
    )).toBeNull();
  });

  it("does not promote unresolved generic alternate art by matching its release", () => {
    expect(selectExactTcgplayerProduct(p2, [product({
      productId: 5,
      groupName: p2.setName,
      productName: "Nami (Alternate Art Parallel)",
      productUrl: "https://www.tcgplayer.com/product/5/nami-parallel",
    })])).toBeNull();
  });

  it("selects only the verified exact TCGplayer product for a researched treatment", () => {
    expect(goldGearFive.tcgplayerProductId).toBe(632504);
    expect(selectExactTcgplayerProduct(goldGearFive, [
      product({ productId: 632503, groupName: goldGearFive.setName, productName: "Monkey.D.Luffy (SP)", collectorNumber: "OP05-119", productUrl: "https://www.tcgplayer.com/product/632503" }),
      product({ productId: 632504, groupName: goldGearFive.setName, productName: "Monkey.D.Luffy (Gold SP)", collectorNumber: "OP05-119", productUrl: "https://www.tcgplayer.com/product/632504" }),
    ])?.productId).toBe(632504);
  });

  it.each(researchedSpecialReleases)(
    "accepts verified $id from its real TCGplayer group",
    ({ id, productId, groupId, groupName, productName }) => {
      const card = mapOnePieceCardToIdentity(findOnePieceCatalogVariant(id)!, {
        confidence: "high",
        matchReasons: ["selected"],
      });
      const exact = product({
        productId,
        groupId,
        groupName,
        productName,
        collectorNumber: card.cardNumber,
        productUrl: `https://www.tcgplayer.com/product/${productId}`,
      });

      expect(card.tcgplayerGroupId).toBe(groupId);
      expect(selectExactTcgplayerProduct(card, [exact])?.productId).toBe(productId);
    },
  );

  // The crosswalk gates the market anchor on the product's release matching the
  // confirmed card's set, and TCGplayer names its promo groups nothing like
  // pokemontcg.io does. Without the shared alias the Scarlet & Violet promos
  // resolved to no product, so the anchor and the market-floor gate went dark.
  it("accepts TCGplayer's promo group name for a Scarlet & Violet promo", () => {
    const mewtwo = {
      id: "svp-52",
      name: "Mewtwo",
      setName: "Scarlet & Violet Black Star Promos",
      setCode: "SVP",
      cardNumber: "052",
      language: "English",
      imageUrl: null,
      confidence: "high" as const,
      matchReasons: [],
    };
    const svPromoProduct: TcgplayerProductMatch = {
      categoryId: 3,
      productId: 518872,
      groupId: 22872,
      groupName: "SV: Scarlet & Violet Promo Cards",
      productName: "Mewtwo - 052",
      productUrl: "https://www.tcgplayer.com/product/518872/pokemon-sv-scarlet-and-violet-promo-cards-mewtwo-052",
      collectorNumber: "052",
      imageUrl: null,
    };

    expect(selectExactTcgplayerProduct(mewtwo, [svPromoProduct])?.productId).toBe(518872);
  });
});
