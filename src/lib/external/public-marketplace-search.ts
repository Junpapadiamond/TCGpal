import type {
  BuyerContext,
  CardIdentityCandidate,
  ListingSeed,
  Marketplace,
} from "@/lib/schemas";
import {
  detectMarketplaceFromUrl,
  isFetchableListingUrl,
  isPathAllowedByRobots,
  UniversalListingBlockedError,
} from "@/lib/external/universal-listing";

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1_500_000;
const USER_AGENT = "TCGpalAgent/0.1 (user-initiated public marketplace search; +https://tcgpal.vercel.app)";

export type PublicMarketplaceSearchTarget = {
  platform: Extract<Marketplace, "Facebook" | "Reddit" | "Mercari" | "Whatnot">;
  searchUrl: (query: string, buyer: BuyerContext) => string;
};

export const publicMarketplaceSearchTargets: PublicMarketplaceSearchTarget[] = [
  {
    platform: "Mercari",
    searchUrl: (query) => `https://www.mercari.com/search/?keyword=${encodeURIComponent(query)}`,
  },
  {
    platform: "Whatnot",
    searchUrl: (query) => `https://www.whatnot.com/search?query=${encodeURIComponent(query)}`,
  },
  {
    platform: "Reddit",
    searchUrl: (query) => `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&type=link`,
  },
  {
    platform: "Facebook",
    searchUrl: (query) => `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(query)}`,
  },
];

export type PublicMarketplaceSearchResult = {
  seeds: ListingSeed[];
  searchUrl: string;
};

export async function searchPublicMarketplace(
  target: PublicMarketplaceSearchTarget,
  card: CardIdentityCandidate,
  buyer: BuyerContext,
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<PublicMarketplaceSearchResult> {
  const query = buildMarketplaceQuery(card);
  const searchUrl = target.searchUrl(query, buyer);
  const html = await fetchPublicSearchHtml(searchUrl, fetcher);
  const hits = extractSearchHits(html, new URL(searchUrl), target.platform);
  const observedAt = now().toISOString();
  const seeds = hits
    .map((hit, index) => hitToSeed(hit, index, target.platform, card, observedAt))
    .filter((seed): seed is ListingSeed => seed !== null)
    .slice(0, 12);

  return { seeds, searchUrl };
}

export function buildManualMarketplaceReferenceLinks(card: CardIdentityCandidate, buyer: BuyerContext) {
  const query = buildMarketplaceQuery(card);
  const searchLinks = publicMarketplaceSearchTargets.map((target) => ({
    label: `${target.platform} search`,
    url: target.searchUrl(query, buyer),
  }));

  return [
    {
      label: "eBay active",
      url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_BIN=1`,
    },
    {
      label: "eBay sold",
      url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`,
    },
    {
      label: "TCGplayer search",
      url: `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${encodeURIComponent(query)}&view=grid`,
    },
    ...searchLinks,
    ...(buyer.postalCode
      ? [{
        label: "Local shops",
        url: `https://www.google.com/maps/search/${encodeURIComponent(`Pokemon card shop near ${buyer.postalCode}`)}`,
      }]
      : []),
  ];
}

function buildMarketplaceQuery(card: Pick<CardIdentityCandidate, "name" | "setName" | "cardNumber">) {
  return [card.name, card.cardNumber, card.setName, "pokemon card"]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

async function fetchPublicSearchHtml(rawUrl: string, fetcher: typeof fetch) {
  const fetchable = isFetchableListingUrl(rawUrl);
  if (!fetchable.ok) throw new UniversalListingBlockedError(fetchable.reason ?? "Search URL cannot be fetched.");

  const url = new URL(rawUrl);
  if (!(await isPathAllowedByRobots(url, fetcher))) {
    throw new UniversalListingBlockedError(`${detectMarketplaceFromUrl(rawUrl)} robots.txt disallows this public search page.`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`Public search page responded with ${response.status}.`);
  const finalUrl = response.url ? new URL(response.url) : url;
  const finalCheck = isFetchableListingUrl(finalUrl.toString());
  if (!finalCheck.ok) throw new UniversalListingBlockedError(finalCheck.reason ?? "Search redirected to a blocked host.");
  return (await response.text()).slice(0, MAX_HTML_BYTES);
}

type SearchHit = {
  url: string;
  title: string;
  price: number | null;
  imageUrl: string | null;
};

function extractSearchHits(html: string, baseUrl: URL, platform: Marketplace): SearchHit[] {
  const hits: SearchHit[] = [];

  for (const block of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    collectJsonHits(safeJsonParse(block[1]), baseUrl, platform, hits);
  }

  for (const block of html.matchAll(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    collectJsonHits(safeJsonParse(block[1]), baseUrl, platform, hits);
  }

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attribute(match[1], "href");
    const title = stripHtml(match[2]);
    if (!href || title.length < 8) continue;
    const url = normalizeCandidateUrl(href, baseUrl, platform);
    if (!url) continue;
    const windowStart = Math.max(0, match.index - 400);
    const windowEnd = Math.min(html.length, match.index + match[0].length + 400);
    hits.push({
      url,
      title,
      price: extractPrice(`${title} ${stripHtml(html.slice(windowStart, windowEnd))}`),
      imageUrl: null,
    });
  }

  return dedupeHits(hits);
}

function collectJsonHits(node: unknown, baseUrl: URL, platform: Marketplace, hits: SearchHit[]) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonHits(item, baseUrl, platform, hits);
    return;
  }
  if (typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  const item = typeof record.item === "object" && record.item ? record.item as Record<string, unknown> : record;
  const urlValue = firstString(item.url, item.href, record.url);
  const title = firstString(item.name, item.title, record.name, record.title);
  const url = urlValue ? normalizeCandidateUrl(urlValue, baseUrl, platform) : null;
  if (url && title) {
    hits.push({
      url,
      title,
      price: priceFromJson(item) ?? priceFromJson(record),
      imageUrl: imageFromJson(item.image),
    });
  }

  for (const value of Object.values(record)) collectJsonHits(value, baseUrl, platform, hits);
}

function hitToSeed(
  hit: SearchHit,
  index: number,
  marketplace: Marketplace,
  card: CardIdentityCandidate,
  observedAt: string,
): ListingSeed | null {
  if (hit.price === null) return null;

  const titleText = normalizeWords(hit.title);
  const cardName = normalizeWords(card.name);
  const nameOverlapScore = tokenOverlap(titleText, cardName);
  const number = collectorNumberParts(card.cardNumber).number;
  const titleNumber = collectorNumberParts(extractCollectorNumber(hit.title)).number;
  const hasNumber = Boolean(number && titleNumber && number === titleNumber);
  const setToken = normalizeWords(card.setName);
  const hasSetToken = Boolean(setToken && tokenOverlap(titleText, setToken) >= 0.4);
  const nameLooksRight = nameOverlapScore >= 0.7 || normalizeText(hit.title).includes(normalizeText(card.name));

  if (!nameLooksRight || (!hasNumber && !hasSetToken)) return null;

  return {
    id: `public-${slug(marketplace)}-${stableHash(hit.url)}-${index}`,
    marketplace,
    url: hit.url,
    title: hit.title.slice(0, 300),
    cardId: card.id,
    matchConfidence: hasNumber ? "high" : "medium",
    matchReasons: [
      hasNumber
        ? "Public search result title includes the confirmed collector number."
        : "Public search result title matches the card name and set, but needs buyer review.",
    ],
    active: true,
    raw: !/\b(psa|bgs|cgc|sgc)\s*\d|\bslab(?:bed)?\b/i.test(hit.title),
    currency: "USD",
    price: hit.price,
    shipping: null,
    claimedCondition: "Unknown",
    imageUrl: hit.imageUrl,
    seller: {
      feedbackPercentage: null,
      feedbackCount: null,
      returnsAccepted: null,
      topRated: null,
      buyerProtection: null,
    },
    evidence: {
      photoCount: hit.imageUrl ? 1 : 0,
      frontBackExplicit: false,
      closeupsExplicit: false,
      surfaceExplicit: false,
      identityExplicit: hasNumber,
      substantiveConditionNotes: false,
      missing: [
        "Public search result only; open the listing to review item-specific photos.",
        "Seller track record was not available from the search result.",
        "Shipping and tax were not available from the search result.",
      ],
    },
    observedAt,
    demo: false,
    userSupplied: false,
  };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(decodeEntities(value));
  } catch {
    return null;
  }
}

function normalizeCandidateUrl(value: string, baseUrl: URL, platform: Marketplace) {
  try {
    const url = new URL(decodeEntities(value), baseUrl);
    if (url.protocol !== "https:") return null;
    if (detectMarketplaceFromUrl(url.toString()) !== platform) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function attribute(attrs: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = attrs.match(new RegExp(`${escaped}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? decodeEntities(match[1]) : null;
}

function priceFromJson(record: Record<string, unknown>): number | null {
  const direct = numberish(record.price)
    ?? numberish(record.amount)
    ?? numberish(record.currentPrice)
    ?? numberish(record.value);
  if (direct !== null) return direct;

  const offers = record.offers;
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      if (typeof offer === "object" && offer) {
        const price = priceFromJson(offer as Record<string, unknown>);
        if (price !== null) return price;
      }
    }
  }
  if (typeof offers === "object" && offers) return priceFromJson(offers as Record<string, unknown>);
  return null;
}

function imageFromJson(value: unknown) {
  if (typeof value === "string" && value.startsWith("https://")) return value;
  if (Array.isArray(value)) return value.find((entry) => typeof entry === "string" && entry.startsWith("https://")) ?? null;
  if (typeof value === "object" && value && "url" in value && typeof value.url === "string" && value.url.startsWith("https://")) return value.url;
  return null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return decodeEntities(value.trim());
  }
  return null;
}

function extractPrice(value: string) {
  const match = value.match(/\$\s*([0-9]{1,5}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/);
  return match ? numberish(match[1]) : null;
}

function numberish(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function dedupeHits(hits: SearchHit[]) {
  return Array.from(new Map(hits.map((hit) => [hit.url, hit])).values());
}

function stripHtml(value: string) {
  return decodeEntities(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'");
}

function collectorNumberParts(value: string) {
  const [rawNumber = "", rawTotal = ""] = value.trim().replace(/\s+/g, "").split("/", 2);
  return {
    number: normalizeCollectorSegment(rawNumber),
    total: normalizeCollectorSegment(rawTotal),
  };
}

function extractCollectorNumber(value: string) {
  return value.match(/\b(?:[A-Za-z]{1,4})?\d{1,3}\s*\/\s*(?:[A-Za-z]{1,4})?\d{1,3}\b/)?.[0] ?? "";
}

function normalizeCollectorSegment(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/\d/.test(normalized)) return "";
  const match = normalized.match(/^([A-Z]*)(\d+)$/);
  return match ? `${match[1]}${Number(match[2])}` : normalized;
}

function normalizeWords(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokenOverlap(left: string, right: string) {
  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const shared = [...rightTokens].filter((token) => leftTokens.has(token)).length;
  return shared / rightTokens.size;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
