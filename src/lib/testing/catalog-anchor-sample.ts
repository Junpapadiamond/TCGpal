import { z } from "zod";
import { formatCollectorNumber } from "@/lib/ai/listing-compare";

// The card sample the market-anchor coverage check measures.
//
// One card per catalogued set, drawn from the live catalog rather than a fixed
// list, because the failure this check exists to catch arrives with a *new* set:
// a release whose TCGplayer group name the crosswalk has never seen. A hardcoded
// basket would keep passing while the newest set silently lost its anchor.
//
// Numbers go through `formatCollectorNumber` deliberately — the crosswalk is fed
// the formatted number, so a sample that used the catalog's raw `number` would
// measure a card the product never asks about.
const POKEMON_TCG_API = "https://api.pokemontcg.io/v2";

const setSchema = z.object({
  id: z.string(),
  name: z.string(),
  total: z.number().optional(),
  printedTotal: z.number().optional(),
  ptcgoCode: z.string().optional(),
});

const cardSchema = z.object({
  id: z.string(),
  name: z.string(),
  number: z.string().optional(),
  set: setSchema.optional(),
});

export type AnchorSampleCard = {
  id: string;
  name: string;
  setName: string;
  setCode: string;
  cardNumber: string;
};

// pokemontcg.io answers a large share of requests with a 5xx — 28 of 42 measured
// on 2026-08-21 — and the failures are bursty rather than independent, so a
// linear 400ms backoff simply spends every attempt inside the same outage. Back
// off exponentially to about a minute total: this is a daily audit, not a
// request path, and a false coverage regression costs far more than the seconds.
const MAX_ATTEMPT_DELAY_MS = 15_000;

async function getJson(url: string, apiKey: string | undefined, attempts = 8): Promise<unknown> {
  let lastError: unknown = new Error(`${url} was never attempted`);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: apiKey ? { "X-Api-Key": apiKey } : undefined });
      if (response.ok) return await response.json();
      if (response.status < 500 && response.status !== 429) throw new Error(`${url} failed with ${response.status}`);
      lastError = new Error(`${url} failed with ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), MAX_ATTEMPT_DELAY_MS)));
    }
  }
  throw lastError;
}

export async function fetchCatalogAnchorSample(options: { apiKey?: string; perSet?: number } = {}) {
  const apiKey = options.apiKey ?? process.env.POKEMON_TCG_API_KEY;
  const perSet = options.perSet ?? 1;
  const setsResponse = await getJson(`${POKEMON_TCG_API}/sets?pageSize=250`, apiKey);
  const sets = z.object({ data: z.array(setSchema) }).parse(setsResponse).data;

  const cards: AnchorSampleCard[] = [];
  const unreadableSets: string[] = [];
  // Sequential on purpose: parallel requests measurably raise this API's 5xx
  // rate, which would show up as a coverage regression that isn't one.
  for (const set of sets) {
    try {
      const response = await getJson(
        `${POKEMON_TCG_API}/cards?q=set.id:${encodeURIComponent(set.id)}&pageSize=${perSet}&select=id,name,number,set`,
        apiKey,
      );
      for (const card of z.object({ data: z.array(cardSchema) }).parse(response).data) {
        cards.push({
          id: card.id,
          name: card.name,
          setName: card.set?.name ?? set.name,
          setCode: (card.set?.id ?? set.id).toUpperCase(),
          cardNumber: formatCollectorNumber(card.number ?? "", card.set ?? set),
        });
      }
    } catch {
      unreadableSets.push(set.id);
    }
  }

  return { sets, cards, unreadableSets };
}
