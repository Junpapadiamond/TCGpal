import type { TcgGame } from "@/lib/schemas";

/**
 * Outbound search links for marketplaces TCGlens does not read.
 *
 * These are manual checks: the buyer opens them and judges for themselves. No
 * page is fetched, nothing is parsed, and nothing here can enter ranking. The
 * only thing that matters is that the link actually performs the search — a
 * marketplace that ignores an unrecognised parameter still returns 200 with the
 * query sitting in the address bar, which looks correct and is useless. Each
 * parameter name below is the one its own site reads; they are not guesses and
 * not interchangeable.
 */

// TCGplayer scopes search by product line, in both the path and the query. An
// unscoped search returns Magic and Yu-Gi-Oh rows for names both games share.
const tcgplayerProductLine: Record<TcgGame, string> = {
  pokemon: "pokemon",
  onePiece: "one-piece-card-game",
};

export function tcgplayerSearchUrl(game: TcgGame, query: string): string {
  const productLine = tcgplayerProductLine[game];
  const url = new URL(`https://www.tcgplayer.com/search/${productLine}/product`);
  url.searchParams.set("productLineName", productLine);
  url.searchParams.set("q", query);
  return url.toString();
}

export function whatnotSearchUrl(query: string): string {
  const url = new URL("https://www.whatnot.com/search");
  url.searchParams.set("query", query);
  return url.toString();
}
