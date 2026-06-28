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
  // match locally. The response is cached (revalidate) to keep this cheap.
  const base = resolveBaseUrl(baseUrl);
  const raw = await fetchJson(`${base}/allSetCards/`, fetcher, timeoutMs);
  const all = z.array(onePieceCardSchema).parse(raw);

  const limit = Math.min(Math.max(pageSize, 1), 50);
  const cards = all
    .map((card) => ({ card, score: scoreOnePieceCard(card, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score
        || a.card.card_name.length - b.card.card_name.length
        || a.card.card_set_id.localeCompare(b.card.card_set_id),
    )
    .slice(0, limit)
    .map((entry) => entry.card);

  return { source: "optcg-api", query: normalizedQuery, cards, count: cards.length };
}

function normalizeOnePieceName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function onePieceTokens(value: string): string[] {
  return normalizeOnePieceName(value).split(" ").filter(Boolean);
}

// Bounded Levenshtein: true only when a and b are within a single edit. Used to
// rescue single-character typos like "puffy" → "luffy".
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (a.length < b.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits <= 1;
}

// A query token matches a card token by exact or prefix. A single typo is only
// forgiven for a one-word query of length >= 4, which keeps "law" from matching
// "raw" while still resolving "puffy" → "luffy".
function matchesToken(queryToken: string, cardToken: string, allowFuzzy: boolean): boolean {
  if (cardToken === queryToken || cardToken.startsWith(queryToken)) return true;
  return allowFuzzy && queryToken.length >= 4 && withinOneEdit(queryToken, cardToken);
}

// Tokenized relevance score. 0 means "not a match" (every query token must hit a
// card token). Higher is better; full-name and prefix matches beat token and
// fuzzy matches. One Piece names look like "Monkey.D.Luffy" / "Trafalgar Law".
function scoreOnePieceCard(card: OnePieceTcgCard, query: string): number {
  const queryTokens = onePieceTokens(query);
  if (queryTokens.length === 0) return 0;

  const fullName = normalizeOnePieceName(card.card_name);
  const cardTokens = fullName.split(" ").filter(Boolean);
  const allowFuzzy = queryTokens.length === 1;

  const everyTokenMatches = queryTokens.every((queryToken) =>
    cardTokens.some((cardToken) => matchesToken(queryToken, cardToken, allowFuzzy)),
  );
  if (!everyTokenMatches) return 0;

  const normalizedQuery = normalizeOnePieceName(query);
  if (fullName === normalizedQuery) return 1000;
  if (fullName.startsWith(normalizedQuery)) return 500;
  if (queryTokens.every((queryToken) => cardTokens.includes(queryToken))) return 300;
  if (queryTokens.every((queryToken) => cardTokens.some((cardToken) => cardToken.startsWith(queryToken)))) return 150;
  return 50;
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
