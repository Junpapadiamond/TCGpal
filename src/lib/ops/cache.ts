import { createHash } from "node:crypto";
import { getCache } from "@vercel/functions";
import { getOperationalErrorCode, logOpsEvent } from "@/lib/ops/events";
import { getRedisClient } from "@/lib/ops/redis";

type CacheBackend = "redis" | "vercel-runtime" | "memory";

type LocalEntry = {
  value: unknown;
  expiresAt: number;
};

export type JsonCacheGetOptions<T> = {
  now?: Date;
  validate?: (value: unknown) => T | null;
};

export type JsonCacheSetOptions = {
  ttlSeconds: number;
  now?: Date;
};

const LOCAL_CACHE_MAX_ENTRIES = 500;
const localCache = new Map<string, LocalEntry>();

export function toCacheKey(scope: string, rawKey: string) {
  const safeScope = scope.trim().replace(/[^a-zA-Z0-9:-]/g, "-").slice(0, 48) || "default";
  const digest = createHash("sha256").update(rawKey).digest("hex").slice(0, 48);
  return `tcgpal:${safeScope}:${digest}`;
}

export async function getJsonCache<T = unknown>(
  scope: string,
  rawKey: string,
  options: JsonCacheGetOptions<T> = {},
): Promise<T | null> {
  const key = toCacheKey(scope, rawKey);
  const redis = getRedisClient();
  if (redis) {
    try {
      const value = await redis.get<unknown>(key);
      return parseCachedValue(value, options.validate);
    } catch (error) {
      recordCacheBackendFailure("redis", error);
    }
  }

  if (isVercelRuntimeCacheAvailable()) {
    try {
      const value = await getCache().get(key);
      return parseCachedValue(value, options.validate);
    } catch (error) {
      recordCacheBackendFailure("vercel-runtime", error);
    }
  }

  return getLocalValue(key, options);
}

export async function setJsonCache(
  scope: string,
  rawKey: string,
  value: unknown,
  options: JsonCacheSetOptions,
): Promise<CacheBackend> {
  const key = toCacheKey(scope, rawKey);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(key, value, { ex: options.ttlSeconds });
      return "redis";
    } catch (error) {
      recordCacheBackendFailure("redis", error);
    }
  }

  if (isVercelRuntimeCacheAvailable()) {
    try {
      await getCache().set(key, value, {
        ttl: options.ttlSeconds,
        tags: [`tcgpal-${safeCacheTag(scope)}`],
        name: `tcgpal-${safeCacheTag(scope)}`,
      });
      return "vercel-runtime";
    } catch (error) {
      recordCacheBackendFailure("vercel-runtime", error);
    }
  }

  setLocalValue(key, value, options);
  return "memory";
}

export function clearLocalCache() {
  localCache.clear();
}

function getLocalValue<T>(
  key: string,
  { now = new Date(), validate }: JsonCacheGetOptions<T>,
) {
  const entry = localCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now.getTime()) {
    localCache.delete(key);
    return null;
  }
  return parseCachedValue(entry.value, validate);
}

function setLocalValue(key: string, value: unknown, { now = new Date(), ttlSeconds }: JsonCacheSetOptions) {
  pruneLocalCache(now);
  if (localCache.size >= LOCAL_CACHE_MAX_ENTRIES) {
    const oldest = localCache.keys().next().value;
    if (oldest !== undefined) localCache.delete(oldest);
  }
  localCache.set(key, {
    value,
    expiresAt: now.getTime() + ttlSeconds * 1000,
  });
}

function pruneLocalCache(now: Date) {
  const nowMs = now.getTime();
  for (const [key, entry] of localCache) {
    if (entry.expiresAt <= nowMs) localCache.delete(key);
  }
}

function parseCachedValue<T>(value: unknown, validate?: (value: unknown) => T | null) {
  if (value === null || value === undefined) return null;
  if (!validate) return value as T;
  return validate(value);
}

function recordCacheBackendFailure(backend: CacheBackend, error: unknown) {
  logOpsEvent({
    event: "provider_failure",
    level: "warn",
    provider: "cache",
    status: "fallback",
    cacheBackend: backend,
    errorCode: getOperationalErrorCode(error),
  });
}

function isVercelRuntimeCacheAvailable() {
  return process.env.VERCEL === "1";
}

function safeCacheTag(scope: string) {
  return scope.trim().replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 48) || "default";
}
