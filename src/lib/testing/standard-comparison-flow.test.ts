import { afterEach, describe, expect, it, vi } from "vitest";
import { runListingComparison } from "@/lib/ai/listing-compare";
import { clearCrosswalkCache } from "@/lib/comparison/crosswalk";
import {
  STANDARD_COMPARISON_FLOW_CARDS,
  assertStandardComparisonFlowPlan,
  runStandardComparisonFlow,
} from "@/lib/testing/standard-comparison-flow";
import type { ComparisonRequest } from "@/lib/schemas";

type PokemonFixtureCard = {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  set: {
    id: string;
    name: string;
    printedTotal: number;
    images?: { symbol?: string };
  };
  images: { small: string; large: string };
  tcgplayer?: {
    url: string;
    prices: Record<string, { low?: number; mid?: number; high?: number; market?: number }>;
  };
};

const pokemonFixtures: PokemonFixtureCard[] = [
  pokemonFixture("swsh7-215", "Umbreon VMAX", "215", "Evolving Skies", "swsh7", 203, 420),
  pokemonFixture("base1-4", "Charizard", "4", "Base", "base1", 102, 360),
  pokemonFixture("sv3pt5-25", "Pikachu", "25", "Scarlet & Violet 151", "sv3pt5", 165, 2.5),
];

const standardFlowFetcher = vi.fn(async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  if (url.hostname === "api.pokemontcg.io") {
    if (url.pathname.startsWith("/v2/cards/")) {
      const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      const card = pokemonFixtures.find((fixture) => fixture.id === id);
      if (!card) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
      return Response.json({ data: card });
    }
    return Response.json({
      data: pokemonFixtures,
      page: 1,
      pageSize: pokemonFixtures.length,
      count: pokemonFixtures.length,
      totalCount: pokemonFixtures.length,
    });
  }
  throw new Error(`network disabled in standard flow test: ${url.href}`);
}) as unknown as typeof fetch;

afterEach(() => {
  clearCrosswalkCache();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("standard multi-card comparison flow", () => {
  it("codifies the pilot smoke standard as at least five sequential searches across both live games", () => {
    expect(() => assertStandardComparisonFlowPlan(STANDARD_COMPARISON_FLOW_CARDS)).not.toThrow();
    expect(STANDARD_COMPARISON_FLOW_CARDS).toHaveLength(6);
    expect(new Set(STANDARD_COMPARISON_FLOW_CARDS.map((card) => card.game))).toEqual(new Set(["pokemon", "onePiece"]));
    expect(STANDARD_COMPARISON_FLOW_CARDS.slice(1).every((card) => card.entryMode !== "first_search")).toBe(true);
    // The standard must always include a multi-print card confirmed to a specific
    // special print (SP/alt), so variant-fidelity regressions surface here first.
    expect(STANDARD_COMPARISON_FLOW_CARDS.some((card) => card.expectedCardId.includes("_p"))).toBe(true);
  });

  it("runs five card-first comparisons in one session, confirming ambiguous picks before the next search", async () => {
    const result = await runStandardComparisonFlow({
      cards: STANDARD_COMPARISON_FLOW_CARDS,
      compare: (request: ComparisonRequest) => runListingComparison(request, { fetcher: standardFlowFetcher }),
    });

    expect(result.cards).toHaveLength(6);
    expect(result.cards.map((card) => card.game)).toEqual(["pokemon", "onePiece", "pokemon", "onePiece", "pokemon", "onePiece"]);
    expect(result.cards.map((card) => card.entryMode)).toEqual(["first_search", "edit_search", "new_search", "edit_search", "new_search", "new_search"]);
    expect(result.cards.every((card) => card.finalStatus !== "needs_confirmation")).toBe(true);
    expect(result.cards.every((card) => card.confirmedCardId)).toBe(true);
    expect(result.cards.every((card) => card.rankedChoiceCount > 0)).toBe(true);
    expect(result.cards.every((card) => card.sourceResultCount > 0)).toBe(true);
    // The SP step must confirm the exact special print, not the base art.
    expect(result.cards[5]?.confirmedCardId).toBe("OP01-016_p4");
  });
});

function pokemonFixture(
  id: string,
  name: string,
  number: string,
  setName: string,
  setId: string,
  printedTotal: number,
  market: number,
): PokemonFixtureCard {
  return {
    id,
    name,
    number,
    rarity: "Rare",
    set: {
      id: setId,
      name: setName,
      printedTotal,
      images: { symbol: `https://images.pokemontcg.io/${setId}/symbol.png` },
    },
    images: {
      small: `https://images.pokemontcg.io/${setId}/${number}.png`,
      large: `https://images.pokemontcg.io/${setId}/${number}_hires.png`,
    },
    tcgplayer: {
      url: `https://prices.pokemontcg.io/tcgplayer/${id}`,
      prices: { holofoil: { low: market * 0.8, mid: market, high: market * 1.4, market } },
    },
  };
}
