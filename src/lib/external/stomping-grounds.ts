import { randomUUID } from "node:crypto";
import { z } from "zod";
import { collectorNumberConflict, collectorNumberPattern } from "@/lib/comparison/collector-number";
import { isGradedListing } from "@/lib/comparison/graded-listing";
import type { PlatformSearchInput } from "@/lib/comparison/platforms";
import { getJsonCache, setJsonCache, toCacheKey } from "@/lib/ops/cache";
import { enforceRateLimit } from "@/lib/ops/rate-limit";
import { getRedisClient } from "@/lib/ops/redis";
import { listingSeedSchema, type CardIdentityCandidate, type ConditionClaim, type ListingSeed } from "@/lib/schemas";
import { assessTitleMatch } from "./ebay";

const ENDPOINT = "https://singles.stompinggroundstcg.com/api/ucp/mcp";
const PROFILE = "https://lenstcg.com/ucp-profile.json";
const TTL_MS = 5 * 60 * 1000;
const REQUEST_MS = 8_000;
const MAX_BYTES = 2_000_000;
const MAX_PRODUCTS = 5;
const MAX_VARIANTS = 12;
const flights = new Map<string, Promise<ListingSeed[]>>();
const COOLDOWN_KEY = toCacheKey("stomping-grounds", "cooldown");
const IN_FLIGHT_KEY = toCacheKey("stomping-grounds", "in-flight");
const sharedCooldownError = "Stomping Grounds shared cooldown is unavailable; acquisition is paused for operator review.";
const releaseScript = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;
// Publish the longest deadline and release ownership atomically. A failed write
// leaves the persistent pre-request latch intact, including across instances.
const publishCooldownScript = `
if redis.call('GET', KEYS[2]) ~= ARGV[2] then return -1 end
local raw = redis.call('GET', KEYS[1])
local current = 0
if raw then
  current = tonumber(raw)
  if not current then return -1 end
end
local deadline = math.max(current, tonumber(ARGV[1]))
redis.call('SET', KEYS[1], string.format('%.0f', deadline), 'PXAT', string.format('%.0f', deadline))
redis.call('DEL', KEYS[2])
return deadline
`;
type RequestGuard = { redis: NonNullable<ReturnType<typeof getRedisClient>>; owner: string } | null;

const productUrlSchema = z.string().max(2000).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "singles.stompinggroundstcg.com"
    && !url.username && !url.password && !url.port && !url.search && !url.hash
    && /^\/products\/[a-z0-9][a-z0-9-]*$/.test(url.pathname);
});
const variantSchema = z.object({
  id: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d{1,20}$/),
  title: z.string().min(1).max(300),
  price: z.object({ amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), currency: z.string().max(10) }),
  availability: z.object({ available: z.boolean() }),
  options: z.array(z.object({ name: z.string().max(100), label: z.string().max(300) })).max(10).optional(),
  requires: z.object({ shipping: z.boolean() }),
});
const catalogSchema = z.object({
  ucp: z.object({ status: z.string().optional() }).optional(),
  products: z.array(z.object({
    id: z.string().regex(/^gid:\/\/shopify\/Product\/\d{1,20}$/),
    title: z.string().min(1).max(2000), url: productUrlSchema,
    description: z.object({ html: z.string().max(20_000) }).optional(),
    tags: z.array(z.string().max(300)).max(100).optional(),
    gift_card: z.boolean().optional(),
    variants: z.array(variantSchema).max(100),
  })).max(MAX_PRODUCTS),
});
const envelopeSchema = z.object({
  error: z.unknown().optional(),
  result: z.object({
    isError: z.boolean().optional(), structuredContent: z.unknown().optional(),
    content: z.array(z.object({ type: z.string(), text: z.string().max(MAX_BYTES).optional() })).max(10).optional(),
  }).optional(),
});
const cacheSchema = z.object({ observedAt: z.iso.datetime(), rows: z.array(listingSeedSchema).max(MAX_VARIANTS) });

export function isStompingGroundsEnabled() {
  return process.env.STOMPING_GROUNDS_ENABLED === "1";
}

/** Intended merchant API only. HTML, cart, checkout and product mutations are outside this adapter. */
export function parseStompingGroundsListings(payload: unknown, card: CardIdentityCandidate, now = new Date()): ListingSeed[] {
  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success || !envelope.data.result) throw new Error("Stomping Grounds response schema changed.");
  if (envelope.data.error != null || envelope.data.result.isError) throw new Error("Stomping Grounds returned a catalog error.");
  const result = envelope.data.result;
  let catalog: unknown = result.structuredContent;
  if (catalog === undefined) {
    const text = result.content?.find((part) => part.type === "text")?.text;
    try { catalog = text === undefined ? null : JSON.parse(text); }
    catch { throw new Error("Stomping Grounds catalog schema contains invalid JSON."); }
  }
  const parsed = catalogSchema.safeParse(catalog);
  if (!parsed.success) throw new Error("Stomping Grounds catalog schema changed; no inventory was inferred.");
  if (parsed.data.ucp?.status && parsed.data.ucp.status !== "success") throw new Error("Stomping Grounds catalog reported an error.");
  if (!Number.isFinite(now.getTime())) throw new Error("Stomping Grounds observation time is invalid.");
  const rows = new Map<string, ListingSeed>();
  for (const product of parsed.data.products) {
    if (product.gift_card || graded(product.title)) continue;
    // One Piece product titles often omit the number. Retain only the labeled
    // collector field, never the full merchant description or its HTML/CSS.
    const plain = (product.description?.html ?? "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ");
    const numbers = [...plain.matchAll(/\bCard Number:\s*([A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*)/gi)].map((match) => match[1]);
    const tags = (product.tags ?? []).join(" ").slice(0, 3000);
    // Check independently: concatenating a correct number with a conflicting
    // number must not let the former mask an explicit contradiction.
    if ([product.title, ...numbers, ...(product.tags ?? [])].some((value) => numberConflict(value, card.cardNumber))) continue;
    for (const variant of product.variants) {
      if (!variant.availability.available || !variant.requires.shipping || variant.price.currency !== "USD"
        || variant.price.amount <= 0 || graded(variant.title)) continue;
      if ([variant.title, ...(variant.options ?? []).map((option) => option.label)]
        .some((value) => numberConflict(value, card.cardNumber))) continue;
      const optionText = (variant.options ?? []).map((option) => option.label).join(" ");
      if (graded(optionText)) continue;
      const claimedCondition = condition(variant.title);
      const optionConditions = (variant.options ?? []).map((option) => condition(option.label)).filter((value) => value !== "Unknown");
      if (claimedCondition !== "Unknown" && optionConditions.some((value) => value !== claimedCondition)) continue;
      const matchAspectText = [...numbers.map((number) => `Card Number: ${number}`), tags, variant.title, optionText].filter(Boolean).join(" ");
      const title = `${product.title} — ${variant.title}`;
      const match = assessTitleMatch(`${title} ${matchAspectText}`, card);
      if (match.confidence === "low") continue;
      const language = explicitLanguage(`${title} ${tags} ${optionText}`);
      const id = variant.id.split("/").at(-1)!;
      rows.set(id, listingSeedSchema.parse({
        id: `stomping-grounds-${id}`, marketplace: "Stomping Grounds", url: `${product.url}?variant=${id}`,
        title, cardId: card.id, matchConfidence: match.confidence,
        matchReasons: [...match.reasons, "Merchant catalog reports this variant available; store maintenance makes current stock uncertain."],
        matchAspectText, listingLanguage: language,
        active: true, raw: true, currency: "USD", price: variant.price.amount / 100,
        shipping: null, buyerFee: null, claimedCondition,
        // Catalog art is not a photo of the actual card being sold.
        imageUrl: null, imageUrls: [],
        seller: { feedbackPercentage: null, feedbackCount: null, returnsAccepted: null, topRated: null, buyerProtection: null, subRatings: null },
        evidence: { photoCount: 0, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false,
          identityExplicit: false, substantiveConditionNotes: false,
          missing: ["The merchant warns that inventory may be inaccurate during store maintenance; confirm availability.",
            "Shipping and mandatory buyer fees require checkout confirmation.", "Catalog artwork is not seller condition photography.",
            "Seller track record is unverified.", ...(language === null ? ["Card language is not explicitly verified."] : [])] },
        observedAt: now.toISOString(), demo: false, userSupplied: false,
      }));
      if (rows.size >= MAX_VARIANTS) return [...rows.values()];
    }
  }
  return [...rows.values()];
}

function graded(text: string) {
  return isGradedListing(text) || /\bgraded\b|\bgem\s+mint\b/i.test(text);
}

function numberConflict(value: string, expected: string) {
  const matchingNumber = collectorNumberPattern(expected);
  // Also catch two contradictory numbers within one structured field. The
  // shared generic helper otherwise deliberately accepts any expected match.
  const remaining = matchingNumber ? value.replace(new RegExp(matchingNumber.source, "gi"), " ") : value;
  return collectorNumberConflict(remaining, expected);
}

function explicitLanguage(text: string) {
  const names = ["English", "Japanese", "Chinese", "Korean", "German", "French", "Spanish", "Italian", "Portuguese"];
  const found = names.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
  return found.length === 1 ? found[0] : found.length > 1 ? "Multiple languages" : null;
}

function condition(title: string): ConditionClaim {
  const normalized = title.replace(/^\(?(?:English|Japanese|Chinese|Korean|German|French|Spanish|Italian|Portuguese)\)?\s*[-:]\s*/i, "").trim();
  const match = /^(Near Mint|Lightly Played|Moderately Played|Heavily Played|Damaged)(?:\s+(?:Holofoil|Reverse Holofoil|Foil|Non-Foil|Normal))?$/i.exec(normalized);
  const names: ConditionClaim[] = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
  return names.find((name) => name.toLowerCase() === match?.[1].toLowerCase()) ?? "Unknown";
}

export async function searchStompingGrounds(input: PlatformSearchInput): Promise<ListingSeed[]> {
  if (!isStompingGroundsEnabled()) throw new Error("Stomping Grounds adapter is disabled.");
  input.signal?.throwIfAborted();
  const card = input.card;
  const key = JSON.stringify(["v2", card.id, card.name, card.cardNumber, card.setName, card.setCode, card.language]);
  const previous = flights.get(key);
  if (previous) return previous;
  const pending = load(input, key).finally(() => flights.delete(key));
  flights.set(key, pending);
  return pending;
}

async function load(input: PlatformSearchInput, key: string): Promise<ListingSeed[]> {
  const cached = await getJsonCache("stomping-grounds", key, { validate: (value) => {
    const parsed = cacheSchema.safeParse(value);
    if (!parsed.success) return null;
    const age = Date.now() - Date.parse(parsed.data.observedAt);
    if (age < 0 || age >= TTL_MS) return null;
    return parsed.data.rows.every((row) => row.observedAt === parsed.data.observedAt && row.cardId === input.card.id
      && row.marketplace === "Stomping Grounds" && row.shipping === null && row.buyerFee === null
      && row.active && row.raw && !row.demo && !row.userSupplied && row.evidence.photoCount === 0
      && row.imageUrl === null && row.imageUrls.length === 0) ? parsed.data.rows : null;
  } });
  input.signal?.throwIfAborted();
  if (cached !== null) return cached;
  await assertNoCooldown();
  const limit = await enforceRateLimit("stomping-grounds:global", { max: 60, windowMs: 3_600_000 });
  if ((process.env.NODE_ENV === "production" || process.env.VERCEL === "1") && limit.backend !== "redis") {
    throw new Error("Stomping Grounds shared request limiter is unavailable.");
  }
  if (!limit.allowed) throw new Error("Stomping Grounds request limit reached; try again later.");
  input.signal?.throwIfAborted();
  const guard = await acquireGuard();
  const payload = await requestCatalog(input, guard);
  input.signal?.throwIfAborted();
  const observedAt = new Date();
  const rows = parseStompingGroundsListings(payload, input.card, observedAt);
  await setJsonCache("stomping-grounds", key, { observedAt: observedAt.toISOString(), rows }, { ttlSeconds: 300 });
  return rows;
}

async function requestCatalog(input: PlatformSearchInput, guard: RequestGuard): Promise<unknown> {
  const controller = new AbortController();
  const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new Error("Stomping Grounds request timed out.")), REQUEST_MS);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let responseStatus: number | undefined;
  let abort: () => void = () => {};
  const stopped = new Promise<never>((_resolve, reject) => {
    abort = () => {
      void reader?.cancel().catch(() => {});
      reject(new Error(controller.signal.aborted ? "Stomping Grounds request timed out." : "Stomping Grounds request cancelled."));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  const work = (async () => {
    const response = await input.fetcher(ENDPOINT, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
      cache: "no-store", redirect: "error", signal,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_catalog", arguments: {
        meta: { "ucp-agent": { profile: PROFILE } },
        catalog: { query: `${input.card.name} ${input.card.cardNumber}`.trim().slice(0, 200),
          context: { address_country: "US", currency: "USD" }, filters: { available: true }, pagination: { limit: MAX_PRODUCTS } },
      } } }),
    });
    signal.throwIfAborted();
    responseStatus = response.status;
    if (!response.ok) {
      if (response.status === 429) {
        await publishCooldown(guard, retryAfterDeadline(response.headers.get("retry-after")));
      }
      void response.body?.cancel().catch(() => {});
      throw new Error(`Stomping Grounds returned HTTP ${response.status}; no inventory was inferred.`);
    }
    if (Number(response.headers.get("content-length")) > MAX_BYTES) {
      void response.body?.cancel().catch(() => {});
      throw new Error("Stomping Grounds response exceeded the size limit.");
    }
    reader = response.body?.getReader();
    if (!reader) throw new Error("Stomping Grounds returned an empty response body.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES) throw new Error("Stomping Grounds response exceeded the size limit.");
      chunks.push(part.value);
    }
    signal.throwIfAborted();
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
    catch { throw new Error("Stomping Grounds returned invalid JSON."); }
  })();
  try { return await Promise.race([work, stopped]); }
  finally {
    clearTimeout(timer); signal.removeEventListener("abort", abort);
    void reader?.cancel().catch(() => {});
    reader?.releaseLock();
    // An observed 429 is handled above. Failed publication intentionally leaves
    // the latch paused. Unknown network outcomes get a conservative short pause.
    if (responseStatus === undefined) await publishCooldown(guard, Date.now() + 60_000);
    else if (responseStatus !== 429) await releaseGuard(guard);
  }
}

function production() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

async function assertNoCooldown() {
  const redis = getRedisClient();
  if (!redis && production()) throw new Error(sharedCooldownError);
  let value: unknown;
  try { value = redis ? await redis.get<unknown>(COOLDOWN_KEY) : await getJsonCache("stomping-grounds", "cooldown"); }
  catch { throw new Error(sharedCooldownError); }
  if (value == null) return;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(sharedCooldownError);
  if (value > Date.now()) throw new Error("Stomping Grounds request cooldown is active; try again later.");
}

async function acquireGuard(): Promise<RequestGuard> {
  const redis = getRedisClient();
  if (!redis) {
    if (production()) throw new Error(sharedCooldownError);
    return null;
  }
  const owner = randomUUID();
  let acquired: unknown;
  try { acquired = await redis.set(IN_FLIGHT_KEY, owner, { nx: true }); }
  catch { throw new Error(sharedCooldownError); }
  if (acquired !== "OK") throw new Error("Stomping Grounds acquisition is in-flight or paused for operator review.");
  const guard = { redis, owner };
  try {
    // The previous owner might have published a deadline between our first
    // read and acquiring the latch. Check again while we own it.
    await assertNoCooldown();
  } catch (error) {
    if (error instanceof Error && error.message.includes("cooldown is active")) await releaseGuard(guard);
    throw error;
  }
  return guard;
}

async function releaseGuard(guard: RequestGuard) {
  if (!guard) return;
  try {
    const released = await guard.redis.eval(releaseScript, [IN_FLIGHT_KEY], [guard.owner]);
    if (released !== 1) throw new Error();
  } catch { throw new Error(sharedCooldownError); }
}

async function publishCooldown(guard: RequestGuard, deadline: number) {
  if (guard) {
    try {
      const published = await guard.redis.eval(publishCooldownScript, [COOLDOWN_KEY, IN_FLIGHT_KEY], [deadline, guard.owner]);
      if (typeof published !== "number" || !Number.isSafeInteger(published) || published < deadline) throw new Error();
    } catch { throw new Error(sharedCooldownError); }
    return;
  }
  if (production()) throw new Error(sharedCooldownError);
  const existing = await getJsonCache<unknown>("stomping-grounds", "cooldown");
  const until = typeof existing === "number" && Number.isSafeInteger(existing) ? Math.max(existing, deadline) : deadline;
  await setJsonCache("stomping-grounds", "cooldown", until, { ttlSeconds: Math.ceil((until - Date.now()) / 1000) });
}

function retryAfterDeadline(retry: string | null) {
  if (!retry) return Date.now() + 60_000;
  const deadline = /^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry);
  if (!Number.isSafeInteger(deadline) || deadline < 0 || deadline > 8_640_000_000_000_000) {
    throw new Error("Stomping Grounds Retry-After could not be safely represented; acquisition is paused for operator review.");
  }
  return Math.max(Date.now() + 1000, deadline);
}
