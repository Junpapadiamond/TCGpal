import { z } from "zod";
import { deriveVariantIntent, isOnePieceCardKey, type VariantIntent } from "@/lib/comparison/ranking";
import { assessPrintFidelity } from "@/lib/comparison/print-fidelity";
import type {
  BuyerContext,
  CardIdentityCandidate,
  ListingSeed,
  SourceListing,
} from "@/lib/schemas";

// Query token appended when the confirmed One Piece print is a special class,
// so Best Match surfaces the right print instead of the cheaper base copies.
const VARIANT_QUERY_TOKENS: Partial<Record<VariantIntent, string>> = {
  sp: "SP",
  manga: "manga",
  treasure: "treasure rare",
  alt: "alt art",
};

function researchedPrintQueryToken(card: CardIdentityCandidate): string | null {
  if (card.treatments?.includes("gold")) return "gold";
  if (card.treatments?.includes("silver")) return "silver";
  if (card.treatments?.includes("red") && card.artworkClass === "super_alternate") return "red super alt";
  if (card.artworkClass === "manga") return "manga";
  if (card.artworkClass === "wanted_poster") return "wanted poster";
  if (card.artworkClass === "super_alternate") return "super alt";
  const aliases = card.collectorAliases ?? [];
  for (const token of [
    "tournament winner",
    "tournament pack",
    "treasure cup",
    "regional champion",
    "regional finalist",
    "regional participation",
    "premium collection",
    "championship",
    "anniversary",
    "promo",
  ]) {
    if (aliases.some((alias) => alias.toLowerCase().includes(token))) return token;
  }
  return null;
}

const ebayAmountSchema = z.object({
  value: z.string(),
  currency: z.string(),
});

const ebaySellerSchema = z.object({
  feedbackPercentage: z.string().optional(),
  feedbackScore: z.number().optional(),
  subRatings: z.unknown().optional(),
  detailedSellerRatings: z.unknown().optional(),
  sellerSubRatings: z.unknown().optional(),
}).passthrough();

const ebayImageSchema = z.object({ imageUrl: z.string().url() });

const ebayLocalizedAspectSchema = z.object({
  name: z.string(),
  value: z.string(),
}).passthrough();

const ebayItemSchema = z.object({
  itemId: z.string(),
  epid: z.string().optional(),
  itemWebUrl: z.string().url().optional(),
  itemAffiliateWebUrl: z.string().url().optional(),
  title: z.string(),
  shortDescription: z.string().optional(),
  price: ebayAmountSchema,
  condition: z.string().optional(),
  conditionDescriptors: z.array(z.object({
    name: z.string().optional(),
    values: z.array(z.object({
      content: z.string().optional(),
      additionalInfo: z.array(z.string()).optional(),
    }).passthrough()).optional(),
  }).passthrough()).optional(),
  localizedAspects: z.array(z.object({
    name: z.string(),
    value: z.string(),
  }).passthrough()).optional(),
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

const ebayCatalogAspectSchema = z.object({
  name: z.string(),
  value: z.string().optional(),
  values: z.array(z.string()).optional(),
}).passthrough();

const ebayCatalogProductSchema = z.object({
  epid: z.string().optional(),
  title: z.string().optional(),
  localizedAspects: z.array(ebayLocalizedAspectSchema).optional(),
  aspects: z.array(ebayCatalogAspectSchema).optional(),
  aspectGroups: z.array(z.object({
    localizedAspects: z.array(ebayLocalizedAspectSchema).optional(),
    aspects: z.array(ebayCatalogAspectSchema).optional(),
  }).passthrough()).optional(),
}).passthrough();

const ebayCatalogSearchSchema = z.object({
  productSummaries: z.array(ebayCatalogProductSchema).default([]),
}).passthrough();

const ebayTokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
});

const EBAY_HOSTS = new Set(["ebay.com", "www.ebay.com", "m.ebay.com"]);
const EBAY_API = "https://api.ebay.com";
const EBAY_CATALOG_API = `${EBAY_API}/commerce/catalog/v1_beta`;

export type EbayLocalizedAspect = {
  name: string;
  value: string;
};

export type EbayProductResolution = {
  epid: string;
  confidence: "high";
  productTitle: string;
  localizedAspects: EbayLocalizedAspect[];
  matchReasons: string[];
};

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
  ebayProduct?: EbayProductResolution | null,
): Promise<ListingSeed[]> {
  const token = await getEbayToken(fetcher);
  // Recall-first query: name + collector number. Set names are the token real
  // titles most often omit, and Best Match treats extra terms as AND-ish — so
  // including the set silently drops listings that are fine. Set/name/number
  // agreement is verified deterministically per title in assessTitleMatch.
  const query = queryOverride?.trim()
    || [card.name, card.cardNumber || card.setName].filter(Boolean).join(" ").trim();

  // One Piece special prints (SP / manga / treasure / alt art) share their card
  // number with the far cheaper base copy, so a plain name+number search surfaces
  // mostly the wrong print and the variant gate then rejects everything. Lead with
  // a variant-marked query and keep the unmarked query as the visible fallback.
  // Applied on top of query overrides too: the crosswalk template is the same
  // deterministic name+number string, and the fallback attempt protects recall.
  const variantToken = isOnePieceCardKey(card.cardNumber, card.id)
    ? researchedPrintQueryToken(card) ?? VARIANT_QUERY_TOKENS[deriveVariantIntent(card)] ?? null
    : null;
  const exactPrintToken = isOnePieceCardKey(card.cardNumber, card.id)
    ? card.id.match(/_([a-z]\d+)$/i)?.[1]?.toUpperCase() ?? null
    : null;

  const attempts = [
    ...(ebayProduct?.epid
      ? [{ mode: "epid" as const, epid: ebayProduct.epid, query: "", fallbackReason: "" }]
      : []),
    ...(variantToken && exactPrintToken
      ? [{
        mode: "keyword" as const,
        query: `${query} ${exactPrintToken} ${variantToken}`,
        fallbackReason: ebayProduct?.epid
          ? `eBay product-ID search returned no USD candidates; broadened to the exact-print keyword query.`
          : "",
      }]
      : []),
    ...(variantToken
      ? [{
        mode: "keyword" as const,
        query: `${query} ${variantToken}`,
        fallbackReason: ebayProduct?.epid
          ? `eBay product-ID search for ePID ${ebayProduct.epid} returned no USD candidates; broadened to the variant-marked keyword query.`
          : "",
      }]
      : []),
    {
      mode: "keyword" as const,
      query,
      fallbackReason: variantToken
        ? `eBay search for "${query} ${variantToken}" returned no USD candidates; broadened to the plain card query.`
        : ebayProduct?.epid
          ? `eBay product-ID search for ePID ${ebayProduct.epid} returned no USD candidates; broadened to keyword fallback.`
          : "",
    },
  ];

  let summaries: z.infer<typeof ebayItemSchema>[] = [];
  let searchNote = "";
  for (const [index, attempt] of attempts.entries()) {
    const finalAttempt = index === attempts.length - 1;
    const endpoint = buildEbaySearchEndpoint(attempt);
    const response = await fetchWithTimeout(endpoint, {
      headers: ebayHeaders(token, buyer),
      cache: "no-store",
    }, fetcher);
    if (!response.ok) {
      if (!finalAttempt) {
        searchNote = attempt.mode === "epid"
          ? `eBay product-ID search for ePID ${attempt.epid} failed with ${response.status}; broadened to keyword fallback.`
          : `eBay search for "${attempt.query}" failed with ${response.status}; broadened to the plain card query.`;
        continue;
      }
      throw new Error(`eBay active-listing search failed with ${response.status}.`);
    }
    const result = ebaySearchSchema.parse(await response.json());
    summaries = result.itemSummaries.filter((item) => item.price.currency === "USD");
    if (!finalAttempt && summaries.length > 0) {
      const nonMismatches = summaries.filter((item) => assessPrintFidelity({
        card,
        matchText: item.title,
        listingPrice: Number(item.price.value),
        exactMarketAnchor: null,
      }).match !== "mismatch");
      if (nonMismatches.length === 0) {
        continue;
      }
      summaries = nonMismatches;
    }
    searchNote = attempt.mode === "epid"
      ? `Searched eBay by product ID ePID ${attempt.epid}.`
      : attempt.fallbackReason || (variantToken && !finalAttempt
        ? `Searched eBay with the variant-marked query "${attempt.query}".`
        : "Searched eBay by keyword fallback.");
    if (summaries.length > 0 || finalAttempt) break;
  }

  // Browse search summaries usually say only "Ungraded". The item endpoint
  // carries eBay's structured Card Condition descriptor (NM/LP/MP/HP/Damaged).
  // Enrich a bounded exact-match shortlist in parallel so condition is a real
  // deterministic input without turning the search into an unbounded crawl.
  const detailTargets = summaries
    .filter((item) => {
      const match = assessTitleMatch(item.title, card);
      return match.confidence !== "low"
        && !/\b(psa|bgs|cgc|sgc|ace)[\s:._#-]*\d|\bgraded\s*\d|\bslab(?:bed)?\b/i.test(item.title);
    })
    .slice(0, 12);
  const details = await Promise.all(detailTargets.map(async (item) => {
    try {
      return await getEbayItemDetail(item.itemId, token, buyer, fetcher);
    } catch {
      return null;
    }
  }));
  const detailById = new Map(
    details.filter((item): item is z.infer<typeof ebayItemSchema> => item !== null)
      .map((item) => [item.itemId, item]),
  );
  return summaries.map((item) => toNormalizedSeed(detailById.get(item.itemId) ?? item, card, searchNote));
}

function buildEbaySearchEndpoint(attempt:
  | { mode: "epid"; epid: string }
  | { mode: "keyword"; query: string }
) {
  const endpoint = new URL(`${EBAY_API}/buy/browse/v1/item_summary/search`);
  if (attempt.mode === "epid") {
    endpoint.searchParams.set("epid", attempt.epid);
  } else {
    endpoint.searchParams.set("q", attempt.query);
  }
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
  return endpoint;
}

export async function resolveEbayProductForCard(
  card: CardIdentityCandidate,
  buyer: BuyerContext,
  fetcher: typeof fetch = fetch,
): Promise<EbayProductResolution | null> {
  const token = await getEbayToken(fetcher);
  const endpoint = new URL(`${EBAY_CATALOG_API}/product_summary/search`);
  endpoint.searchParams.set("q", [card.name, card.cardNumber || card.setName].filter(Boolean).join(" ").trim());
  endpoint.searchParams.set("limit", "10");

  const response = await fetchWithTimeout(endpoint, {
    headers: ebayHeaders(token, buyer),
    cache: "no-store",
  }, fetcher);
  if (!response.ok) {
    return null;
  }

  const result = ebayCatalogSearchSchema.parse(await response.json());
  if (result.productSummaries.length === 0) {
    return null;
  }
  const matches = result.productSummaries
    .flatMap((product) => {
      const epid = product.epid?.trim();
      if (!epid) return [];
      const localizedAspects = extractCatalogAspects(product);
      const productTitle = product.title?.trim() || "";
      const aspectText = localizedAspects.flatMap((aspect) => [aspect.name, aspect.value]).join(" ");
      const searchableText = [productTitle, aspectText].filter(Boolean).join(" ");
      const numberPattern = collectorNumberPattern(card.cardNumber);
      if (!aspectText || !numberPattern?.test(aspectText)) return [];
      const match = assessTitleMatch(searchableText, card);
      if (match.confidence !== "high") return [];
      const print = assessPrintFidelity({
        card,
        matchText: searchableText,
        listingPrice: 0,
        exactMarketAnchor: null,
      });
      if (print.match !== "exact" && print.match !== "compatible") return [];
      return [{
        epid,
        confidence: "high" as const,
        productTitle,
        localizedAspects,
        matchReasons: [
          "eBay Catalog product matched the confirmed card identity.",
          ...match.reasons,
        ],
      }];
    });

  const uniqueByEpid = new Map(matches.map((match) => [match.epid, match]));
  return uniqueByEpid.size === 1 ? [...uniqueByEpid.values()][0] : null;
}

function extractCatalogAspects(product: z.infer<typeof ebayCatalogProductSchema>): EbayLocalizedAspect[] {
  const direct = product.localizedAspects ?? [];
  const fromAspects = normalizeCatalogAspects(product.aspects ?? []);
  const fromGroups = (product.aspectGroups ?? []).flatMap((group) => [
    ...(group.localizedAspects ?? []),
    ...normalizeCatalogAspects(group.aspects ?? []),
  ]);
  const deduped = new Map<string, EbayLocalizedAspect>();
  for (const aspect of [...direct, ...fromAspects, ...fromGroups]) {
    const name = aspect.name.trim();
    const value = aspect.value.trim();
    if (name && value) deduped.set(`${name.toLowerCase()}:${value.toLowerCase()}`, { name, value });
  }
  return [...deduped.values()];
}

function normalizeCatalogAspects(aspects: z.infer<typeof ebayCatalogAspectSchema>[]): EbayLocalizedAspect[] {
  return aspects.flatMap((aspect) => {
    const values = aspect.values ?? (aspect.value ? [aspect.value] : []);
    return values.flatMap((value) => value ? [{ name: aspect.name, value }] : []);
  });
}

function toSourceListing(item: z.infer<typeof ebayItemSchema>, fallbackUrl: string): SourceListing {
  const descriptorDetails = (item.conditionDescriptors ?? [])
    .flatMap((descriptor) => descriptor.values ?? [])
    .flatMap((value) => value.additionalInfo ?? [])
    .filter(Boolean);
  const descriptorText = (item.conditionDescriptors ?? [])
    .flatMap((descriptor) => descriptor.values ?? [])
    .flatMap((value) => [value.content ?? "", ...(value.additionalInfo ?? [])])
    .filter(Boolean)
    .join(". ");
  const description = [item.shortDescription ?? "", descriptorText].filter(Boolean).join(". ");
  const photoCount = 1 + (item.additionalImages?.length ?? item.thumbnailImages?.length ?? 0);
  const evidence = evidenceFromText(`${item.title} ${description}`, photoCount, descriptorDetails.length > 0);
  return {
    marketplace: "eBay",
    url: item.itemWebUrl ?? item.itemAffiliateWebUrl ?? fallbackUrl,
    title: item.title,
    description,
    price: toUsd(item.price),
    shipping: cheapestUsdShipping(item.shippingOptions),
    claimedCondition: normalizeCondition(`${descriptorText} ${item.condition ?? ""} ${item.title}`),
    active: !item.itemEndDate || new Date(item.itemEndDate).getTime() > Date.now(),
    seller: {
      feedbackPercentage: numberOrNull(item.seller?.feedbackPercentage),
      feedbackCount: item.seller?.feedbackScore ?? null,
      returnsAccepted: item.returnTerms?.returnsAccepted ?? null,
      topRated: item.topRatedBuyingExperience ?? null,
      buyerProtection: true,
      subRatings: normalizeEbaySellerSubRatings(item.seller),
    },
    evidence,
  };
}

async function getEbayItemDetail(
  itemId: string,
  token: string,
  buyer: BuyerContext,
  fetcher: typeof fetch,
) {
  const endpoint = new URL(`${EBAY_API}/buy/browse/v1/item/${encodeURIComponent(itemId)}`);
  const response = await fetchWithTimeout(endpoint, {
    headers: ebayHeaders(token, buyer),
    cache: "no-store",
  }, fetcher);
  if (!response.ok) throw new Error(`eBay item detail failed with ${response.status}.`);
  return ebayItemSchema.parse(await response.json());
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
// schemes with distinctive shapes - set codes, promo codes, and fractions - so
// number-less titles and other formats are never falsely demoted.
function titleNamesADifferentCollectorNumber(title: string, cardNumber: string): boolean {
  const trimmed = cardNumber.trim();
  if (/^[A-Za-z]{1,4}\d{0,2}-\d{1,4}$/.test(trimmed)) {
    return /\b[A-Za-z]{1,4}\d{0,2}-\d{1,4}\b/i.test(title);
  }
  const promoCode = trimmed.match(/^([A-Za-z]{1,6})[-\s]*0*(\d{1,4})$/);
  if (promoCode) {
    const [, prefix, ownDigits] = promoCode;
    const titleCode = title.match(new RegExp(`(?<![a-z0-9])${escapeRegExp(prefix)}[-\\s]*0*(\\d{1,4})(?![0-9])`, "i"));
    return Boolean(titleCode && stripLeadingZeros(titleCode[1]) !== stripLeadingZeros(ownDigits));
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// eBay's structured item specifics (Parallel/Variant, Rarity, Features, ...)
// frequently name the exact print even when the seller's own title is plain —
// real listings vary wildly in title discipline, but category-templated
// specifics are filled in far more consistently. Joined as inert text (never
// displayed) so the deterministic variant/language gates can read it alongside
// the title instead of undercounting real matching supply. Aspect names are
// not hardcoded/allowlisted here — eBay categories use inconsistent naming
// ("Parallel/Variant" vs "Card Rarity" vs "Features"), so every aspect's
// name:value pair is included; the gate patterns are specific enough (require
// "special art", "SP", "treasure rare", explicit language names, ...) that
// unrelated aspect noise cannot falsely trigger them.
function buildMatchAspectText(item: z.infer<typeof ebayItemSchema>): string {
  return (item.localizedAspects ?? [])
    .filter((aspect) => aspect.name && aspect.value)
    .map((aspect) => `${aspect.name}: ${aspect.value}`)
    .join(". ");
}

function toNormalizedSeed(item: z.infer<typeof ebayItemSchema>, card: CardIdentityCandidate, searchNote = "") {
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
    matchReasons: searchNote ? [searchNote, ...match.reasons] : match.reasons,
    active: source.active,
    raw: !/\b(psa|bgs|cgc|sgc|ace)[\s:._#-]*\d|\bgraded\s*\d|\bslab(?:bed)?\b/i.test(title),
    currency: "USD" as const,
    price: source.price ?? 0,
    shipping: source.shipping,
    claimedCondition: source.claimedCondition,
    listingLanguage: item.localizedAspects?.find((aspect) => aspect.name.toLowerCase() === "language")?.value ?? null,
    matchAspectText: buildMatchAspectText(item),
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

function evidenceFromText(text: string, photoCount: number, substantiveConditionNotes = false) {
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
    substantiveConditionNotes,
    missing: ["Photo content isn't verified from the listing text — open the listing to review the photos."],
  };
}

function normalizeCondition(value: string | undefined): SourceListing["claimedCondition"] {
  const condition = value?.toLowerCase() ?? "";
  if (/\b(near[\s-]?mint|nm|mint)\b/.test(condition) || condition.trim() === "new") return "Near Mint";
  if (/\b(light(?:ly)?[\s-]?played|lp)\b/.test(condition)) return "Lightly Played";
  if (/\b(moderate(?:ly)?[\s-]?played|mp)\b/.test(condition)) return "Moderately Played";
  if (/\b(heavy|heavily[\s-]?played|hp)\b/.test(condition)) return "Heavily Played";
  if (/\b(damaged?|crease[ds]?)\b/.test(condition)) return "Damaged";
  return "Unknown";
}

function toUsd(amount: z.infer<typeof ebayAmountSchema>) {
  if (amount.currency !== "USD") return 0;
  const value = Number(amount.value);
  return Number.isFinite(value) ? value : 0;
}

// eBay returns shipping options in no guaranteed order, so taking the first one can
// quote an expedited rate and overstate the landed cost. Use the cheapest explicit
// USD option. Missing data stays unknown; it must never silently become free.
function cheapestUsdShipping(
  options: z.infer<typeof ebayItemSchema>["shippingOptions"],
): number | null {
  const costs = (options ?? [])
    .map((option) => option.shippingCost)
    .filter((cost): cost is z.infer<typeof ebayAmountSchema> => cost !== undefined)
    .filter((cost) => cost.currency === "USD")
    .map((cost) => Number(cost.value))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return costs.length ? Math.min(...costs) : null;
}

function numberOrNull(value: string | undefined) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeEbaySellerSubRatings(seller: z.infer<typeof ebaySellerSchema> | undefined) {
  if (!seller) return null;
  const raw = seller.subRatings ?? seller.detailedSellerRatings ?? seller.sellerSubRatings;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const subRatings = {
    accurateDescription: ratingFromRecord(record, ["accurateDescription", "description", "itemAsDescribed", "item_description"]),
    shippingCost: ratingFromRecord(record, ["shippingCost", "reasonableShippingCost", "shipping_cost"]),
    shippingSpeed: ratingFromRecord(record, ["shippingSpeed", "shippingTime", "shipping_speed"]),
    communication: ratingFromRecord(record, ["communication", "sellerCommunication", "seller_communication"]),
  };
  return Object.values(subRatings).some((value) => value !== null) ? subRatings : null;
}

function ratingFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(number)) return Math.max(0, Math.min(5, number));
  }
  return null;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
