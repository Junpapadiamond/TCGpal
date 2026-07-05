import { z } from "zod";
import { createAiProvider } from "@/lib/ai/provider";
import { getAiConfig } from "@/lib/ai/config";
import { detectMarketplaceFromUrl } from "@/lib/comparison/marketplace-url";
import { extractTavilyListingPage, isTavilyConfigured } from "@/lib/external/tavily";
import type { ConditionClaim, Marketplace, SourceListing } from "@/lib/schemas";

export { detectMarketplaceFromUrl } from "@/lib/comparison/marketplace-url";

// R6: the paste-a-URL universal adapter. A user pastes one listing URL from any
// marketplace; TCGpal performs a single user-initiated fetch of exactly that
// page (never crawling, never following a site beyond the pasted URL), extracts
// the listing facts, and feeds them into the same deterministic pipeline as
// API-backed sources. robots.txt is honored: a disallowed path falls back to
// the manual evidence form instead of fetching.

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1_500_000;
const USER_AGENT = "TCGpalAgent/0.1 (user-initiated single-listing check; +https://tcgpal.vercel.app)";

export class UniversalListingBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UniversalListingBlockedError";
  }
}

export type UniversalListingResult = {
  marketplace: Marketplace;
  listing: SourceListing;
  // Card identity as the page states it — the deterministic identity critic
  // compares this against the buyer's confirmed version.
  extractedCard: { name: string; number: string; setName: string };
  notes: string[];
  usedAi: boolean;
};

export function isFetchableListingUrl(value: string): { ok: boolean; reason?: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "The pasted value is not a valid URL." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Only https listing URLs can be fetched." };
  if (url.username || url.password) return { ok: false, reason: "URLs with embedded credentials are not fetched." };
  if (isBlockedHost(url.hostname)) return { ok: false, reason: "Only public marketplace hosts can be fetched." };
  return { ok: true };
}

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // IPv4 literal
  if (host.includes(":") || host.startsWith("[")) return true; // IPv6 literal
  if (!host.includes(".")) return true; // bare intranet names
  return false;
}

// ---------- robots.txt (honored per pasted path, cached per origin) ----------

type RobotsRules = { allow: string[]; disallow: string[] };
const robotsCache = new Map<string, { rules: RobotsRules | null; at: number }>();
const ROBOTS_TTL_MS = 60 * 60 * 1000;

export async function isPathAllowedByRobots(
  url: URL,
  fetcher: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<boolean> {
  const origin = url.origin;
  const cached = robotsCache.get(origin);
  let rules = cached && now.getTime() - cached.at < ROBOTS_TTL_MS ? cached.rules : undefined;

  if (rules === undefined) {
    rules = await loadRobots(origin, fetcher);
    robotsCache.set(origin, { rules, at: now.getTime() });
  }

  if (!rules) return true; // no robots.txt (or unreadable) → allowed
  return evaluateRobots(rules, url.pathname + url.search);
}

async function loadRobots(origin: string, fetcher: typeof fetch): Promise<RobotsRules | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetcher(new URL(`${origin}/robots.txt`), {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) return null;
    return parseRobots(await response.text());
  } catch {
    return null;
  }
}

function parseRobots(text: string): RobotsRules {
  const rules: RobotsRules = { allow: [], disallow: [] };
  let applies = false;
  let sawAnyAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawField, ...rest] = line.split(":");
    const field = rawField.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (field === "user-agent") {
      const agent = value.toLowerCase();
      // A new agent block starts; groups of consecutive user-agent lines share rules.
      if (sawAnyAgent && (rules.allow.length || rules.disallow.length)) {
        applies = agent === "*" || agent.includes("tcgpal");
      } else {
        applies = applies || agent === "*" || agent.includes("tcgpal");
      }
      sawAnyAgent = true;
    } else if (applies && field === "disallow" && value) {
      rules.disallow.push(value);
    } else if (applies && field === "allow" && value) {
      rules.allow.push(value);
    }
  }
  return rules;
}

function evaluateRobots(rules: RobotsRules, path: string) {
  const longestMatch = (patterns: string[]) =>
    patterns.reduce((best, pattern) => (robotsPatternMatches(pattern, path) && pattern.length > best ? pattern.length : best), 0);
  const allowLength = longestMatch(rules.allow);
  const disallowLength = longestMatch(rules.disallow);
  return allowLength >= disallowLength;
}

function robotsPatternMatches(pattern: string, path: string) {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const anchored = escaped.endsWith("\\$") ? `^${escaped.slice(0, -2)}$` : `^${escaped}`;
  return new RegExp(anchored).test(path);
}

// ---------- extraction ----------

const aiExtractionSchema = z.object({
  title: z.string().nullable(),
  price: z.number().nullable(),
  shipping: z.number().nullable(),
  currency: z.string().nullable(),
  condition: z.string().nullable(),
  cardName: z.string().nullable(),
  cardNumber: z.string().nullable(),
  setName: z.string().nullable(),
  photoCount: z.number().nullable(),
  sellerFeedbackPercentage: z.number().nullable(),
  sellerFeedbackCount: z.number().nullable(),
  conditionNotes: z.string().nullable(),
});

type AiExtraction = z.infer<typeof aiExtractionSchema>;

type TextExtraction = {
  title: string | null;
  price: number | null;
  shipping: number | null;
  currency: string | null;
  condition: string | null;
  description: string | null;
  photoCount: number | null;
  cardName: string | null;
  cardNumber: string | null;
  setName: string | null;
};

function needsTavilyFallback(deterministic: DeterministicExtraction, ai: AiExtraction | null) {
  return !(deterministic.title ?? ai?.title) || (deterministic.price ?? ai?.price) === null;
}

function extractFromText(text: string): TextExtraction {
  const clean = text.replace(/\s+/g, " ").trim();
  const priceMatch = clean.match(/(?:price|item|asking|ask|sale)?[^$]{0,24}(?:US\s*)?\$\s*([1-9][0-9,]*(?:\.\d{1,2})?)/i);
  const shippingMatch = clean.match(/(?:shipping|postage|delivery)[^$]{0,32}(?:US\s*)?\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  const nonUsdCurrency = !priceMatch && /\b(?:JPY|YEN)\b|[¥￥]|円/.test(clean);
  const cardNumber = extractCollectorNumber(clean);
  const title = firstUsefulLine(text) ?? null;
  const condition = clean.match(/\b(near\s*mint|nm|mint|like\s+new|light(?:ly)?\s*played|lp|moderate(?:ly)?\s*played|mp|heavy|heavily\s*played|hp|damaged|damage|poor)\b/i)?.[0] ?? null;

  return {
    title,
    price: moneyMatch(priceMatch),
    shipping: moneyMatch(shippingMatch),
    currency: priceMatch ? "USD" : nonUsdCurrency ? "JPY" : null,
    condition,
    description: clean.slice(0, 2000) || null,
    photoCount: photoCountFromText(clean),
    cardName: title ? title.replace(cardNumber, "").replace(/\s+/g, " ").trim() || null : null,
    cardNumber: cardNumber || null,
    setName: clean.match(/\b(Evolving Skies|Romance Dawn|Pillars of Strength|Paramount War|Awakening of the New Era)\b/i)?.[0] ?? null,
  };
}

function firstUsefulLine(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find((line) => line.length >= 8 && !/^https?:\/\//i.test(line))
    ?.slice(0, 300);
}

function moneyMatch(match: RegExpMatchArray | null) {
  const raw = match?.[1];
  if (!raw) return null;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function photoCountFromText(text: string) {
  if (/front.{0,16}back|back.{0,16}front/i.test(text)) return 2;
  if (/\b(photo|photos|pictures|pics|images)\b/i.test(text)) return 1;
  return null;
}

export async function fetchUniversalListing(
  rawUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<UniversalListingResult> {
  const fetchable = isFetchableListingUrl(rawUrl);
  if (!fetchable.ok) throw new UniversalListingBlockedError(fetchable.reason ?? "This URL cannot be fetched.");
  const url = new URL(rawUrl);
  const notes: string[] = [];

  if (!(await isPathAllowedByRobots(url, fetcher))) {
    throw new UniversalListingBlockedError(
      "This site's robots.txt disallows automated access to that page, so TCGpal did not fetch it. Add the listing facts manually instead.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const fallback = await tavilyOnlyListing(rawUrl, fetcher, notes, `Direct fetch unavailable (${errorMessage(error)}).`);
    if (fallback) return fallback;
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const fallback = await tavilyOnlyListing(rawUrl, fetcher, notes, `Direct fetch returned HTTP ${response.status}.`);
    if (fallback) return fallback;
    throw new Error(`The listing page responded with ${response.status}.`);
  }
  const finalUrl = response.url ? new URL(response.url) : url;
  if (isBlockedHost(finalUrl.hostname)) {
    throw new UniversalListingBlockedError("The listing URL redirected to a non-public host and was discarded.");
  }

  const html = (await response.text()).slice(0, MAX_HTML_BYTES);
  const deterministic = extractDeterministic(html);

  let ai: AiExtraction | null = null;
  try {
    ai = await extractWithAi(html, rawUrl);
  } catch (error) {
    notes.push(`AI extraction unavailable (${error instanceof Error ? error.message.slice(0, 120) : "unknown error"}).`);
  }

  let tavily: TextExtraction | null = null;
  if (needsTavilyFallback(deterministic, ai) && isTavilyConfigured()) {
    try {
      const page = await extractTavilyListingPage({ url: rawUrl, fetcher });
      if (page) {
        tavily = extractFromText(`${page.title}\n${page.content}`);
        notes.push("Tavily Extract filled missing listing facts from the exact pasted URL only.");
      }
    } catch (error) {
      notes.push(`Tavily exact-URL extraction unavailable (${error instanceof Error ? error.message.slice(0, 120) : "unknown error"}).`);
    }
  }

  return buildUniversalListingResult(rawUrl, deterministic, ai, tavily, notes);
}

async function tavilyOnlyListing(
  rawUrl: string,
  fetcher: typeof fetch,
  notes: string[],
  reason: string,
): Promise<UniversalListingResult | null> {
  if (!isTavilyConfigured()) {
    throw new Error(`${reason} Tavily exact-URL extraction is not configured.`);
  }
  try {
    const page = await extractTavilyListingPage({ url: rawUrl, fetcher });
    if (!page) return null;
    const tavily = extractFromText(`${page.title}\n${page.content}`);
    notes.push(`${reason} Tavily Extract filled missing listing facts from the exact pasted URL only.`);
    return buildUniversalListingResult(rawUrl, emptyDeterministicExtraction(), null, tavily, notes);
  } catch (error) {
    throw new Error(
      `${reason} Tavily exact-URL extraction was unavailable (${error instanceof Error ? error.message.slice(0, 180) : "unknown error"}).`,
    );
  }
}

function buildUniversalListingResult(
  rawUrl: string,
  deterministic: DeterministicExtraction,
  ai: AiExtraction | null,
  tavily: TextExtraction | null,
  notes: string[],
): UniversalListingResult {
  // Deterministic page data (JSON-LD / meta tags) is source truth; the model
  // and exact-URL Tavily text only fill gaps the structured markup does not cover.
  const title = deterministic.title ?? ai?.title ?? tavily?.title ?? "";
  const price = deterministic.price ?? ai?.price ?? tavily?.price ?? null;
  const currency = (deterministic.currency ?? ai?.currency ?? tavily?.currency ?? "USD").toUpperCase();
  if (currency && currency !== "USD") {
    throw new Error(`The pasted listing is priced in ${currency}; TCGpal compares USD listings only.`);
  }
  if (price === null && !title) {
    throw new Error("No price or title could be extracted from the pasted page.");
  }

  const marketplace = detectMarketplaceFromUrl(rawUrl);
  const description = (deterministic.description ?? tavily?.description ?? ai?.conditionNotes ?? "").slice(0, 2000);
  const conditionText = deterministic.condition ?? ai?.condition ?? tavily?.condition ?? "";
  const photoCount = deterministic.photoCount
    ?? (typeof ai?.photoCount === "number" ? Math.max(0, Math.round(ai.photoCount)) : null)
    ?? tavily?.photoCount
    ?? 0;

  const listing: SourceListing = {
    marketplace,
    url: rawUrl,
    title: title.slice(0, 300),
    description,
    price,
    shipping: ai?.shipping ?? tavily?.shipping ?? null,
    claimedCondition: normalizeConditionText(conditionText),
    active: true,
    seller: {
      feedbackPercentage: clampNullable(ai?.sellerFeedbackPercentage, 0, 100),
      feedbackCount: ai?.sellerFeedbackCount !== null && ai?.sellerFeedbackCount !== undefined
        ? Math.max(0, Math.round(ai.sellerFeedbackCount))
        : null,
      returnsAccepted: null,
      topRated: null,
      buyerProtection: null,
      subRatings: null,
    },
    evidence: evidenceFromExtraction(photoCount, `${title} ${description}`),
  };

  return {
    marketplace,
    listing,
    extractedCard: {
      name: ai?.cardName ?? tavily?.cardName ?? "",
      number: ai?.cardNumber ?? tavily?.cardNumber ?? extractCollectorNumber(`${title} ${description}`),
      setName: ai?.setName ?? tavily?.setName ?? "",
    },
    notes,
    usedAi: ai !== null || tavily !== null,
  };
}

function emptyDeterministicExtraction(): DeterministicExtraction {
  return {
    title: null,
    price: null,
    currency: null,
    condition: null,
    description: null,
    photoCount: null,
  };
}

async function extractWithAi(html: string, url: string): Promise<AiExtraction> {
  const provider = createAiProvider(getAiConfig());
  const distilled = distillHtml(html);
  const response = await provider.completeJson({
    role: "classifier",
    schemaName: "pasted_listing_extraction",
    schema: aiExtractionSchema,
    system: [
      "You extract trading-card listing facts from marketplace page text.",
      "Use only what the page states. Every field you cannot find verbatim must be null — never estimate, never invent.",
      "price/shipping are numbers in the page's currency without symbols. condition is the seller's stated condition string.",
      "cardName/cardNumber/setName describe the card being sold as printed on the page (cardNumber like 215/203 when present).",
    ].join("\n"),
    user: { url, pageText: distilled },
  });
  return response.data;
}

type DeterministicExtraction = {
  title: string | null;
  price: number | null;
  currency: string | null;
  condition: string | null;
  description: string | null;
  photoCount: number | null;
};

// JSON-LD Product/Offer blocks and OpenGraph metas are machine-readable source
// truth that model output must never override.
export function extractDeterministic(html: string): DeterministicExtraction {
  const result: DeterministicExtraction = {
    title: null,
    price: null,
    currency: null,
    condition: null,
    description: null,
    photoCount: null,
  };

  for (const block of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(block[1]) as unknown;
      const product = findProductNode(parsed);
      if (!product) continue;
      result.title ??= stringOrNull(product.name);
      result.description ??= stringOrNull(product.description);
      const offer = firstOffer(product);
      if (offer) {
        result.price ??= numberish(offer.price);
        result.currency ??= stringOrNull(offer.priceCurrency);
        result.condition ??= conditionFromSchema(stringOrNull(offer.itemCondition));
      }
      const images = Array.isArray(product.image) ? product.image.length : product.image ? 1 : 0;
      if (images) result.photoCount = Math.max(result.photoCount ?? 0, images);
    } catch {
      /* skip malformed JSON-LD blocks */
    }
  }

  result.title ??= metaContent(html, "og:title") ?? htmlTitle(html);
  result.description ??= metaContent(html, "og:description");
  result.price ??= numberish(metaContent(html, "product:price:amount") ?? metaContent(html, "og:price:amount"));
  result.currency ??= metaContent(html, "product:price:currency") ?? metaContent(html, "og:price:currency");
  return result;
}

type ProductNode = {
  name?: unknown;
  description?: unknown;
  image?: unknown;
  offers?: unknown;
};

function findProductNode(node: unknown): ProductNode | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProductNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object" || !node) return null;
  const record = node as Record<string, unknown>;
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((entry) => typeof entry === "string" && entry.toLowerCase() === "product")) {
    return record as ProductNode;
  }
  if (record["@graph"]) return findProductNode(record["@graph"]);
  return null;
}

type OfferNode = { price?: unknown; priceCurrency?: unknown; itemCondition?: unknown };

function firstOffer(product: ProductNode): OfferNode | null {
  const offers = product.offers;
  if (Array.isArray(offers)) return (offers[0] as OfferNode) ?? null;
  if (typeof offers === "object" && offers) return offers as OfferNode;
  return null;
}

function conditionFromSchema(value: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("newcondition")) return "Near Mint";
  if (normalized.includes("usedcondition")) return null; // "used" carries no card-grade info
  return value;
}

function distillHtml(html: string) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  const metas = [...withoutScripts.matchAll(/<meta[^>]+>/gi)].map((match) => match[0]).join("\n");
  const jsonLd = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim())
    .join("\n")
    .slice(0, 6000);
  const text = withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 9000);
  return `${metas.slice(0, 3000)}\n\nJSON-LD:\n${jsonLd}\n\nPAGE TEXT:\n${text}`;
}

function evidenceFromExtraction(photoCount: number, text: string) {
  const normalized = text.toLowerCase();
  const frontBackExplicit = /front.{0,12}back|back.{0,12}front/.test(normalized);
  const closeupsExplicit = /corner|edge|close[- ]?up/.test(normalized);
  const surfaceExplicit = /surface|foil|holo|video|glare/.test(normalized);
  const substantiveConditionNotes = /scratch|whitening|dent|crease|print line|off[- ]?center|clean/.test(normalized);
  return {
    photoCount,
    frontBackExplicit,
    closeupsExplicit,
    surfaceExplicit,
    identityExplicit: /\b\d{1,3}\s*\/\s*\d{1,3}\b/.test(normalized),
    substantiveConditionNotes,
    missing: [
      !frontBackExplicit ? "Front and back views are not explicitly described." : "",
      !closeupsExplicit ? "Corner and edge closeups are not explicit." : "",
      !surfaceExplicit ? "Surface evidence is not explicit." : "",
    ].filter(Boolean),
  };
}

function normalizeConditionText(value: string): ConditionClaim {
  const condition = value.toLowerCase();
  if (/near\s*mint|\bnm\b|brand new|like new/.test(condition)) return "Near Mint";
  if (/light|excellent|\blp\b/.test(condition)) return "Lightly Played";
  if (/moderate|\bmp\b|very good/.test(condition)) return "Moderately Played";
  if (/heavy|\bhp\b|acceptable/.test(condition)) return "Heavily Played";
  if (/damage|poor/.test(condition)) return "Damaged";
  return "Unknown";
}

function metaContent(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["']`,
    "i",
  );
  const match = html.match(pattern);
  return match ? decodeEntities(match[1] ?? match[2] ?? "") || null : null;
}

function htmlTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].trim()).slice(0, 300) || null : null;
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'");
}

function extractCollectorNumber(value: string) {
  return value.match(/\b(?:[A-Za-z]{1,4})?\d{1,3}\s*\/\s*(?:[A-Za-z]{1,4})?\d{1,3}\b/)?.[0] ?? "";
}

function numberish(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clampNullable(value: number | null | undefined, min: number, max: number) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
