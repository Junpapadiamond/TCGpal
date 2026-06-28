import { describe, expect, it, vi } from "vitest";
import { browsePokemonCards, getPokemonCard, searchPokemonCards } from "@/lib/external/pokemon-tcg";

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
              set: {
                name: "Brilliant Stars",
                series: "Sword & Shield",
                images: { symbol: "https://example.com/brilliant-stars-symbol.png" },
              },
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
    expect(result.cards[0]?.rarity).toBe("Rare Holo VSTAR");
    expect(result.cards[0]?.set?.images?.symbol).toBe("https://example.com/brilliant-stars-symbol.png");
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

  it("searches full collector numbers using the API number and printed set total", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("q")).toBe("number:215 set.printedTotal:203 set.id:swsh7");

      return new Response(JSON.stringify({
        data: [
          {
            id: "swsh7-215",
            name: "Umbreon VMAX",
            number: "215",
            set: { id: "swsh7", name: "Evolving Skies", printedTotal: 203 },
          },
        ],
        count: 1,
        totalCount: 1,
      }));
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({
      query: "Umbreon VMAX",
      cardNumber: "215/203",
      setHint: "Evolving Skies / SWSH7",
      fetcher,
    });

    expect(result.cards[0]?.id).toBe("swsh7-215");
  });

  it("drops a bad set hint instead of hiding an exact collector-number match", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      const query = url.searchParams.get("q");
      if (query?.includes("set.ptcgoCode:EVS")) {
        return new Response(JSON.stringify({ data: [], count: 0, totalCount: 0 }));
      }
      expect(query).toBe("number:215 set.printedTotal:203");
      return new Response(JSON.stringify({
        data: [
          {
            id: "swsh7-215",
            name: "Umbreon VMAX",
            number: "215",
            set: { id: "swsh7", name: "Evolving Skies", printedTotal: 203 },
          },
        ],
        count: 1,
        totalCount: 1,
      }));
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({
      query: "Umbreon VMAX",
      cardNumber: "215/203",
      setHint: "EVS",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.cards[0]?.id).toBe("swsh7-215");
  });

  it("treats non-numeric collector placeholders as blank and searches card themes", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("q")).toBe(
        'name:"Dialga" (set.name:"Team plasma" OR set.series:"Team plasma" OR subtypes:"Team plasma")',
      );
      return new Response(JSON.stringify({
        data: [
          {
            id: "bw10-65",
            name: "Dialga-EX",
            number: "65",
            subtypes: ["Basic", "EX", "Team Plasma"],
            set: { id: "bw10", name: "Plasma Blast", printedTotal: 101 },
          },
          {
            id: "bw10-99",
            name: "Dialga-EX",
            number: "99",
            subtypes: ["Basic", "EX", "Team Plasma"],
            set: { id: "bw10", name: "Plasma Blast", printedTotal: 101 },
          },
        ],
        count: 2,
        totalCount: 2,
      }));
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({
      query: "Dialga",
      cardNumber: "N",
      setHint: "Team plasma",
      fetcher,
    });

    expect(result.cards.map((card) => card.id)).toEqual(["bw10-65", "bw10-99"]);
  });

  it("reloads a confirmed card by stable catalog id", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe("/v2/cards/swsh7-215");
      return new Response(JSON.stringify({
        data: {
          id: "swsh7-215",
          name: "Umbreon VMAX",
          number: "215",
          set: { id: "swsh7", name: "Evolving Skies", printedTotal: 203 },
        },
      }));
    }) as unknown as typeof fetch;

    const card = await getPokemonCard({ id: "swsh7-215", fetcher });

    expect(card.name).toBe("Umbreon VMAX");
  });
});
