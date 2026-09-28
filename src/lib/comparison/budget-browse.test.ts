import { describe, expect, it } from "vitest";
import { budgetBrowseCandidates } from "./budget-browse";
import type { CardIdentityCandidate } from "@/lib/schemas";

describe("budget version browsing", () => {
  const card = (id: string, price: number | null): CardIdentityCandidate => ({ id, name: "Charizard", setName: "Set", setCode: "SET", cardNumber: id, language: "English", imageUrl: null, confidence: "high", matchReasons: [], marketMid: price, marketSource: "tcgcsv", marketUrl: "https://www.tcgplayer.com/product/1", marketAsOf: "2026-09-28T00:00:00Z" });
  it("separates budget hints from unknown and above-budget references", () => {
    const result = budgetBrowseCandidates([card("a", 90), card("b", 170), card("c", null), { ...card("d", 20), marketAsOf: null }], 150);
    expect(result.within.map(c => c.id)).toEqual(["a"]);
    expect(result.unknown.map(c => c.id)).toEqual(["c", "d"]);
    expect(result.above.map(c => c.id)).toEqual(["b"]);
  });
});
