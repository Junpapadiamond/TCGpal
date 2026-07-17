import { describe, expect, it, vi } from "vitest";
import { resolveCardIdentity } from "@/lib/ai/card-identity";

function pokemonFetcher(cards: unknown[]) {
  return vi.fn(async () => new Response(JSON.stringify({
    data: cards,
    count: cards.length,
    totalCount: cards.length,
  }))) as unknown as typeof fetch;
}

const pikachuCards = [
  {
    id: "sv5-18",
    name: "Pikachu",
    number: "18",
    rarity: "Common",
    set: { id: "sv5", name: "Paldean Fates", printedTotal: 91 },
    images: { small: "https://images.pokemontcg.io/sv5/18.png" },
  },
  {
    id: "sv5-131",
    name: "Pikachu",
    number: "131",
    rarity: "Shiny Rare",
    set: { id: "sv5", name: "Paldean Fates", printedTotal: 91 },
    images: { small: "https://images.pokemontcg.io/sv5/131.png" },
  },
];

describe("resolveCardIdentity", () => {
  it("returns a confirmation gallery for a name-only Pokémon search", async () => {
    const result = await resolveCardIdentity(
      { query: "Pikachu", cardHint: { game: "pokemon" } },
      { fetcher: pokemonFetcher(pikachuCards), now: () => new Date("2026-07-12T00:00:00.000Z") },
    );

    expect(result.status).toBe("needs_confirmation");
    expect(result.confirmedCard).toBeNull();
    expect(result.candidates.map((card) => card.id)).toEqual(["sv5-18", "sv5-131"]);
    expect(result.identityContractVersion).toBe(1);
  });

  it("resolves one proven Pokémon print when name and collector number agree", async () => {
    const result = await resolveCardIdentity(
      { query: "Umbreon VMAX 215/203", cardHint: { game: "pokemon" } },
      { fetcher: pokemonFetcher([{
        id: "swsh7-215",
        name: "Umbreon VMAX",
        number: "215",
        set: { id: "swsh7", name: "Evolving Skies", printedTotal: 203 },
        images: { small: "https://images.pokemontcg.io/swsh7/215.png" },
      }]) },
    );

    expect(result.status).toBe("resolved");
    expect(result.confirmedCard?.id).toBe("swsh7-215");
    expect(result.candidates).toHaveLength(1);
  });

  it("keeps same-number One Piece sibling artworks in confirmation", async () => {
    const result = await resolveCardIdentity({
      query: "Nami OP01-016",
      cardHint: { game: "onePiece" },
    });

    expect(result.status).toBe("needs_confirmation");
    expect(result.confirmedCard).toBeNull();
    expect(result.candidates.length).toBeGreaterThan(1);
    expect(new Set(result.candidates.map((card) => card.cardNumber))).toEqual(new Set(["OP01-016"]));
  });

  it("distinguishes an empty catalog result from an unavailable catalog", async () => {
    const noMatch = await resolveCardIdentity(
      { query: "Missingmon", cardHint: { game: "pokemon" } },
      { fetcher: pokemonFetcher([]) },
    );
    const unavailable = await resolveCardIdentity(
      { query: "Pikachu", cardHint: { game: "pokemon" } },
      { fetcher: vi.fn(async () => { throw new Error("catalog offline"); }) as unknown as typeof fetch },
    );

    expect(noMatch.status).toBe("not_found");
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.warnings.join(" ")).toMatch(/unavailable|offline/i);
  });

  it("does not retry a Pokemon lookup after its parent request is cancelled", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn((_url: URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        signal.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        }, { once: true });
      })
    )) as unknown as typeof fetch;

    const pending = resolveCardIdentity(
      { query: "Charizard", cardHint: { game: "pokemon" } },
      { fetcher, signal: controller.signal },
    );
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
