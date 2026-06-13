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
      releaseDate: z.string().optional(),
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
  pageSize?: number;
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
  pageSize = 8,
  apiKey = process.env.POKEMON_TCG_API_KEY,
  fetcher = fetch,
  timeoutMs = 8000,
}: SearchPokemonCardsOptions): Promise<PokemonTcgSearchResult> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) throw new Error("Pokemon card search query must be at least 2 characters.");

  return browsePokemonCards({
    query: normalizedQuery,
    page: 1,
    pageSize: Math.min(Math.max(pageSize, 1), 20),
    apiKey,
    fetcher,
    timeoutMs,
  });
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
    query: normalizedQuery,
    apiQuery,
    cards: json.data,
    count: json.count ?? json.data.length,
    totalCount: json.totalCount ?? null,
  };
}

function buildPokemonCardQuery(query: string) {
  if (!query) return "";
  if (query.includes(":")) return query;
  return `name:"${query.replaceAll('"', '\\"')}"`;
}
