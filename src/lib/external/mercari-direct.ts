import { z } from "zod";
import { listingSeedSchema, type CardIdentityCandidate, type ListingSeed } from "@/lib/schemas";
import type { PlatformSearchInput } from "@/lib/comparison/platforms";
import { assessTitleMatch } from "./ebay";
import { isGradedListing } from "@/lib/comparison/graded-listing";
import { titleConditionFloor } from "@/lib/comparison/ranking";
import { getJsonCache, setJsonCache } from "@/lib/ops/cache";
import { enforceRateLimit } from "@/lib/ops/rate-limit";

const itemUrl = z.string().regex(/^https:\/\/www\.mercari\.com\/us\/item\/m\d+\/$/);
const fact = z.object({ value: z.unknown(), evidence: z.string().max(2000).nullable(), sourceUrl: itemUrl,
  observedAt: z.iso.datetime(), acquisitionMethod: z.literal("browser-dom"), confidence: z.enum(["high", "medium", "low"]) });
const observation = z.object({ label: z.literal("mercari-page"), status: z.enum(["observed", "blocked", "unavailable"]),
  sourceUrl: itemUrl, observedAt: z.iso.datetime(), conflicts: z.array(z.string()).max(20), fields: z.record(z.string(), fact) });
const fieldsSchema = z.object({ title: z.string().min(1).max(2000), itemPrice: z.number().positive().nullable(), currency: z.string().nullable(),
  shippingCost: z.number().nonnegative().nullable(), buyerFee: z.number().nonnegative().nullable(),
  conditionClaim: z.string().max(100).nullable(), description: z.string().max(1500).nullable(), availability: z.enum(["active", "sold", "unknown"]),
  imageUrls: z.array(z.string()).max(12) });
const seedsSchema = z.array(listingSeedSchema).max(3);
const flights = new Map<string, Promise<ListingSeed[]>>();
const TTL_MS = 5 * 60 * 1000;

export function isMercariDirectEnabled() {
  return process.env.MERCARI_DIRECT_ENABLED !== "0"
    && (process.env.VERCEL === "1" || process.env.MERCARI_DIRECT_ENABLED === "1");
}

export function parseMercariObservations(payload: unknown, card: CardIdentityCandidate, now = new Date()): ListingSeed[] {
  const parsed = z.array(observation).max(3).safeParse(payload);
  if (!parsed.success) throw new Error("Mercari page schema changed; no inventory was inferred.");
  const seeds = new Map<string, ListingSeed>();
  for (const row of parsed.data) {
    if (now.getTime() - Date.parse(row.observedAt) > TTL_MS || Date.parse(row.observedAt) > now.getTime() + 60_000) {
      throw new Error("Mercari observation is stale or has an invalid time.");
    }
    if (row.status !== "observed" || row.conflicts.length) continue;
    for (const field of Object.values(row.fields)) {
      if (field.sourceUrl !== row.sourceUrl || field.observedAt !== row.observedAt) throw new Error("Mercari field provenance conflicts with its page.");
    }
    const fields = fieldsSchema.safeParse(Object.fromEntries(Object.entries(row.fields).map(([key, field]) => [key, field.value])));
    if (!fields.success) throw new Error("Mercari required fields changed; no inventory was inferred.");
    const item = fields.data;
    if (item.availability !== "active" || item.currency !== "USD" || !item.itemPrice) continue;
    const price = Math.round(item.itemPrice * 100) / 100;
    if (price <= 0) continue;
    const match = assessTitleMatch(item.title, card);
    const text = `${item.title} ${item.description ?? ""}`;
    // Only card-specific statements, never generic merchandise condition. Use
    // description for conservative exclusions; retain no raw description/PII.
    const condition = titleConditionFloor(text) ?? (/\b(?:not|non|almost)\s*[- ]?\s*(?:near[ -]?mint|nm|mint)\b/i.test(text)
      ? "Unknown" : /\b(?:near[ -]?mint|nm)\b/i.test(item.title) ? "Near Mint" : "Unknown");
    const aspects = [ /\b(?:Japanese|Japan|JPN)\b|日本語/i.test(text) ? "Japanese" : "",
      /\b(?:Korean|Korea)\b|한국/i.test(text) ? "Korean" : "",
      /\b(?:Chinese|China)\b|中文/i.test(text) ? "Chinese" : "",
      /\b(?:proxy|replica|metal|custom|sticker|digital)\b/i.exec(text)?.[0] ?? "" ].filter(Boolean).join(" ");
    const images = [...new Set(item.imageUrls.filter((value) => {
      try { const image = new URL(value); return image.protocol === "https:" && !image.username && !image.password && !image.port
        && image.hostname === "u-mercari-images.mercdn.net"; } catch { return false; }
    }))];
    const id = new URL(row.sourceUrl).pathname.split("/")[3];
    seeds.set(id, listingSeedSchema.parse({ id: `mercari-${id}`, marketplace: "Mercari", url: row.sourceUrl, title: item.title,
      cardId: card.id, matchConfidence: match.confidence, matchReasons: [...match.reasons, "Public Mercari detail observed via our browser adapter."],
      matchAspectText: aspects, active: true, raw: !isGradedListing(text), currency: "USD", price, shipping: item.shippingCost, buyerFee: item.buyerFee,
      claimedCondition: condition, imageUrl: images[0] ?? null, imageUrls: images,
      seller: { feedbackPercentage: null, feedbackCount: null, returnsAccepted: null, topRated: null, buyerProtection: null, subRatings: null },
      evidence: { photoCount: images.length, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: false,
        substantiveConditionNotes: false, missing: ["Seller history is unverified.", "US listing-page shipping and fees; confirm destination-specific charges at checkout.",
          ...(item.shippingCost === null ? ["Shipping is unknown."] : []), ...(item.buyerFee === null ? ["Buyer Protection fee is unknown."] : [])] },
      observedAt: row.observedAt, demo: false, userSupplied: false }));
  }
  return [...seeds.values()];
}

type Collect = (query: string, fetcher: typeof fetch, signal?: AbortSignal) => Promise<unknown[]>;
export async function searchMercariDirect(input: PlatformSearchInput, dependencies: { collect?: Collect } = {}): Promise<ListingSeed[]> {
  if (!isMercariDirectEnabled()) throw new Error("Mercari direct adapter is disabled.");
  const query = `${input.card.name} ${input.card.cardNumber}`.trim().slice(0, 200);
  const key = JSON.stringify(["v1", input.card.id, input.card.language, query]);
  const previous = flights.get(key);
  if (previous) return previous;
  const pending = (async () => {
    const cached = await getJsonCache("mercari-direct", key, { validate: (value) => {
      const rows = seedsSchema.safeParse(value);
      return rows.success && rows.data.every(row => { const age = Date.now() - Date.parse(row.observedAt); return Number.isFinite(age) && age >= -60_000 && age <= TTL_MS; }) ? rows.data : null;
    } });
    if (cached) return cached;
    const limit = await enforceRateLimit("mercari-direct:global", { max: 60, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) {
      throw new Error("Mercari request limit reached; try again later.");
    }
    const collect = dependencies.collect ?? (await import("./mercari-browser")).collectMercariPages;
    const rows = parseMercariObservations(await collect(query, input.fetcher, input.signal), input.card);
    await setJsonCache("mercari-direct", key, rows, { ttlSeconds: rows.length ? 300 : 45 });
    return rows;
  })().finally(() => flights.delete(key));
  flights.set(key, pending);
  return pending;
}
