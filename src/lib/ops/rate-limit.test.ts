import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalRateLimitStore,
  enforceRateLimit,
  getRateLimitIdentity,
  rateLimitHeaders,
} from "@/lib/ops/rate-limit";

describe("rate limit adapter", () => {
  beforeEach(() => {
    clearLocalRateLimitStore();
    vi.unstubAllEnvs();
  });

  it("allows requests up to the fixed-window limit and then blocks", async () => {
    const rule = { max: 2, windowMs: 60_000 };
    const now = new Date("2026-07-05T10:00:00Z");

    const first = await enforceRateLimit("listing-compare:test", rule, { now });
    const second = await enforceRateLimit("listing-compare:test", rule, { now });
    const third = await enforceRateLimit("listing-compare:test", rule, { now });

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBe(60);
  });

  it("resets after the window expires", async () => {
    const rule = { max: 1, windowMs: 60_000 };

    await enforceRateLimit("listing-compare:test", rule, {
      now: new Date("2026-07-05T10:00:00Z"),
    });
    const allowedAfterReset = await enforceRateLimit("listing-compare:test", rule, {
      now: new Date("2026-07-05T10:01:00Z"),
    });

    expect(allowedAfterReset.allowed).toBe(true);
    expect(allowedAfterReset.remaining).toBe(0);
  });

  it("hashes request IPs with the configured salt", () => {
    vi.stubEnv("RATE_LIMIT_SALT", "unit-test-salt");
    const request = new Request("https://tcgpal.test/api", {
      headers: { "x-forwarded-for": "203.0.113.10, 70.41.3.18" },
    });

    const identity = getRateLimitIdentity(request);

    expect(identity).toMatch(/^[a-f0-9]{40}$/);
    expect(identity).not.toContain("203.0.113.10");
  });

  it("emits standard rate-limit headers", async () => {
    const result = await enforceRateLimit("listing-compare:test", { max: 1, windowMs: 60_000 }, {
      now: new Date("2026-07-05T10:00:00Z"),
    });

    expect(rateLimitHeaders(result)).toEqual({
      "RateLimit-Limit": "1",
      "RateLimit-Remaining": "0",
      "RateLimit-Reset": "60",
      "X-RateLimit-Limit": "1",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": "2026-07-05T10:01:00.000Z",
    });
  });
});
