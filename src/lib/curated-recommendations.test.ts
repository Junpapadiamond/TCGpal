import { describe, expect, it } from "vitest";
import { defaultProfile } from "./sample-data";
import { getCuratedRecommendations, getJournalBasedRecommendations, pokemonCardToRecommendation, toListingRiskInput, toRawVsSlabInput } from "./curated-recommendations";
import { listingRiskInputSchema, rawVsSlabInputSchema } from "./schemas";

describe("curated recommendations", () => {
  it("returns five Pokemon chase cards for a Pokemon-only profile", () => {
    const cards = getCuratedRecommendations({
      ...defaultProfile,
      favoriteTcgs: ["Pokemon"],
      playerType: "Collector",
      budgetRange: "$1000+",
    });

    expect(cards).toHaveLength(5);
    expect(new Set(cards.map((card) => card.tcg))).toEqual(new Set(["Pokemon"]));
    expect(cards.map((card) => card.cardName)).toEqual([
      "Mega Charizard X ex",
      "Umbreon VMAX",
      "Giratina V",
      "Rayquaza VMAX",
      "Gengar VMAX",
    ]);
    expect(cards.every((card) => card.imageUrl?.startsWith("https://images.pokemontcg.io/"))).toBe(true);
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

  it("keeps journal-scored recommendations inside selected TCGs", () => {
    const cards = getJournalBasedRecommendations(
      {
        ...defaultProfile,
        favoriteTcgs: ["Pokemon"],
        playerType: "Hybrid Collector-Seller",
        budgetRange: "$1000+",
      },
      [
        {
          id: "journal-1",
          tcg: "One Piece",
          cardName: "Tony Tony Chopper",
          version: "EB01 Japanese Alternate Art",
          date: "2026-05-24",
          actionType: "Considering purchase",
          price: 80,
          userGoal: "Collection + resale",
          tags: "Chopper alternate art",
          sentiment: "Still interested",
          thesis: "I used to watch One Piece cards, but this profile is now Pokemon-only.",
          watchReason: "Old preference.",
          buyCondition: "",
          sellCondition: "",
          stopCondition: "",
          risks: "",
          missingInfo: "",
          reviewDate: "",
          reviewStatus: "Watching",
          finalOutcome: "",
          lessonsLearned: "",
          actualGrade: "UNKNOWN",
          source: "manual",
          createdAt: "2026-05-24T00:00:00.000Z",
        },
      ],
    );

    expect(cards).toHaveLength(5);
    expect(cards.every((recommendation) => recommendation.card.tcg === "Pokemon")).toBe(true);
  });

  it("converts a selected card to valid tool inputs", () => {
    const card = getCuratedRecommendations(defaultProfile)[0]!;

    expect(rawVsSlabInputSchema.safeParse(toRawVsSlabInput(card)).success).toBe(true);
    expect(listingRiskInputSchema.safeParse(toListingRiskInput(card)).success).toBe(true);
  });

  it("converts a Pokemon TCG API card into a selectable recommendation", () => {
    const card = pokemonCardToRecommendation({
      id: "swsh7-215",
      name: "Umbreon VMAX",
      supertype: "Pokemon",
      subtypes: ["VMAX"],
      number: "215",
      rarity: "Rare Secret",
      set: { name: "Evolving Skies" },
      images: { large: "https://images.pokemontcg.io/swsh7/215.png" },
      tcgplayer: {
        prices: {
          holofoil: { market: 500 },
        },
      },
    });

    expect(card.id).toBe("pokemon-api-swsh7-215");
    expect(card.tcg).toBe("Pokemon");
    expect(card.version).toContain("Evolving Skies");
    expect(card.suggestedRawPrice).toBe(500);
    expect(rawVsSlabInputSchema.safeParse(toRawVsSlabInput(card)).success).toBe(true);
  });

  it("uses journal terms to prioritize related local recommendations", () => {
    const cards = getJournalBasedRecommendations(defaultProfile, [
      {
        id: "journal-1",
        tcg: "Pokemon",
        cardName: "Mega Charizard X ex",
        version: "Phantasmal Flames 125/094",
        date: "2026-05-24",
        actionType: "Considering purchase",
        price: 65,
        userGoal: "Collection + resale",
        tags: "Charizard Phantasmal Flames",
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

    expect(cards[0]?.card.cardName).toBe("Mega Charizard X ex");
    expect(cards[0]?.reason).toContain("Recommended because");
  });
});
