import { z } from "zod";
import { getJsonCache, setJsonCache } from "@/lib/ops/cache";
import { enforceRateLimit } from "@/lib/ops/rate-limit";
import { isRedisConfigured } from "@/lib/ops/redis";
import { listingSeedSchema, type ListingSeed } from "@/lib/schemas";
import { titleConditionFloor } from "@/lib/comparison/ranking";

export const APIFY_MAX_RESULTS = 40;
export const APIFY_MAX_CHARGE_USD = 0.15;
export const APIFY_TIMEOUT_MS = 30_000;
const cacheSchema = z.array(listingSeedSchema).max(APIFY_MAX_RESULTS);
const flights = new Map<string, Promise<ListingSeed[]>>();

type Search = {
  provider: "whatnot" | "mercari";
  actor: string;
  token: string;
  key: string;
  input: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  parse: (payload: unknown, now: Date) => ListingSeed[];
};

// Successful sanitized facts retain their acquisition time. Errors never become
// cached empty inventory. Global daily limits fail closed in production if the
// shared counter is unavailable; per-process counters are only for local tests.
export async function runApifySearch(search: Search): Promise<ListingSeed[]> {
  const key = `${search.provider}:v1:${search.key}`;
  const previous = flights.get(key);
  if (previous) return previous;
  const pending = load(search, key).finally(() => flights.delete(key));
  flights.set(key, pending);
  return pending;
}

async function load(search: Search, key: string): Promise<ListingSeed[]> {
  const cached = await getJsonCache("marketplace-provider", key, { validate: (value) => {
    const parsed = cacheSchema.safeParse(value);
    if (!parsed.success) return null;
    try {
      for (const seed of parsed.data) observationTime(seed.observedAt, new Date());
      return parsed.data;
    } catch { return null; }
  } });
  if (cached) return cached;
  if (process.env.NODE_ENV === "production" && !isRedisConfigured()) {
    throw new Error("Paid source paused: shared daily budget counter is not configured.");
  }
  const limit = await enforceRateLimit(`apify:${search.provider}`, { max: 25, windowMs: 24 * 60 * 60 * 1000 });
  if (process.env.NODE_ENV === "production" && limit.backend !== "redis") {
    throw new Error("Paid source paused: shared daily budget counter is unavailable.");
  }
  if (!limit.allowed) throw new Error("Daily source budget reached; try again after the UTC reset.");
  search.signal?.throwIfAborted();
  const url = new URL(`https://api.apify.com/v2/acts/${search.actor}/run-sync-get-dataset-items`);
  url.search = new URLSearchParams({ timeout: "25", maxItems: String(APIFY_MAX_RESULTS), maxTotalChargeUsd: String(APIFY_MAX_CHARGE_USD), restartOnError: "false", clean: "true" }).toString();
  let response: Response;
  try {
    response = await search.fetcher(url, {
      method: "POST", headers: { authorization: `Bearer ${search.token}`, "content-type": "application/json" },
      body: JSON.stringify(search.input), cache: "no-store", redirect: "error",
      signal: search.signal ? AbortSignal.any([search.signal, AbortSignal.timeout(APIFY_TIMEOUT_MS)]) : AbortSignal.timeout(APIFY_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Provider request failed or timed out; no inventory was inferred.");
  }
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}; no inventory was inferred.`);
  // Bound the response independently of actor-side limits. Do not retain raw
  // seller profiles or description payloads in caches, logs, or shared reports.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Provider returned an empty response body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw new Error("Provider response exceeded the size limit."); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const text = Buffer.concat(chunks).toString("utf8");
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { throw new Error("Provider returned invalid JSON."); }
  const seeds = cacheSchema.parse(search.parse(payload, new Date()));
  await setJsonCache("marketplace-provider", key, seeds, { ttlSeconds: seeds.length ? 900 : 60 });
  return seeds;
}

export function providerRows(payload: unknown): unknown[] {
  const parsed = z.array(z.unknown()).max(1000).safeParse(payload);
  if (!parsed.success) throw new Error("Provider dataset format changed; no inventory was inferred.");
  return parsed.data.slice(0, APIFY_MAX_RESULTS);
}

export function observationTime(value: unknown, now: Date): string {
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : now;
  if (!Number.isFinite(date.getTime()) || date.getTime() > now.getTime() + 60_000 || now.getTime() - date.getTime() > 900_000) {
    throw new Error("Provider observation time is invalid or stale.");
  }
  return date.toISOString();
}

export function httpsImageUrls(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => {
    if (!value) return false;
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port
      && ["images.whatnot.com", "u-mercari-images.mercdn.net", "static.mercdn.net"].includes(url.hostname); } catch { return false; }
  }))].slice(0, 24);
}

export function sellerCardCondition(text: string) {
  // titleConditionFloor only detects worse-than-NM claims; it deliberately does
  // not infer NM. Read an affirmative seller statement separately, after ranges.
  return titleConditionFloor(text) ?? (/\b(?:not|non|almost)\s*[- ]?\s*(?:near[ -]?mint|nm|mint)\b/i.test(text)
    ? "Unknown" : /\b(?:near[ -]?mint|nm|mint)\b/i.test(text) ? "Near Mint" : "Unknown");
}
