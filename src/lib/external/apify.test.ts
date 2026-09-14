import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runApifySearch } from "./apify";
import { clearLocalCache } from "@/lib/ops/cache";
import { enforceRateLimit } from "@/lib/ops/rate-limit";
import { demoListingSeeds } from "@/lib/comparison/fixtures";

vi.mock("@/lib/ops/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/ops/redis", () => ({ isRedisConfigured: () => true, getRedisClient: () => null }));
const parse = () => [{ ...demoListingSeeds[0], demo: false, observedAt: "2026-09-14T16:00:00.000Z" }];
const base = { provider: "whatnot" as const, actor: "epicscrapers~whatnot-scraper", token: "test-secret", key: "test-card", input: { searchQueries: ["Pikachu 58/102"] }, parse };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-14T16:00:00Z")); clearLocalCache(); vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true, limit: 25, remaining: 24, resetAt: new Date(), retryAfterSeconds: 0, backend: "redis" }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("paid source safeguards", () => {
  it("coalesces identical calls, caches only sanitized results and preserves the observation timestamp", async () => {
    const fetcher = vi.fn(async () => Response.json([{ privateSellerField: "discard" }]));
    const [a, b] = await Promise.all([runApifySearch({ ...base, fetcher }), runApifySearch({ ...base, fetcher })]);
    expect(a).toEqual(b);
    expect(await runApifySearch({ ...base, fetcher })).toEqual(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a[0].observedAt).toBe("2026-09-14T16:00:00.000Z");
    const [url, init] = vi.mocked(fetcher).mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("maxTotalChargeUsd")).toBe("0.15");
    expect(url.href).not.toContain("test-secret");
    expect(init.headers).toMatchObject({ authorization: "Bearer test-secret" });
  });
  it("surfaces provider failures and retries the next request without caching a fake empty result", async () => {
    const fetcher = vi.fn(async () => new Response("private upstream error", { status: 403 }));
    await expect(runApifySearch({ ...base, fetcher })).rejects.toThrow("HTTP 403");
    await expect(runApifySearch({ ...base, fetcher })).rejects.toThrow("HTTP 403");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("refreshes rows when their original observation becomes stale even inside the cache TTL", async () => {
    vi.setSystemTime(new Date("2026-09-14T16:10:00Z"));
    const fetcher = vi.fn(async () => Response.json([]));
    await runApifySearch({ ...base, fetcher });
    vi.setSystemTime(new Date("2026-09-14T16:16:00Z"));
    await runApifySearch({ ...base, fetcher, parse: () => [{ ...parse()[0], observedAt: new Date().toISOString() }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("makes no paid request when the global budget is exhausted or unavailable in production", async () => {
    const fetcher = vi.fn();
    vi.mocked(enforceRateLimit).mockResolvedValueOnce({ allowed: false, limit: 25, remaining: 0, resetAt: new Date(), retryAfterSeconds: 99, backend: "redis" });
    await expect(runApifySearch({ ...base, fetcher })).rejects.toThrow(/budget/);
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(enforceRateLimit).mockResolvedValueOnce({ allowed: true, limit: 25, remaining: 24, resetAt: new Date(), retryAfterSeconds: 0, backend: "memory" });
    await expect(runApifySearch({ ...base, fetcher })).rejects.toThrow(/counter is unavailable/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
