import { z } from "zod";
import type { CardIdentityCandidate, ListingSeed } from "@/lib/schemas";

// TCGCSV republishes the TCGplayer catalog and daily aggregate price dump.
// It is a reference feed, never concrete seller inventory. Data is daily, so
// freshness is surfaced and >48h-stale data triggers a warning.
const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const TCGCSV_LAST_UPDATED_URL = "https://tcgcsv.com/last-updated.txt";
const POKEMON_CATEGORY_ID = 3;
const ONE_PIECE_CATEGORY_ID = 68;

export const TCGCSV_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export class TcgcsvUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TcgcsvUnavailableError";
  }
}

const tcgcsvGroupSchema = z.object({
  groupId: z.number().int(),
  name: z.string(),
  abbreviation: z.string().nullable().optional(),
}).passthrough();

const tcgcsvProductSchema = z.object({
  productId: z.number().int(),
  name: z.string(),
  cleanName: z.string().nullable().optional(),
  imageUrl: z.string().optional(),
  url: z.string().optional(),
  extendedData: z.array(z.object({
    name: z.string(),
    value: z.string(),
  }).passthrough()).optional(),
}).passthrough();

const tcgcsvPriceSchema = z.object({
  productId: z.number().int(),
  lowPrice: z.number().nullable().optional(),
  midPrice: z.number().nullable().optional(),
  highPrice: z.number().nullable().optional(),
  marketPrice: z.number().nullable().optional(),
  directLowPrice: z.number().nullable().optional(),
  subTypeName: z.string(),
}).passthrough();

const tcgcsvEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({
  results: z.array(item),
}).passthrough();

export type TcgplayerProductMatch = {
  categoryId: number;
  groupId: number;
  groupName: string;
  productId: number;
  productName: string;
  collectorNumber: string;
  productUrl: string;
  imageUrl: string | null;
};

type TcgcsvProduct = z.infer<typeof tcgcsvProductSchema>;

export type TcgplayerPriceRow = z.infer<typeof tcgcsvPriceSchema>;

export type TcgplayerMarketAnchor = {
  low: number | null;
  mid: number | null;
  high: number | null;
  subTypeName: string;
  url: string;
};

export type TcgplayerSearchResult = {
  seeds: ListingSeed[];
  anchor: TcgplayerMarketAnchor | null;
  product: TcgplayerProductMatch | null;
  asOf: string | null;
};

export async function getTcgcsvLastUpdated(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await tcgcsvFetch(new URL(TCGCSV_LAST_UPDATED_URL), fetcher, 1800);
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  } catch {
    return null;
  }
}

export function isTcgcsvStale(asOf: string | null, now: Date = new Date()) {
  if (!asOf) return false;
  const at = new Date(asOf).getTime();
  return Number.isFinite(at) && now.getTime() - at > TCGCSV_STALE_AFTER_MS;
}

// Crosswalk leg: canonical card (pokemontcg.io identity) → TCGplayer product.
// Group is matched by set name, product by printed collector number; a name
// sanity check prevents a wrong-number data glitch from crossing sets.
export async function resolveTcgplayerProduct(
  card: Pick<CardIdentityCandidate, "name" | "setName" | "cardNumber"> & Partial<Pick<CardIdentityCandidate, "tcgplayerProductId" | "tcgplayerGroupId" | "variant">>,
  fetcher: typeof fetch = fetch,
  options: { preferredProductId?: number | null } = {},
): Promise<TcgplayerProductMatch | null> {
  const matches = await resolveTcgplayerProductVariants(card, fetcher);
  if (matches.length === 0) return null;
  const preferredProductId = options.preferredProductId ?? card.tcgplayerProductId ?? null;
  if (preferredProductId) {
    return matches.find((product) => product.productId === preferredProductId) ?? null;
  }
  // Anchor to the print class the buyer confirmed. Ambiguous products and a
  // missing requested variant return null so a sibling SKU never supplies the
  // selected print's market anchor.
  const wantsAlt = Boolean(card.variant);
  const sameClass = matches.filter((product) => isParallelProduct(product) === wantsAlt);
  if (sameClass.length === 1) return sameClass[0];
  if (!card.variant && matches.length === 1) return matches[0];
  return null;
}

export async function resolveTcgplayerProductVariants(
  card: Pick<CardIdentityCandidate, "name" | "setName" | "cardNumber"> & Partial<Pick<CardIdentityCandidate, "tcgplayerProductId" | "tcgplayerGroupId">>,
  fetcher: typeof fetch = fetch,
): Promise<TcgplayerProductMatch[]> {
  const categoryId = inferTcgplayerCategoryId(card);
  const group = await findTcgplayerGroup(categoryId, card.setName, fetcher, card.tcgplayerGroupId ?? null);
  if (!group) return [];

  const response = await tcgcsvFetch(new URL(`${TCGCSV_BASE}/${categoryId}/${group.groupId}/products`), fetcher, 86400);
  if (!response.ok) throw new TcgcsvUnavailableError(`TCGplayer product feed failed with ${response.status}.`);
  const products = tcgcsvEnvelope(tcgcsvProductSchema).parse(await response.json()).results;

  const wantedNumber = collectorNumberKey(card.cardNumber);
  const wantedPrefix = collectorPrefixKey(card.cardNumber);
  if (!wantedPrefix) return [];

  const candidates = products.filter((product) => {
    const number = product.extendedData?.find((entry) => entry.name === "Number")?.value ?? "";
    return collectorNumberKey(number) === wantedNumber || collectorPrefixKey(number) === wantedPrefix;
  });

  const nameMatches = candidates.filter((product) => productNameMatchesCard(product.cleanName || product.name, card.name));
  const matches = nameMatches.length > 0 ? nameMatches : candidates.length === 1 ? candidates : [];
  if (card.tcgplayerProductId) {
    return matches
      .filter((product) => product.productId === card.tcgplayerProductId)
      .map((product) => toProductMatch(categoryId, group, product));
  }
  return sortTcgplayerProducts(matches).map((product) => toProductMatch(categoryId, group, product));
}

function toProductMatch(
  categoryId: number,
  group: { groupId: number; name: string },
  product: TcgcsvProduct,
): TcgplayerProductMatch {
  return {
    categoryId,
    groupId: group.groupId,
    groupName: group.name,
    productId: product.productId,
    productName: product.name,
    collectorNumber: product.extendedData?.find((entry) => entry.name === "Number")?.value ?? "",
    productUrl: product.url || `https://www.tcgplayer.com/product/${product.productId}`,
    imageUrl: product.imageUrl || null,
  };
}

export async function getTcgplayerPrices(
  categoryId: number,
  groupId: number,
  productId: number,
  fetcher: typeof fetch = fetch,
): Promise<TcgplayerPriceRow[]> {
  const response = await tcgcsvFetch(new URL(`${TCGCSV_BASE}/${categoryId}/${groupId}/prices`), fetcher, 86400);
  if (!response.ok) throw new TcgcsvUnavailableError(`TCGplayer price feed failed with ${response.status}.`);
  const rows = tcgcsvEnvelope(tcgcsvPriceSchema).parse(await response.json()).results;
  return rows.filter((row) => row.productId === productId);
}

// Crosswalk product → daily aggregate reference. TCGCSV does not identify a
// specific seller, condition, shipping amount, or buyable listing, so it never
// produces ranking seeds. The empty `seeds` field remains for API compatibility
// while callers migrate to the reference-only semantics.
export async function searchTcgplayerListings(
  card: CardIdentityCandidate,
  product: TcgplayerProductMatch | null,
  fetcher: typeof fetch = fetch,
): Promise<TcgplayerSearchResult> {
  void card;
  if (!product) {
    return { seeds: [], anchor: null, product: null, asOf: await getTcgcsvLastUpdated(fetcher) };
  }

  const [rows, asOf] = await Promise.all([
    getTcgplayerPrices(product.categoryId, product.groupId, product.productId, fetcher),
    getTcgcsvLastUpdated(fetcher),
  ]);

  const anchorRow = sortByVariantPreference(rows).find((row) => row.marketPrice !== null || row.midPrice !== null) ?? null;
  const anchor = anchorRow
    ? {
      low: anchorRow.lowPrice ?? null,
      mid: anchorRow.marketPrice ?? anchorRow.midPrice ?? null,
      high: anchorRow.highPrice ?? null,
      subTypeName: anchorRow.subTypeName,
      url: product.productUrl,
    }
    : null;

  return { seeds: [], anchor, product, asOf };
}

async function findTcgplayerGroup(
  categoryId: number,
  setName: string,
  fetcher: typeof fetch,
  preferredGroupId: number | null = null,
) {
  const response = await tcgcsvFetch(new URL(`${TCGCSV_BASE}/${categoryId}/groups`), fetcher, 86400);
  if (!response.ok) throw new TcgcsvUnavailableError(`TCGplayer group feed failed with ${response.status}.`);
  const groups = tcgcsvEnvelope(tcgcsvGroupSchema).parse(await response.json()).results;

  if (preferredGroupId) {
    return groups.find((group) => group.groupId === preferredGroupId) ?? null;
  }

  const wanted = normalize(setName);
  if (!wanted) return null;

  // TCGCSV group names carry a set-code prefix ("SWSH07: Evolving Skies"), so
  // containment of the catalog set name is the primary match.
  const exact = groups.find((group) => {
    const name = normalize(group.name);
    return name === wanted || name.endsWith(wanted) || name.includes(wanted);
  });
  if (exact) return exact;

  const bestTokens = groups
    .map((group) => ({ group, overlap: nameOverlap(group.name, setName) }))
    .sort((a, b) => b.overlap - a.overlap)[0];
  return bestTokens && bestTokens.overlap >= 0.8 ? bestTokens.group : null;
}

export function inferTcgplayerCategoryId(card: Pick<CardIdentityCandidate, "cardNumber"> & Partial<Pick<CardIdentityCandidate, "id" | "setCode">>) {
  const key = `${card.id ?? ""} ${card.setCode ?? ""} ${card.cardNumber}`.toUpperCase();
  return /\b(?:OP|ST|EB|PRB|P)-?\d{0,3}-\d{1,4}\b/.test(key)
    ? ONE_PIECE_CATEGORY_ID
    : POKEMON_CATEGORY_ID;
}

// Prefer the variants that usually represent the card's primary printing so
// the anchor and the first listing rows match the version the buyer confirmed.
const variantPreference = ["holofoil", "normal", "reverse holofoil", "1st edition holofoil", "unlimited holofoil"];

function sortByVariantPreference(rows: TcgplayerPriceRow[]) {
  return [...rows].sort((a, b) => variantRank(a.subTypeName) - variantRank(b.subTypeName));
}

function variantRank(subTypeName: string) {
  const index = variantPreference.indexOf(subTypeName.toLowerCase());
  return index === -1 ? variantPreference.length : index;
}

async function tcgcsvFetch(url: URL, fetcher: typeof fetch, revalidateSeconds: number, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, {
      // TCGCSV rejects requests without a User-Agent with 401.
      headers: {
        "User-Agent": "TCGlens/0.1 (+https://tcgpal.vercel.app)",
        Accept: "application/json, text/plain",
      },
      next: { revalidate: revalidateSeconds },
      signal: controller.signal,
    } as RequestInit & { next: { revalidate: number } });
  } finally {
    clearTimeout(timeout);
  }
}

function collectorNumberKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9/]/g, "").split("/").map(stripLeadingZeros).join("/");
}

function collectorPrefixKey(value: string) {
  return collectorNumberKey(value).split("/")[0] ?? "";
}

function stripLeadingZeros(segment: string) {
  const match = segment.match(/^([A-Z]*)0*(\d+)$/);
  return match ? `${match[1]}${match[2]}` : segment;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function nameOverlap(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const shared = [...rightTokens].filter((token) => leftTokens.has(token)).length;
  return shared / rightTokens.size;
}

function productNameMatchesCard(productName: string, cardName: string) {
  const compactProduct = normalize(productName);
  const compactCard = normalize(cardName);
  return nameOverlap(productName, cardName) >= 0.5
    || Boolean(compactCard && (compactProduct.includes(compactCard) || compactCard.includes(compactProduct)));
}

function isParallelProduct(product: Pick<TcgplayerProductMatch, "productName"> | { name: string; cleanName?: string | null }) {
  const name = "productName" in product ? product.productName : `${product.name} ${product.cleanName ?? ""}`;
  return /\b(parallel|alternate\s+art|alt\s+art)\b/i.test(name);
}

function sortTcgplayerProducts<T extends { name: string; cleanName?: string | null; productId: number }>(products: T[]) {
  return [...products].sort((a, b) =>
    productVariantRank(a) - productVariantRank(b)
    || a.productId - b.productId,
  );
}

function productVariantRank(product: { name: string; cleanName?: string | null }) {
  return isParallelProduct(product) ? 1 : 0;
}

function tokenize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean);
}
