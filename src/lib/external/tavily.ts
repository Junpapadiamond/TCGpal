import { z } from "zod";
import type { WebCitation } from "@/lib/schemas";

const TAVILY_BASE_URL = "https://api.tavily.com";
const TAVILY_TIMEOUT_MS = 8000;

const contextBlockedDomains = [
  "ebay.com",
  "facebook.com",
  "mercari.com",
  "reddit.com",
  "whatnot.com",
];

const tavilySearchResultSchema = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
  content: z.string().nullable().optional(),
  raw_content: z.string().nullable().optional(),
  score: z.number().optional(),
});

const tavilySearchResponseSchema = z.object({
  results: z.array(tavilySearchResultSchema).default([]),
});

const tavilyExtractResultSchema = z.object({
  url: z.string().optional(),
  title: z.string().nullable().optional(),
  raw_content: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
});

const tavilyExtractResponseSchema = z.object({
  results: z.array(tavilyExtractResultSchema).default([]),
  failed_results: z.array(z.unknown()).default([]),
});

export type TavilyWebContext = {
  citations: WebCitation[];
};

type TavilySearchOptions = {
  query: string;
  maxResults?: number;
  fetcher?: typeof fetch;
};

type TavilyExtractOptions = {
  url: string;
  query?: string;
  fetcher?: typeof fetch;
};

export function isTavilyConfigured() {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

export async function searchTavilyContext({
  query,
  maxResults = 5,
  fetcher = fetch,
}: TavilySearchOptions): Promise<TavilyWebContext> {
  const response = await tavilyPost(
    "search",
    {
      query,
      search_depth: "basic",
      topic: "general",
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
      include_favicon: false,
      exclude_domains: contextBlockedDomains,
    },
    tavilySearchResponseSchema,
    fetcher,
  );

  return {
    citations: response.results
      .map((result): WebCitation | null => toCitation(result, "tavily_search"))
      .filter((citation): citation is WebCitation => citation !== null)
      .slice(0, maxResults),
  };
}

export async function extractTavilyUrl({
  url,
  query = "Extract trading-card listing or reference context from this exact URL.",
  fetcher = fetch,
}: TavilyExtractOptions): Promise<TavilyWebContext> {
  const parsed = parsePublicHttpsUrl(url);
  const response = await tavilyPost(
    "extract",
    {
      urls: [parsed.href],
      query,
      chunks_per_source: 2,
      extract_depth: "basic",
      format: "text",
      include_images: false,
      include_favicon: false,
      timeout: Math.ceil(TAVILY_TIMEOUT_MS / 1000),
    },
    tavilyExtractResponseSchema,
    fetcher,
  );

  return {
    citations: response.results
      .map((result): WebCitation | null => toCitation(result, "tavily_extract"))
      .filter((citation): citation is WebCitation => citation !== null)
      .slice(0, 1),
  };
}

async function tavilyPost<T>(
  path: "search" | "extract",
  body: Record<string, unknown>,
  schema: z.ZodType<T>,
  fetcher: typeof fetch,
): Promise<T> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) throw new Error("Tavily is not configured.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);
  try {
    const response = await fetcher(`${TAVILY_BASE_URL}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP ${response.status}`;
      throw new Error(`Tavily ${path} failed: ${message.slice(0, 240)}`);
    }

    return schema.parse(payload);
  } finally {
    clearTimeout(timeout);
  }
}

function toCitation(
  result: z.infer<typeof tavilySearchResultSchema> | z.infer<typeof tavilyExtractResultSchema>,
  source: WebCitation["source"],
): WebCitation | null {
  if (!result.url) return null;
  const parsed = parsePublicHttpsUrlOrNull(result.url);
  if (!parsed) return null;
  if (source === "tavily_search" && isContextBlockedDomain(parsed.hostname)) return null;

  const title = cleanText(result.title ?? parsed.hostname.replace(/^www\./, ""));
  const snippet = cleanText(result.content ?? result.raw_content ?? "");
  if (!title) return null;

  return {
    title: title.slice(0, 140),
    url: parsed.href,
    snippet: snippet.slice(0, 280),
    source,
  };
}

function parsePublicHttpsUrl(value: string) {
  const parsed = parsePublicHttpsUrlOrNull(value);
  if (!parsed) throw new Error("Tavily extract only accepts public https URLs.");
  return parsed;
}

function parsePublicHttpsUrlOrNull(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (isBlockedHost(url.hostname)) return null;
  return url;
}

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.includes(":") || host.startsWith("[")) return true;
  if (!host.includes(".")) return true;
  return false;
}

function isContextBlockedDomain(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return contextBlockedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function cleanText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}
