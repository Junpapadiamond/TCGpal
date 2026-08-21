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

  it("distinguishes an empty catalog result from an outage recovered by the local snapshot", async () => {
    const noMatch = await resolveCardIdentity(
      { query: "Missingmon", cardHint: { game: "pokemon" } },
      { fetcher: pokemonFetcher([]) },
    );
    const recovered = await resolveCardIdentity(
      { query: "Pikachu", cardHint: { game: "pokemon" } },
      { fetcher: vi.fn(async () => { throw new Error("catalog offline"); }) as unknown as typeof fetch },
    );

    expect(noMatch.status).toBe("not_found");
    expect(recovered.status).toBe("needs_confirmation");
    expect(recovered.candidates.some((card) => card.id === "base1-58")).toBe(true);
    expect(recovered.warnings.join(" ")).toMatch(/local catalog snapshot/i);
  });

  it("still reports unavailable when neither the provider nor snapshot knows the card", async () => {
    const result = await resolveCardIdentity(
      { query: "Missingmon", cardHint: { game: "pokemon" } },
      { fetcher: vi.fn(async () => { throw new Error("catalog offline"); }) as unknown as typeof fetch },
    );

    expect(result.status).toBe("unavailable");
    expect(result.candidates).toEqual([]);
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

  // pokemontcg.io reports a `printedTotal` for every set, including promo
  // releases where no denominator is printed on the card at all. A Scarlet &
  // Violet Black Star Promo reads "SVP EN 052" and TCGplayer publishes it as
  // "052"; composing "52/215" invented a collector number nobody ever wrote.
  // Measured 2026-08-19, eBay returned 0 rows for "Mewtwo 52/215" against 2,069
  // for "Mewtwo 052", so every SV promo comparison abstained with no listings.
  it("gives a Scarlet & Violet promo its printed number instead of a set total", async () => {
    const result = await resolveCardIdentity(
      { query: "Mewtwo SVP 052", cardHint: { game: "pokemon" } },
      { fetcher: pokemonFetcher([{
        id: "svp-52",
        name: "Mewtwo",
        number: "52",
        rarity: "Promo",
        set: { id: "svp", name: "Scarlet & Violet Black Star Promos", printedTotal: 215, ptcgoCode: "PR-SV" },
        images: { small: "https://images.pokemontcg.io/svp/52.png" },
      }]) },
    );

    expect(result.candidates[0]?.cardNumber).toBe("052");
  });

  // The WotC-era promos are the exception that proves the rule: they really are
  // printed as a fraction, and TCGplayer publishes them the same way ("06/53"),
  // so the denominator there is a fact rather than an invention.
  it("keeps the printed fraction on a Wizards Black Star Promo", async () => {
    const result = await resolveCardIdentity(
      { query: "Mewtwo", cardHint: { game: "pokemon" } },
      { fetcher: pokemonFetcher([{
        id: "basep-3",
        name: "Mewtwo",
        number: "3",
        rarity: "Promo",
        set: { id: "basep", name: "Wizards Black Star Promos", printedTotal: 53, ptcgoCode: "PR" },
        images: { small: "https://images.pokemontcg.io/basep/3.png" },
      }]) },
    );

    expect(result.candidates[0]?.cardNumber).toBe("3/53");
  });

  // Every promo release between those two glues its prefix onto the number, and
  // that glued string is the catalog's own key — appending a total would break it.
  it("leaves a prefixed promo number exactly as the catalog stores it", async () => {
    const result = await resolveCardIdentity(
      { query: "Charizard V SWSH050", cardHint: { game: "pokemon" } },
      { fetcher: pokemonFetcher([{
        id: "swshp-SWSH050",
        name: "Charizard V",
        number: "SWSH050",
        rarity: "Promo",
        set: { id: "swshp", name: "SWSH Black Star Promos", printedTotal: 307, ptcgoCode: "PR-SW" },
        images: { small: "https://images.pokemontcg.io/swshp/SWSH050.png" },
      }]) },
    );

    expect(result.candidates[0]?.cardNumber).toBe("SWSH050");
  });

  // pokemontcg.io is mid-migration on this release and serves two different set
  // payloads under the same set id: svp-52 comes back as "Scarlet & Violet Black
  // Star Promos" with ptcgoCode PR-SV and printedTotal 215, while svp-179 comes
  // back as "Scarlet & Violet Promos" with no ptcgoCode and printedTotal 150.
  // Detecting the release by code alone left the second half of the set
  // fabricating "179/150".
  it("gives a promo its printed number even when the catalog omits the release code", async () => {
    const result = await resolveCardIdentity(
      { query: "Xerneas ex SVP 179", cardHint: { game: "pokemon" } },
      { fetcher: pokemonFetcher([{
        id: "svp-179",
        name: "Xerneas ex",
        number: "179",
        rarity: "Promo",
        set: { id: "svp", name: "Scarlet & Violet Promos", printedTotal: 150 },
        images: { small: "https://images.pokemontcg.io/svp/179.png" },
      }]) },
    );

    expect(result.candidates[0]?.cardNumber).toBe("179");
  });

  // The McDonald's releases are numbered as a real fraction and the catalog does
  // not call them promos, so the promo rule must not reach them.
  it("keeps the printed fraction on a McDonald's collection card", async () => {
    const result = await resolveCardIdentity(
      { query: "Pikachu", cardHint: { game: "pokemon" } },
      { fetcher: pokemonFetcher([{
        id: "mcd19-1",
        name: "Pikachu",
        number: "1",
        set: { id: "mcd19", name: "McDonald's Collection 2019", printedTotal: 12 },
        images: { small: "https://images.pokemontcg.io/mcd19/1.png" },
      }]) },
    );

    expect(result.candidates[0]?.cardNumber).toBe("1/12");
  });
});
