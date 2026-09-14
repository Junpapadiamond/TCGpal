import { afterEach, describe, expect, it, vi } from "vitest";
import { getRedisClient } from "@/lib/ops/redis";
import { reserveApifyPilotRun } from "./apify-budget";

vi.mock("@/lib/ops/redis", () => ({ getRedisClient: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("shared Apify pilot spending ceiling", () => {
  it("allows at most 20 paid starts across concurrent requests and does not reset its counter", async () => {
    let count = 0;
    const incr = vi.fn<(key: string) => Promise<number>>(async () => ++count);
    vi.mocked(getRedisClient).mockReturnValue({ incr } as unknown as NonNullable<ReturnType<typeof getRedisClient>>);
    const attempts = await Promise.allSettled(Array.from({ length: 25 }, () => reserveApifyPilotRun()));
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(20);
    expect(new Set(incr.mock.calls.map((args) => args[0])).size).toBe(1);
    await expect(reserveApifyPilotRun()).rejects.toThrow(/budget/);
  });

  it("makes unavailable or ambiguous shared counters a closed spending gate", async () => {
    vi.mocked(getRedisClient).mockReturnValue(null);
    await expect(reserveApifyPilotRun()).rejects.toThrow(/counter/);
    const incr = vi.fn().mockRejectedValueOnce(new Error("sensitive Redis error")).mockResolvedValueOnce("1");
    vi.mocked(getRedisClient).mockReturnValue({ incr } as unknown as NonNullable<ReturnType<typeof getRedisClient>>);
    await expect(reserveApifyPilotRun()).rejects.toThrow("Paid source paused: shared pilot counter is unavailable.");
    await expect(reserveApifyPilotRun()).rejects.toThrow(/counter/);
  });
});
