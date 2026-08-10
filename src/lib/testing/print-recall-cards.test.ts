import { describe, expect, it } from "vitest";
import {
  PRINT_RECALL_CARDS,
  PRINT_RECALL_HELD_OUT_CARDS,
  PRINT_RECALL_TUNING_CARDS,
} from "@/lib/testing/print-recall-cards";

// The eval set is a measuring instrument: a baseline recall number only means
// something if the later run scores the same 30 cards under the same split. These
// tests are the guard against silently editing the ruler between measurements.
describe("print-recall eval card set", () => {
  it("holds exactly 30 cards with unique ids", () => {
    expect(PRINT_RECALL_CARDS).toHaveLength(30);
    expect(new Set(PRINT_RECALL_CARDS.map((card) => card.id)).size).toBe(30);
  });

  it("splits into 20 tuning and 10 held-out cards that partition the set", () => {
    expect(PRINT_RECALL_TUNING_CARDS).toHaveLength(20);
    expect(PRINT_RECALL_HELD_OUT_CARDS).toHaveLength(10);
    expect(PRINT_RECALL_TUNING_CARDS.length + PRINT_RECALL_HELD_OUT_CARDS.length).toBe(PRINT_RECALL_CARDS.length);
    const ids = new Set([...PRINT_RECALL_TUNING_CARDS, ...PRINT_RECALL_HELD_OUT_CARDS].map((card) => card.id));
    expect(ids.size).toBe(PRINT_RECALL_CARDS.length);
  });

  it("keeps the held-out half representative rather than a leftover pile", () => {
    for (const subset of [PRINT_RECALL_TUNING_CARDS, PRINT_RECALL_HELD_OUT_CARDS]) {
      expect(new Set(subset.map((card) => card.game))).toEqual(new Set(["pokemon", "onePiece"]));
      expect(new Set(subset.map((card) => card.printClass))).toEqual(new Set(["base", "alternate"]));
    }
  });

  it("covers both games, both print classes, and the vintage era", () => {
    expect(new Set(PRINT_RECALL_CARDS.map((card) => card.game))).toEqual(new Set(["pokemon", "onePiece"]));
    expect(new Set(PRINT_RECALL_CARDS.map((card) => card.printClass))).toEqual(new Set(["base", "alternate"]));
    expect(PRINT_RECALL_CARDS.filter((card) => card.era === "vintage").length).toBeGreaterThanOrEqual(4);
    expect(PRINT_RECALL_CARDS.filter((card) => card.game === "onePiece").length).toBeGreaterThanOrEqual(10);
  });

  // These three returned zero eligible listings against production on 2026-08-10
  // and are the reason the retrieval plan exists. Dropping them would make a later
  // recall gain unfalsifiable.
  it.each(["Nami OP01-016", "Roronoa Zoro OP06-118", "Monkey.D.Luffy OP05-119"])(
    "keeps the known zero-eligible card %s in the tuning half",
    (label) => {
      const card = PRINT_RECALL_CARDS.find((entry) => entry.label === label);
      expect(card).toBeDefined();
      expect(card?.split).toBe("tuning");
    },
  );

  it("gives every entry the fields the measurement script sends", () => {
    for (const card of PRINT_RECALL_CARDS) {
      expect(card.id, card.label).toMatch(/^[a-z0-9-]+$/);
      for (const field of ["label", "query", "name", "setCode", "cardNumber", "note"] as const) {
        expect(card[field].trim(), `${card.id}.${field}`).not.toBe("");
      }
      expect(["pokemon", "onePiece"]).toContain(card.game);
      expect(["base", "alternate"]).toContain(card.printClass);
      expect(["vintage", "modern"]).toContain(card.era);
      expect(["tuning", "held_out"]).toContain(card.split);
      // The hero query is what a buyer types; the collector number has to be in it
      // or the run measures a looser search than the one the card set describes.
      expect(card.query.toLowerCase(), card.id).toContain(card.cardNumber.toLowerCase());
    }
  });

  it("pins alternate prints to a confirmed card id under their own collector number", () => {
    for (const card of PRINT_RECALL_CARDS) {
      if (card.printClass === "alternate" && card.game === "onePiece") {
        expect(card.confirmedCardId, card.id).toBeDefined();
      }
      if (!card.confirmedCardId) continue;
      // Guards the copy-paste error that would silently measure a different card:
      // "OP02-013_p1" must belong to OP02-013, never to a neighbouring number.
      expect(card.confirmedCardId.toUpperCase(), card.id).toMatch(
        new RegExp(`^${card.cardNumber.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(_[A-Z]\\d+)?$`),
      );
    }
  });
});
