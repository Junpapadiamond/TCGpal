import { describe, expect, it } from "vitest";
import { defaultProfile } from "./sample-data";
import { getCuratedRecommendations, getJournalBasedRecommendations, toListingRiskInput, toRawVsSlabInput } from "./curated-recommendations";
import { listingRiskInputSchema, rawVsSlabInputSchema } from "./schemas";

describe("curated recommendations", () => {
  it("returns cards for multiple selected TCGs", () => {
    const cards = getCuratedRecommendations({
      ...defaultProfile,
      favoriteTcgs: ["Pokemon", "One Piece"],
      playerType: "Collector",
      budgetRange: "$150",
    });

    expect(cards.length).toBeGreaterThan(1);
    expect(new Set(cards.map((card) => card.tcg))).toEqual(new Set(["One Piece", "Pokemon"]));
  });

  it("prioritizes grading and resale cards for hybrid users", () => {
    const cards = getCuratedRecommendations({
      ...defaultProfile,
      favoriteTcgs: ["Pokemon"],
      playerType: "Hybrid Collector-Seller",
      budgetRange: "$150",
    });

    expect(cards.some((card) => card.riskFlags.some((flag) => flag.toLowerCase().includes("margin") || flag.toLowerCase().includes("grading")))).toBe(true);
  });

  it("still returns recommendations when budget is deferred", () => {
    const cards = getCuratedRecommendations({
      ...defaultProfile,
      favoriteTcgs: ["League / Riot TCG"],
      playerType: "Collector",
      budgetRange: "Talk about it later",
    });

    expect(cards.length).toBeGreaterThan(0);
  });

  it("converts a selected card to valid tool inputs", () => {
    const card = getCuratedRecommendations(defaultProfile)[0]!;

    expect(rawVsSlabInputSchema.safeParse(toRawVsSlabInput(card)).success).toBe(true);
    expect(listingRiskInputSchema.safeParse(toListingRiskInput(card)).success).toBe(true);
  });

  it("uses journal terms to prioritize related local recommendations", () => {
    const cards = getJournalBasedRecommendations(defaultProfile, [
      {
        id: "journal-1",
        tcg: "Pokemon",
        cardName: "Charizard VSTAR",
        version: "Crown Zenith",
        date: "2026-05-24",
        actionType: "Considering purchase",
        price: 65,
        userGoal: "Collection + resale",
        tags: "Charizard Crown Zenith",
        sentiment: "Still interested",
        thesis: "I want to track Charizard because it has collection demand but needs disciplined entry pricing.",
        watchReason: "Charizard is a character I keep comparing against other chase cards.",
        buyCondition: "Only consider clean copies near recent sold comps.",
        sellCondition: "",
        stopCondition: "Skip if condition photos are weak.",
        risks: "Population and grading margin risk.",
        missingInfo: "",
        reviewDate: "",
        reviewStatus: "Watching",
        finalOutcome: "",
        lessonsLearned: "",
        actualGrade: "UNKNOWN",
        source: "manual",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
    ]);

    expect(cards[0]?.card.cardName).toBe("Charizard VSTAR");
    expect(cards[0]?.reason).toContain("Recommended because");
  });
});
