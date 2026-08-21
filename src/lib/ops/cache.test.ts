import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalCache,
  getJsonCache,
  setJsonCache,
  toCacheKey,
} from "@/lib/ops/cache";

const runtimeCache = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  get: vi.fn(async (key: string) => runtimeCache.values.get(key) ?? null),
  set: vi.fn(async (key: string, value: unknown) => { runtimeCache.values.set(key, value); }),
}));

vi.mock("@vercel/functions", () => ({
  getCache: () => ({
    get: runtimeCache.get,
    set: runtimeCache.set,
  }),
}));

describe("shared cache adapter", () => {
  beforeEach(() => {
    clearLocalCache();
    runtimeCache.values.clear();
    runtimeCache.get.mockClear();
    runtimeCache.set.mockClear();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("stores JSON values in the local fallback until the TTL expires", async () => {
    await setJsonCache("comparison", "raw-key", { value: 42 }, {
      ttlSeconds: 60,
      now: new Date("2026-07-05T10:00:00Z"),
    });

    await expect(getJsonCache("comparison", "raw-key", {
      now: new Date("2026-07-05T10:00:30Z"),
    })).resolves.toEqual({ value: 42 });

    await expect(getJsonCache("comparison", "raw-key", {
      now: new Date("2026-07-05T10:01:01Z"),
    })).resolves.toBeNull();
  });

  it("hashes raw cache keys before they reach a backend", () => {
    const key = toCacheKey("comparison", "card|Near Mint|10001|0.08");

    expect(key).toMatch(/^tcgpal:comparison:[a-f0-9]{48}$/);
    expect(key).not.toContain("10001");
    expect(key).not.toContain("Near Mint");
  });

  it("uses Vercel Runtime Cache across function instances when Redis is absent", async () => {
    vi.stubEnv("VERCEL", "1");

    await expect(setJsonCache("comparison", "same-report", { value: 99 }, {
      ttlSeconds: 900,
    })).resolves.toBe("vercel-runtime");
    clearLocalCache();

    await expect(getJsonCache("comparison", "same-report")).resolves.toEqual({ value: 99 });
    expect(runtimeCache.set).toHaveBeenCalledWith(
      expect.stringMatching(/^tcgpal:comparison:/),
      { value: 99 },
      expect.objectContaining({ ttl: 900 }),
    );
  });
});
