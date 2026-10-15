import { z } from "zod";
import { createHash } from "node:crypto";
import { getRedisClient } from "@/lib/ops/redis";

const poolSchema = z.array(z.string().regex(/^apify_api_[A-Za-z0-9]+$/)).min(1).max(10);
const limitsSchema = z.object({ data: z.object({
  monthlyUsageCycle: z.object({ startAt: z.iso.datetime(), endAt: z.iso.datetime() }),
  limits: z.object({ maxMonthlyUsageUsd: z.number().nonnegative() }),
  current: z.object({ monthlyUsageUsd: z.number().nonnegative() }),
}) });

// A conservative spending ledger includes in-flight and uncertain runs. Use
// integer microdollars; never refund reservations or reset the shared pilot key.
const reserveAccountScript = `
local raw = redis.call('GET', KEYS[1])
if raw and not string.match(raw, '^%d+$') then return -1 end
local reserved = tonumber(raw or '0')
if not reserved or reserved > 9007199254740991 then return -1 end
local next = reserved + tonumber(ARGV[2])
if tonumber(ARGV[1]) + next > tonumber(ARGV[3]) then return 0 end
redis.call('SET', KEYS[1], next, 'EXAT', ARGV[4])
return 1
`;

// Explicitly authorized company test pool. Select before starting an Actor:
// never retry an ambiguous paid run or rotate around an access/rate restriction.
export async function selectApifyAccountToken(fixedToken: string, maxChargeUsd: number, fetcher: typeof fetch, signal?: AbortSignal): Promise<string> {
  if (process.env.APIFY_ACCOUNT_POOL_ENABLED !== "1") return fixedToken;
  let tokens: string[];
  try { tokens = [...new Set(poolSchema.parse(JSON.parse(process.env.APIFY_AUTHORIZED_TOKEN_POOL ?? "")))]; }
  catch { throw new Error("Authorized account pool configuration is invalid."); }
  const deadline = AbortSignal.timeout(8_000);
  const boundedSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (const token of tokens) {
    boundedSignal.throwIfAborted();
    let response: Response;
    let data: z.infer<typeof limitsSchema>["data"];
    try {
      response = await fetcher("https://api.apify.com/v2/users/me/limits", {
        headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: boundedSignal,
      });
    } catch { throw new Error("Apify account usage check failed; no account switch or Actor start."); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Apify account usage returned HTTP ${response.status}; no account switch or Actor start.`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Apify account usage response is invalid.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        boundedSignal.throwIfAborted();
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 32_768) { await reader.cancel(); throw new Error("oversize"); }
        chunks.push(part.value);
      }
      data = limitsSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))).data;
    } catch { throw new Error("Apify account usage response is invalid or timed out."); }
    finally { reader.releaseLock(); }
    const start = Date.parse(data.monthlyUsageCycle.startAt);
    const end = Date.parse(data.monthlyUsageCycle.endAt);
    if (start > Date.now() || end <= Date.now() || end <= start) throw new Error("Apify account usage cycle is invalid.");
    const used = Math.ceil(data.current.monthlyUsageUsd * 1_000_000 - 0.000001);
    const charge = Math.round(maxChargeUsd * 1_000_000);
    const maximum = Math.floor(Math.min(5, data.limits.maxMonthlyUsageUsd) * 1_000_000);
    if (!Number.isSafeInteger(used) || !Number.isSafeInteger(charge) || charge <= 0) throw new Error("Apify account usage is invalid.");
    if (used + charge > maximum) continue;
    const redis = getRedisClient();
    if (!redis) throw new Error("Apify account allowance storage is unavailable.");
    const digest = createHash("sha256").update(token).digest("hex");
    const key = `tcglens:apify-account-v2:${digest}:${start}`;
    let reserved: unknown;
    try {
      boundedSignal.throwIfAborted();
      reserved = await redis.eval(reserveAccountScript, [key], [used, charge, maximum, Math.ceil(end / 1000) + 86400]);
    } catch { throw new Error("Apify account allowance storage is unavailable; no Actor started."); }
    if (reserved === 1) return token;
    if (reserved !== 0) throw new Error("Apify account allowance storage is invalid.");
  }
  throw new Error("Apify account allowance exhausted on all authorized accounts; this source is paused.");
}
