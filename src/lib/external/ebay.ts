import { z } from "zod";
import type {
  BuyerContext,
  CardIdentityCandidate,
  NormalizedListing,
  SourceListing,
} from "@/lib/schemas";

const ebayAmountSchema = z.object({
  value: z.string(),
  currency: z.string(),
});

const ebaySellerSchema = z.object({
  feedbackPercentage: z.string().optional(),
  feedbackScore: z.number().optional(),
}).passthrough();

const ebayImageSchema = z.object({ imageUrl: z.string().url() });

const ebayItemSchema = z.object({
  itemId: z.string(),
  itemWebUrl: z.string().url().optional(),
  itemAffiliateWebUrl: z.string().url().optional(),
  title: z.string(),
  shortDescription: z.string().optional(),
  price: ebayAmountSchema,
  condition: z.string().optional(),
  image: ebayImageSchema.optional(),
  additionalImages: z.array(ebayImageSchema).optional(),
  thumbnailImages: z.array(ebayImageSchema).optional(),
  seller: ebaySellerSchema.optional(),
  shippingOptions: z.array(z.object({
    shippingCost: ebayAmountSchema.optional(),
  }).passthrough()).optional(),
  topRatedBuyingExperience: z.boolean().optional(),
  itemEndDate: z.string().optional(),
  buyingOptions: z.array(z.string()).optional(),
  returnTerms: z.object({
    returnsAccepted: z.boolean().optional(),
  }).passthrough().optional(),
}).passthrough();

const ebaySearchSchema = z.object({
  itemSummaries: z.array(ebayItemSchema).default([]),
}).passthrough();

const ebayTokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
});

const EBAY_HOSTS = new Set(["ebay.com", "www.ebay.com", "m.ebay.com"]);
const EBAY_API = "https://api.ebay.com";

// eBay's client-credentials token is valid ~2h, but was refetched on every request — costing
// ~1-2s per comparison for no reason. Cache it in module scope; the actual token HTTP call
// itself stays cache: "no-store" (this is an app-level cache, not a browser/CDN one).
let cachedToken: { token: string; expiresAt: number } | null = null;
// Refresh a minute early so a token never expires mid-request.
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export class EbayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EbayUnavailableError";
  }
}

export function parseEbayUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { supported: false as const, itemId: null };
  }

  if (url.protocol !== "https:" || !EBAY_HOSTS.has(url.hostname.toLowerCase())) {
    return { supported: false as const, itemId: null };
  }

  const pathMatch = url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})(?:\/|$)/i);
  const queryId = url.searchParams.get("item");
  const itemId = pathMatch?.[1] ?? (queryId && /^\d{9,15}$/.test(queryId) ? queryId : null);

  return { supported: true as const, itemId };
}

export function hasEbayCredentials() {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

// Test-only: the token cache is module-scoped (by design, so it survives across requests in
// the same server process), so tests that assert on fetch counts need to reset it between cases.
export function resetEbayTokenCacheForTests() {
  cachedToken = null;
}

export async function getEbayListingByUrl(
  url: string,
  buyer: BuyerContext,
  fetcher: typeof fetch = fetch,
): Promise<SourceListing> {
  const parsed = parseEbayUrl(url);
  if (!parsed.supported) throw new Error("Only allowlisted eBay URLs may be fetched automatically.");
  if (!parsed.itemId) throw new Error("The eBay item ID could not be read from this URL.");
  const token = await getEbayToken(fetcher);
  const endpoint = new URL(`${EBAY_API}/buy/browse/v1/item/get_item_by_legacy_id`);
  endpoint.searchParams.set("legacy_item_id", parsed.itemId);
  const response = await fetchWithTimeout(endpoint, {
    headers: ebayHeaders(token, buyer),
    cache: "no-store",
  }, fetcher);
  if (!response.ok) throw new Error(`eBay item lookup failed with ${response.status}.`);
  return toSourceListing(ebayItemSchema.parse(await response.json()), url);
}

export async function searchEbayAlternatives(
  card: CardIdentityCandidate,
  buyer: BuyerContext,
  fetcher: typeof fetch = fetch,
  // Optional model-refined query. The deterministic default below is always the
  // fallback, so a missing or empty override never weakens the search.
  queryOverride?: string,
): Promise<Array<Omit<
  NormalizedListing,
  | "estimatedTax"
  | "preTaxTotal"
  | "estimatedLandedCost"
  | "sellerTrustScore"
  | "evidenceCompletenessScore"
  | "safetyScore"
  | "valueScore"
  | "eligible"
  | "exclusionReasons"
>>> {
  const token = await getEbayToken(fetcher);
  const endpoint = new URL(`${EBAY_API}/buy/browse/v1/item_summary/search`);
  const query = queryOverride?.trim() || `${card.name} ${card.setName} ${card.cardNumber}`;
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("limit", "50");
  // Best Match (no price sort): price-ascending floods the top with cheap novelty
  // replicas that name the card. Our deterministic ranking sorts on price after
  // identity/eligibility filtering instead.
  //
  // Only FIXED_PRICE: eBay's Browse API rejects `priceCurrency` unless it is paired
  // with a `price` range filter, returning HTTP 400 and zero listings. The marketplace
  // is already scoped to a single country via X-EBAY-C-MARKETPLACE-ID, so currency is
  // enforced below by dropping any non-USD summaries instead of via the request filter.
  endpoint.searchParams.set("filter", "buyingOptions:{FIXED_PRICE}");
  const response = await fetchWithTimeout(endpoint, {
    headers: ebayHeaders(token, buyer),
    cache: "no-store",
  }, fetcher);
  if (!response.ok) throw new Error(`eBay active-listing search failed with ${response.status}.`);
  const result = ebaySearchSchema.parse(await response.json());
  return result.itemSummaries
    .filter((item) => item.price.currency === "USD")
    .map((item) => toNormalizedSeed(item, card));
}

function toSourceListing(item: z.infer<typeof ebayItemSchema>, fallbackUrl: string): SourceListing {
  const description = item.shortDescription ?? "";
  const photoCount = 1 + (item.additionalImages?.length ?? item.thumbnailImages?.length ?? 0);
  const evidence = evidenceFromText(`${item.title} ${description}`, photoCount);
  return {
    marketplace: "eBay",
    url: item.itemWebUrl ?? item.itemAffiliateWebUrl ?? fallbackUrl,
    title: item.title,
    description,
    price: toUsd(item.price),
    shipping: cheapestUsdShipping(item.shippingOptions),
    claimedCondition: normalizeCondition(item.condition),
    active: !item.itemEndDate || new Date(item.itemEndDate).getTime() > Date.now(),
    seller: {
      feedbackPercentage: numberOrNull(item.seller?.feedbackPercentage),
      feedbackCount: item.seller?.feedbackScore ?? null,
      returnsAccepted: item.returnTerms?.returnsAccepted ?? null,
      topRated: item.topRatedBuyingExperience ?? null,
      buyerProtection: true,
    },
    evidence,
  };
}

function toNormalizedSeed(item: z.infer<typeof ebayItemSchema>, card: CardIdentityCandidate) {
  const source = toSourceListing(item, item.itemWebUrl ?? item.itemAffiliateWebUrl ?? "https://www.ebay.com");
  const title = item.title;
  const exactNumber = normalizeText(title).includes(normalizeText(card.cardNumber));
  const nameMatch = normalizeText(title).includes(normalizeText(card.name));
  const setMatch = normalizeText(title).includes(normalizeText(card.setName));

  return {
    id: `ebay-${item.itemId}`,
    marketplace: "eBay" as const,
    url: source.url || null,
    title,
    cardId: card.id,
    matchConfidence: exactNumber && nameMatch ? "high" as const : nameMatch && setMatch ? "medium" as const : "low" as const,
    matchReasons: [
      exactNumber ? "Collector number matches." : "Collector number is not explicit.",
      setMatch ? "Set name matches." : "Set name is not explicit.",
    ],
    active: source.active,
    raw: !/\b(psa|bgs|cgc|sgc)\s*\d|\bslab(?:bed)?\b/i.test(title),
    currency: "USD" as const,
    price: source.price ?? 0,
    shipping: source.shipping,
    claimedCondition: source.claimedCondition,
    imageUrl: item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl ?? null,
    seller: source.seller,
    evidence: source.evidence,
    observedAt: new Date().toISOString(),
    demo: false,
  };
}

async function getEbayToken(fetcher: typeof fetch) {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new EbayUnavailableError("eBay credentials are not configured.");
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetchWithTimeout(new URL(`${EBAY_API}/identity/v1/oauth2/token`), {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
    cache: "no-store",
  }, fetcher);
  if (!response.ok) throw new EbayUnavailableError(`eBay authentication failed with ${response.status}.`);
  const parsed = ebayTokenSchema.parse(await response.json());
  const ttlMs = (parsed.expires_in ?? 7200) * 1000;
  cachedToken = { token: parsed.access_token, expiresAt: Date.now() + Math.max(ttlMs - TOKEN_EXPIRY_MARGIN_MS, 0) };
  return parsed.access_token;
}

function ebayHeaders(token: string, buyer: BuyerContext) {
  const marketplace = process.env.EBAY_MARKETPLACE_ID || "EBAY_US";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": marketplace,
  };
  if (buyer.postalCode) {
    headers["X-EBAY-C-ENDUSERCTX"] = `contextualLocation=country%3DUS%2Czip%3D${encodeURIComponent(buyer.postalCode)}`;
  }
  return headers;
}

async function fetchWithTimeout(
  url: URL,
  init: RequestInit,
  fetcher: typeof fetch,
  timeoutMs = 9000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function evidenceFromText(text: string, photoCount: number) {
  // For an auto-fetched eBay listing we can verify the photo COUNT and whether the
  // collector number is in the title — but not what the photos actually show. We no
  // longer infer front/back, corner, or surface coverage from the seller's prose:
  // that guesswork was routinely wrong (every holo listing says "holo", etc.). Those
  // read as not-verified; the buyer reviews the photos via the listing link. Photo
  // count is the honest evidence signal, so "best documented" means "most photos".
  const identityExplicit = /\b\d{1,3}\/\d{1,3}\b/.test(text.toLowerCase());
  return {
    photoCount,
    frontBackExplicit: false,
    closeupsExplicit: false,
    surfaceExplicit: false,
    identityExplicit,
    substantiveConditionNotes: false,
    missing: ["Photo content isn't verified from the listing text — open the listing to review the photos."],
  };
}

function normalizeCondition(value: string | undefined): SourceListing["claimedCondition"] {
  const condition = value?.toLowerCase() ?? "";
  if (condition.includes("near mint") || condition === "new") return "Near Mint";
  if (condition.includes("light")) return "Lightly Played";
  if (condition.includes("moderate")) return "Moderately Played";
  if (condition.includes("heavy")) return "Heavily Played";
  if (condition.includes("damage")) return "Damaged";
  return "Unknown";
}

function toUsd(amount: z.infer<typeof ebayAmountSchema>) {
  if (amount.currency !== "USD") return 0;
  const value = Number(amount.value);
  return Number.isFinite(value) ? value : 0;
}

// eBay returns shipping options in no guaranteed order, so taking the first one can
// quote an expedited rate and overstate the landed cost (a real cause of the price
// not matching the listing page). Use the cheapest USD option; absent/free shipping
// is 0. (Calculated shipping that depends on the buyer's address simply isn't in the
// summary, so it reads as 0 here — the item-price line still reconciles with eBay.)
function cheapestUsdShipping(
  options: z.infer<typeof ebayItemSchema>["shippingOptions"],
): number {
  const costs = (options ?? [])
    .map((option) => option.shippingCost)
    .filter((cost): cost is z.infer<typeof ebayAmountSchema> => cost !== undefined)
    .filter((cost) => cost.currency === "USD")
    .map((cost) => Number(cost.value))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return costs.length ? Math.min(...costs) : 0;
}

function numberOrNull(value: string | undefined) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
