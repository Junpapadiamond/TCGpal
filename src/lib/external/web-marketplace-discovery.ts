import { z } from "zod";
import type { CardIdentityCandidate, Marketplace, WebDiscovery, WebDiscoveryProvider } from "@/lib/schemas";

const SEARCH_TIMEOUT_MS = 5000;
const RESULTS_PER_TARGET = 3;
const MAX_DISCOVERY_RESULTS = 30;

type DiscoveryTarget = {
  id: string;
  platformLabel: string;
  marketplace: Marketplace;
  domains: string[];
  localeHint: "us" | "jp";
};

const discoveryTargets: DiscoveryTarget[] = [
  { id: "ebay", platformLabel: "eBay", marketplace: "eBay", domains: ["ebay.com"], localeHint: "us" },
  { id: "mercari-us", platformLabel: "Mercari US", marketplace: "Mercari", domains: ["mercari.com"], localeHint: "us" },
  { id: "facebook", platformLabel: "Facebook Marketplace", marketplace: "Facebook", domains: ["facebook.com"], localeHint: "us" },
  { id: "reddit", platformLabel: "Reddit trades", marketplace: "Reddit", domains: ["reddit.com"], localeHint: "us" },
  { id: "whatnot", platformLabel: "Whatnot", marketplace: "Whatnot", domains: ["whatnot.com"], localeHint: "us" },
  { id: "yahoo-jp", platformLabel: "Yahoo Auctions JP", marketplace: "Yahoo Auctions JP", domains: ["auctions.yahoo.co.jp"], localeHint: "jp" },
  { id: "mercari-jp", platformLabel: "Mercari JP", marketplace: "Mercari", domains: ["jp.mercari.com"], localeHint: "jp" },
  { id: "snkrdunk", platformLabel: "SNKRDUNK", marketplace: "SNKRDUNK", domains: ["snkrdunk.com"], localeHint: "jp" },
  { id: "cardrush-pokemon", platformLabel: "Card Rush Pokemon", marketplace: "Other", domains: ["cardrush-pokemon.jp"], localeHint: "jp" },
  { id: "cardrush-onepiece", platformLabel: "Card Rush One Piece", marketplace: "Other", domains: ["cardrush-op.jp"], localeHint: "jp" },
  { id: "yuyutei", platformLabel: "Yuyutei", marketplace: "Other", domains: ["yuyu-tei.jp"], localeHint: "jp" },
];

const exaResultSchema = z.object({
  title: z.string().nullable().optional(),
  url: z.string(),
});

const exaSearchResponseSchema = z.object({
  results: z.array(exaResultSchema).default([]),
});

const tavilyResultSchema = z.object({
  title: z.string().nullable().optional(),
  url: z.string(),
  content: z.string().nullable().optional(),
});

const tavilySearchResponseSchema = z.object({
  results: z.array(tavilyResultSchema).default([]),
});

type RawDiscovery = {
  target: DiscoveryTarget;
  title: string;
  url: string;
  provider: WebDiscoveryProvider;
};

export function isWebMarketplaceDiscoveryConfigured() {
  if (process.env.WEB_DISCOVERY === "0" || process.env.WEB_DISCOVERY === "false") return false;
  return Boolean(process.env.EXA_API_KEY?.trim() || process.env.TAVILY_API_KEY?.trim());
}

export async function discoverWebMarketplaceLinks({
  card,
  fetcher = fetch,
  now = () => new Date(),
}: {
  card: CardIdentityCandidate;
  fetcher?: typeof fetch;
  now?: () => Date;
}): Promise<{ results: WebDiscovery[]; warnings: string[] }> {
  if (!isWebMarketplaceDiscoveryConfigured()) return { results: [], warnings: ["Web discovery skipped: no Exa or Tavily key is configured."] };

  const warnings: string[] = [];
  const calls = discoveryTargetsForCard(card).flatMap((target) => {
    const query = buildDiscoveryQuery(card, target);
    const providerCalls: Array<Promise<RawDiscovery[]>> = [];
    if (process.env.EXA_API_KEY?.trim()) {
      providerCalls.push(searchExa(target, query, fetcher).catch((error) => {
        warnings.push(`${target.platformLabel} via Exa unavailable: ${errorMessage(error)}`);
        return [];
      }));
    }
    if (process.env.TAVILY_API_KEY?.trim()) {
      providerCalls.push(searchTavily(target, query, fetcher).catch((error) => {
        warnings.push(`${target.platformLabel} via Tavily unavailable: ${errorMessage(error)}`);
        return [];
      }));
    }
    return providerCalls;
  });

  const settled = await Promise.all(calls);
  const discoveredAt = now().toISOString();
  return {
    results: mergeRawDiscoveries(settled.flat(), discoveredAt).slice(0, MAX_DISCOVERY_RESULTS),
    warnings: warnings.slice(0, 8),
  };
}

async function searchExa(target: DiscoveryTarget, query: string, fetcher: typeof fetch): Promise<RawDiscovery[]> {
  const apiKey = process.env.EXA_API_KEY?.trim();
  if (!apiKey) return [];
  const payload = await postJsonWithTimeout(
    "https://api.exa.ai/search",
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: RESULTS_PER_TARGET,
        includeDomains: target.domains,
        contents: { text: false, highlights: false },
      }),
    },
    fetcher,
  );
  const parsed = exaSearchResponseSchema.parse(payload);
  return parsed.results.map((result) => toRawDiscovery(result, target, "exa", query)).filter((result): result is RawDiscovery => result !== null);
}

async function searchTavily(target: DiscoveryTarget, query: string, fetcher: typeof fetch): Promise<RawDiscovery[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return [];
  const payload = await postJsonWithTimeout(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        topic: "general",
        max_results: RESULTS_PER_TARGET,
        include_domains: target.domains,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_favicon: false,
      }),
    },
    fetcher,
  );
  const parsed = tavilySearchResponseSchema.parse(payload);
  return parsed.results.map((result) => toRawDiscovery(result, target, "tavily", query)).filter((result): result is RawDiscovery => result !== null);
}

async function postJsonWithTimeout(url: string, init: RequestInit, fetcher: typeof fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetcher(url, { ...init, cache: "no-store", signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload === "object" && payload && ("message" in payload || "error" in payload)
        ? String((payload as { message?: unknown; error?: unknown }).message ?? (payload as { error?: unknown }).error)
        : `HTTP ${response.status}`;
      throw new Error(message.slice(0, 240));
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function toRawDiscovery(
  result: { title?: string | null; url: string },
  target: DiscoveryTarget,
  provider: WebDiscoveryProvider,
  query: string,
): RawDiscovery | null {
  const url = parsePublicHttpsUrl(result.url);
  if (!url) return null;
  if (!target.domains.some((domain) => hostMatches(url.hostname, domain))) return null;
  if (target.id === "reddit" && !url.pathname.toLowerCase().includes("/r/pkmntcgtrades/")) return null;
  const title = cleanText(result.title ?? url.hostname.replace(/^www\./, ""));
  if (!title) return null;
  if (isGradedOrSlabResult(title)) return null;
  if (!resultSeemsCardRelevant(`${title} ${url.href}`, query)) return null;
  return {
    target,
    title: title.slice(0, 160),
    url: url.href,
    provider,
  };
}

function mergeRawDiscoveries(items: RawDiscovery[], discoveredAt: string): WebDiscovery[] {
  const byUrl = new Map<string, WebDiscovery>();
  for (const item of items) {
    const existing = byUrl.get(item.url);
    if (existing) {
      if (!existing.providers.includes(item.provider)) existing.providers.push(item.provider);
      continue;
    }

    byUrl.set(item.url, {
      id: `web-${hashUrl(item.url)}`,
      marketplace: item.target.marketplace,
      platformLabel: item.target.platformLabel,
      title: item.title,
      url: item.url,
      providers: [item.provider],
      listingLike: looksListingLike(item.url),
      discoveredAt,
      note: "Experimental web discovery only: may be stale, sold, login-gated, region-blocked, or indirectly indexed. Open manually or paste the exact URL back into TCGpal before comparing.",
    });
  }

  return [...byUrl.values()].sort((a, b) => {
    if (a.listingLike !== b.listingLike) return a.listingLike ? -1 : 1;
    return a.platformLabel.localeCompare(b.platformLabel);
  });
}

function buildDiscoveryQuery(card: CardIdentityCandidate, target: DiscoveryTarget) {
  const base = [
    card.name,
    card.cardNumber,
    card.setName,
    card.setCode,
    card.language,
  ].filter(Boolean).join(" ");
  const tcg = card.id.toLowerCase().includes("op") || card.setCode.toLowerCase().startsWith("op") ? "One Piece Card Game" : "Pokemon card";
  const suffix = target.localeHint === "jp" ? "ポケカ ワンピースカード トレカ" : "raw single trading card listing";
  return `${base} ${tcg} ${suffix}`.slice(0, 500);
}

function discoveryTargetsForCard(card: CardIdentityCandidate) {
  const onePiece = isOnePieceCard(card);
  return discoveryTargets.filter((target) => {
    if (onePiece && target.id === "cardrush-pokemon") return false;
    if (!onePiece && target.id === "cardrush-onepiece") return false;
    return true;
  });
}

function isOnePieceCard(card: CardIdentityCandidate) {
  return card.id.toLowerCase().startsWith("op")
    || card.cardNumber.toLowerCase().startsWith("op")
    || card.setCode.toLowerCase().startsWith("op");
}

function resultSeemsCardRelevant(text: string, query: string) {
  const normalizedText = normalizeLoose(text);
  const number = query.match(/\b[A-Z]{0,4}\d{1,4}\s*\/\s*[A-Z]{0,4}\d{1,4}\b/i)?.[0] ?? "";
  if (number) {
    const compactNumber = number.replace(/\s+/g, "").toLowerCase();
    if (normalizedText.includes(compactNumber) || normalizedText.includes(compactNumber.replace("/", ""))) return true;
  }

  const titleTokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !["card", "game", "raw", "single", "trading", "listing", "pokemon", "piece", "english"].includes(token));
  const coreTokens = titleTokens.slice(0, 3);
  return coreTokens.length > 0 && coreTokens.every((token) => normalizedText.includes(token));
}

function isGradedOrSlabResult(value: string) {
  return /\b(psa|bgs|cgc|sgc|graded|slab|gem\s*mint)\b|鑑定/i.test(value);
}

function parsePublicHttpsUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (isBlockedHost(url.hostname)) return null;
  url.hash = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function hostMatches(hostname: string, domain: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host === domain || host.endsWith(`.${domain}`);
}

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.includes(":") || host.startsWith("[")) return true;
  if (!host.includes(".")) return true;
  return false;
}

function looksListingLike(value: string) {
  try {
    const path = new URL(value).pathname.toLowerCase();
    return /\/itm\/|\/item\/|\/items\/|\/product\/|\/products\/|\/auction\/|\/listing\/|\/used\//.test(path);
  } catch {
    return false;
  }
}

function hashUrl(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function cleanText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

function normalizeLoose(value: string) {
  return value
    .toLowerCase()
    .replace(/％/g, "%")
    .replace(/\s+/g, "")
    .trim();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}
