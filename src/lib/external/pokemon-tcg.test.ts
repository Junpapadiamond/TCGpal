import { describe, expect, it, vi } from "vitest";
import { browsePokemonCards, searchPokemonCards } from "@/lib/external/pokemon-tcg";

describe("Pokemon TCG API adapter", () => {
  it("builds a safe name query and normalizes card results", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("q")).toBe('name:"Charizard VSTAR"');
      expect(url.searchParams.get("pageSize")).toBe("4");

      return new Response(
        JSON.stringify({
          data: [
            {
              id: "swsh9-18",
              name: "Charizard VSTAR",
              number: "18",
              rarity: "Rare Holo VSTAR",
              set: { name: "Brilliant Stars", series: "Sword & Shield" },
              images: { small: "https://example.com/small.png" },
            },
          ],
          count: 1,
          totalCount: 1,
        }),
      );
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({ query: "Charizard VSTAR", pageSize: 4, fetcher });

    expect(result.source).toBe("pokemon-tcg-api");
    expect(result.apiQuery).toBe('name:"Charizard VSTAR"');
    expect(result.cards[0]?.name).toBe("Charizard VSTAR");
  });

  it("browses cards by page without requiring a query", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("q")).toBeNull();
      expect(url.searchParams.get("page")).toBe("3");
      expect(url.searchParams.get("pageSize")).toBe("24");
      expect(url.searchParams.get("orderBy")).toBe("-set.releaseDate,name");

      return new Response(
        JSON.stringify({
          data: [
            {
              id: "sv1-1",
              name: "Sprigatito",
              number: "1",
              set: { name: "Scarlet & Violet" },
            },
          ],
          count: 1,
          totalCount: 18000,
        }),
      );
    }) as unknown as typeof fetch;

    const result = await browsePokemonCards({ page: 3, pageSize: 24, fetcher });

    expect(result.query).toBe("");
    expect(result.apiQuery).toBe("");
    expect(result.totalCount).toBe(18000);
    expect(result.cards[0]?.name).toBe("Sprigatito");
  });
});
