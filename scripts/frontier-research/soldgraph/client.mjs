import { randomUUID } from "node:crypto";
import { z } from "zod";

// Founder-triggered research only. No imports from application code, cache,
// ranking, or marketplace transports; no writes or background polling.
const ORIGIN = "https://api.soldgraph.com";
const MAX_BYTES = 1_000_000;
const DEADLINE_MS = 20_000;
const inputSchema = z.object({
  founderTriggered: z.literal(true),
  apiKey: z.string().regex(/^sg_[!-~]{1,508}$/),
  marketplace: z.enum(["mercari", "whatnot"]),
  query: z.string().trim().min(1).max(200),
});
const money = z.object({ amount: z.number().nonnegative(), currency: z.literal("USD") });
const optionalClaim = z.string().max(200).nullable();
const commonRow = z.object({ id: z.string().min(1).max(200), title: z.string().max(2000).nullable(),
  link: z.string().max(1000), condition: optionalClaim });
const mercariRow = commonRow.extend({ id: z.string().regex(/^m\d+$/), displayed_price: money });
const whatnotRow = commonRow.extend({ displayed_price: money.nullable(), quantity: z.number().int().nonnegative(),
  grading_service: optionalClaim, grade: optionalClaim, card_set: optionalClaim, card_number: optionalClaim, language: optionalClaim });
const failureCode = z.enum(["schema", "network", "upstream", "throttled", "blocked", "rejected", "not_found",
  "filter_not_supported", "auth", "daily_limit", "deadline_exceeded", "credential_storage"]);
const envelope = z.object({ request_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  status: z.enum(["pending", "complete", "failed"]), credits: z.number().int().min(0).max(1), cached: z.boolean(),
  poll_url: z.string().max(200).optional(), result: z.unknown().optional(), error: z.object({ code: failureCode }).optional() });
class ResearchError extends Error {}
const stopped = reason => new ResearchError(`Soldgraph research stopped (${reason}).`);

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(stopped("cancelled"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(stopped("cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { signal.removeEventListener("abort", abort); resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

async function readJson(response, signal) {
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw stopped("response size");
  }
  if (!response.body) throw stopped("schema");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await abortable(reader.read(), signal);
      if (signal.aborted) throw stopped("cancelled");
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw stopped("response size");
      text += decoder.decode(chunk.value, { stream: true });
    }
    try { return JSON.parse(text + decoder.decode()); } catch { throw stopped("schema"); }
  } finally {
    signal.removeEventListener("abort", cancel);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function validatedPage(value, input, now) {
  const schema = z.object({ provider: z.literal(input.marketplace), country: z.literal("us"), query: z.string(),
    page: z.literal(1), count: z.number().int().min(0).max(3), collected_at: z.iso.datetime({ offset: true }),
    schema_version: z.literal(2), completeness: z.literal("provider_page_only"),
    data: z.array(input.marketplace === "mercari" ? mercariRow : whatnotRow).max(3) });
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw stopped("schema");
  const page = parsed.data;
  const age = now - Date.parse(page.collected_at);
  if (page.query.replace(/\s+/g, " ").trim() !== input.query || page.count !== page.data.length
    || age < -60_000 || age > 16 * 60_000 || new Set(page.data.map(row => row.id)).size !== page.data.length) throw stopped("schema");
  for (const row of page.data) {
    const expected = input.marketplace === "mercari" ? `https://www.mercari.com/us/item/${row.id}/`
      : `https://www.whatnot.com/listing/${row.id}`;
    if (row.link !== expected || (input.marketplace === "whatnot" && !/^[A-Za-z0-9_=-]+$/.test(row.id))) throw stopped("schema");
  }
  return page;
}

function observations(page, endpoint) {
  return page.data.map(row => {
    const field = (value, supportingField, confidence = "medium") => ({ value, sourceUrl: row.link,
      observedAt: page.collected_at, acquisitionMethod: "soldgraph-api", providerEndpoint: endpoint,
      supportingField, confidence: value === null ? "unknown" : confidence });
    return { sourceUrl: row.link, evidenceState: "provider-reported", verifiedForRanking: false, identityChecked: false,
      fields: { title: field(row.title, "result.data[].title"), itemPrice: field(row.displayed_price?.amount ?? null, "result.data[].displayed_price.amount"),
        currency: field(row.displayed_price?.currency ?? null, "result.data[].displayed_price.currency"),
        conditionClaim: field(row.condition, "result.data[].condition"), cardCondition: field(null, "not independently verified"),
        availability: field("provider-reported-active", "active-listings endpoint; not independently checked"),
        shipping: field(null, "not supplied"), buyerFee: field(null, "not supplied"), tax: field(null, "not supplied"),
        ...(page.provider === "whatnot" ? { quantity: field(row.quantity, "result.data[].quantity"),
          gradingService: field(row.grading_service, "result.data[].grading_service"), grade: field(row.grade, "result.data[].grade"),
          cardSet: field(row.card_set, "result.data[].card_set"), cardNumber: field(row.card_number, "result.data[].card_number"),
          language: field(row.language, "result.data[].language") } : {}),
      } };
  });
}

/** Exactly one search and at most one job check. Results remain in memory. */
export async function researchListings(options) {
  const parsed = inputSchema.safeParse(options);
  if (!parsed.success) throw stopped("explicit research trigger, key, marketplace and query required");
  const input = { ...parsed.data, query: parsed.data.query.replace(/\s+/g, " ") };
  const now = options.now ?? Date.now;
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  let deadlineReached = false;
  const timer = setTimeout(() => { deadlineReached = true; controller.abort(); }, DEADLINE_MS);
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const endpoint = `${ORIGIN}/v1/${input.marketplace}/listings`;
  const report = { label: "frontier-research", productionReady: false, marketplace: input.marketplace, query: input.query,
    observations: [], limitations: ["Provider-reported asks and availability, not independently verified.",
      "Exact card, print, raw status and condition are not validated.", "Shipping, buyer fees and tax are unknown.",
      "One source page only; no production cache, ranking or recommendation."] };
  const headers = { Authorization: `Bearer ${input.apiKey}`, Accept: "application/json", "Idempotency-Key": randomUUID() };
  const call = async url => {
    if (controller.signal.aborted) throw stopped("cancelled");
    const response = await abortable(fetcher(url, { method: "GET", headers, redirect: "error", cache: "no-store", signal: controller.signal }), controller.signal);
    if (![200, 202].includes(response.status)) {
      void response.body?.cancel().catch(() => undefined);
      throw stopped(`HTTP ${response.status}`);
    }
    const job = envelope.safeParse(await readJson(response, controller.signal));
    if (!job.success) throw stopped("schema");
    if (job.data.status === "pending" && (job.data.poll_url !== `/v1/jobs/${job.data.request_id}` || job.data.credits !== 0)) throw stopped("schema");
    return { job: job.data, retryAfter: response.headers.get("retry-after") };
  };
  try {
    const params = new URLSearchParams({ q: input.query, page: "1", count: "3", country: "us", sort: "best_match" });
    let { job, retryAfter } = await call(`${endpoint}?${params}`);
    const requestId = job.request_id;
    if (job.status === "pending") {
      const seconds = retryAfter === null ? 2 : /^\d+$/.test(retryAfter) ? Number(retryAfter) : (Date.parse(retryAfter) - now()) / 1000;
      // A longer or invalid upstream delay ends this bounded experiment.
      if (!Number.isFinite(seconds) || seconds > 5) return { ...report, status: "pending", requestId };
      let pause;
      try { await abortable(new Promise(resolve => { pause = setTimeout(resolve, Math.max(2, seconds) * 1000); }), controller.signal); }
      finally { clearTimeout(pause); }
      ({ job } = await call(`${ORIGIN}/v1/jobs/${requestId}?wait=20`));
      if (job.request_id !== requestId) throw stopped("schema");
    }
    if (job.status === "failed") {
      if (!job.error || job.credits !== 0) throw stopped("schema");
      return { ...report, status: "failed", failure: job.error.code, requestId };
    }
    if (job.status === "pending") return { ...report, status: "pending", requestId };
    if (job.credits !== 1) throw stopped("schema");
    const page = validatedPage(job.result, input, now());
    return { ...report, status: "complete", requestId, cached: job.cached, credits: job.credits,
      observations: observations(page, endpoint) };
  } catch (error) {
    if (controller.signal.aborted) throw stopped(deadlineReached ? "deadline" : "cancelled");
    if (error instanceof ResearchError) throw error;
    // Never include provider bodies, transport messages, headers or credentials.
    throw stopped("network");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}
