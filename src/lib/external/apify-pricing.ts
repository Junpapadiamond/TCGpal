import { z } from "zod";

const eventSchema = z.object({
  eventPriceUsd: z.number().finite().nonnegative().optional(),
  eventTieredPricingUsd: z.record(z.string(), z.object({ tieredEventPriceUsd: z.number().finite().nonnegative() })).optional(),
});
const pricingSchema = z.object({ data: z.object({ pricingInfos: z.array(z.object({
  startedAt: z.iso.datetime(), pricingModel: z.string(),
  minimalMaxTotalChargeUsd: z.number().finite().nonnegative().nullish(),
  pricingPerEvent: z.object({ actorChargeEvents: z.record(z.string(), eventSchema) }).optional(),
})).max(100) }) });

// Actor builds do not pin tariffs. Check public current prices before reserving
// a lifetime start; an unknown price must never trigger a speculative paid run.
export async function checkApifyPricing(input: {
  actor: string; provider: "whatnot" | "mercari"; memoryMbytes: number;
  maxResults: number; maxChargeUsd: number; fetcher: typeof fetch;
  signal?: AbortSignal; now?: Date;
}): Promise<number> {
  let payload: unknown;
  try {
    const response = await input.fetcher(new URL(`https://api.apify.com/v2/acts/${input.actor}`), {
      method: "GET", cache: "no-store", redirect: "error",
      signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(3_000)]) : AbortSignal.timeout(3_000),
    });
    if (!response.ok || !response.body) throw new Error();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 256_000) { await reader.cancel(); throw new Error(); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Paid source paused: current Apify pricing is unavailable.");
  }
  const parsed = pricingSchema.safeParse(payload);
  if (!parsed.success) throw new Error("Paid source paused: Apify pricing format needs review.");
  const now = input.now ?? new Date();
  const tariff = parsed.data.data.pricingInfos
    .filter((info) => new Date(info.startedAt) <= now)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  if (!tariff || tariff.pricingModel !== "PAY_PER_EVENT" || !tariff.pricingPerEvent) {
    throw new Error("Paid source paused: Apify pricing model needs review.");
  }
  const events = tariff.pricingPerEvent.actorChargeEvents;
  const resultEvent = input.provider === "whatnot" ? "item" : "apify-default-dataset-item";
  const counts: Record<string, number> = {
    "apify-actor-start": Math.max(1, Math.ceil(input.memoryMbytes / 1024)),
    [resultEvent]: input.maxResults,
    ...(input.provider === "mercari" ? { "search-request": 1 } : {}),
  };
  if (!events["apify-actor-start"] || !events[resultEvent]) {
    throw new Error("Paid source paused: Apify pricing events need review.");
  }
  let expectedCharge = 0;
  for (const [name, event] of Object.entries(events)) {
    // FREE is the conservative tariff even when the account has a paid plan.
    const price = event.eventTieredPricingUsd ? event.eventTieredPricingUsd.FREE?.tieredEventPriceUsd : event.eventPriceUsd;
    if (!Object.hasOwn(counts, name) || price === undefined) throw new Error("Paid source paused: Apify pricing events need review.");
    expectedCharge += counts[name] * price;
  }
  if (expectedCharge > input.maxChargeUsd + 1e-9 || (tariff.minimalMaxTotalChargeUsd ?? 0) > input.maxChargeUsd) {
    throw new Error(`Paid source paused: current Apify pricing exceeds the $${input.maxChargeUsd.toFixed(2)} per-run cap.`);
  }
  return expectedCharge;
}
