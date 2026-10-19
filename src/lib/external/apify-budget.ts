import { getRedisClient } from "@/lib/ops/redis";

// Both marketplace Actors share the original lifetime allowance: 20 starts at
// $0.03/Whatnot or $0.05/Mercari. A separately approved, expiring cumulative
// ceiling can extend Whatnot only. Never reset this key on renewal, a new day,
// deploy or process. Separate approved Console tests are not application starts.
export const APIFY_PILOT_MAX_RUNS = 20;
const budgetKey = "tcglens:apify-pilot:2026-09-14:reserved-runs";
const maxApprovedRuns = 10_000;
const approvalError = "Paid source paused: pilot budget approval is incomplete or invalid.";
const expiredError = "Paid source paused: pilot budget approval has expired.";

// October 19 approval: ten starts / $0.50 total. The successful Console
// verification consumed one start; at most nine application starts remain.
// Keep this ledger permanently and also increment the original lifetime ledger.
const mercariRenewalKey = "tcglens:apify-pilot:2026-10-19:mercari-reserved-runs";
const mercariRenewalExpiry = Date.parse("2026-10-22T00:00:00Z");
const reserveMercariScript = `
local limit = tonumber(ARGV[1])
local now = redis.call('TIME')
if tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000) >= tonumber(ARGV[2]) then return -2 end
local counts = {}
for i = 1, 2 do
  local raw = redis.call('GET', KEYS[i])
  if raw and raw ~= '0' and not string.match(raw, '^[1-9][0-9]*$') then return -1 end
  counts[i] = tonumber(raw or '0')
  if not counts[i] or counts[i] >= 9007199254740991 then return -1 end
end
if counts[2] >= limit then return 0 end
redis.call('INCR', KEYS[1])
return redis.call('INCR', KEYS[2])
`;

// Checking before INCR in one Redis operation prevents rejected requests from
// inflating the lifetime count. Redis time also closes the check/reserve race at
// the approval deadline. No expiry, reset, refund, or local fallback is allowed.
const reserveScript = `
local limit = tonumber(ARGV[1])
local expiresAt = tonumber(ARGV[2])
if expiresAt > 0 then
  local now = redis.call('TIME')
  local nowMs = tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000)
  if nowMs >= expiresAt then return -2 end
end
local raw = redis.call('GET', KEYS[1])
local count = 0
if raw then
  if raw ~= '0' and not string.match(raw, '^[1-9][0-9]*$') then return -1 end
  count = tonumber(raw)
  if not count or count > 9007199254740991 then return -1 end
end
if count >= limit then return 0 end
return redis.call('INCR', KEYS[1])
`;

function approvedBudget(provider?: "whatnot" | "mercari") {
  const maximum = process.env.APIFY_PILOT_APPROVED_MAX_RUNS?.trim() ?? "";
  const deadline = process.env.APIFY_PILOT_APPROVAL_EXPIRES_AT?.trim() ?? "";
  if (!maximum && !deadline) return { limit: APIFY_PILOT_MAX_RUNS, expiresAt: 0 };

  const limit = Number(maximum);
  const expiresAt = Date.parse(deadline);
  if (!/^[1-9]\d*$/.test(maximum) || !Number.isSafeInteger(limit)
    || limit <= APIFY_PILOT_MAX_RUNS || limit > maxApprovedRuns
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(deadline)
    || !Number.isFinite(expiresAt)) throw new Error(approvalError);
  const canonicalDeadline = new Date(expiresAt).toISOString();
  if (deadline !== canonicalDeadline && deadline !== canonicalDeadline.replace(".000Z", "Z")) throw new Error(approvalError);
  if (expiresAt <= Date.now()) throw new Error(expiredError);

  // The failed Mercari transport needs its own review and authorization. Merely
  // configuring a Whatnot renewal must never enlarge Mercari's allowance.
  return provider === "whatnot" ? { limit, expiresAt } : { limit: APIFY_PILOT_MAX_RUNS, expiresAt: 0 };
}

export async function reserveApifyPilotRun(provider?: "whatnot" | "mercari"): Promise<void> {
  const mercariApproval = provider === "mercari" ? process.env.MERCARI_APIFY_APPROVED_RUNS?.trim() : undefined;
  if (mercariApproval && !/^[1-9]$/.test(mercariApproval)) throw new Error(approvalError);
  const { limit, expiresAt } = mercariApproval
    ? { limit: Number(mercariApproval), expiresAt: mercariRenewalExpiry }
    : approvedBudget(provider);
  if (expiresAt && expiresAt <= Date.now()) throw new Error(expiredError);
  const redis = getRedisClient();
  if (!redis) throw new Error("Paid source paused: shared pilot counter is not configured.");
  let count: unknown;
  try {
    count = await redis.eval(mercariApproval ? reserveMercariScript : reserveScript,
      mercariApproval ? [budgetKey, mercariRenewalKey] : [budgetKey], [limit, expiresAt]);
  } catch {
    // A lost response may still have incremented the counter. Do not retry or
    // refund the reservation: over-counting is preferable to overspending.
    throw new Error("Paid source paused: shared pilot counter is unavailable.");
  }
  if (count === -2) throw new Error(expiredError);
  if (count === 0) throw new Error("Cross-market pilot budget reached; this source is paused.");
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1 || count > limit) {
    throw new Error("Paid source paused: shared pilot counter is unavailable.");
  }
}
