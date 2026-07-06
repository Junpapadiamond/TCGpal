import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalCache,
  getJsonCache,
  setJsonCache,
  toCacheKey,
} from "@/lib/ops/cache";

describe("shared cache adapter", () => {
  beforeEach(() => {
    clearLocalCache();
  });

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
});
