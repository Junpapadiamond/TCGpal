import { z } from "zod";

// Separate research harness: never imported by product routes, the provider
// registry, caches or ranking. An invocation makes exactly one provider request.
const inputSchema = z.object({
  founderTriggered: z.literal(true), apiKey: z.string().regex(/^[!-~]{1,512}$/),
  query: z.string().trim().min(1).max(200),
});
const itemSchema = z.object({
  id: z.string().regex(/^m\d+$/), url: z.string().max(1000),
  title: z.string().min(1).max(2000), price_cents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
const pageSchema = z.object({ code: z.literal(200), data: z.object({
  query: z.string().max(200), total_results: z.number().int().nonnegative(), items: z.array(itemSchema).max(100),
}) });
class ResearchError extends Error {}
const stopped = reason => new ResearchError(`Crawlora research stopped (${reason}).`);

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(stopped("deadline"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(stopped("deadline"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { signal.removeEventListener("abort", abort); resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

async function readJson(response, signal) {
  if (Number(response.headers.get("content-length")) > 1_000_000 || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    throw stopped("response size");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const part = await abortable(reader.read(), signal);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1_000_000) throw stopped("response size");
      text += decoder.decode(part.value, { stream: true });
    }
    try { return JSON.parse(text + decoder.decode()); } catch { throw stopped("schema"); }
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function queryMercariResearch(rawInput, { fetcher = fetch } = {}) {
  const parsedInput = inputSchema.safeParse(rawInput);
  if (!parsedInput.success) throw stopped("input");
  const input = parsedInput.data;
  const endpoint = new URL("https://api.crawlora.net/api/v1/mercari/search");
  endpoint.searchParams.set("query", input.query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const startedAt = Date.now();
  try {
    const response = await abortable(fetcher(endpoint, {
      method: "GET", headers: { "x-api-key": input.apiKey, Accept: "application/json" },
      redirect: "error", cache: "no-store", signal: controller.signal,
    }), controller.signal);
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => undefined);
      throw stopped(`HTTP ${response.status}`);
    }
    const value = await readJson(response, controller.signal);
    const parsed = pageSchema.safeParse(value);
    if (!parsed.success) throw stopped("schema");
    const page = parsed.data.data;
    if (page.query !== input.query || new Set(page.items.map(item => item.id)).size !== page.items.length) throw stopped("schema");
    for (const item of page.items) {
      const canonical = `https://www.mercari.com/us/item/${item.id}`;
      if (item.url !== canonical && item.url !== `${canonical}/`) throw stopped("schema");
    }
    const observedAt = new Date().toISOString();
    const observations = page.items.slice(0, 3).map((item, index) => {
      const field = (value, supportingField) => ({ value, supportingField, sourceUrl: item.url, observedAt,
        providerEndpoint: endpoint.href, acquisitionMethod: "crawlora-api", confidence: value === null ? "unknown" : "medium" });
      return { sourceUrl: item.url, observedAt, evidenceState: "provider-reported", verifiedForRanking: false, identityChecked: false,
        fields: {
          title: field(item.title, `data.items[${index}].title`),
          priceCents: field(item.price_cents, `data.items[${index}].price_cents`),
          currency: field(null, "Currency is not documented; a cents field does not establish USD."),
          availability: field(null, "The documented response does not establish active/unsold status."),
          conditionClaim: field(null, "condition_code is a best-effort decoded field, not a supported card-condition claim."),
          shipping: field(null, "not supplied"), buyerFee: field(null, "not supplied"), tax: field(null, "not supplied"),
        },
        // Field names help audit live schema coverage; seller identifiers and
        // unknown field values never enter the minimal persisted observation.
        returnedFieldNames: Object.keys(value.data.items[index]).filter(name => /^[a-zA-Z0-9_]{1,80}$/.test(name)).sort(),
      };
    });
    return { mode: "frontier-research", provider: "crawlora", marketplace: "Mercari", query: input.query,
      observedAt, acquisitionTimestampMeaning: "provider response received; upstream collection time unknown",
      durationMs: Date.now() - startedAt, requestCount: 1, documentedCreditCost: 3,
      returnedCount: page.items.length, totalResultsClaim: page.total_results, observations };
  } catch (error) {
    if (error instanceof ResearchError) throw error;
    throw stopped(controller.signal.aborted ? "deadline" : "network");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
