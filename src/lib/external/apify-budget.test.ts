import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRedisClient } from "@/lib/ops/redis";
import { reserveApifyPilotRun } from "./apify-budget";

vi.mock("@/lib/ops/redis", () => ({ getRedisClient: vi.fn() }));
const originalKey = "tcglens:apify-pilot:2026-09-14:reserved-runs";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  vi.stubEnv("APIFY_PILOT_APPROVED_MAX_RUNS", "");
  vi.stubEnv("APIFY_PILOT_APPROVAL_EXPIRES_AT", "");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

// Model Redis' atomic operation as one synchronous state transition. The fake
// intentionally has no INCR/SET/DEL fallback, so the application must request a
// single atomic reservation and cannot repair or reset the original counter.
function sharedCounter(initialCount = 0) {
  let count = initialCount;
  const evaluate = vi.fn(async (_script: string, keys: string[], args: number[]) => {
    expect(keys).toEqual([originalKey]);
    const [limit, expiresAt] = args;
    if (expiresAt && Date.now() >= expiresAt) return -2;
    if (!Number.isSafeInteger(count) || count < 0) return -1;
    if (count >= limit) return 0;
    return ++count;
  });
  vi.mocked(getRedisClient).mockReturnValue({ eval: evaluate } as unknown as NonNullable<ReturnType<typeof getRedisClient>>);
  return { evaluate, count: () => count };
}

function approve(maxRuns = "25", expiresAt = "2026-10-04T00:00:00Z") {
  vi.stubEnv("APIFY_PILOT_APPROVED_MAX_RUNS", maxRuns);
  vi.stubEnv("APIFY_PILOT_APPROVAL_EXPIRES_AT", expiresAt);
}

describe("shared Apify pilot spending ceiling", () => {
  it("allows at most 20 starts concurrently and never increments exhausted traffic", async () => {
    const counter = sharedCounter();
    const attempts = await Promise.allSettled(Array.from({ length: 25 }, () => reserveApifyPilotRun()));
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(20);
    expect(counter.count()).toBe(20);
    await expect(reserveApifyPilotRun()).rejects.toThrow(/budget/);
    expect(counter.count()).toBe(20);
    expect(counter.evaluate.mock.calls.every((call) => call[2][0] === 20)).toBe(true);
  });

  it("applies an explicit expiring cumulative extension to Whatnot only", async () => {
    approve();
    const counter = sharedCounter(20);
    await expect(reserveApifyPilotRun("mercari")).rejects.toThrow(/budget/);
    await expect(reserveApifyPilotRun()).rejects.toThrow(/budget/);
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => reserveApifyPilotRun("whatnot")));
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(5);
    expect(counter.count()).toBe(25);
    expect(counter.evaluate).toHaveBeenCalledWith(expect.any(String), [originalKey], [25, Date.parse("2026-10-04T00:00:00Z")]);
  });

  it("preserves historical over-counting instead of resetting it to the old limit", async () => {
    approve("50");
    const counter = sharedCounter(49);
    await expect(reserveApifyPilotRun("whatnot")).resolves.toBeUndefined();
    await expect(reserveApifyPilotRun("whatnot")).rejects.toThrow(/budget/);
    expect(counter.count()).toBe(50);
  });

  it("does not renew allowance after the deadline, a day change, or removing approval", async () => {
    approve();
    const counter = sharedCounter(20);
    await reserveApifyPilotRun("whatnot");
    vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
    await expect(reserveApifyPilotRun("whatnot")).rejects.toThrow(/expired/);
    vi.stubEnv("APIFY_PILOT_APPROVED_MAX_RUNS", "");
    vi.stubEnv("APIFY_PILOT_APPROVAL_EXPIRES_AT", "");
    await expect(reserveApifyPilotRun("whatnot")).rejects.toThrow(/budget/);
    expect(counter.count()).toBe(21);
  });

  it.each([
    ["25", ""], ["", "2026-10-04T00:00:00Z"], ["garbage", "2026-10-04T00:00:00Z"],
    ["20", "2026-10-04T00:00:00Z"], ["0", "2026-10-04T00:00:00Z"], ["-1", "2026-10-04T00:00:00Z"],
    ["25.5", "2026-10-04T00:00:00Z"], ["1e3", "2026-10-04T00:00:00Z"], ["025", "2026-10-04T00:00:00Z"],
    ["10001", "2026-10-04T00:00:00Z"], ["9007199254740992", "2026-10-04T00:00:00Z"],
    ["25", "2026-10-04"], ["25", "2026-10-04T00:00:00"], ["25", "2027-02-30T00:00:00Z"],
    ["25", "invalid"],
  ])("fails closed for invalid or incomplete approval (%s, %s)", async (limit, expiresAt) => {
    approve(limit, expiresAt);
    const counter = sharedCounter();
    await expect(reserveApifyPilotRun("whatnot")).rejects.toThrow(/approval/);
    expect(counter.evaluate).not.toHaveBeenCalled();
    expect(counter.count()).toBe(0);
  });

  it("accepts the upper bounded ceiling and millisecond UTC deadline", async () => {
    approve("10000", "2026-10-04T00:00:00.123Z");
    const counter = sharedCounter(9999);
    await expect(reserveApifyPilotRun("whatnot")).resolves.toBeUndefined();
    await expect(reserveApifyPilotRun("whatnot")).rejects.toThrow(/budget/);
    expect(counter.count()).toBe(10000);
  });

  it("honors deadline expiry at Redis even if the application checked before expiry", async () => {
    approve();
    const counter = sharedCounter(20);
    counter.evaluate.mockImplementationOnce(async () => -2);
    await expect(reserveApifyPilotRun("whatnot")).rejects.toThrow(/expired/);
    expect(counter.count()).toBe(20);
  });

  it("makes unavailable or ambiguous shared counters a closed gate without retry", async () => {
    vi.mocked(getRedisClient).mockReturnValue(null);
    await expect(reserveApifyPilotRun()).rejects.toThrow(/counter/);
    const evaluate = vi.fn().mockRejectedValueOnce(new Error("sensitive Redis error"));
    vi.mocked(getRedisClient).mockReturnValue({ eval: evaluate } as unknown as NonNullable<ReturnType<typeof getRedisClient>>);
    await expect(reserveApifyPilotRun()).rejects.toThrow("Paid source paused: shared pilot counter is unavailable.");
    expect(evaluate).toHaveBeenCalledTimes(1);
    for (const response of ["1", null, -1, 1.5, 21, Number.NaN]) {
      evaluate.mockResolvedValueOnce(response);
      await expect(reserveApifyPilotRun()).rejects.toThrow(/counter/);
    }
  });
});
