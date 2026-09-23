import { getRedisClient } from "@/lib/ops/redis";

// Both marketplace Actors share this lifetime pilot allowance: 20 starts at
// $0.03/Whatnot or $0.05/Mercari (at most $1 total). Never reset it on a new
// day, deploy or process. Separate approved Console tests are not app starts.
export const APIFY_PILOT_MAX_RUNS = 20;
const budgetKey = "tcglens:apify-pilot:2026-09-14:reserved-runs";

export async function reserveApifyPilotRun(): Promise<void> {
  const redis = getRedisClient();
  if (!redis) throw new Error("Paid source paused: shared pilot counter is not configured.");
  let count: number;
  try {
    count = await redis.incr(budgetKey);
  } catch {
    // A lost response may still have incremented the counter. Do not retry or
    // refund the reservation: over-counting is preferable to overspending.
    throw new Error("Paid source paused: shared pilot counter is unavailable.");
  }
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Paid source paused: shared pilot counter is unavailable.");
  if (count > APIFY_PILOT_MAX_RUNS) throw new Error("Cross-market pilot budget reached; this source is paused.");
}
