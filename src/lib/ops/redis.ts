import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;
let redisSignature = "";

function redisCredentials() {
  // Vercel Marketplace injects KV_REST_API_*. Keep complete credential pairs
  // together: a partial manual configuration must never mix database tokens.
  for (const pair of [
    { url: process.env.UPSTASH_REDIS_REST_URL?.trim(), token: process.env.UPSTASH_REDIS_REST_TOKEN?.trim() },
    { url: process.env.KV_REST_API_URL?.trim(), token: process.env.KV_REST_API_TOKEN?.trim() },
  ]) {
    if (pair.url && pair.token) return { url: pair.url, token: pair.token };
  }
  return null;
}

export function isRedisConfigured() {
  return Boolean(redisCredentials());
}

export function getRedisClient(): Redis | null {
  const credentials = redisCredentials();
  if (!credentials) return null;
  const { url, token } = credentials;

  const signature = `${url}|${token}`;
  if (!redisClient || redisSignature !== signature) {
    redisClient = new Redis({ url, token });
    redisSignature = signature;
  }

  return redisClient;
}

export function resetRedisClientForTests() {
  redisClient = null;
  redisSignature = "";
}
