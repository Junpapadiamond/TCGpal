import { describe, expect, it } from "vitest";
import { buildJapanReferenceLinks, buildJapanSearchQuery } from "@/lib/comparison/japan-references";
import type { CardIdentityCandidate } from "@/lib/schemas";

const onePieceCard: CardIdentityCandidate = {
  id: "OP01-024",
  name: "Monkey.D.Luffy",
  setName: "Romance Dawn",
  setCode: "OP-01",
  cardNumber: "OP01-024",
  language: "EN",
  imageUrl: null,
  confidence: "high",
  matchReasons: [],
};

const pokemonCard: CardIdentityCandidate = {
  id: "swsh7-215",
  name: "Umbreon VMAX",
  setName: "Evolving Skies",
  setCode: "SWSH7",
  cardNumber: "215/203",
  language: "English",
  imageUrl: null,
  confidence: "high",
  matchReasons: [],
};

describe("Japan reference links", () => {
  it("builds manual Japan price checks for One Piece cards", () => {
    const links = buildJapanReferenceLinks(onePieceCard, "2026-07-04T00:00:00.000Z");

    expect(buildJapanSearchQuery(onePieceCard)).toContain("OP01-024");
    expect(links.map((link) => link.label)).toEqual([
      "Yahoo Auctions JP price check",
      "Mercari JP price check",
      "SNKRDUNK Japan price check",
      "Card Rush OP price check",
      "Yuyutei OP price check",
    ]);
    expect(links.every((link) => link.status === "missing")).toBe(true);
    expect(links.every((link) => link.note.includes("not fetched or analyzed"))).toBe(true);
    expect(links.every((link) => !link.note.toLowerCase().includes("paste"))).toBe(true);
    expect(links.find((link) => link.label === "Card Rush OP price check")?.url).toContain("OP01-024");
  });

  it("routes Pokemon cards to the Pokemon Yuyutei search instead of OP shops", () => {
    const links = buildJapanReferenceLinks(pokemonCard, "2026-07-04T00:00:00.000Z");

    expect(buildJapanSearchQuery(pokemonCard)).toContain("ポケカ");
    expect(links.map((link) => link.label)).toContain("Yuyutei Pokemon price check");
    expect(links.map((link) => link.label)).not.toContain("Card Rush OP price check");
  });
});
