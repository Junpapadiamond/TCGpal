import { afterEach, describe, expect, it, vi } from "vitest";
import { getRedisClient } from "@/lib/ops/redis";
import { reserveSoldgraphSearch } from "./soldgraph-budget";

vi.mock("@/lib/ops/redis", () => ({ getRedisClient: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("free Soldgraph rolling allowance", () => {
  it("reserves at most 80 initial searches atomically across both sources", async () => {
    let count = 0;
    const evaluate = vi.fn(async (script: string, keys: string[], args: (number | string)[]) => {
      expect(keys).toEqual(["tcglens:soldgraph:free-searches:v1"]);
      expect(args[0]).toBe(80);
      expect(args[1]).toBe(30 * 24 * 60 * 60 * 1000);
      expect(script).toContain("redis.call('TIME')");
      expect(script).toContain("ZREMRANGEBYSCORE");
      expect(script).not.toMatch(/apify|refund|DECR/);
      return count >= 80 ? 0 : ++count;
    });
    vi.mocked(getRedisClient).mockReturnValue({ eval: evaluate } as unknown as NonNullable<ReturnType<typeof getRedisClient>>);
    const attempts = await Promise.allSettled(Array.from({ length: 85 }, () => reserveSoldgraphSearch()));
    expect(attempts.filter(attempt => attempt.status === "fulfilled")).toHaveLength(80);
    expect(count).toBe(80);
    const ids = evaluate.mock.calls.map(call => call[2][2]);
    expect(new Set(ids).size).toBe(85);
  });

  it("fails closed without shared storage and never retries an ambiguous reservation", async () => {
    vi.mocked(getRedisClient).mockReturnValue(null);
    await expect(reserveSoldgraphSearch()).rejects.toThrow(/shared allowance/);
    const evaluate = vi.fn().mockRejectedValue(new Error("PRIVATE_REDIS_ERROR"));
    vi.mocked(getRedisClient).mockReturnValue({ eval: evaluate } as unknown as NonNullable<ReturnType<typeof getRedisClient>>);
    await expect(reserveSoldgraphSearch()).rejects.toThrow("Soldgraph shared allowance is unavailable.");
    expect(evaluate).toHaveBeenCalledOnce();
    for (const value of ["1", -1, 1.5, 81, null]) {
      evaluate.mockResolvedValueOnce(value);
      await expect(reserveSoldgraphSearch()).rejects.toThrow(/unavailable/);
    }
  });
});
