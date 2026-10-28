import { NextResponse } from "next/server";
import { getEbaySellerFeedback } from "@/lib/external/ebay-feedback";
import { parseEbayUrl } from "@/lib/external/ebay";
import { getJsonCache, setJsonCache } from "@/lib/ops/cache";
import { createRequestId, logOpsEvent } from "@/lib/ops/events";
import { rateLimitHeaders, rateLimitRequest } from "@/lib/ops/rate-limit";
import { sellerFeedbackRequestSchema, sellerFeedbackResponseSchema, type SellerFeedbackResponse } from "@/lib/schemas";

export const maxDuration = 10;
const flights = new Map<string, Promise<SellerFeedbackResponse>>();
const scope = "ebay-feedback-v1";

async function readBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 4096) throw new RangeError();
  if (!request.body) throw new Error();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel(); }, 1500);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new Error();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) { await reader.cancel(); throw new RangeError(); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const rateLimit = await rateLimitRequest(request, "seller-feedback");
  const headers = { ...rateLimitHeaders(rateLimit), "x-request-id": requestId, "Cache-Control": "no-store" };
  if (!rateLimit.allowed) return NextResponse.json({ error: "Too many seller feedback checks." }, {
    status: 429, headers: { ...headers, "Retry-After": String(rateLimit.retryAfterSeconds) },
  });
  let listingUrl: string;
  try { ({ listingUrl } = sellerFeedbackRequestSchema.parse(await readBody(request))); }
  catch (error) { return NextResponse.json({ error: "A valid eBay item URL is required." }, { status: error instanceof RangeError ? 413 : 400, headers }); }
  if (process.env.EBAY_FEEDBACK_ENABLED === "false") return NextResponse.json({
    status: "disabled", source: "eBay Feedback API", observedAt: new Date().toISOString(), periods: [],
  }, { headers });
  const key = parseEbayUrl(listingUrl).itemId!;
  const startedAt = Date.now();
  try {
    // Hash the item ID through the cache interface; never store usernames,
    // response text or seller IDs. Same listing URL variants share one result.
    let flight = flights.get(key);
    if (!flight) {
      flight = (async () => {
        const cached = await getJsonCache<SellerFeedbackResponse>(scope, key, { validate(value) {
          const parsed = sellerFeedbackResponseSchema.safeParse(value);
          return parsed.success ? parsed.data : null;
        } });
        if (cached) return cached;
        const result = sellerFeedbackResponseSchema.parse(await getEbaySellerFeedback(listingUrl));
        await setJsonCache(scope, key, result, { ttlSeconds: result.status === "unavailable" ? 30 : 900 });
        return result;
      })().finally(() => { flights.delete(key); });
      flights.set(key, flight);
    }
    const result = await flight;
    logOpsEvent({ event: "source_outcome", requestId, route: "seller-feedback", provider: "ebay-feedback",
      status: result.status === "unavailable" ? "failed" : "complete", count: result.periods.length, durationMs: Date.now() - startedAt });
    return NextResponse.json(result, { headers });
  } catch {
    logOpsEvent({ event: "provider_failure", requestId, route: "seller-feedback", provider: "ebay-feedback", status: "failed" });
    return NextResponse.json({ status: "unavailable", source: "eBay Feedback API", observedAt: new Date().toISOString(), periods: [] }, { headers });
  }
}
