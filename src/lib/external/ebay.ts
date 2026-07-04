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
): Promise<ListingSeed[]> {
  const token = await getEbayToken(fetcher);
  const endpoint = new URL(`${EBAY_API}/buy/browse/v1/item_summary/search`);
  // Recall-first query: name + collector number. Set names are the token real
  // titles most often omit, and Best Match treats extra terms as AND-ish — so
  // including the set silently drops listings that are fine. Set/name/number
  // agreement is verified deterministically per title in assessTitleMatch.
  const query = queryOverride?.trim()
    || [card.name, card.cardNumber || card.setName].filter(Boolean).join(" ").trim();
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

// How confidently a live listing title identifies the confirmed card. Sellers
// write titles loosely — reordered words ("VMAX Umbreon"), zero-padded numbers
// ("004/102"), "#215" without the denominator, set codes instead of set names —
// so this matcher works on normalized tokens rather than literal substrings.
// Exported for direct unit testing; ranking eligibility depends on it (low
// confidence is excluded from the comparison).
export function assessTitleMatch(
  title: string,
  card: Pick<CardIdentityCandidate, "name" | "setName" | "setCode" | "cardNumber">,
): { confidence: "high" | "medium" | "low"; reasons: string[] } {
  const squashedTitle = normalizeText(title);
  const titleTokens = new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(stripLeadingZeros),
  );

  // Name: substring on the squashed strings (handles punctuation/spacing) OR
  // every significant name token present in any order (handles reordering).
  const nameTokens = card.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
  const nameMatch = Boolean(card.name)
    && (squashedTitle.includes(normalizeText(card.name))
      || (nameTokens.length > 0 && nameTokens.every((token) => titleTokens.has(token))));
  // Sellers shorten names ("Luffy" for "Monkey.D.Luffy"). A partial name is
  // enough when the full collector code also matches — the code pins the print.
  const namePartial = nameMatch || nameTokens.some((token) => titleTokens.has(token));

  // Collector number: "full" needs the whole identifier (fraction or prefix
  // code) via an anchored pattern — zero-padding and separator variance are
  // tolerated, but boundaries are enforced so "4/102" never matches inside
  // "14/102". "partial" accepts the bare numerator the way titles write
  // "#215"; a partial hit alone never reaches high confidence.
  const { numerator } = splitCollectorNumber(card.cardNumber);
  const numberPattern = collectorNumberPattern(card.cardNumber);
  const fullNumber = numberPattern !== null && numberPattern.test(title);
  const partialNumber = fullNumber
    || (Boolean(numerator) && titleTokens.has(stripLeadingZeros(numerator)));
  // A bare short numerator ("25") collides across sets for generic names, so
  // it only supports a medium match when it is specific enough (3+ digits) or
  // the set corroborates it.
  const partialStrong = fullNumber
    || (partialNumber && stripLeadingZeros(numerator).replace(/\D/g, "").length >= 3);
  // A title that spells out a DIFFERENT collector number of the same scheme is a
  // different card, however well the name and set line up — a set holds many cards
  // of one character (One Piece "OP01-024" vs "OP01-003"; Pokémon "215/203" vs
  // "44/203"). Only fires when the card's own number is absent from the title, so a
  // correct listing that also mentions another number is never demoted.
  const differentPrint = !fullNumber && titleNamesADifferentCollectorNumber(title, card.cardNumber);

  // Set: full set name or the set code ("Evolving Skies" or "SWSH7").
  const setMatch = (Boolean(card.setName) && squashedTitle.includes(normalizeText(card.setName)))
    || (Boolean(card.setCode) && squashedTitle.includes(normalizeText(card.setCode)));

  const reasons = [
    fullNumber
      ? "Collector number matches."
      : differentPrint
        ? "Title lists a different collector number — likely a different print."
        : partialNumber
          ? "Card number appears without the full collector code."
          : "Collector number is not explicit.",
    nameMatch ? "Card name matches." : namePartial ? "Card name partially matches." : "Card name is not explicit.",
    setMatch ? "Set matches." : "Set is not explicit.",
  ];

  // An explicit, contradicting collector number overrides an otherwise-strong
  // name+set match: it is a different print, so it must not rank as this card.
  if (differentPrint) return { confidence: "low", reasons };
  if (namePartial && fullNumber) return { confidence: "high", reasons };
  if (nameMatch && (partialStrong || setMatch)) return { confidence: "medium", reasons };
  if (fullNumber && setMatch) return { confidence: "medium", reasons };
  return { confidence: "low", reasons };
}

// Does the title spell out a collector number of the card's OWN scheme that isn't
// the card's number? Used only when the card's number is absent from the title, to
// catch a same-name, same-set sibling ("OP01-003" in an "OP01-024" search). Kept to
// the two schemes with distinctive shapes — set codes ("OP01-024") and fractions
// ("215/203") — so number-less titles and other formats are never falsely demoted.
function titleNamesADifferentCollectorNumber(title: string, cardNumber: string): boolean {
  const trimmed = cardNumber.trim();
  if (/^[A-Za-z]{1,4}\d{0,2}-\d{1,4}$/.test(trimmed)) {
    return /\b[A-Za-z]{1,4}\d{0,2}-\d{1,4}\b/i.test(title);
  }
  const compact = trimmed.replace(/\s+/g, "");
  if (/^[A-Za-z]{0,4}\d{1,3}\/[A-Za-z]{0,4}\d{1,3}$/.test(compact)) {
    return /\b[A-Za-z]{0,4}\d{1,3}\s*\/\s*[A-Za-z]{0,4}\d{2,3}\b/i.test(title);
  }
  return false;
}

function splitCollectorNumber(cardNumber: string) {
  const fraction = cardNumber.match(/^\s*([A-Za-z]{0,4}\d{1,3})\s*\/\s*([A-Za-z]{0,4}\d{1,3})\s*$/);
  if (fraction) return { numerator: fraction[1].toLowerCase(), denominator: fraction[2].toLowerCase() };
  return { numerator: normalizeText(cardNumber), denominator: "" };
}

// Builds an anchored, padding/separator-tolerant pattern for the catalog's
// collector number. Fractions ("215/203", "TG23/TG30") keep the slash;
// prefix codes ("SWSH144", "OP01-003") allow optional hyphens/spaces between
// their letter and digit runs. Lookarounds stop partial-digit matches
// ("4/102" inside "14/102", "SWSH14" inside "SWSH144").
function collectorNumberPattern(cardNumber: string): RegExp | null {
  const trimmed = cardNumber.trim().toLowerCase();
  if (!trimmed) return null;
  const fraction = trimmed.match(/^([a-z]{0,4})0*(\d{1,3})\s*\/\s*([a-z]{0,4})0*(\d{1,3})$/);
  if (fraction) {
    const [, prefixA, digitsA, prefixB, digitsB] = fraction;
    return new RegExp(
      `(?<![a-z0-9])${prefixA}[-\\s]*0*${digitsA}\\s*/\\s*${prefixB}[-\\s]*0*${digitsB}(?![0-9])`,
      "i",
    );
  }
  const runs = trimmed.match(/[a-z]+|\d+/g);
  if (!runs) return null;
  return new RegExp(`(?<![a-z0-9])${runs.join("[-\\s]*")}(?![0-9])`, "i");
}

function stripLeadingZeros(token: string) {
  return /^\d+$/.test(token) ? token.replace(/^0+(?=\d)/, "") : token;
}

function toNormalizedSeed(item: z.infer<typeof ebayItemSchema>, card: CardIdentityCandidate) {
  const source = toSourceListing(item, item.itemWebUrl ?? item.itemAffiliateWebUrl ?? "https://www.ebay.com");
  const title = item.title;
  const match = assessTitleMatch(title, card);

  return {
    id: `ebay-${item.itemId}`,
    marketplace: "eBay" as const,
    url: source.url || null,
    title,
    cardId: card.id,
    matchConfidence: match.confidence,
    matchReasons: match.reasons,
    active: source.active,
    raw: !/\b(psa|bgs|cgc|sgc|ace)[\s:._#-]*\d|\bgraded\s*\d|\bslab(?:bed)?\b/i.test(title),
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
