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
});
