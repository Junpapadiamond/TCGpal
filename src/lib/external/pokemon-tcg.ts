import { z } from "zod";
import { classifyPokemonName } from "@/lib/external/pokemon-name-match";
import { createLinkedAbortSignal } from "@/lib/ops/abort";

const pokemonTcgCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  supertype: z.string().optional(),
  subtypes: z.array(z.string()).optional(),
  hp: z.string().optional(),
  types: z.array(z.string()).optional(),
  number: z.string().optional(),
  rarity: z.string().optional(),
  set: z
    .object({
      id: z.string().optional(),
      name: z.string(),
      series: z.string().optional(),
      printedTotal: z.number().optional(),
      ptcgoCode: z.string().optional(),
      releaseDate: z.string().optional(),
      images: z
        .object({
          symbol: z.string().url().optional(),
        })
        .optional(),
    })
    .optional(),
  images: z
    .object({
      small: z.string().optional(),
      large: z.string().optional(),
    })
    .optional(),
  tcgplayer: z
    .object({
      url: z.string().optional(),
      updatedAt: z.string().optional(),
      prices: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

const pokemonTcgSearchResponseSchema = z.object({
  data: z.array(pokemonTcgCardSchema),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  count: z.number().optional(),
  totalCount: z.number().optional(),
});

const pokemonTcgCardResponseSchema = z.object({
  data: pokemonTcgCardSchema,
});

export type PokemonTcgCard = z.infer<typeof pokemonTcgCardSchema>;

export type PokemonTcgSearchResult = {
  source: "pokemon-tcg-api";
  query: string;
  apiQuery: string;
  cards: PokemonTcgCard[];
  count: number;
  totalCount: number | null;
};

type SearchPokemonCardsOptions = {
  query: string;
  cardNumber?: string;
  setHint?: string;
  relaxed?: boolean;
  pageSize?: number;
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type GetPokemonCardOptions = {
  id: string;
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type BrowsePokemonCardsOptions = {
  query?: string;
  page?: number;
  pageSize?: number;
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
};

const POKEMON_TCG_API_BASE_URL = "https://api.pokemontcg.io/v2";

export async function searchPokemonCards({
  query,
  cardNumber = "",
  setHint = "",
  relaxed = true,
  pageSize = 8,
  apiKey = process.env.POKEMON_TCG_API_KEY,
  fetcher = fetch,
  timeoutMs = 8000,
  signal,
}: SearchPokemonCardsOptions): Promise<PokemonTcgSearchResult> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) throw new Error("Pokemon card search query must be at least 2 characters.");

  const apiQueries = buildPokemonCardQueries({
    name: normalizedQuery,
    cardNumber,
    setHint,
    relaxed,
  });
  let lastResult: PokemonTcgSearchResult | null = null;
  let lastError: unknown = null;

  for (const apiQuery of apiQueries) {
    // Each tier gets one immediate second chance before the ladder gives up its
    // precision. Measured 2026-08-19, pokemontcg.io answered 14 of 24 identical
    // requests with a 500/502 while the query itself was fine, and loosening on
    // that resolved a precise "Charizard 4/102" to whatever the newest-first
    // name tier happened to return.
    for (let tierAttempt = 0; tierAttempt < 2; tierAttempt += 1) {
      let retryThisTier = false;
      try {
        const result = await fetchPokemonCards({
          query: normalizedQuery,
          apiQuery,
          page: 1,
          // 250 is the Pokemon TCG API's own maximum. A lower ceiling here is not a
          // safety net, it is silent data loss: the query is ordered
          // -set.releaseDate, so clamping a name-only search to 50 removed exactly
          // the oldest prints, and a "pikachu" picker could never show Base Set.
          pageSize: Math.min(Math.max(pageSize, 1), 250),
          apiKey,
          fetcher,
          timeoutMs,
          signal,
        });
        lastResult = result;
        if (result.cards.length > 0) return result;
      } catch (error) {
        if (signal?.aborted || !canTrySaferPokemonQuery(error)) throw error;
        // The API occasionally times out or returns 500 for one expensive or
        // overly-specific Lucene query while a simpler name query succeeds. A
        // failed tier must not discard the rest of the deterministic search
        // ladder and make the buyer submit the same card again.
        lastError = error;
        // Only fast server faults are worth re-asking: a timeout means this
        // query is too slow, which is the case the looser tiers exist for.
        retryThisTier = tierAttempt === 0 && isRetryablePokemonServerFault(error);
      }
      if (!retryThisTier) break;
    }
  }

  if (lastError) throw lastError;
  return lastResult as PokemonTcgSearchResult;
}

class PokemonTcgRequestError extends Error {
  constructor(readonly status: number) {
    super(`Pokemon TCG API request failed with ${status}.`);
    this.name = "PokemonTcgRequestError";
  }
}

// A server-side fault the API returns quickly — about a second, measured
// 2026-08-19 — so re-asking the same question costs almost nothing. Timeouts are
// excluded deliberately: those spend the whole attempt budget and mean the query
// is too slow, not that the server hiccuped.
function isRetryablePokemonServerFault(error: unknown) {
  return error instanceof PokemonTcgRequestError && error.status >= 500;
}

function canTrySaferPokemonQuery(error: unknown) {
  if (error instanceof PokemonTcgRequestError) {
    return error.status === 400 || error.status === 404 || error.status === 500;
  }
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "TimeoutError");
}

export async function getPokemonCard({
  id,
  apiKey = process.env.POKEMON_TCG_API_KEY,
  fetcher = fetch,
  timeoutMs = 8000,
  signal,
}: GetPokemonCardOptions): Promise<PokemonTcgCard> {
  const normalizedId = id.trim();
  if (!normalizedId) throw new Error("Pokemon card id is required.");

  const linked = createLinkedAbortSignal(signal, timeoutMs);
  const response = await fetcher(
    new URL(`${POKEMON_TCG_API_BASE_URL}/cards/${encodeURIComponent(normalizedId)}`),
    {
      headers: apiKey ? { "X-Api-Key": apiKey } : undefined,
      next: { revalidate: 3600 },
      signal: linked.signal,
    } as RequestInit & { next: { revalidate: number } },
  ).finally(linked.cleanup);

  if (!response.ok) {
    throw new Error(`Pokemon TCG API card lookup failed with ${response.status}.`);
  }

  return pokemonTcgCardResponseSchema.parse(await response.json()).data;
}

export async function browsePokemonCards({
  query = "",
  page = 1,
  pageSize = 24,
  apiKey = process.env.POKEMON_TCG_API_KEY,
  fetcher = fetch,
  timeoutMs = 8000,
  signal,
}: BrowsePokemonCardsOptions): Promise<PokemonTcgSearchResult> {
  const normalizedQuery = query.trim();
  const apiQuery = buildPokemonCardQuery(normalizedQuery);
  return fetchPokemonCards({
    query: normalizedQuery,
    apiQuery,
    page,
    pageSize,
    apiKey,
    fetcher,
    timeoutMs,
    signal,
  });
}

async function fetchPokemonCards({
  query,
  apiQuery,
  page,
  pageSize,
  apiKey,
  fetcher,
  timeoutMs,
  signal,
}: {
  query: string;
  apiQuery: string;
  page: number;
  pageSize: number;
  apiKey?: string;
  fetcher: typeof fetch;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<PokemonTcgSearchResult> {
  const url = new URL(`${POKEMON_TCG_API_BASE_URL}/cards`);
  if (apiQuery) url.searchParams.set("q", apiQuery);
  url.searchParams.set("page", String(Math.max(page, 1)));
  url.searchParams.set("pageSize", String(Math.min(Math.max(pageSize, 1), 250)));
  url.searchParams.set("orderBy", "-set.releaseDate,name");
  url.searchParams.set("select", "id,name,subtypes,number,rarity,set,images");

  const linked = createLinkedAbortSignal(signal, timeoutMs);

  const response = await fetcher(url, {
    headers: apiKey ? { "X-Api-Key": apiKey } : undefined,
    next: { revalidate: 3600 },
    signal: linked.signal,
  } as RequestInit & { next: { revalidate: number } }).finally(linked.cleanup);

  if (!response.ok) {
    throw new PokemonTcgRequestError(response.status);
  }

  const json = pokemonTcgSearchResponseSchema.parse(await response.json());

  const cards = !query || query.includes(":")
    ? json.data
    : json.data.filter((card) => classifyPokemonName(query, card.name) !== "unrelated");
  return {
    source: "pokemon-tcg-api",
    query,
    apiQuery,
    cards,
    count: cards.length,
    totalCount: json.totalCount ?? null,
  };
}

function buildPokemonCardQuery(query: string) {
  if (!query) return "";
  if (query.includes(":")) return query;
  if (/\s(?:&|and)\s/i.test(query)) {
    return wildcardAllTokens(nameTokens(query).filter((token) => !new Set(["ex", "gx", "v"]).has(token)));
  }
  return `name:"${escapeLucenePhrase(query)}"`;
}

// Significant search tokens from a plain name: lowercase, split on
// non-alphanumerics, drop 1-char noise. Variant tokens (vmax/vstar/ex) are kept
// because they disambiguate rather than dilute. Tokens are [a-z0-9] only, so no
// Lucene escaping is needed.
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

// Suffix-tolerant AND of every token: `name:rayquaza* name:vmax*`. Matches loose
// input ("rayquaza vmax" → "Rayquaza VMAX") and trailing words.
function wildcardAllTokens(tokens: string[]): string {
  if (tokens.length === 0) return "";
  return tokens.map((token) => `name:${token}*`).join(" ");
}

// Loosest tier: substring on the single longest token only, e.g. `name:*charizard*`.
// Longest-token keeps this from matching half the catalog on short tokens.
function looseSingleToken(tokens: string[]): string {
  const longest = tokens.reduce((best, token) => (token.length > best.length ? token : best), "");
  return longest ? `name:*${longest}*` : "";
}

function buildPokemonCardQueries({
  name,
  cardNumber,
  setHint,
  relaxed,
}: {
  name: string;
  cardNumber: string;
  setHint: string;
  relaxed: boolean;
}) {
  const number = parseCollectorNumber(cardNumber);
  const setFilter = buildSetFilter(setHint);
  const nameFilter = buildPokemonCardQuery(name);
  const queries: string[] = [];

  if (number.number) {
    const numberFilters = [
      collectorNumberFilter(number.number),
      number.printedTotal ? `set.printedTotal:${number.printedTotal}` : "",
    ].filter(Boolean);

    if (setFilter) queries.push([...numberFilters, setFilter].join(" "));
    queries.push([
      ...numberFilters,
      !number.printedTotal && !setFilter ? nameFilter : "",
    ].filter(Boolean).join(" "));
    // A prefixed collector code ("XY121", "SWSH050", "SM211") names exactly one
    // card in the whole catalog, so ANDing the buyer's spelling of the name onto
    // it can only lose that card and never sharpen the result: "Charizard EX
    // XY121" asked for `number:XY121 name:"Charizard EX"` and matched nothing,
    // because the catalog writes it "Charizard-EX". Dropping the name here — and
    // only here — recovers the exact print before the ladder loosens to a
    // name-only tier that answers with whatever released most recently. A bare
    // number is not unique ("4" exists in nearly every set), so it keeps the set
    // total that pins it to one release.
    if (!number.printedTotal && /^[A-Za-z]/.test(number.number)) {
      queries.push(numberFilters.join(" "));
    }
    queries.push(nameFilter);
  } else {
    if (setFilter) queries.push(`${nameFilter} ${setFilter}`);
    queries.push(nameFilter);
  }

  // Relaxed fallbacks for loose/partial/typo-ish input. These only run when the
  // precise tiers above return nothing (searchPokemonCards stops at the first
  // non-empty result), so exact matches stay fast and precise. Skipped for raw
  // `field:value` queries the caller passed through verbatim.
  if (relaxed && !name.includes(":")) {
    const tokens = nameTokens(name);
    const wildcard = wildcardAllTokens(tokens);
    const loose = looseSingleToken(tokens);
    if (wildcard) queries.push(wildcard);
    if (loose) queries.push(loose);
  }

  return Array.from(new Set(queries.filter(Boolean)));
}

function buildSetFilter(setHint: string) {
  const normalized = setHint.trim();
  if (!normalized) return "";

  const parts = normalized.split("/").map((part) => part.trim()).filter(Boolean);
  const likelyCode = parts.at(-1) ?? normalized;

  if (
    /^[a-z]{1,10}\d+[a-z]*$/i.test(likelyCode)
    || /^(?:base|bw|xy|sm|swsh|sv)p$/i.test(likelyCode)
  ) {
    return `set.id:${likelyCode.toLowerCase()}`;
  }
  if (/^[a-z]{2,4}$/i.test(likelyCode)) {
    return `set.ptcgoCode:${likelyCode.toUpperCase()}`;
  }

  const phrase = escapeLucenePhrase(parts[0] ?? normalized);
  return `(set.name:"${phrase}" OR set.series:"${phrase}" OR subtypes:"${phrase}")`;
}

/**
 * A `number:` filter that matches the card whichever zero-padding convention the
 * catalog happened to store.
 *
 * Lucene matches the term exactly and the conventions genuinely disagree: a
 * Scarlet & Violet promo is printed "SVP EN 052" and published by TCGplayer as
 * "052", but pokemontcg.io stores it as "52" — measured 2026-08-19,
 * `number:052 set.id:svp` returned nothing while `number:52 set.id:svp` returned
 * the card. The legacy promos invert it ("SWSH050" in the catalog, "SWSH50" as
 * sellers write it). A single spelling therefore returned zero rows and the
 * ladder fell through to a loose name tier, which confirms an unrelated print
 * instead of reporting that the number was not found.
 *
 * Only the trailing digit run is re-padded, so a fraction's denominator and any
 * letter prefix are left exactly as the caller supplied them.
 */
function collectorNumberFilter(value: string) {
  const parts = value.match(/^(.*?)(\d+)$/);
  if (!parts) return `number:${value}`;
  const [, prefix, digits] = parts;
  const stripped = digits.replace(/^0+(?=\d)/, "");
  const spellings = new Set([
    value,
    `${prefix}${stripped}`,
    `${prefix}${stripped.padStart(2, "0")}`,
    `${prefix}${stripped.padStart(3, "0")}`,
  ]);
  const filters = [...spellings].map((spelling) => `number:${spelling}`);
  return filters.length === 1 ? filters[0] : `(${filters.join(" OR ")})`;
}

function parseCollectorNumber(value: string) {
  const [rawNumber = "", rawTotal = ""] = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/^#/, "")
    .split("/", 2);
  const candidateNumber = rawNumber.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const number = /\d/.test(candidateNumber) ? candidateNumber : "";
  const printedTotal = rawTotal.match(/\d+$/)?.[0]?.replace(/^0+(?=\d)/, "") ?? "";
  return { number, printedTotal };
}

function escapeLucenePhrase(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
