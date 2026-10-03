import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getJsonCache, setJsonCache } from "@/lib/ops/cache";
import { assessTitleMatch } from "./ebay";
import { isGradedListing } from "@/lib/comparison/graded-listing";
import { sellerCardCondition } from "./apify";
import { reserveSoldgraphSearch } from "./soldgraph-budget";
import { listingSeedSchema, type CardIdentityCandidate, type ListingSeed } from "@/lib/schemas";

export type SoldgraphMarketplace = "mercari" | "whatnot";
const ORIGIN = "https://api.soldgraph.com";
const MAX_RESULTS = 3;
const MAX_BYTES = 1_000_000;
const DEADLINE_MS = 20_000;
const MAX_AGE_MS = 15 * 60 * 1000;
const IMAGE_HOSTS: Record<SoldgraphMarketplace, readonly string[]> = {
  whatnot: ["images.whatnot.com"],
  mercari: ["u-mercari-images.mercdn.net"],
};
const flights = new Map<string, Promise<ListingSeed[]>>();
const cacheSchema = z.object({ observedAt: z.iso.datetime({ offset: true }), seeds: z.array(listingSeedSchema).max(MAX_RESULTS) });
const claim = z.string().max(200).nullable();
const rowSchema = z.object({
  id: z.string().min(1).max(200), title: z.string().min(1).max(2000).nullable(), link: z.string().max(1000),
  condition: claim, displayed_price: z.object({ amount: z.number().nonnegative(), currency: z.literal("USD") }).nullable(),
  // The documented nullable primary image is a search preview, not a gallery
  // or independently checked condition photography (OpenAPI schema v2).
  image: z.string().max(4096).nullable(),
  quantity: z.number().int().nonnegative().optional(), grading_service: claim.optional(), grade: claim.optional(),
  card_set: claim.optional(), card_number: claim.optional(), language: claim.optional(),
  // These fields are not currently supplied. If a future response contradicts
  // the active Buy Now endpoint, reject that row instead of erasing the claim.
  status: z.string().optional(), listing_status: z.string().optional(), transaction_type: z.string().optional(),
});
const jobSchema = z.object({
  request_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), status: z.enum(["pending", "complete", "failed"]),
  credits: z.number().int().min(0).max(1), cached: z.boolean(), poll_url: z.string().max(200).optional(),
  result: z.unknown().optional(), error: z.object({ code: z.string().max(100) }).optional(),
});
type Job = z.infer<typeof jobSchema>;
const schemaError = () => new Error("Soldgraph schema changed; no inventory was inferred.");

export function hasSoldgraphCredentials() {
  return process.env.SOLDGRAPH_ENABLED === "1" && /^sg_[!-~]{1,508}$/.test(process.env.SOLDGRAPH_API_KEY?.trim() ?? "");
}

function freshTimestamp(value: string, now: Date) {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time > now.getTime() + 60_000 || now.getTime() - time >= MAX_AGE_MS) {
    throw new Error("Soldgraph observation is invalid or stale.");
  }
  return new Date(time).toISOString();
}

function listingPreview(value: string | null, marketplace: SoldgraphMarketplace) {
  if (!value) return null;
  try {
    const image = new URL(value);
    if (image.protocol !== "https:" || image.username || image.password || image.port || image.hash
      || !IMAGE_HOSTS[marketplace].includes(image.hostname)) return null;
    // Preserve the provider's signed CDN query without constructing another
    // URL or fetching a marketplace page. The client may display this preview.
    return image.href;
  } catch {
    return null;
  }
}

function parsePage(payload: unknown, marketplace: SoldgraphMarketplace, query: string, now: Date) {
  const parsed = z.object({
    provider: z.literal(marketplace), country: z.literal("us"), query: z.string().max(200), page: z.literal(1),
    count: z.number().int().min(0).max(MAX_RESULTS), collected_at: z.iso.datetime({ offset: true }), schema_version: z.literal(2),
    completeness: z.literal("provider_page_only"), data: z.array(rowSchema).max(MAX_RESULTS),
  }).safeParse(payload);
  if (!parsed.success) throw schemaError();
  const page = parsed.data;
  if (page.query.trim().replace(/\s+/g, " ") !== query || page.count !== page.data.length
    || new Set(page.data.map(row => row.id)).size !== page.data.length) throw schemaError();
  freshTimestamp(page.collected_at, now);
  for (const row of page.data) {
    const idPattern = marketplace === "mercari" ? /^m\d+$/ : /^[A-Za-z0-9_=-]+$/;
    const canonical = marketplace === "mercari" ? `https://www.mercari.com/us/item/${row.id}/` : `https://www.whatnot.com/listing/${row.id}`;
    if (!idPattern.test(row.id) || row.link !== canonical || (marketplace === "whatnot" && row.quantity === undefined)) throw schemaError();
  }
  return page;
}

export function parseSoldgraphListings(payload: unknown, marketplace: SoldgraphMarketplace, card: CardIdentityCandidate, query: string, now: Date): ListingSeed[] {
  const page = parsePage(payload, marketplace, query, now);
  const seeds: ListingSeed[] = [];
  for (const row of page.data) {
    const price = row.displayed_price?.amount;
    if (!row.title || price === undefined || price <= 0 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001
      || isGradedListing(row.title) || /^graded$/i.test(row.condition ?? "")
      || (row.status && !/^(?:active|on_sale|published)$/i.test(row.status))
      || (row.listing_status && !/^(?:active|on_sale|published)$/i.test(row.listing_status))
      || (row.transaction_type && !/^(?:buy_now|buy_it_now)$/i.test(row.transaction_type))) continue;
    const attrs = marketplace === "whatnot" ? [row.condition, row.card_set, row.card_number, row.language].filter(Boolean).join(" · ") : "";
    if (marketplace === "whatnot" && (row.quantity === 0
      || [row.grading_service, row.grade].some(value => value != null && !/^(?:raw|ungraded|none|n\/a)$/i.test(value)))) continue;
    const match = assessTitleMatch(`${row.title} ${attrs}`, card);
    const imageUrl = listingPreview(row.image, marketplace);
    seeds.push({
      id: `${marketplace}-${row.id}`, marketplace: marketplace === "mercari" ? "Mercari" : "Whatnot", url: row.link,
      title: row.title, cardId: card.id, matchConfidence: match.confidence, matchReasons: match.reasons,
      matchAspectText: attrs, listingLanguage: marketplace === "whatnot" ? row.language ?? null : null,
      active: true, raw: true, currency: "USD", price, shipping: null, buyerFee: null,
      // Mercari's generic Like New is not a trading-card Near Mint assertion.
      claimedCondition: sellerCardCondition(`${row.title} ${marketplace === "whatnot" ? row.condition ?? "" : ""}`),
      imageUrl, imageKind: imageUrl ? "listing_preview" : "unknown", imageUrls: [],
      seller: { feedbackPercentage: null, feedbackCount: null, returnsAccepted: null, topRated: null, buyerProtection: null, subRatings: null },
      evidence: { photoCount: 0, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false,
        identityExplicit: false, substantiveConditionNotes: false,
        missing: ["Provider-reported asking price and availability; confirm the live listing.", "Shipping and buyer fees require checkout confirmation.", "Seller record and condition photos are unverified."] },
      observedAt: freshTimestamp(page.collected_at, now), demo: false, userSupplied: false,
    });
  }
  return z.array(listingSeedSchema).max(MAX_RESULTS).parse(seeds);
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("Soldgraph request cancelled."));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Soldgraph request cancelled."));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("Soldgraph response exceeded the size limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw schemaError();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    while (true) {
      const chunk = await abortable(reader.read(), signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("Soldgraph response exceeded the size limit.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    try { return JSON.parse(text + decoder.decode()); } catch { throw schemaError(); }
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!signal.aborted) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function searchSoldgraphListings(marketplace: SoldgraphMarketplace, card: CardIdentityCandidate, fetcher: typeof fetch, query?: string, signal?: AbortSignal): Promise<ListingSeed[]> {
  if (!hasSoldgraphCredentials()) throw new Error("Soldgraph is not enabled with a valid server credential.");
  const search = (query ?? `${card.name} ${card.cardNumber}`).trim().replace(/\s+/g, " ").slice(0, 200);
  if (!search) throw new Error("Soldgraph search query is required.");
  // v1 deliberately discarded previews; do not reuse those image-less seeds.
  const key = JSON.stringify(["v2", marketplace, card.id, card.language, search]);
  const previous = flights.get(key);
  if (previous) return previous;
  const flight = load(marketplace, card, fetcher, search, key, signal).finally(() => flights.delete(key));
  flights.set(key, flight);
  return flight;
}

async function load(marketplace: SoldgraphMarketplace, card: CardIdentityCandidate, fetcher: typeof fetch, search: string, key: string, signal?: AbortSignal): Promise<ListingSeed[]> {
  const cached = await getJsonCache("soldgraph-listings", key, { validate: value => {
    const parsed = cacheSchema.safeParse(value);
    if (!parsed.success) return null;
    try { freshTimestamp(parsed.data.observedAt, new Date()); return parsed.data; } catch { return null; }
  } });
  if (cached) return cached.seeds;
  signal?.throwIfAborted();
  await reserveSoldgraphSearch();
  signal?.throwIfAborted();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const headers = { Authorization: `Bearer ${process.env.SOLDGRAPH_API_KEY!.trim()}`, Accept: "application/json", "Idempotency-Key": randomUUID() };
  const call = async (url: URL): Promise<{ job: Job; retryAfter: string | null }> => {
    let response: Response;
    try { response = await abortable(fetcher(url, { method: "GET", headers, redirect: "error", cache: "no-store", signal: controller.signal }), controller.signal); }
    catch { throw new Error("Soldgraph provider request failed."); }
    if (![200, 202].includes(response.status)) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error(`Soldgraph returned HTTP ${response.status}.`);
    }
    const parsed = jobSchema.safeParse(await readJson(response, controller.signal));
    if (!parsed.success) throw schemaError();
    const job = parsed.data;
    if ((job.status === "pending" && (job.poll_url !== `/v1/jobs/${job.request_id}` || job.credits !== 0))
      || (job.status === "failed" && (!job.error || job.credits !== 0)) || (job.status === "complete" && job.credits !== 1)) throw schemaError();
    return { job, retryAfter: response.headers.get("retry-after") };
  };
  try {
    const url = new URL(`/v1/${marketplace}/listings`, ORIGIN);
    url.search = new URLSearchParams({ q: search, count: String(MAX_RESULTS), page: "1", country: "us", sort: "best_match" }).toString();
    const initial = await call(url);
    let job = initial.job;
    const retryAfter = initial.retryAfter;
    const id = job.request_id;
    if (job.status === "pending") {
      const seconds = retryAfter === null ? 2 : /^\d+$/.test(retryAfter) ? Number(retryAfter) : (Date.parse(retryAfter) - Date.now()) / 1000;
      if (!Number.isFinite(seconds) || seconds > 5) throw new Error("Soldgraph search is still pending; no replacement search was started.");
      let pause: ReturnType<typeof setTimeout> | undefined;
      try { await abortable(new Promise<void>(resolve => { pause = setTimeout(resolve, Math.max(2, seconds) * 1000); }), controller.signal); }
      finally { clearTimeout(pause); }
      ({ job } = await call(new URL(`/v1/jobs/${id}?wait=20`, ORIGIN)));
      if (job.request_id !== id) throw schemaError();
    }
    if (job.status !== "complete") throw new Error(`Soldgraph search ${job.status}; no inventory was inferred.`);
    const page = parsePage(job.result, marketplace, search, new Date());
    const seeds = parseSoldgraphListings(page, marketplace, card, search, new Date());
    const observedAt = freshTimestamp(page.collected_at, new Date());
    const ttlSeconds = Math.max(1, Math.floor((Date.parse(observedAt) + MAX_AGE_MS - Date.now()) / 1000));
    await setJsonCache("soldgraph-listings", key, { observedAt, seeds }, { ttlSeconds });
    return seeds;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? "Soldgraph request cancelled." : "Soldgraph request timed out.");
    if (error instanceof Error && error.message.startsWith("Soldgraph ")) throw error;
    throw new Error("Soldgraph provider request failed; no inventory was inferred.");
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", cancel);
  }
}
