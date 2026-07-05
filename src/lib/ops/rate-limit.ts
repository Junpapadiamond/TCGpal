import { createHash } from "node:crypto";
import { getOperationalErrorCode, logOpsEvent, type OpsRoute } from "@/lib/ops/events";
import { getRedisClient } from "@/lib/ops/redis";
import { toCacheKey } from "@/lib/ops/cache";

export type RateLimitRule = {
  max: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
  backend: "redis" | "memory";
};

export type EnforceRateLimitOptions = {
  now?: Date;
};

type LocalRateEntry = {
  count: number;
  resetAt: number;
};

const DEFAULT_COMPARISON_LIMIT = 20;
const DEFAULT_EXPLAIN_LIMIT = 60;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const LOCAL_RATE_LIMIT_MAX_ENTRIES = 2500;
const localRateLimitStore = new Map<string, LocalRateEntry>();

export async function rateLimitRequest(
  request: Request,
  route: OpsRoute,
  options: EnforceRateLimitOptions = {},
) {
  const identity = getRateLimitIdentity(request);
  return enforceRateLimit(`${route}:${identity}`, getRateLimitRule(route), options);
}

export async function enforceRateLimit(
  rawKey: string,
  rule: RateLimitRule,
  options: EnforceRateLimitOptions = {},
): Promise<RateLimitResult> {
  const now = options.now ?? new Date();
  const resetAt = getWindowReset(now, rule.windowMs);
  const windowKey = toCacheKey("rate-limit", `${rawKey}:${resetAt.toISOString()}`);
  const redis = getRedisClient();

  if (redis) {
    try {
      const count = await redis.incr(windowKey);
      if (count === 1) await redis.expire(windowKey, Math.ceil(rule.windowMs / 1000));
      return toRateLimitResult(count, rule, now, resetAt, "redis");
    } catch (error) {
      logOpsEvent({
        event: "provider_failure",
        level: "warn",
        provider: "rate-limit",
        status: "fallback",
        rateLimitBackend: "redis",
        errorCode: getOperationalErrorCode(error),
      });
    }
  }

  return enforceLocalRateLimit(windowKey, rule, now, resetAt);
}

export function getRateLimitIdentity(request: Request) {
  const ip = firstHeader(request, [
    "true-client-ip",
    "cf-connecting-ip",
    "x-real-ip",
    "x-vercel-forwarded-for",
    "x-forwarded-for",
  ]) ?? "anonymous";
  const normalizedIp = ip.split(",")[0]?.trim() || "anonymous";
  const salt = process.env.RATE_LIMIT_SALT?.trim() || "tcgpal-local-rate-limit";
  return createHash("sha256").update(`${salt}:${normalizedIp}`).digest("hex").slice(0, 40);
}

export function getRateLimitRule(route: OpsRoute): RateLimitRule {
  if (route === "listing-compare-explain") {
    return {
      max: readPositiveInt("RATE_LIMIT_EXPLAIN_MAX", DEFAULT_EXPLAIN_LIMIT),
      windowMs: readPositiveInt("RATE_LIMIT_EXPLAIN_WINDOW_MS", DEFAULT_WINDOW_MS),
    };
  }

  return {
    max: readPositiveInt("RATE_LIMIT_COMPARE_MAX", DEFAULT_COMPARISON_LIMIT),
    windowMs: readPositiveInt("RATE_LIMIT_COMPARE_WINDOW_MS", DEFAULT_WINDOW_MS),
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt.toISOString(),
  };
}

export function clearLocalRateLimitStore() {
  localRateLimitStore.clear();
}

function enforceLocalRateLimit(
  key: string,
  rule: RateLimitRule,
  now: Date,
  resetAt: Date,
): RateLimitResult {
  pruneLocalRateLimitStore(now);
  let entry = localRateLimitStore.get(key);
  if (!entry || entry.resetAt <= now.getTime()) {
    entry = { count: 0, resetAt: resetAt.getTime() };
    localRateLimitStore.set(key, entry);
  }

  entry.count += 1;
  if (localRateLimitStore.size >= LOCAL_RATE_LIMIT_MAX_ENTRIES) {
    const oldest = localRateLimitStore.keys().next().value;
    if (oldest !== undefined) localRateLimitStore.delete(oldest);
  }

  return toRateLimitResult(entry.count, rule, now, resetAt, "memory");
}

function toRateLimitResult(
  count: number,
  rule: RateLimitRule,
  now: Date,
  resetAt: Date,
  backend: RateLimitResult["backend"],
): RateLimitResult {
  const remaining = Math.max(0, rule.max - count);
  return {
    allowed: count <= rule.max,
    limit: rule.max,
    remaining,
    resetAt,
    retryAfterSeconds: Math.max(0, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
    backend,
  };
}

function getWindowReset(now: Date, windowMs: number) {
  const nextWindow = Math.floor(now.getTime() / windowMs) * windowMs + windowMs;
  return new Date(nextWindow);
}

function pruneLocalRateLimitStore(now: Date) {
  const nowMs = now.getTime();
  for (const [key, entry] of localRateLimitStore) {
    if (entry.resetAt <= nowMs) localRateLimitStore.delete(key);
  }
}

function firstHeader(request: Request, names: string[]) {
  for (const name of names) {
    const value = request.headers.get(name)?.trim();
    if (value) return value;
  }
  return null;
}

function readPositiveInt(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
