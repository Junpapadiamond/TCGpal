import { z } from "zod";
import type { CardIdentityCandidate, ListingSeed } from "@/lib/schemas";
import { collectorNumberParts, normalizeCollectorNumber } from "@/lib/comparison/collector-number";
import { onePieceReferenceGroupAliases } from "./one-piece-taxonomy";

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
  const groups = await findTcgplayerGroups(categoryId, card.setName, fetcher, card.tcgplayerGroupId ?? null);
  const wantedNumber = collectorNumberKey(card.cardNumber);
  const wantedPrefix = collectorPrefixKey(card.cardNumber);
  if (!wantedPrefix) return [];

  const byGroup = await Promise.all(groups.map(async (group) => {
    const response = await tcgcsvFetch(new URL(`${TCGCSV_BASE}/${categoryId}/${group.groupId}/products`), fetcher, 86400);
    if (!response.ok) throw new TcgcsvUnavailableError(`TCGplayer product feed failed with ${response.status}.`);
    const products = tcgcsvEnvelope(tcgcsvProductSchema).parse(await response.json()).results;

    const candidates = products.filter((product) => {
      const number = productNumber(product);
      return collectorNumberKey(number) === wantedNumber || collectorPrefixKey(number) === wantedPrefix;
    });

    const nameMatches = candidates.filter((product) => productNameMatchesCard(product.cleanName || product.name, card.name));
    const exactNumberMatches = candidates.filter(
      (product) => collectorNumberKey(productNumber(product)) === wantedNumber,
    );
    const matches = nameMatches.length > 0
      ? nameMatches
      : exactNumberMatches.length === 1
        ? exactNumberMatches
        : [];
    if (card.tcgplayerProductId) {
      return matches
        .filter((product) => product.productId === card.tcgplayerProductId)
        .map((product) => toProductMatch(categoryId, group, product));
    }
    return sortTcgplayerProducts(matches).map((product) => toProductMatch(categoryId, group, product));
  }));
  return byGroup.flat();
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

// Exported for the market-anchor coverage audit, which has to name the stage
// that dropped a card: "the set never found a TCGplayer group" and "the group
// was right but no product carried that collector number" are different bugs
// with different fixes, and an empty product list cannot tell them apart.
export async function findTcgplayerGroup(
  categoryId: number,
  setName: string,
  fetcher: typeof fetch = fetch,
  preferredGroupId: number | null = null,
) {
  return (await findTcgplayerGroups(categoryId, setName, fetcher, preferredGroupId))[0] ?? null;
}

async function findTcgplayerGroups(
  categoryId: number,
  setName: string,
  fetcher: typeof fetch = fetch,
  preferredGroupId: number | null = null,
) {
  const response = await tcgcsvFetch(new URL(`${TCGCSV_BASE}/${categoryId}/groups`), fetcher, 86400);
  if (!response.ok) throw new TcgcsvUnavailableError(`TCGplayer group feed failed with ${response.status}.`);
  const groups = tcgcsvEnvelope(tcgcsvGroupSchema).parse(await response.json()).results;

  if (preferredGroupId) {
    return groups.filter((group) => group.groupId === preferredGroupId);
  }

  const wantedTerms = setNameMatchTerms(setName);
  if (!wantedTerms[0]) return [];

  // TCGCSV group names carry a set-code prefix ("SWSH07: Evolving Skies"), so a
  // base set's name is a substring of every later release in its era and the
  // containment search returns a dozen candidates. Rank them, because the
  // tie-break is what decides where the market anchor comes from.
  //
  // Shortest-name was the wrong tie-break: it sent "Scarlet & Violet" to "SV:
  // Scarlet & Violet 151" and "XY" to "XY Promos", and `releaseMatches` in
  // crosswalk.ts then discarded both, so four base sets — 722 cards — showed no
  // market reference at all. Rank by the words the group adds instead. "151",
  // "Promos" and "Trainer Gallery" name a different release; "SV01:" and "Base
  // Set" only spell out the same one.
  const contained = groups
    .map((group) => ({
      group,
      tier: Math.max(...wantedTerms.map((wanted) => containmentTier(normalize(group.name), wanted))),
    }))
    .filter((entry) => entry.tier > 0)
    .sort((a, b) => b.tier - a.tier
      || extraReleaseTokens(a.group.name, setName) - extraReleaseTokens(b.group.name, setName)
      || normalize(a.group.name).length - normalize(b.group.name).length);
  const primary = contained[0]?.group;
  const aliases = categoryId === ONE_PIECE_CATEGORY_ID ? onePieceReferenceGroupAliases(setName).map(normalize) : [];
  const aliasGroups = groups.filter((group) => aliases.includes(normalize(group.name)));
  // The existing primary group plus exact-name alias groups; never an
  // unbounded group crawl. A failed feed prevents claiming uniqueness over it.
  return [...new Map([...(primary ? [primary] : []), ...aliasGroups].map((group) => [group.groupId, group])).values()];
}

// Structural words spell out an edition the set name already implies: a release
// code ("SV01", "SWSH", "HGSS", "WoTC") or the words "base"/"set". Everything
// else names a different product — which is exactly what disqualifies a group.
const STRUCTURAL_GROUP_TOKEN = /^(?:base|set|[a-z]{2,4}\d{0,2})$/;

export function extraReleaseTokens(groupName: string, setName: string) {
  const wanted = new Set(tokenize(setName));
  return tokenize(groupName)
    .filter((token) => !wanted.has(token) && !STRUCTURAL_GROUP_TOKEN.test(token))
    .length;
}

// Shared with `releaseMatches` in crosswalk.ts: a group the search accepts and
// the crosswalk then rejects is the failure mode this whole rule exists to fix,
// so both sides must ask the same question.
export function releaseTokensCovered(groupName: string, setName: string) {
  const groupTokens = new Set(tokenize(groupName));
  const wanted = tokenize(setName);
  return wanted.length > 0 && wanted.every((token) => groupTokens.has(token));
}

// pokemontcg.io names every promo release "<era> Black Star Promos"; TCGplayer
// publishes each one under its own, different name. Only the SM alias existed,
// so every other promo release resolved to no group at all and lost its market
// anchor — which is also the input the market-floor gate uses to reject
// replicas and mispriced rows. Each alias is the exact TCGplayer group name (or
// the suffix of it that `containmentTier` needs), kept explicit so a broad promo
// search cannot silently cross into a different era's group.
const PROMO_GROUP_ALIASES: Record<string, string> = {
  scarletvioletblackstarpromos: "scarletvioletpromocards",
  // pokemontcg.io serves this same set id under two names while it migrates.
  scarletvioletpromos: "scarletvioletpromocards",
  swshblackstarpromos: "swordshieldpromocards",
  smblackstarpromos: "smpromos",
  xyblackstarpromos: "xypromos",
  bwblackstarpromos: "blackandwhitepromos",
  dpblackstarpromos: "diamondandpearlpromos",
  hgssblackstarpromos: "hgsspromos",
  nintendoblackstarpromos: "nintendopromos",
  wizardsblackstarpromos: "wotcpromo",

  // Main releases the two catalogues simply name differently. Each target is the
  // exact TCGplayer group name, verified 2026-08-21 card-by-card against that
  // group's product feed — a name that merely looks right is not evidence.
  // Without these, 1,263 catalogued cards had no market anchor and therefore no
  // market-floor gate either.
  //
  // pokemontcg.io spells the conjunction "&" and drops TCGplayer's era prefix,
  // or keeps an era prefix TCGplayer drops.
  sunmoon: "smbaseset",
  blackwhite: "blackandwhite",
  diamondpearl: "diamondandpearl",
  rubysapphire: "exrubyandsapphire",
  expeditionbaseset: "expedition",
  hsunleashed: "unleashed",
  hsundaunted: "undaunted",
  hstriumphant: "triumphant",
  pokemonrumble: "rumble",

  // TCGplayer files these as "Promos"; pokemontcg.io as "Collection". 2021 is
  // the one year TCGplayer names for the anniversary rather than the year, and
  // 2013 and 2020 exist in neither catalogue.
  mcdonaldscollection2011: "mcdonaldspromos2011",
  mcdonaldscollection2012: "mcdonaldspromos2012",
  mcdonaldscollection2014: "mcdonaldspromos2014",
  mcdonaldscollection2015: "mcdonaldspromos2015",
  mcdonaldscollection2016: "mcdonaldspromos2016",
  mcdonaldscollection2017: "mcdonaldspromos2017",
  mcdonaldscollection2018: "mcdonaldspromos2018",
  mcdonaldscollection2019: "mcdonaldspromos2019",
  mcdonaldscollection2021: "mcdonalds25thanniversarypromos",
  mcdonaldscollection2022: "mcdonaldspromos2022",

  // pokemontcg.io splits each EX Trainer Kit into one set per mascot deck;
  // TCGplayer publishes the kit as a single group, so two set names share a
  // target. The full group name is the target on purpose: aliasing to
  // "latiaslatios" would lose the tie-break to "XY Trainer Kit: Latias & Latios".
  extrainerkitlatias: "extrainerkit1latiaslatios",
  extrainerkitlatios: "extrainerkit1latiaslatios",
  extrainerkit2plusle: "extrainerkit2plusleminun",
  extrainerkit2minun: "extrainerkit2plusleminun",

  // Same nine cards, two names. Verified by number and card name, not by shape.
  bestofgame: "bestofpromos",
};

export function setNameMatchTerms(setName: string) {
  const wanted = normalize(setName);
  const alias = PROMO_GROUP_ALIASES[wanted];
  return alias ? [wanted, alias] : [wanted];
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
  return normalizeCollectorNumber(value);
}

function productNumber(product: TcgcsvProduct) {
  return product.extendedData?.find((entry) => entry.name === "Number")?.value ?? "";
}

function collectorPrefixKey(value: string) {
  return collectorNumberParts(value).number;
}

// pokemontcg.io writes "Pokémon GO" and "Pokédex"; TCGplayer writes "Pokemon".
// Stripping non-ASCII without folding first turned the accented letter into
// nothing at all — "pokmon" — so the two catalogues could never agree on a name
// that contains one. This is a card-name matcher as much as a set-name matcher:
// `nameOverlap` scored "Pokémon Catcher" at 0.33 against TCGplayer's "Pokemon
// Catcher" and the crosswalk lost the card.
function foldAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(value: string) {
  return foldAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function containmentTier(groupName: string, wanted: string) {
  if (groupName === wanted) return 3;
  if (groupName.endsWith(wanted)) return 2;
  return groupName.includes(wanted) ? 1 : 0;
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
  return foldAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean);
}
