import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runApifySearch } from "./apify";
import { clearLocalCache } from "@/lib/ops/cache";
import { reserveApifyPilotRun } from "./apify-budget";
import { demoListingSeeds } from "@/lib/comparison/fixtures";

vi.mock("./apify-budget", () => ({ reserveApifyPilotRun: vi.fn() }));
vi.mock("@/lib/ops/redis", () => ({ isRedisConfigured: () => true, getRedisClient: () => null }));
const parse = () => [{ ...demoListingSeeds[0], demo: false, observedAt: "2026-09-14T16:00:00.000Z" }];
const base = { provider: "whatnot" as const, actor: "epicscrapers~whatnot-scraper", token: "test-secret", key: "test-card", input: { searchQueries: ["Pikachu 58/102"] }, parse };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-14T16:00:00Z")); clearLocalCache(); vi.mocked(reserveApifyPilotRun).mockResolvedValue(undefined); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("paid source safeguards", () => {
  it("allows Mercari cold startup and a 40-second result while keeping the three-row spending cap", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetcher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40_000));
      return Response.json([]);
    });
    const pending = runApifySearch({ ...base, provider: "mercari", actor: "getascraper~mercari-us-scraper", fetcher });
    await vi.advanceTimersByTimeAsync(40_000);
    await expect(pending).resolves.toHaveLength(1);
    const [url] = fetcher.mock.calls[0] as unknown as [URL];
    expect(url.searchParams.get("timeout")).toBe("90");
    expect(url.searchParams.get("maxTotalChargeUsd")).toBe("0.03");
    expect(url.searchParams.get("maxItems")).toBe("3");
    expect(timeout).toHaveBeenCalledWith(95_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("aborts a hung Mercari request after response headroom without starting a replacement run", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
    }));
    const outcome = runApifySearch({ ...base, provider: "mercari", actor: "getascraper~mercari-us-scraper", fetcher })
      .then(() => "success", (error: Error) => error.message);
    let settled = false;
    void outcome.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(94_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toMatch(/timed out/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reserveApifyPilotRun).toHaveBeenCalledTimes(1);
  });

  it("coalesces identical calls, caches only sanitized results and preserves the observation timestamp", async () => {
    const fetcher = vi.fn(async () => Response.json([{ privateSellerField: "discard" }]));
    const [a, b] = await Promise.all([runApifySearch({ ...base, fetcher }), runApifySearch({ ...base, fetcher })]);
    expect(a).toEqual(b);
    expect(await runApifySearch({ ...base, fetcher })).toEqual(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a[0].observedAt).toBe("2026-09-14T16:00:00.000Z");
    const [url, init] = vi.mocked(fetcher).mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("maxTotalChargeUsd")).toBe("0.03");
    expect(url.searchParams.get("maxItems")).toBe("3");
    expect(reserveApifyPilotRun).toHaveBeenCalledTimes(1);
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
    vi.mocked(reserveApifyPilotRun).mockRejectedValueOnce(new Error("Pilot budget reached"));
    await expect(runApifySearch({ ...base, fetcher })).rejects.toThrow(/budget/);
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(reserveApifyPilotRun).mockRejectedValueOnce(new Error("Shared pilot counter is unavailable"));
    await expect(runApifySearch({ ...base, fetcher })).rejects.toThrow(/counter is unavailable/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
