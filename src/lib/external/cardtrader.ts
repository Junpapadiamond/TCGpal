import { createHash } from "node:crypto";
import { z } from "zod";
import type { PlatformSearchInput } from "@/lib/comparison/platforms";
import { collectorNumberConflict, collectorNumberNumerator, collectorNumbersEquivalent } from "@/lib/comparison/collector-number";
import { isExcludedProduct } from "@/lib/comparison/product-type";
import { isGradedListing } from "@/lib/comparison/graded-listing";
import { assessPrintFidelity } from "@/lib/comparison/print-fidelity";
import { getJsonCache, setJsonCache } from "@/lib/ops/cache";
import { enforceRateLimit } from "@/lib/ops/rate-limit";
import { listingSeedSchema, type CardIdentityCandidate, type ConditionClaim, type ListingSeed } from "@/lib/schemas";

const ORIGIN = "https://api.cardtrader.com";
const DEADLINE_MS = 12_000;
const MAX_BYTES = 4_000_000;
const CATALOG_TTL = 6 * 60 * 60;
const OFFERS_TTL = 120;
const idSchema = z.number().int().positive().safe();
const expansionSchema = z.object({ id: idSchema, game_id: idSchema, code: z.string().max(100), name: z.string().max(300) });
const blueprintSchema = z.object({
  id: idSchema, name: z.string().min(1).max(300), version: z.string().max(500).nullable(),
  game_id: idSchema, category_id: idSchema, expansion_id: idSchema.nullable(),
  tcg_player_id: z.union([idSchema, z.string().regex(/^\d+$/).transform(Number)]).nullable(),
  fixed_properties: z.object({ collector_number: z.string().max(100).optional() }),
});
type Blueprint = z.infer<typeof blueprintSchema>;
type Expansion = z.infer<typeof expansionSchema>;
const offerSchema = z.object({
  id: idSchema, blueprint_id: idSchema, name_en: z.string().min(1).max(300),
  expansion: z.object({ id: idSchema, code: z.string().max(100), name_en: z.string().max(300) }),
  quantity: z.number().int().nonnegative(), bundle_size: z.number().int().positive().optional(),
  description: z.string().max(10_000).nullable(), graded: z.boolean(), on_vacation: z.boolean(),
  price: z.object({ cents: z.number().int().nonnegative().safe(), currency: z.string().max(10) }),
  properties_hash: z.object({
    condition: z.string().max(80).optional(), signed: z.boolean(), altered: z.boolean(), collector_number: z.string().max(100),
    pokemon_language: z.string().max(20).optional(), onepiece_language: z.string().max(20).optional(),
    pokemon_reverse: z.boolean().optional(), first_edition: z.boolean().optional(),
  }),
  user: z.object({ country_code: z.string().max(10), username: z.string().max(200) }),
});
const offersSchema = z.record(z.string().regex(/^\d+$/), z.array(offerSchema).max(200));
const seedCacheSchema = z.object({ observedAt: z.iso.datetime(), rows: z.array(listingSeedSchema).max(12) });
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const isOnePiece = (card: CardIdentityCandidate) => /^(?:OP|ST|EB|PRB|P)-?\d/i.test(card.cardNumber);
const gameId = (card: CardIdentityCandidate) => isOnePiece(card) ? 15 : 5;

export function isCardTraderEnabled() {
  return process.env.CARDTRADER_ENABLED === "1" && process.env.CARDTRADER_MARKET_DATA_APPROVED === "1"
    && Boolean(process.env.CARDTRADER_API_TOKEN?.trim());
}

function sameNumber(actual: string, expected: string) {
  // A catalog may omit the printed set denominator. An explicit denominator
  // must agree; never strip one to conceal a conflict.
  return collectorNumbersEquivalent(actual, expected) || (!actual.includes("/")
    && Boolean(collectorNumberNumerator(actual)) && collectorNumberNumerator(actual) === collectorNumberNumerator(expected));
}

export function selectCardTraderBlueprint(payload: unknown, card: CardIdentityCandidate, productId: number | null): Blueprint | null {
  const rows = parseArray(payload, blueprintSchema);
  if (!productId) return null;
  const matches = rows.filter(row => row.tcg_player_id === productId);
  // Ambiguous provider associations do not pick the cheapest sibling.
  if (matches.length !== 1) return null;
  const row = matches[0];
  if (row.game_id !== gameId(card) || row.category_id !== (isOnePiece(card) ? 192 : 73)
    || normalize(row.name) !== normalize(card.name) || !sameNumber(row.fixed_properties.collector_number ?? "", card.cardNumber)
    || collectorNumberConflict(row.version ?? "", card.cardNumber)) return null;
  return row;
}

const conditions: Record<string, ConditionClaim> = {
  Mint: "Near Mint", "Near Mint": "Near Mint", "Slightly Played": "Lightly Played",
  "Moderately Played": "Moderately Played", Played: "Heavily Played", Poor: "Damaged",
};

export function parseCardTraderOffers(payload: unknown, blueprint: Blueprint, card: CardIdentityCandidate, now = new Date()): ListingSeed[] {
  const parsed = offersSchema.safeParse(payload);
  if (!parsed.success || !Object.hasOwn(parsed.data, String(blueprint.id))) throw schemaError();
  const rows = new Map<number, ListingSeed>();
  for (const offer of parsed.data[String(blueprint.id)]) {
    const properties = offer.properties_hash;
    const language = isOnePiece(card) ? properties.onepiece_language : properties.pokemon_language;
    if (offer.blueprint_id !== blueprint.id || offer.expansion.id !== blueprint.expansion_id
      || normalize(offer.name_en) !== normalize(blueprint.name) || !sameNumber(properties.collector_number, card.cardNumber)
      || offer.quantity < 1 || offer.graded || offer.on_vacation || (offer.bundle_size ?? 1) !== 1
      || properties.signed || properties.altered || language !== "en" || offer.user.country_code !== "US"
      || offer.price.currency !== "USD" || offer.price.cents <= 0) continue;
    // This initial source supports ordinary English raw singles only. The
    // external product ID alone cannot prove reverse-holo or edition properties.
    if (properties.pokemon_reverse || properties.first_edition) continue;
    const description = (offer.description ?? "").replace(/<[^>]*>/g, " ").slice(0, 3000);
    const title = [offer.name_en, properties.collector_number, offer.expansion.name_en].filter(Boolean).join(" — ");
    const sourceText = `${title} ${description}`;
    if (isExcludedProduct({ title: sourceText }) || isGradedListing(sourceText) || collectorNumberConflict(description, card.cardNumber)
      || /\b(?:Japanese|Korean|Chinese|French|German|Italian|Spanish|Portuguese)\b/i.test(description)) continue;
    const matchAspectText = `${sourceText} Blueprint version: ${blueprint.version ?? "unspecified"}. English. Seller condition: ${properties.condition ?? "Unknown"}.`;
    const fidelity = assessPrintFidelity({ card, matchText: matchAspectText, listingPrice: offer.price.cents / 100, exactMarketAnchor: null });
    if (fidelity.match === "mismatch") continue;
    rows.set(offer.id, listingSeedSchema.parse({
      id: `cardtrader-${offer.id}`, marketplace: "CardTrader", url: `https://www.cardtrader.com/en/cards/${blueprint.id}`,
      title, cardId: card.id, matchConfidence: "high", listingLanguage: "English", matchAspectText,
      matchReasons: ["Exact TCGplayer product association and collector number agree with the confirmed card.",
        `CardTrader offer ${offer.id}, seller ${offer.user.username}. The link opens this print's seller table.`],
      active: true, raw: true, currency: "USD", price: offer.price.cents / 100, shipping: null, buyerFee: null,
      claimedCondition: conditions[properties.condition ?? ""] ?? "Unknown", imageUrl: null, imageUrls: [],
      seller: { feedbackPercentage: null, feedbackCount: null, returnsAccepted: null, topRated: null, buyerProtection: null, subRatings: null },
      evidence: { photoCount: 0, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false,
        identityExplicit: false, substantiveConditionNotes: false,
        missing: ["CardTrader account-currency USD quote; the seller's original currency is not supplied.",
          "Shipping, buyer fees and delivery availability require confirmation on CardTrader.",
          "Seller history and item-specific condition photos are unverified."] },
      observedAt: now.toISOString(), demo: false, userSupplied: false,
    }));
    if (rows.size >= 12) break;
  }
  return [...rows.values()];
}

function parseArray<T>(payload: unknown, schema: z.ZodType<T>): T[] {
  const array = z.array(schema).max(10_000);
  const parsed = z.union([array, z.object({ array }) .transform(value => value.array)]).safeParse(payload);
  if (!parsed.success) throw schemaError();
  return parsed.data;
}
function schemaError() { return new Error("CardTrader response schema changed; no inventory was inferred."); }

function selectExpansions(rows: Expansion[], card: CardIdentityCandidate): Expansion[] {
  const game = rows.filter(row => row.game_id === gameId(card));
  const wantedName = normalize(card.setName);
  const wantedCode = normalize(card.setCode);
  const primary = game.filter(row => normalize(row.code) === wantedCode || normalize(row.name) === wantedName
    || normalize(row.name.replace(/^(?:OP|ST|EB|PRB)-?\d+\s*:\s*/i, "")) === wantedName);
  // One Piece distributes promotional print blueprints across these three
  // explicit catalog families. Search only bounded families, never every set.
  const promos = isOnePiece(card) ? game.filter(row => ["promo", "bandai", "oppcc"].includes(normalize(row.code))) : [];
  return [...new Map([...primary, ...promos].map(row => [row.id, row])).values()].slice(0, 4);
}

export async function searchCardTrader(input: PlatformSearchInput): Promise<ListingSeed[]> {
  if (!isCardTraderEnabled()) throw new Error("CardTrader is disabled until market-data use is approved and configured.");
  input.signal?.throwIfAborted();
  if (!/^(?:en|english)$/i.test(input.card.language)) return [];
  const productId = input.plan?.tcgplayerProductId ?? input.card.tcgplayerProductId;
  if (!productId) throw new Error("CardTrader exact product mapping is unavailable for this print.");
  const token = process.env.CARDTRADER_API_TOKEN!.trim();
  const accountScope = createHash("sha256").update(token).digest("hex").slice(0, 20);
  const key = JSON.stringify(["v1", accountScope, input.card, productId]);
  const cached = await getJsonCache("cardtrader-offers", key, { validate: value => {
    const parsed = seedCacheSchema.safeParse(value);
    if (!parsed.success) return null;
    const age = Date.now() - Date.parse(parsed.data.observedAt);
    return age >= 0 && age < OFFERS_TTL * 1000 && parsed.data.rows.every(row => row.cardId === input.card.id
      && row.marketplace === "CardTrader" && row.shipping === null && row.buyerFee === null
      && row.observedAt === parsed.data.observedAt && row.active && row.raw && !row.demo && !row.userSupplied)
      ? parsed.data.rows : null;
  } });
  input.signal?.throwIfAborted();
  if (cached !== null) return cached;
  const controller = new AbortController();
  const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
  try {
    const request = (path: string) => getJson(path, token, input.fetcher, signal);
    const expansions = await catalog("expansions", expansionSchema, () => request("/expansions"), signal);
    const selected = selectExpansions(expansions, input.card);
    if (!selected.length) throw new Error("CardTrader matching expansion is unavailable.");
    let blueprint: Blueprint | null = null;
    for (const expansion of selected) {
      const blueprints = await catalog(`blueprints:${expansion.id}`, blueprintSchema,
        () => request(`/blueprints/export?expansion_id=${expansion.id}`), signal);
      blueprint = selectCardTraderBlueprint(blueprints, input.card, productId);
      if (blueprint) break;
    }
    if (!blueprint) throw new Error("CardTrader exact print mapping was not found; no sibling print was substituted.");
    const payload = await request(`/marketplace/products?blueprint_id=${blueprint.id}&language=en`);
    const now = new Date();
    const rows = parseCardTraderOffers(payload, blueprint, input.card, now);
    signal.throwIfAborted();
    await setJsonCache("cardtrader-offers", key, { observedAt: now.toISOString(), rows }, { ttlSeconds: OFFERS_TTL });
    return rows;
  } catch (error) {
    if (signal.aborted) throw new Error(input.signal?.aborted ? "CardTrader request cancelled." : "CardTrader request timed out.");
    if (error instanceof Error && error.message.startsWith("CardTrader ")) throw error;
    throw new Error("CardTrader request failed; no inventory was inferred.");
  } finally { clearTimeout(timer); }
}

async function catalog<T>(key: string, schema: z.ZodType<T>, load: () => Promise<unknown>, signal: AbortSignal): Promise<T[]> {
  const cached = await getJsonCache("cardtrader-catalog-v1", key, { validate: value => {
    try { return parseArray(value, schema); } catch { return null; }
  } });
  signal.throwIfAborted();
  if (cached !== null) return cached;
  const rows = parseArray(await load(), schema);
  signal.throwIfAborted();
  await setJsonCache("cardtrader-catalog-v1", key, rows, { ttlSeconds: CATALOG_TTL });
  return rows;
}

async function getJson(path: string, token: string, fetcher: typeof fetch, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  const limits = [{ key: "cardtrader:global", max: 30, windowMs: 10_000 },
    ...(path.startsWith("/marketplace/") ? [{ key: "cardtrader:offers", max: 4, windowMs: 1000 }] : [])];
  for (const rule of limits) {
    const limit = await enforceRateLimit(rule.key, rule);
    if ((process.env.NODE_ENV === "production" || process.env.VERCEL === "1") && limit.backend !== "redis") {
      throw new Error("CardTrader shared request limiter is unavailable.");
    }
    if (!limit.allowed) throw new Error("CardTrader request limit reached; no retry was attempted.");
  }
  signal.throwIfAborted();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let abort: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    abort = () => { void reader?.cancel().catch(() => {}); reject(new Error("CardTrader request cancelled.")); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  const work = (async () => {
    const response = await fetcher(`${ORIGIN}/api/v2${path}`, { method: "GET", redirect: "error", cache: "no-store", signal,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    signal.throwIfAborted();
    if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new Error(`CardTrader returned HTTP ${response.status}; no retry was attempted.`); }
    if (Number(response.headers.get("content-length")) > MAX_BYTES) {
      void response.body?.cancel().catch(() => {}); throw new Error("CardTrader response exceeded the size limit.");
    }
    reader = response.body?.getReader();
    if (!reader) throw schemaError();
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) { void reader.cancel().catch(() => {}); throw new Error("CardTrader response exceeded the size limit."); }
      chunks.push(part.value);
    }
    signal.throwIfAborted();
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw schemaError(); }
  })();
  try { return await Promise.race([work, stopped]); }
  finally { signal.removeEventListener("abort", abort); }
}
