import { z } from "zod";

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
  pageSize?: number;
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

type GetPokemonCardOptions = {
  id: string;
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

type BrowsePokemonCardsOptions = {
  query?: string;
  page?: number;
  pageSize?: number;
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

const POKEMON_TCG_API_BASE_URL = "https://api.pokemontcg.io/v2";

export async function searchPokemonCards({
  query,
  cardNumber = "",
  setHint = "",
  pageSize = 8,
  apiKey = process.env.POKEMON_TCG_API_KEY,
  fetcher = fetch,
  timeoutMs = 8000,
}: SearchPokemonCardsOptions): Promise<PokemonTcgSearchResult> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) throw new Error("Pokemon card search query must be at least 2 characters.");

  const apiQueries = buildPokemonCardQueries({
    name: normalizedQuery,
    cardNumber,
    setHint,
  });
  let lastResult: PokemonTcgSearchResult | null = null;

  for (const apiQuery of apiQueries) {
    const result = await fetchPokemonCards({
      query: normalizedQuery,
      apiQuery,
      page: 1,
      pageSize: Math.min(Math.max(pageSize, 1), 50),
      apiKey,
      fetcher,
      timeoutMs,
    });
    lastResult = result;
    if (result.cards.length > 0) return result;
  }

  return lastResult as PokemonTcgSearchResult;
}

export async function getPokemonCard({
  id,
  apiKey = process.env.POKEMON_TCG_API_KEY,
  fetcher = fetch,
  timeoutMs = 8000,
}: GetPokemonCardOptions): Promise<PokemonTcgCard> {
  const normalizedId = id.trim();
  if (!normalizedId) throw new Error("Pokemon card id is required.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetcher(
    new URL(`${POKEMON_TCG_API_BASE_URL}/cards/${encodeURIComponent(normalizedId)}`),
    {
      headers: apiKey ? { "X-Api-Key": apiKey } : undefined,
      next: { revalidate: 3600 },
      signal: controller.signal,
    } as RequestInit & { next: { revalidate: number } },
  ).finally(() => clearTimeout(timeout));

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
}: {
  query: string;
  apiQuery: string;
  page: number;
  pageSize: number;
  apiKey?: string;
  fetcher: typeof fetch;
  timeoutMs: number;
}): Promise<PokemonTcgSearchResult> {
  const url = new URL(`${POKEMON_TCG_API_BASE_URL}/cards`);
  if (apiQuery) url.searchParams.set("q", apiQuery);
  url.searchParams.set("page", String(Math.max(page, 1)));
  url.searchParams.set("pageSize", String(Math.min(Math.max(pageSize, 1), 250)));
  url.searchParams.set("orderBy", "-set.releaseDate,name");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetcher(url, {
    headers: apiKey ? { "X-Api-Key": apiKey } : undefined,
    next: { revalidate: 3600 },
    signal: controller.signal,
  } as RequestInit & { next: { revalidate: number } }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`Pokemon TCG API request failed with ${response.status}.`);
  }

  const json = pokemonTcgSearchResponseSchema.parse(await response.json());

  return {
    source: "pokemon-tcg-api",
    query,
    apiQuery,
    cards: json.data,
    count: json.count ?? json.data.length,
    totalCount: json.totalCount ?? null,
  };
}

function buildPokemonCardQuery(query: string) {
  if (!query) return "";
  if (query.includes(":")) return query;
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
}: {
  name: string;
  cardNumber: string;
  setHint: string;
}) {
  const number = parseCollectorNumber(cardNumber);
  const setFilter = buildSetFilter(setHint);
  const nameFilter = buildPokemonCardQuery(name);
  const queries: string[] = [];

  if (number.number) {
    const numberFilters = [
      `number:${number.number}`,
      number.printedTotal ? `set.printedTotal:${number.printedTotal}` : "",
    ].filter(Boolean);

    if (setFilter) queries.push([...numberFilters, setFilter].join(" "));
    queries.push([
      ...numberFilters,
      !number.printedTotal && !setFilter ? nameFilter : "",
    ].filter(Boolean).join(" "));
    queries.push(nameFilter);
  } else {
    if (setFilter) queries.push(`${nameFilter} ${setFilter}`);
    queries.push(nameFilter);
  }

  // Relaxed fallbacks for loose/partial/typo-ish input. These only run when the
  // precise tiers above return nothing (searchPokemonCards stops at the first
  // non-empty result), so exact matches stay fast and precise. Skipped for raw
  // `field:value` queries the caller passed through verbatim.
  if (!name.includes(":")) {
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
