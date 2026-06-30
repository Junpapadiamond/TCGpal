import { describe, expect, it } from "vitest";
import { findOnePieceCatalogCard, onePieceCatalog } from "@/lib/external/one-piece-catalog";

const CARD_SET_ID_PATTERN = /^[A-Z]{1,4}\d{0,2}-\d{1,4}$/i;
const OFFICIAL_IMAGE_HOST = /(^|\.)onepiece-cardgame\.com$/i;

describe("bundled One Piece catalog", () => {
  it("ships the full catalog, not just the curated seed", () => {
    // The generated snapshot carries the whole card list; guard against it being
    // accidentally emptied (which would silently shrink coverage back to the seed).
    expect(onePieceCatalog.length).toBeGreaterThan(2000);
  });

  it("spans every released set family", () => {
    const sets = new Set(onePieceCatalog.map((card) => card.set_id));
    for (const set of ["OP-01", "OP-09", "OP-12", "ST-01", "EB-01", "PRB-01", "P"]) {
      expect(sets.has(set)).toBe(true);
    }
  });

  it("carries accurate tags on known cards", () => {
    const zoro = findOnePieceCatalogCard("OP01-001");
    expect(zoro).toMatchObject({
      card_name: "Roronoa Zoro",
      set_id: "OP-01",
      set_name: "Romance Dawn",
      rarity: "L",
      card_type: "Leader",
      card_color: "Red",
    });
    expect(zoro?.sub_types).toContain("Straw Hat Crew");

    const luffy = findOnePieceCatalogCard("OP01-024");
    expect(luffy).toMatchObject({ card_name: "Monkey.D.Luffy", rarity: "SR", card_type: "Character" });

    // A dual-color leader proves multi-value tags are preserved.
    expect(findOnePieceCatalogCard("OP11-001")?.card_color).toBe("Red/Black");
  });

  it("looks up ids case-insensitively", () => {
    expect(findOnePieceCatalogCard("op01-001")?.card_name).toBe("Roronoa Zoro");
    expect(findOnePieceCatalogCard("  OP01-024  ")?.card_name).toBe("Monkey.D.Luffy");
  });

  it("keeps every entry well-formed and never invents a price", () => {
    for (const card of onePieceCatalog) {
      expect(card.card_name.length).toBeGreaterThan(0);
      expect(CARD_SET_ID_PATTERN.test(card.card_set_id)).toBe(true);
      expect(card.market_price ?? null).toBeNull();
      expect(card.inventory_price ?? null).toBeNull();
      if (card.card_image) {
        expect(OFFICIAL_IMAGE_HOST.test(new URL(card.card_image).hostname)).toBe(true);
      }
    }
  });

  it("has unique card ids (no number collisions)", () => {
    const ids = onePieceCatalog.map((card) => card.card_set_id.toUpperCase());
    expect(new Set(ids).size).toBe(ids.length);
  });
});
