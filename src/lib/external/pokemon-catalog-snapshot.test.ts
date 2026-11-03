import { describe, expect, it } from "vitest";
import { getPokemonCardFromSnapshot, searchPokemonCatalogSnapshot } from "./pokemon-catalog-snapshot";

describe("catalog artwork provenance", () => {
  it.each(["55", "57", "276", "277"])("keeps the provider image URLs for Ascended Heroes Pikachu %s", (number) => {
    expect(getPokemonCardFromSnapshot(`me2pt5-${number}`)?.images).toEqual({
      small: `https://images.scrydex.com/pokemon/me2pt5-${number}/small`,
      large: `https://images.scrydex.com/pokemon/me2pt5-${number}/large`,
    });
  });

  it("keeps older artwork and the full Pikachu version range", () => {
    const cards = searchPokemonCatalogSnapshot({ query: "Pikachu" }).cards;
    expect(cards.some(card => card.id === "me2pt5-277")).toBe(true);
    expect(cards.find(card => card.id === "base1-58")?.images?.small).toBe("https://images.pokemontcg.io/base1/58.png");
    expect(getPokemonCardFromSnapshot("not-a-real-card")).toBeNull();
  });

  it("preserves migrated set symbols instead of inventing old CDN URLs", () => {
    expect(getPokemonCardFromSnapshot("me2pt5-55")?.set?.images?.symbol)
      .toBe("https://images.scrydex.com/pokemon/me2pt5-symbol/symbol");
  });
});
