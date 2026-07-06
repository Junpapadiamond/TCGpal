import { clearLocalCache, getJsonCache, setJsonCache } from "@/lib/ops/cache";
import { comparisonReportSchema, type ComparisonReport, type ComparisonRequest } from "@/lib/schemas";

// R7: pure card searches (no user-supplied listing facts) are cacheable — the
// fan-out result only depends on the confirmed card, desired condition, and
// buyer delivery context. 15-minute TTL keeps listings honest while making a
// re-run of the same card near-instant.
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_TTL_SECONDS = CACHE_TTL_MS / 1000;
const CACHE_SCOPE = "comparison-report";

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

export async function getCachedComparison(key: string, now: Date = new Date()): Promise<ComparisonReport | null> {
  return getJsonCache(CACHE_SCOPE, key, {
    now,
    validate(value) {
      const parsed = comparisonReportSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
  });
}

export async function setCachedComparison(key: string, report: ComparisonReport, now: Date = new Date()) {
  // Only cache reports built from live data; demo fixtures and failed runs
  // should re-attempt the live sources on the next request.
  if (report.demoMode || report.status === "needs_confirmation") return;
  await setJsonCache(CACHE_SCOPE, key, report, { ttlSeconds: CACHE_TTL_SECONDS, now });
}

export function clearComparisonCache() {
  clearLocalCache();
}
