import { afterEach, describe, expect, it, vi } from "vitest";
import { getRedisClient } from "@/lib/ops/redis";
import { reserveSoldgraphSearch } from "./soldgraph-budget";

vi.mock("@/lib/ops/redis", () => ({ getRedisClient: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("free Soldgraph rolling allowance", () => {
  it("reserves at most 90 initial searches atomically across both sources", async () => {
    let count = 0;
    const evaluate = vi.fn(async (script: string, keys: string[], args: (number | string)[]) => {
      expect(keys).toEqual(["tcglens:soldgraph:free-searches:v1"]);
      expect(args[0]).toBe(90);
      expect(args[1]).toBe(30 * 24 * 60 * 60 * 1000);
      expect(script).toContain("redis.call('TIME')");
      expect(script).toContain("ZREMRANGEBYSCORE");
      expect(script).not.toMatch(/apify|refund|DECR/);
      return count >= 90 ? 0 : ++count;
    });
    vi.mocked(getRedisClient).mockReturnValue({ eval: evaluate } as unknown as NonNullable<ReturnType<typeof getRedisClient>>);
    const attempts = await Promise.allSettled(Array.from({ length: 95 }, () => reserveSoldgraphSearch()));
    expect(attempts.filter(attempt => attempt.status === "fulfilled")).toHaveLength(90);
    expect(count).toBe(90);
    const ids = evaluate.mock.calls.map(call => call[2][2]);
    expect(new Set(ids).size).toBe(95);
  });

  it("retains the existing 80 reservations and admits only ten additional starts", async () => {
    let count = 80;
    const evaluate = vi.fn(async (_script: string, keys: string[], args: (number | string)[]) => {
      expect(keys).toEqual(["tcglens:soldgraph:free-searches:v1"]);
      return count >= Number(args[0]) ? 0 : ++count;
    });
    vi.mocked(getRedisClient).mockReturnValue({ eval: evaluate } as unknown as NonNullable<ReturnType<typeof getRedisClient>>);
    const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => reserveSoldgraphSearch()));
    expect(attempts.filter(attempt => attempt.status === "fulfilled")).toHaveLength(10);
    expect(count).toBe(90);
    await expect(reserveSoldgraphSearch()).rejects.toThrow("Soldgraph free allowance reached.");
    expect(count).toBe(90);
  });

  it("fails closed without shared storage and never retries an ambiguous reservation", async () => {
    vi.mocked(getRedisClient).mockReturnValue(null);
    await expect(reserveSoldgraphSearch()).rejects.toThrow(/shared allowance/);
    const evaluate = vi.fn().mockRejectedValue(new Error("PRIVATE_REDIS_ERROR"));
    vi.mocked(getRedisClient).mockReturnValue({ eval: evaluate } as unknown as NonNullable<ReturnType<typeof getRedisClient>>);
    await expect(reserveSoldgraphSearch()).rejects.toThrow("Soldgraph shared allowance is unavailable.");
    expect(evaluate).toHaveBeenCalledOnce();
    for (const value of ["1", -1, 1.5, 91, null]) {
      evaluate.mockResolvedValueOnce(value);
      await expect(reserveSoldgraphSearch()).rejects.toThrow(/unavailable/);
    }
  });
});
