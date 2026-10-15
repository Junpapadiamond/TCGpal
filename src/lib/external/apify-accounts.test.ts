import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectApifyAccountToken } from "./apify-accounts";
import { getRedisClient } from "@/lib/ops/redis";

vi.mock("@/lib/ops/redis", () => ({ getRedisClient: vi.fn() }));
beforeEach(() => {
  const ledger = new Map<string, number>();
  vi.mocked(getRedisClient).mockReturnValue({ eval: vi.fn(async (_script: string, [key]: string[], [used, charge, max]: number[]) => {
    const next = (ledger.get(key) ?? 0) + charge;
    if (used + next > max) return 0;
    ledger.set(key, next);
    return 1;
  }) } as unknown as NonNullable<ReturnType<typeof getRedisClient>>);
});

const first = "apify_api_testAccountFirst";
const second = "apify_api_testAccountSecond";
const limits = (used: number, maximum = 5) => Response.json({ data: {
  monthlyUsageCycle: { startAt: new Date(Date.now() - 86400000).toISOString(), endAt: new Date(Date.now() + 86400000).toISOString() },
  limits: { maxMonthlyUsageUsd: maximum }, current: { monthlyUsageUsd: used },
} });
afterEach(() => vi.unstubAllEnvs());
function enable() {
  vi.stubEnv("APIFY_ACCOUNT_POOL_ENABLED", "1");
  vi.stubEnv("APIFY_AUTHORIZED_TOKEN_POOL", JSON.stringify([first, second]));
}
describe("authorized Apify account selection", () => {
  it("uses the existing fixed token without requests when the pool is disabled", async () => {
    const fetcher = vi.fn();
    expect(await selectApifyAccountToken("fixed", 0.03, fetcher)).toBe("fixed");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("automatically selects the next account only when the preceding account lacks remaining credit", async () => {
    enable();
    const fetcher = vi.fn().mockResolvedValueOnce(limits(5)).mockResolvedValueOnce(limits(0));
    expect(await selectApifyAccountToken("fixed", 0.03, fetcher)).toBe(second);
    expect(fetcher.mock.calls.map(([, init]) => init.headers.authorization)).toEqual([`Bearer ${first}`, `Bearer ${second}`]);
    expect(fetcher.mock.calls.every(([url]) => url === "https://api.apify.com/v2/users/me/limits")).toBe(true);
  });
  it.each([401, 403, 429, 500])("stops on HTTP %s without changing accounts", async (status) => {
    enable();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(selectApifyAccountToken("fixed", 0.03, fetcher)).rejects.toThrow(`HTTP ${status}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not use a raised paid allowance beyond the authorized $5 account ceiling", async () => {
    enable();
    const fetcher = vi.fn().mockResolvedValueOnce(limits(4.99, 100)).mockResolvedValueOnce(limits(0));
    expect(await selectApifyAccountToken("fixed", 0.03, fetcher)).toBe(second);
  });
  it("stops when all account budgets are exhausted", async () => {
    enable();
    await expect(selectApifyAccountToken("fixed", 0.03, vi.fn(async () => limits(5)))).rejects.toThrow(/all authorized accounts/);
  });
  it("rejects malformed usage rather than skipping the account", async () => {
    enable();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { current: { monthlyUsageUsd: -1 } } }));
    await expect(selectApifyAccountToken("fixed", 0.03, fetcher)).rejects.toThrow(/invalid/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed secret configuration without echoing it", async () => {
    enable();
    vi.stubEnv("APIFY_AUTHORIZED_TOKEN_POOL", first);
    await expect(selectApifyAccountToken("fixed", 0.03, vi.fn())).rejects.toThrow("Authorized account pool configuration is invalid.");
  });
  it("reserves concurrently and never authorizes two runs against the same remaining credit", async () => {
    enable();
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => limits(4.97));
      const selected = await Promise.all([selectApifyAccountToken("fixed", 0.03, fetcher), selectApifyAccountToken("fixed", 0.03, fetcher)]);
      expect(new Set(selected)).toEqual(new Set([first, second]));
    } finally { vi.useRealTimers(); }
  });
  it("keeps earlier reservations in addition to newly observed external spending", async () => {
    enable();
    vi.useFakeTimers();
    try {
      expect(await selectApifyAccountToken("fixed", 0.03, vi.fn(async () => limits(0)))).toBe(first);
      const fetcher = vi.fn().mockResolvedValueOnce(limits(4.95, 100)).mockResolvedValueOnce(limits(0));
      expect(await selectApifyAccountToken("fixed", 0.03, fetcher)).toBe(second);
    } finally { vi.useRealTimers(); }
  });
  it("accepts an exactly sufficient $0.05 balance", async () => {
    enable();
    expect(await selectApifyAccountToken("fixed", 0.05, vi.fn(async () => limits(4.95)))).toBe(first);
  });
  it("fails closed when durable account reservations are unavailable", async () => {
    enable();
    vi.mocked(getRedisClient).mockReturnValue(null);
    await expect(selectApifyAccountToken("fixed", 0.03, vi.fn(async () => limits(0)))).rejects.toThrow(/storage is unavailable/);
  });
});
