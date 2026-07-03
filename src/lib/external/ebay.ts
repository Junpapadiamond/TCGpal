import { z } from "zod";
import type {
  BuyerContext,
  CardIdentityCandidate,
  ListingSeed,
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
  queryTemplate?: string,
): Promise<ListingSeed[]> {
  const token = await getEbayToken(fetcher);
  const endpoint = new URL(`${EBAY_API}/buy/browse/v1/item_summary/search`);
  endpoint.searchParams.set("q", queryTemplate || buildEbayQuery(card));
  endpoint.searchParams.set("limit", "50");
  // Best Match (no price sort): price-ascending floods the top with cheap novelty
  // replicas that name the card. Our deterministic ranking sorts on price after
  // identity/eligibility filtering instead.
  endpoint.searchParams.set("filter", "buyingOptions:{FIXED_PRICE},priceCurrency:USD");
  const response = await fetchWithTimeout(endpoint, {
    headers: ebayHeaders(token, buyer),
    cache: "no-store",
  }, fetcher);
  if (!response.ok) throw new Error(`eBay active-listing search failed with ${response.status}.`);
  const result = ebaySearchSchema.parse(await response.json());
  return result.itemSummaries.map((item) => toNormalizedSeed(item, card));
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
    shipping: item.shippingOptions?.[0]?.shippingCost ? toUsd(item.shippingOptions[0].shippingCost) : 0,
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

// The crosswalk's eBay identifier is a query template, not a numeric id: the
// platform-native way to address a card on eBay is a Best-Match search string.
export function buildEbayQuery(card: Pick<CardIdentityCandidate, "name" | "setName" | "cardNumber">) {
  return `${card.name} ${card.setName} ${card.cardNumber}`.trim();
}

function toNormalizedSeed(item: z.infer<typeof ebayItemSchema>, card: CardIdentityCandidate): ListingSeed {
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
    userSupplied: false,
  };
}

async function getEbayToken(fetcher: typeof fetch) {
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
  return ebayTokenSchema.parse(await response.json()).access_token;
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
  const normalized = text.toLowerCase();
  const frontBackExplicit = /front.{0,12}back|back.{0,12}front/.test(normalized);
  const closeupsExplicit = /corner|edge|close[- ]?up/.test(normalized);
  const surfaceExplicit = /surface|foil|holo|video|glare/.test(normalized);
  const identityExplicit = /\b\d{1,3}\/\d{1,3}\b/.test(normalized);
  const substantiveConditionNotes = /scratch|whitening|dent|crease|print line|off[- ]?center|clean/.test(normalized);
  const missing = [
    !frontBackExplicit ? "Front and back views are not explicitly described." : "",
    !closeupsExplicit ? "Corner and edge closeups are not explicit." : "",
    !surfaceExplicit ? "Surface evidence is not explicit." : "",
    !substantiveConditionNotes ? "Condition notes are mostly a seller label." : "",
  ].filter(Boolean);
  return {
    photoCount,
    frontBackExplicit,
    closeupsExplicit,
    surfaceExplicit,
    identityExplicit,
    substantiveConditionNotes,
    missing,
  };
}

// eBay trading-card conditions are their own scale ("Ungraded", "Graded",
// "Like New", …). Map what maps cleanly; "Ungraded" carries no condition
// information, so it stays "Unknown" (the UI renders that as "condition not
// stated", never as a seller claim of Unknown).
function normalizeCondition(value: string | undefined): SourceListing["claimedCondition"] {
  const condition = value?.toLowerCase() ?? "";
  if (condition.includes("near mint") || condition === "new" || condition.includes("like new")) return "Near Mint";
  if (condition.includes("light") || condition.includes("excellent")) return "Lightly Played";
  if (condition.includes("moderate") || condition.includes("very good")) return "Moderately Played";
  if (condition.includes("heavy") || condition.includes("acceptable")) return "Heavily Played";
  if (condition.includes("damage")) return "Damaged";
  return "Unknown";
}

function toUsd(amount: z.infer<typeof ebayAmountSchema>) {
  if (amount.currency !== "USD") return 0;
  const value = Number(amount.value);
  return Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: string | undefined) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
