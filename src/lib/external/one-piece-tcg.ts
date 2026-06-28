import { z } from "zod";
import type { CardIdentityCandidate } from "@/lib/schemas";

// OPTCG API (https://www.optcgapi.com) is a free, no-key community catalog for the
// One Piece Trading Card Game. It exposes static-ish JSON dumps plus per-card
// lookups. We only read from it server-side and normalize into the shared
// CardIdentityCandidate shape so the comparison flow stays game-agnostic.
//
// Card art is © Bandai / Eiichiro Oda. OPTCG serves the official sample images
// (with the printed "SAMPLE" watermark), which is what we surface as imageUrl.

const priceField = z
  .preprocess((value) => {
    if (value === null || value === undefined || value === "") return null;
    const numeric =
      typeof value === "string" ? Number(value.replace(/[^0-9.]/g, "")) : value;
    return typeof numeric === "number" && Number.isFinite(numeric) ? numeric : null;
  }, z.number().nullable())
  .optional();

const onePieceCardSchema = z.object({
  card_name: z.string(),
  // Stable per-print id, e.g. "OP01-001", "ST01-001", "EB01-001", "P-001".
  card_set_id: z.string(),
  set_id: z.string().optional(), // e.g. "OP-01"
  set_name: z.string().optional(),
  rarity: z.string().nullable().optional(),
  card_color: z.string().nullable().optional(),
  card_type: z.string().nullable().optional(),
  card_text: z.string().nullable().optional(),
  card_cost: z.string().nullable().optional(),
  card_power: z.string().nullable().optional(),
  life: z.string().nullable().optional(),
  counter_amount: z.string().nullable().optional(),
  attribute: z.string().nullable().optional(),
  sub_types: z.string().nullable().optional(),
  card_image_id: z.string().nullable().optional(),
  card_image: z.string().nullable().optional(),
  market_price: priceField,
  inventory_price: priceField,
});

// OPTCG card endpoints return either a single object or a single-element array
// depending on the path, so accept both and normalize to a flat list.
const onePieceCardResponseSchema = z.union([
  z.array(onePieceCardSchema),
  onePieceCardSchema.transform((card) => [card]),
]);

export type OnePieceTcgCard = z.infer<typeof onePieceCardSchema>;

export type OnePieceTcgSearchResult = {
  source: "optcg-api";
  query: string;
  cards: OnePieceTcgCard[];
  count: number;
};

type SearchOnePieceCardsOptions = {
  query: string;
  cardNumber?: string;
  pageSize?: number;
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

type GetOnePieceCardOptions = {
  cardSetId: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_BASE_URL = "https://www.optcgapi.com/api";

// Matches OP01-001, ST21-001, EB01-061, PRB01-001, and promo P-001 style ids.
const CARD_SET_ID_PATTERN = /^[A-Z]{1,4}\d{0,2}-\d{1,4}$/i;

function resolveBaseUrl(baseUrl?: string) {
  return (baseUrl ?? process.env.ONE_PIECE_TCG_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

async function fetchJson(
  url: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetcher(new URL(url), {
    headers: { Accept: "application/json" },
    next: { revalidate: 21600 },
    signal: controller.signal,
  } as RequestInit & { next: { revalidate: number } }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`OPTCG API request failed with ${response.status}.`);
  }
  return response.json();
}

export async function getOnePieceCard({
  cardSetId,
  baseUrl,
  fetcher = fetch,
  timeoutMs = 8000,
}: GetOnePieceCardOptions): Promise<OnePieceTcgCard | null> {
  const id = cardSetId.trim().toUpperCase();
  if (!id) throw new Error("One Piece card id is required.");

  const base = resolveBaseUrl(baseUrl);
  // A given id lives in exactly one of these collections; try in likelihood order.
  const paths = [
    `${base}/sets/card/${encodeURIComponent(id)}/`,
    `${base}/decks/card/${encodeURIComponent(id)}/`,
    `${base}/promos/card/${encodeURIComponent(id)}/`,
  ];

  for (const path of paths) {
    try {
      const cards = onePieceCardResponseSchema.parse(await fetchJson(path, fetcher, timeoutMs));
      const match = cards.find((card) => card.card_set_id.toUpperCase() === id) ?? cards[0];
      if (match) return match;
    } catch {
      // Try the next collection; a 404 here just means the id is not in that set.
    }
  }
  return null;
}

export async function searchOnePieceCards({
  query,
  cardNumber = "",
  pageSize = 8,
  baseUrl,
  fetcher = fetch,
  timeoutMs = 8000,
}: SearchOnePieceCardsOptions): Promise<OnePieceTcgSearchResult> {
  const normalizedQuery = query.trim();
  const directId = cardNumber.trim().toUpperCase();

  // Fast path: a concrete card id (OP01-001) resolves to a single print.
  if (directId && CARD_SET_ID_PATTERN.test(directId)) {
    const card = await getOnePieceCard({ cardSetId: directId, baseUrl, fetcher, timeoutMs });
    if (card) {
      return { source: "optcg-api", query: normalizedQuery, cards: [card], count: 1 };
    }
  }

  if (normalizedQuery.length < 2) {
    throw new Error("One Piece card search query must be at least 2 characters.");
  }

  // OPTCG has no name-query endpoint, so pull the cached full set-card dump and
  // filter locally. The response is cached (revalidate) to keep this cheap.
  const base = resolveBaseUrl(baseUrl);
  const raw = await fetchJson(`${base}/allSetCards/`, fetcher, timeoutMs);
  const all = z.array(onePieceCardSchema).parse(raw);

  const needle = normalizedQuery.toLowerCase();
  const cards = all
    .filter((card) => card.card_name.toLowerCase().includes(needle))
    .slice(0, Math.min(Math.max(pageSize, 1), 50));

  return { source: "optcg-api", query: normalizedQuery, cards, count: cards.length };
}

function toMarketPrice(card: OnePieceTcgCard): number | null {
  return card.market_price ?? card.inventory_price ?? null;
}

function deriveSetCode(card: OnePieceTcgCard): string {
  if (card.set_id) return card.set_id;
  // Fall back to the prefix of the card id, e.g. "OP01" from "OP01-001".
  return card.card_set_id.split("-")[0] ?? card.card_set_id;
}

export function mapOnePieceCardToIdentity(
  card: OnePieceTcgCard,
  options: { confidence: CardIdentityCandidate["confidence"]; matchReasons: string[] },
): CardIdentityCandidate {
  const image = card.card_image?.trim();
  const imageUrl = image && /^https?:\/\//i.test(image) ? image : null;
  const market = toMarketPrice(card);

  return {
    id: card.card_set_id,
    name: card.card_name,
    setName: card.set_name ?? deriveSetCode(card),
    setCode: deriveSetCode(card),
    cardNumber: card.card_set_id,
    language: "EN",
    imageUrl,
    rarity: card.rarity ?? null,
    confidence: options.confidence,
    matchReasons: options.matchReasons,
    marketLow: market,
    marketMid: market,
    marketHigh: market,
  };
}
