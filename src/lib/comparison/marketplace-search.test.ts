import { describe, expect, it } from "vitest";
import { tcgplayerSearchUrl, whatnotSearchUrl } from "@/lib/comparison/marketplace-search";

// Every parameter name here was checked against the live site on 2026-08-18.
// That is not pedantry: snkrdunk.com silently ignored an unknown `keyword` and
// served its generic ranking page, so a wrong name produces a link that returns
// 200, keeps the query in the address bar, and searches nothing.
describe("marketplace search links", () => {
  it("scopes the TCGplayer search to the game being compared", () => {
    const pokemon = new URL(tcgplayerSearchUrl("pokemon", "Pikachu 58/102"));
    expect(pokemon.hostname).toBe("www.tcgplayer.com");
    expect(pokemon.pathname).toBe("/search/pokemon/product");
    expect(pokemon.searchParams.get("productLineName")).toBe("pokemon");
    expect(pokemon.searchParams.get("q")).toBe("Pikachu 58/102");

    const onePiece = new URL(tcgplayerSearchUrl("onePiece", "Nami OP01-016"));
    expect(onePiece.pathname).toBe("/search/one-piece-card-game/product");
    expect(onePiece.searchParams.get("productLineName")).toBe("one-piece-card-game");
    expect(onePiece.searchParams.get("q")).toBe("Nami OP01-016");
  });

  it("builds a Whatnot search on its own query parameter", () => {
    const url = new URL(whatnotSearchUrl("Pikachu 58/102"));
    expect(url.hostname).toBe("www.whatnot.com");
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("query")).toBe("Pikachu 58/102");
  });

  it("encodes the collector-number slash rather than opening a path segment", () => {
    expect(whatnotSearchUrl("Pikachu 58/102")).toContain("58%2F102");
    expect(tcgplayerSearchUrl("pokemon", "Pikachu 58/102")).toContain("58%2F102");
  });
});
