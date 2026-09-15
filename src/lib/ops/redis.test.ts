import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const construct = vi.hoisted(() => vi.fn());
vi.mock("@upstash/redis", () => ({
  Redis: class { constructor(options: unknown) { construct(options); } },
}));

import { getRedisClient, isRedisConfigured, resetRedisClientForTests } from "./redis";

beforeEach(() => {
  resetRedisClientForTests();
  construct.mockClear();
  for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "KV_REST_API_READ_ONLY_TOKEN"]) vi.stubEnv(key, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("production Redis credentials", () => {
  it("connects using the complete pair injected by Vercel Marketplace", () => {
    vi.stubEnv("KV_REST_API_URL", " https://marketplace.example ");
    vi.stubEnv("KV_REST_API_TOKEN", " write-token ");
    expect(isRedisConfigured()).toBe(true);
    expect(getRedisClient()).not.toBeNull();
    expect(construct).toHaveBeenCalledWith({ url: "https://marketplace.example", token: "write-token" });
  });

  it("retains explicit Upstash configuration precedence and reuses its client", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://explicit.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "explicit-token");
    vi.stubEnv("KV_REST_API_URL", "https://marketplace.example");
    vi.stubEnv("KV_REST_API_TOKEN", "marketplace-token");
    const client = getRedisClient();
    expect(getRedisClient()).toBe(client);
    expect(construct).toHaveBeenCalledTimes(1);
    expect(construct).toHaveBeenCalledWith({ url: "https://explicit.example", token: "explicit-token" });
  });

  it("never pairs one database URL with the other configuration's token", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://explicit.example");
    vi.stubEnv("KV_REST_API_TOKEN", "marketplace-token");
    expect(isRedisConfigured()).toBe(false);
    expect(getRedisClient()).toBeNull();
    expect(construct).not.toHaveBeenCalled();
  });

  it("uses a complete Marketplace pair when manual configuration is incomplete", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://incomplete.example");
    vi.stubEnv("KV_REST_API_URL", "https://marketplace.example");
    vi.stubEnv("KV_REST_API_TOKEN", "marketplace-token");
    expect(isRedisConfigured()).toBe(true);
    getRedisClient();
    expect(construct).toHaveBeenCalledWith({ url: "https://marketplace.example", token: "marketplace-token" });
  });

  it("requires a write token for the spending counter", () => {
    vi.stubEnv("KV_REST_API_URL", "https://marketplace.example");
    vi.stubEnv("KV_REST_API_READ_ONLY_TOKEN", "read-only-token");
    expect(isRedisConfigured()).toBe(false);
    expect(getRedisClient()).toBeNull();
  });

  it("replaces the client when Marketplace credentials change", () => {
    vi.stubEnv("KV_REST_API_URL", "https://marketplace.example");
    vi.stubEnv("KV_REST_API_TOKEN", "first-token");
    const previous = getRedisClient();
    vi.stubEnv("KV_REST_API_TOKEN", "second-token");
    expect(getRedisClient()).not.toBe(previous);
    expect(construct).toHaveBeenLastCalledWith({ url: "https://marketplace.example", token: "second-token" });
  });
});
