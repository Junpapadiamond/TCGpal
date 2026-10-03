import { randomUUID } from "node:crypto";
import { getRedisClient } from "@/lib/ops/redis";

// Free plan: 100 completed requests / rolling 30 days, no automatic overage.
// Reserve every initial request conservatively (including failures), leaving
// 20 requests for founder evaluation. Polls do not start another search. This
// independent allowance never reads, resets or refunds the Apify counter.
const MAX_SEARCHES = 80;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const KEY = "tcglens:soldgraph:free-searches:v1";
const reserveScript = `
local now = redis.call('TIME')
local nowMs = tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', nowMs - tonumber(ARGV[2]))
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[1]) then return 0 end
redis.call('ZADD', KEYS[1], nowMs, ARGV[3])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]) + 86400000)
return count + 1
`;

export async function reserveSoldgraphSearch(): Promise<void> {
  const redis = getRedisClient();
  if (!redis) throw new Error("Soldgraph shared allowance is not configured.");
  let count: unknown;
  try {
    count = await redis.eval(reserveScript, [KEY], [MAX_SEARCHES, WINDOW_MS, randomUUID()]);
  } catch {
    // A lost response can have reserved a request. Never retry or refund it.
    throw new Error("Soldgraph shared allowance is unavailable.");
  }
  if (count === 0) throw new Error("Soldgraph free allowance reached.");
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1 || count > MAX_SEARCHES) {
    throw new Error("Soldgraph shared allowance is unavailable.");
  }
}
