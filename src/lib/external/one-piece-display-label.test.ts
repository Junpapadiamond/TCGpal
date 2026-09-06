import { describe, expect, it } from "vitest";
import catalog from "./one-piece-catalog.generated.json";
import { findOnePieceCatalogVariant } from "./one-piece-catalog";
import { mapOnePieceCardToIdentity } from "./one-piece-tcg";
import { onePiecePrintDisplayLabel } from "./one-piece-taxonomy";

function identity(id: string) {
  return mapOnePieceCardToIdentity(findOnePieceCatalogVariant(id)!, { confidence: "high", matchReasons: [] });
}

describe("One Piece release-derived display labels", () => {
  it("names Nami's starter-deck release instead of its internal P ordinal", () => {
    const card = identity("OP01-016_p3");
    const before = structuredClone(card);
    expect(onePiecePrintDisplayLabel(card, "en")).toBe("Alternate artwork · The Three Captains");
    expect(onePiecePrintDisplayLabel(card, "zh")).toBe("异画版 · The Three Captains");
    expect(card).toEqual(before);
  });

  it("keeps Winner Pack and Tournament Kit releases visibly distinct", () => {
    expect(onePiecePrintDisplayLabel(identity("EB01-015_p1"), "en")).toContain("Tournament Kit 2025 Vol.2");
    expect(onePiecePrintDisplayLabel(identity("EB01-015_p2"), "en")).toContain("Winner Pack 2025 Vol.2");
  });

  it("uses reviewed artwork classes and rarity while keeping reprint provenance", () => {
    expect(onePiecePrintDisplayLabel(identity("OP01-016_p4"), "en")).toContain("SP artwork");
    expect(onePiecePrintDisplayLabel(identity("OP07-109_p2"), "zh")).toContain("宝藏稀有版");
    expect(onePiecePrintDisplayLabel(identity("ST14-010_r1"), "en")).toContain("Reprint · ST-14");
  });

  it("never exposes P/R ordinals in labels across the catalog", () => {
    for (const row of catalog) {
      const card = identity(row.card_image_id);
      for (const lang of ["en", "zh"] as const) {
        expect(onePiecePrintDisplayLabel(card, lang), row.card_image_id).not.toMatch(/\([PR]\d+\)|_[pr]\d+/i);
      }
    }
  });

  it("leaves Pokémon terminology to its existing display path", () => {
    expect(onePiecePrintDisplayLabel({ ...identity("OP01-016"), id: "base1-4", cardNumber: "4/102", printIdentity: undefined }, "en")).toBeNull();
  });
});
