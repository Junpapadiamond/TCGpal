import type { OnePieceTcgCard } from "./one-piece-tcg";
import generatedSnapshot from "./one-piece-catalog.generated.json";

// Curated, hand-verified One Piece catalog bundled in the repo so card search
// works with ZERO network dependency. The live OPTCG API (optcgapi.com) augments
// this for breadth when reachable, but this seed alone guarantees that common
// queries ("luffy", "zoro", "law", "nami"...) always resolve to a real card.
//
// Card numbers/names verified against the official card list and community
// databases (ST-01 Straw Hat Crew + OP-01 Romance Dawn). Images point at the
// official card-game host (watermarked "SAMPLE" art); they render via Vercel's
// image optimizer in the user's browser. A missing image degrades to the card
// placeholder — it never blocks identity resolution.
//
// Prices are intentionally null: TCGpal never invents a market price.

const IMAGE_BASE = "https://en.onepiece-cardgame.com/images/cardlist/card";

function card(
  cardSetId: string,
  cardName: string,
  setId: string,
  setName: string,
  rarity: string,
  cardType: string,
): OnePieceTcgCard {
  return {
    card_name: cardName,
    card_set_id: cardSetId,
    set_id: setId,
    set_name: setName,
    rarity,
    card_type: cardType,
    card_image: `${IMAGE_BASE}/${cardSetId}.png`,
    market_price: null,
    inventory_price: null,
  };
}

const STRAW_HAT = (id: string, name: string, rarity: string, type: string) =>
  card(id, name, "ST-01", "Straw Hat Crew", rarity, type);

const ROMANCE_DAWN = (id: string, name: string, rarity: string, type: string) =>
  card(id, name, "OP-01", "Romance Dawn", rarity, type);

// Hand-verified seed. This alone is the offline guarantee.
const curated: OnePieceTcgCard[] = [
  // ST-01 — Straw Hat Crew starter deck (stable, complete character line-up)
  STRAW_HAT("ST01-001", "Monkey.D.Luffy", "L", "Leader"),
  STRAW_HAT("ST01-002", "Usopp", "C", "Character"),
  STRAW_HAT("ST01-003", "Karoo", "C", "Character"),
  STRAW_HAT("ST01-004", "Sanji", "C", "Character"),
  STRAW_HAT("ST01-005", "Jinbe", "C", "Character"),
  STRAW_HAT("ST01-006", "Tony Tony.Chopper", "C", "Character"),
  STRAW_HAT("ST01-007", "Nami", "C", "Character"),
  STRAW_HAT("ST01-008", "Nico Robin", "C", "Character"),
  STRAW_HAT("ST01-009", "Nefertari Vivi", "C", "Character"),
  STRAW_HAT("ST01-010", "Franky", "C", "Character"),
  STRAW_HAT("ST01-011", "Brook", "C", "Character"),
  STRAW_HAT("ST01-012", "Monkey.D.Luffy", "SR", "Character"),
  STRAW_HAT("ST01-013", "Roronoa Zoro", "SR", "Character"),

  // OP-01 — Romance Dawn (leaders + iconic singles)
  ROMANCE_DAWN("OP01-001", "Roronoa Zoro", "L", "Leader"),
  ROMANCE_DAWN("OP01-002", "Trafalgar Law", "L", "Leader"),
  ROMANCE_DAWN("OP01-003", "Monkey.D.Luffy", "L", "Leader"),
  ROMANCE_DAWN("OP01-013", "Sanji", "R", "Character"),
  ROMANCE_DAWN("OP01-016", "Nami", "R", "Character"),
  ROMANCE_DAWN("OP01-024", "Monkey.D.Luffy", "SR", "Character"),
  ROMANCE_DAWN("OP01-025", "Roronoa Zoro", "SR", "Character"),
  ROMANCE_DAWN("OP01-120", "Shanks", "SR", "Character"),
];

// Full-catalog snapshot produced by `node scripts/build-optcg-catalog.mjs` from the
// maintained `one-piece-card-game-json` dataset (one fully-tagged entry per card
// number). This is the primary source and is bundled in the repo, so coverage works
// with zero network. The curated seed above is only an offline safety net for the
// rare case the snapshot is missing/empty.
function loadSnapshot(): OnePieceTcgCard[] {
  if (!Array.isArray(generatedSnapshot)) return [];
  return (generatedSnapshot as Partial<OnePieceTcgCard>[]).filter(
    (entry): entry is OnePieceTcgCard =>
      typeof entry?.card_name === "string" && typeof entry?.card_set_id === "string",
  );
}

export const onePieceCatalog: OnePieceTcgCard[] = (() => {
  const byId = new Map<string, OnePieceTcgCard>();
  // Snapshot first (authoritative, fully tagged); curated only fills ids it lacks.
  for (const entry of loadSnapshot()) byId.set(entry.card_set_id.toUpperCase(), entry);
  for (const entry of curated) {
    const key = entry.card_set_id.toUpperCase();
    if (!byId.has(key)) byId.set(key, entry);
  }
  return Array.from(byId.values());
})();

const catalogById = new Map(onePieceCatalog.map((entry) => [entry.card_set_id.toUpperCase(), entry]));

export function findOnePieceCatalogCard(cardSetId: string): OnePieceTcgCard | undefined {
  return catalogById.get(cardSetId.trim().toUpperCase());
}
