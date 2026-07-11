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

function product(overrides: Partial<TcgplayerProductMatch>): TcgplayerProductMatch {
  return {
    categoryId: 68,
    groupId: 1,
    groupName: "Awakening Of The New Era",
    productId: 1,
    productName: "Nami (SP)",
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
});
