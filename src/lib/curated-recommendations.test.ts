import { describe, expect, it } from "vitest";
import { defaultProfile } from "./sample-data";
import { getCuratedRecommendations, toListingRiskInput, toRawVsSlabInput } from "./curated-recommendations";
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
});
