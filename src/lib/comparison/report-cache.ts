import type { ComparisonReport, ComparisonRequest } from "@/lib/schemas";

// R7: pure card searches (no user-supplied listing facts) are cacheable — the
// fan-out result only depends on the confirmed card, desired condition, and
// buyer delivery context. 15-minute TTL keeps listings honest while making a
// re-run of the same card near-instant.
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 200;

type CacheEntry = { report: ComparisonReport; at: number };

const cache = new Map<string, CacheEntry>();

export function comparisonCacheKey(request: ComparisonRequest, confirmedCardId: string) {
  return [
    confirmedCardId,
    request.buyer.desiredCondition,
    request.buyer.postalCode,
    request.buyer.taxRate ?? "no-tax",
  ].join("|");
}

// Requests that carry a specific listing (URL or manual facts) are personal to
// that submission and must never be served from — or written to — the cache.
export function isCacheableRequest(request: ComparisonRequest) {
  const source = request.sourceListing;
  return request.webDiscoveryMode !== "expanded"
    && !source.url?.trim()
    && !source.title.trim()
    && source.price === null
    && request.manualCandidates.length === 0;
}

export function getCachedComparison(key: string, now: Date = new Date()): ComparisonReport | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (now.getTime() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.report;
}

export function setCachedComparison(key: string, report: ComparisonReport, now: Date = new Date()) {
  // Only cache reports built from live data; demo fixtures and failed runs
  // should re-attempt the live sources on the next request.
  if (report.demoMode || report.status === "needs_confirmation") return;
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { report, at: now.getTime() });
}

export function clearComparisonCache() {
  cache.clear();
}
