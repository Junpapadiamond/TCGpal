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

// The catalog's first (cold) request intermittently fails or times out, which
// used to surface "card catalog temporarily unavailable" on a user's very first
// search. Retry transient failures (network errors, 429, 5xx) with exponential
// backoff before giving up; 4xx responses are returned immediately.
const CATALOG_RETRY_DELAYS_MS = [400, 900];

async function catalogFetchWithRetry(
  url: URL,
  init: RequestInit & { next: { revalidate: number } },
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= CATALOG_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, CATALOG_RETRY_DELAYS_MS[attempt - 1]));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, { ...init, signal: controller.signal });
      if (response.ok || (response.status < 500 && response.status !== 429)) {
        return response;
      }
      lastError = new Error(`Pokemon TCG API request failed with ${response.status}.`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Pokemon TCG API request failed.");
}

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

  const response = await catalogFetchWithRetry(
    new URL(`${POKEMON_TCG_API_BASE_URL}/cards/${encodeURIComponent(normalizedId)}`),
    {
      headers: apiKey ? { "X-Api-Key": apiKey } : undefined,
      next: { revalidate: 3600 },
    } as RequestInit & { next: { revalidate: number } },
    fetcher,
    timeoutMs,
  );

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

  const response = await catalogFetchWithRetry(url, {
    headers: apiKey ? { "X-Api-Key": apiKey } : undefined,
    next: { revalidate: 3600 },
  } as RequestInit & { next: { revalidate: number } }, fetcher, timeoutMs);

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
