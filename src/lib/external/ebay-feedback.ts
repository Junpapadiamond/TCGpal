import { z } from "zod";
import { getEbaySellerForFeedback, hasEbayCredentials } from "./ebay";
import { sellerFeedbackRequestSchema, sellerFeedbackResponseSchema, type SellerFeedbackResponse } from "@/lib/schemas";

const API = "https://api.ebay.com";
const SCOPE = "https://api.ebay.com/oauth/api_scope/commerce.feedback.readonly";
const MAX_BYTES = 1_000_000;
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() });
const providerSchema = z.object({
  feedbackRatingSummary: z.array(z.object({
    ratingType: z.string(),
    ratingSummaryByRatingType: z.array(z.object({
      userRoleType: z.string().optional(),
      period: z.object({ unit: z.string(), value: z.number().int() }),
      feedbackRatingValueDistribution: z.array(z.object({
        value: z.string(), count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      })).max(20).optional(),
    })).max(100).optional(),
  })).max(20),
});
let token: { value: string; expiresAt: number } | null = null;
let tokenFlight: Promise<string> | null = null;

export function resetFeedbackTokenForTests() { token = null; tokenFlight = null; }

async function feedbackToken(fetcher: typeof fetch): Promise<string> {
  if (token && token.expiresAt > Date.now()) return token.value;
  if (tokenFlight) return tokenFlight;
  tokenFlight = (async () => {
    const response = await fetcher(`${API}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }),
    });
    if (!response.ok) throw new Error("Feedback authorization unavailable.");
    const parsed = tokenSchema.parse(await response.json());
    token = { value: parsed.access_token, expiresAt: Date.now() + Math.max(0, parsed.expires_in - 60) * 1000 };
    return token.value;
  })().finally(() => { tokenFlight = null; });
  return tokenFlight;
}

// One deadline covers token acquisition, the official Browse lookup, feedback
// retrieval and response bodies. No marketplace HTML, redirects or pagination.
function boundedFetcher(fetcher: typeof fetch, deadline: AbortSignal): typeof fetch {
  return async (input, init) => {
    const signal = init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline;
    signal.throwIfAborted();
    const response = await fetcher(input, { ...init, signal, redirect: "error", cache: "no-store" });
    if (!response.ok) { await response.body?.cancel(); return new Response(null, { status: response.status }); }
    if (Number(response.headers.get("content-length")) > MAX_BYTES || !response.body) {
      await response.body?.cancel(); throw new Error("Feedback response exceeds boundary.");
    }
    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Feedback response exceeds boundary."); }
        chunks.push(value);
      }
    } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
    signal.throwIfAborted();
    return new Response(Buffer.concat(chunks), { status: response.status, headers: { "Content-Type": "application/json" } });
  };
}

// Official contract: https://www.developer.ebay.com/develop/api/spec/feedback_api.json
// Preserve actual SELLER periods/distributions; BUYER and combined rows are not
// the seller's track record. Never reinterpret omitted buckets as zero.
export async function getEbaySellerFeedback(listingUrl: string, fetcher: typeof fetch = fetch): Promise<SellerFeedbackResponse> {
  sellerFeedbackRequestSchema.parse({ listingUrl });
  const base = { source: "eBay Feedback API" as const, observedAt: new Date().toISOString(), periods: [] };
  if (process.env.EBAY_FEEDBACK_ENABLED === "false") return { ...base, status: "disabled" };
  if (!hasEbayCredentials()) return { ...base, status: "unavailable" };
  const bounded = boundedFetcher(fetcher, AbortSignal.timeout(5000));
  try {
    const seller = await getEbaySellerForFeedback(listingUrl, bounded);
    if (!seller) return { ...base, status: "no_data" };
    const accessToken = await feedbackToken(bounded);
    const endpoint = new URL(`${API}/commerce/feedback/v1/feedback_rating_summary`);
    endpoint.searchParams.set("user_id", seller);
    endpoint.searchParams.set("filter", "ratingType:OVERALL_EXPERIENCE");
    const response = await bounded(endpoint, { headers: { Authorization: `Bearer ${accessToken}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } });
    if (response.status === 401 && token?.value === accessToken) token = null;
    if (!response.ok) throw new Error("Feedback unavailable.");
    const payload = providerSchema.parse(await response.json());
    const rows = payload.feedbackRatingSummary.filter(x => x.ratingType === "OVERALL_EXPERIENCE")
      .flatMap(x => x.ratingSummaryByRatingType ?? []).filter(x => x.userRoleType === "SELLER" && x.period.unit === "DAY");
    const periods: SellerFeedbackResponse["periods"] = [];
    for (const days of [30, 365] as const) {
      const matches = rows.filter(x => x.period.value === days);
      if (matches.length !== 1) continue;
      const distribution = matches[0].feedbackRatingValueDistribution ?? [];
      const counts = ["POSITIVE", "NEUTRAL", "NEGATIVE"].map(value => distribution.filter(x => x.value === value));
      if (counts.some(entries => entries.length !== 1)) continue;
      periods.push({ days, positive: counts[0][0].count, neutral: counts[1][0].count, negative: counts[2][0].count });
    }
    return sellerFeedbackResponseSchema.parse({ ...base, status: periods.length ? "complete" : "no_data", periods });
  } catch {
    return { ...base, status: "unavailable" };
  }
}
