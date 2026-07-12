import { describe, expect, it } from "vitest";
import {
  findOnePieceCatalogCard,
  findOnePieceCatalogVariant,
  findOnePieceCatalogVariants,
  onePieceCatalog,
} from "@/lib/external/one-piece-catalog";

const CARD_SET_ID_PATTERN = /^[A-Z]{1,4}\d{0,2}-\d{1,4}$/i;
const OFFICIAL_IMAGE_HOST = /(^|\.)onepiece-cardgame\.com$/i;

describe("bundled One Piece catalog", () => {
  it("ships the full catalog, not just the curated seed", () => {
    // The generated snapshot carries the whole card list — every print, including
    // alternate arts — so it comfortably clears the base-only count; guard against
    // it being accidentally emptied (which would silently shrink coverage).
    expect(onePieceCatalog.length).toBeGreaterThan(4000);
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

  it("has a unique id per print (alternate arts share a number but not an id)", () => {
    // Card numbers now intentionally repeat across art variants; the per-print image
    // id is what must stay unique so each alternate art is individually selectable.
    const printIds = onePieceCatalog.map((card) => (card.card_image_id ?? card.card_set_id).toUpperCase());
    expect(new Set(printIds).size).toBe(printIds.length);
  });

  it("carries every alternate art / manga (SP) / treasure rare print with its own image", () => {
    // A number with known parallels must expose more than the base print, each with
    // a distinct SAMPLE image — the whole point of the variant catalog.
    const luffyPrints = findOnePieceCatalogVariants("OP01-024");
    expect(luffyPrints.length).toBeGreaterThan(1);
    expect(luffyPrints[0]?.is_alternate_art).toBe(false); // base art leads the group
    const images = luffyPrints.map((card) => card.card_image);
    expect(new Set(images).size).toBe(images.length);

    // The special rarities the collapse used to drop are present and labeled.
    const rarities = new Set(onePieceCatalog.map((card) => card.rarity));
    expect(rarities.has("TR")).toBe(true); // treasure rare
    expect(rarities.has("SP CARD")).toBe(true); // special / manga art
    const alts = onePieceCatalog.filter((card) => card.is_alternate_art);
    expect(alts.length).toBeGreaterThan(1000);
    expect(alts.every((card) => Boolean(card.variant))).toBe(true);
  });

  it("resolves an exact alternate-art print by its print id", () => {
    const altLuffy = findOnePieceCatalogVariant("OP01-024_p1");
    expect(altLuffy?.card_set_id).toBe("OP01-024");
    expect(altLuffy?.is_alternate_art).toBe(true);
    expect(altLuffy?.variant).toContain("Alternate Art");
    // A bare number still resolves to the canonical base print, not a parallel.
    expect(findOnePieceCatalogCard("OP01-024")?.is_alternate_art).toBe(false);
  });

  it("enriches researched special prints without deriving treatment from the suffix", () => {
    expect(findOnePieceCatalogVariant("OP11-118_p2")).toMatchObject({
      variant: "Manga Art",
      artwork_class: "manga",
      treatments: [],
      tcgplayer_product_id: 632499,
    });
    expect(findOnePieceCatalogVariant("OP05-119_p7")).toMatchObject({
      variant: "Silver Special Art",
      artwork_class: "special",
      treatments: ["silver"],
      tcgplayer_product_id: 632503,
    });
    expect(findOnePieceCatalogVariant("OP05-119_p8")).toMatchObject({
      variant: "Gold Special Art",
      artwork_class: "special",
      treatments: ["gold"],
      tcgplayer_product_id: 632504,
    });
    expect(findOnePieceCatalogVariant("OP03-123_p2")).not.toMatchObject({ artwork_class: "manga" });
  });

  it("classifies every obvious SP or special-release catalog print without inventing a market product", () => {
    const obvious = onePieceCatalog.filter((card) =>
      card.is_alternate_art
      && (card.rarity === "SP CARD" || /anniversary|championship|regional|treasure cup|tournament|winner|premium card collection|promo/i.test(card.set_name ?? "")),
    );
    expect(obvious.length).toBeGreaterThan(300);
    expect(obvious.filter((card) => !card.artwork_class)).toEqual([]);
    expect(obvious.filter((card) => !card.variant || /^(?:Alternate|Special) Art \([PR]\d+\)$/i.test(card.variant))).toEqual([]);
  });
});
