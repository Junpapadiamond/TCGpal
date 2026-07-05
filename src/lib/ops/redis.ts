import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;
let redisSignature = "";

export function isRedisConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
}

export function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;

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
