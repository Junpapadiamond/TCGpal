import type { OnePieceTcgCard } from "./one-piece-tcg";
import generatedSnapshot from "./one-piece-catalog.generated.json";
import { deriveOnePieceCatalogPrintEnrichment, getOnePiecePrintEnrichment } from "./one-piece-print-metadata";

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
    // The curated seed is base prints only; the print id equals the card number.
    is_alternate_art: false,
    variant: null,
    card_type: cardType,
    card_image: `${IMAGE_BASE}/${cardSetId}.png`,
    card_image_id: cardSetId,
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
// maintained `one-piece-card-game-json` dataset (one fully-tagged entry per PRINT —
// base art plus every alternate art / parallel / manga / treasure rare / promo).
// This is the primary source and is bundled in the repo, so coverage works with zero
// network. The curated seed above is only an offline safety net for the rare case
// the snapshot is missing/empty.
function loadSnapshot(): OnePieceTcgCard[] {
  if (!Array.isArray(generatedSnapshot)) return [];
  return (generatedSnapshot as Partial<OnePieceTcgCard>[]).filter(
    (entry): entry is OnePieceTcgCard =>
      typeof entry?.card_name === "string" && typeof entry?.card_set_id === "string",
  ).map((entry) => {
    const enrichment = getOnePiecePrintEnrichment(entry.card_image_id ?? entry.card_set_id)
      ?? deriveOnePieceCatalogPrintEnrichment({
        canonicalPrintId: entry.card_image_id ?? entry.card_set_id,
        isAlternateArt: Boolean(entry.is_alternate_art),
        rarity: entry.rarity,
        releaseName: entry.set_name,
      });
    if (!enrichment) return entry;
    return {
      ...entry,
      variant: enrichment.displayLabel,
      artwork_class: enrichment.artworkClass,
      treatments: [...enrichment.treatments],
      collector_aliases: [...enrichment.collectorAliases],
      exact_markers: [...enrichment.exactMarkers],
      tcgplayer_product_id: enrichment.tcgplayerProductId,
      tcgplayer_group_id: enrichment.tcgplayerGroupId,
    };
  });
}

// The stable per-print key: the image id keeps alternate arts of one number distinct.
function printKey(entry: OnePieceTcgCard): string {
  return (entry.card_image_id?.trim() || entry.card_set_id).trim().toUpperCase();
}

export const onePieceCatalog: OnePieceTcgCard[] = (() => {
  const byPrint = new Map<string, OnePieceTcgCard>();
  // Snapshot first (authoritative, fully tagged); curated only fills prints it lacks.
  for (const entry of loadSnapshot()) byPrint.set(printKey(entry), entry);
  for (const entry of curated) {
    const key = printKey(entry);
    if (!byPrint.has(key)) byPrint.set(key, entry);
  }
  return Array.from(byPrint.values());
})();

// Exact-print index (used to reload a user-confirmed alternate art with no network).
const catalogByPrint = new Map(onePieceCatalog.map((entry) => [printKey(entry), entry]));

// Card number → all its prints, base art first, so a number search surfaces every
// variant and a bare-number lookup still returns the canonical base print.
const catalogByNumber = (() => {
  const byNumber = new Map<string, OnePieceTcgCard[]>();
  for (const entry of onePieceCatalog) {
    const number = entry.card_set_id.trim().toUpperCase();
    const list = byNumber.get(number);
    if (list) list.push(entry);
    else byNumber.set(number, [entry]);
  }
  for (const list of byNumber.values()) {
    list.sort(
      (a, b) =>
        Number(Boolean(a.is_alternate_art)) - Number(Boolean(b.is_alternate_art))
        || printKey(a).localeCompare(printKey(b)),
    );
  }
  return byNumber;
})();

// Resolve a card NUMBER to its canonical (base) print. Also accepts a full print id
// so callers that pass either form still resolve.
export function findOnePieceCatalogCard(cardSetId: string): OnePieceTcgCard | undefined {
  const key = cardSetId.trim().toUpperCase();
  const prints = catalogByNumber.get(key);
  if (prints && prints.length > 0) return prints[0];
  return catalogByPrint.get(key);
}

// Resolve an exact print id (e.g. "OP01-024_p1") to that specific alternate art.
export function findOnePieceCatalogVariant(printId: string): OnePieceTcgCard | undefined {
  return catalogByPrint.get(printId.trim().toUpperCase());
}

// Every print of a card number, base art first (drives the number-search fan-out).
export function findOnePieceCatalogVariants(cardSetId: string): OnePieceTcgCard[] {
  return catalogByNumber.get(cardSetId.trim().toUpperCase()) ?? [];
}
