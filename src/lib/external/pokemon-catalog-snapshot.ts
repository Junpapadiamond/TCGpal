import snapshot from "@/data/pokemon-catalog-index.json";
import { collectorNumberParts } from "@/lib/comparison/collector-number";
import { classifyPokemonName } from "@/lib/external/pokemon-name-match";
import type { PokemonTcgCard, PokemonTcgSearchResult } from "@/lib/external/pokemon-tcg";

type SnapshotCard = (typeof snapshot.cards)[number];

export const POKEMON_CATALOG_SNAPSHOT_REVISION = snapshot.revision;
export const POKEMON_CATALOG_SNAPSHOT_UPDATED_AT = snapshot.sourceUpdatedAt;

const cardsById = new Map(snapshot.cards.map((card) => [card.i, card]));

export function getPokemonCardFromSnapshot(id: string): PokemonTcgCard | null {
  const card = cardsById.get(id.trim());
  return card ? expandCard(card) : null;
}

export function searchPokemonCatalogSnapshot({
  query,
  cardNumber = "",
  setHint = "",
  pageSize = 250,
}: {
  query: string;
  cardNumber?: string;
  setHint?: string;
  pageSize?: number;
}): PokemonTcgSearchResult {
  const requestedParts = collectorNumberParts(cardNumber);
  const requestedNumber = requestedParts.number;
  const requestedTotal = requestedParts.total;
  const wantedSet = normalize(setHint);
  const matches = snapshot.cards
    .flatMap((card) => {
      const nameClass = classifyPokemonName(query, card.n);
      const numberMatches = Boolean(requestedNumber)
        && normalizeCollectorToken(card.d) === normalizeCollectorToken(requestedNumber)
        && (!requestedTotal || normalizeCollectorToken(String(card.s.t ?? "")) === normalizeCollectorToken(requestedTotal));
      // A full seller title can contain set/rarity/condition noise that makes
      // the name classifier reject an otherwise exact printed number. For
      // fraction numbers, number + printed set total is the stronger identity.
      if (nameClass === "unrelated" && !numberMatches) return [];
      return [{
        card,
        nameRank: nameClass === "exact" ? 0 : nameClass === "form" ? 1 : nameClass === "related" ? 2 : 3,
        numberRank: numberMatches ? 0 : 1,
        setRank: wantedSet && snapshotSetValues(card).some((value) => value === wantedSet) ? 0 : 1,
      }];
    })
    .sort((left, right) => left.numberRank - right.numberRank
      || left.setRank - right.setRank
      || left.nameRank - right.nameRank
      || sortableDate(right.card.s.d) - sortableDate(left.card.s.d)
      || left.card.i.localeCompare(right.card.i));
  const cards = matches.slice(0, Math.min(Math.max(pageSize, 1), 250)).map(({ card }) => expandCard(card));
  return {
    source: "pokemon-catalog-snapshot",
    query,
    apiQuery: "local-snapshot",
    cards,
    count: cards.length,
    totalCount: matches.length,
  };
}

function expandCard(card: SnapshotCard): PokemonTcgCard {
  const imageStem = `https://images.pokemontcg.io/${card.s.i}/${card.d}`;
  return {
    id: card.i,
    name: card.n,
    subtypes: card.u,
    number: card.d,
    rarity: card.r,
    set: {
      id: card.s.i,
      name: card.s.n,
      series: card.s.e,
      printedTotal: card.s.t,
      ptcgoCode: card.s.p,
      releaseDate: card.s.d,
      images: { symbol: `https://images.pokemontcg.io/${card.s.i}/symbol.png` },
    },
    images: { small: `${imageStem}.png`, large: `${imageStem}_hires.png` },
  };
}

function snapshotSetValues(card: SnapshotCard) {
  return [card.s.i, card.s.n, card.s.e, card.s.p].filter(Boolean).map(normalize);
}

function normalize(value: string | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeCollectorToken(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^([A-Z]*?)0+(\d)/, "$1$2");
}

function sortableDate(value: string | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value.replaceAll("/", "-"));
  return Number.isFinite(parsed) ? parsed : 0;
}
