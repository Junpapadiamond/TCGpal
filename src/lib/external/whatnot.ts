import { z } from "zod";
import { assessTitleMatch } from "@/lib/external/ebay";
import { isGradedListing } from "@/lib/comparison/graded-listing";
import { APIFY_MAX_RESULTS, httpsImageUrls, observationTime, providerRows, runApifySearch, sellerCardCondition } from "./apify";
import type { CardIdentityCandidate, ListingSeed } from "@/lib/schemas";

// The README shows dollars, but the September 14 pilot returned amountSafe equal
// to amount (16600, 100, 13900). Official Money.amount docs describe minor units;
// a listing-page check is still required before selecting the production unit.
// Never infer units from the price magnitude or silently migrate an old token.
export type WhatnotPriceUnit = "dollars" | "cents";
export function hasWhatnotCredentials() {
  return process.env.CROSS_MARKET_PRICE_PILOT_ENABLED === "1" && Boolean(process.env.WHATNOT_APIFY_TOKEN?.trim())
    && ["dollars", "cents"].includes(process.env.WHATNOT_APIFY_PRICE_UNIT ?? "");
}

const itemSchema = z.object({
  type: z.string().optional(), id: z.string().min(1).max(200), title: z.string().min(1).max(2000),
  subtitle: z.string().nullish(), description: z.string().nullish(),
  publicStatus: z.string().nullish(), transactionType: z.string().nullish(), quantity: z.number().nullish(),
  price: z.object({ amount: z.number().int().nonnegative().nullish(), amountSafe: z.number().nullish(), currency: z.string().nullish() }).nullish(),
  images: z.array(z.object({ url: z.string().nullish(), label: z.string().nullish() })).nullish(),
  user: z.object({ sellerRating: z.object({ overall: z.number().nullish(), numReviews: z.number().int().nonnegative().nullish() }).nullish() }).nullish(),
  scrapedAt: z.string().nullish(),
});

export function parseWhatnotListings(payload: unknown, card: CardIdentityCandidate, now: Date, unit: WhatnotPriceUnit): ListingSeed[] {
  const rows = providerRows(payload);
  const seeds = new Map<string, ListingSeed>();
  let valid = 0;
  for (const row of rows) {
    const parsed = itemSchema.safeParse(row);
    if (!parsed.success) continue;
    valid += 1;
    const item = parsed.data;
    if ((item.type && item.type !== "listing") || !["BUY_NOW", "BUY_IT_NOW"].includes(item.transactionType ?? "")
      || !["ACTIVE", "PUBLISHED"].includes(item.publicStatus ?? "") || (item.quantity != null && item.quantity <= 0)
      || item.price?.currency !== "USD") continue;
    const sourceAmount = unit === "cents" ? item.price.amount ?? item.price.amountSafe : item.price.amountSafe;
    if (typeof sourceAmount !== "number" || sourceAmount <= 0) continue;
    const price = Math.round(sourceAmount * (unit === "cents" ? 1 : 100)) / 100;
    if (price <= 0) continue;
    const facets = (item.subtitle ?? "").split(/[∙·•]/).map((s) => s.trim());
    const language = facets.find((facet) => /^(english|japanese|korean|german|french|spanish|italian|traditional chinese|simplified chinese)$/i.test(facet)) ?? null;
    const matchAspectText = item.subtitle ?? "";
    const match = assessTitleMatch(`${item.title} ${matchAspectText}`, card);
    const images = httpsImageUrls((item.images ?? []).map((image) => image.url));
    const labels = new Set((item.images ?? []).filter((image) => image.url && images.includes(image.url)).map((image) => image.label?.toUpperCase()));
    const reviews = item.user?.sellerRating?.numReviews;
    seeds.set(item.id, {
      id: `whatnot-${item.id}`, marketplace: "Whatnot", url: `https://www.whatnot.com/listing/${encodeURIComponent(item.id)}`,
      title: item.title, cardId: card.id, matchConfidence: match.confidence, matchReasons: match.reasons,
      matchAspectText, listingLanguage: language, active: true,
      raw: !isGradedListing(item.title) && !facets.some((facet) => /^graded$/i.test(facet)), currency: "USD",
      price,
      shipping: null, buyerFee: null,
      claimedCondition: sellerCardCondition(`${item.title} ${matchAspectText}`),
      imageUrl: images[0] ?? null, imageUrls: images,
      seller: { feedbackPercentage: null, feedbackCount: reviews && reviews > 0 ? reviews : null, returnsAccepted: null, topRated: null, buyerProtection: null, subRatings: null },
      evidence: { photoCount: images.length, frontBackExplicit: labels.has("FRONT") && labels.has("BACK"), closeupsExplicit: false, surfaceExplicit: false, identityExplicit: false, substantiveConditionNotes: false, missing: ["Shipping and buyer fees require checkout confirmation."] },
      observedAt: observationTime(item.scrapedAt, now), demo: false, userSupplied: false,
    });
  }
  if (rows.length > 0 && valid === 0) throw new Error("Whatnot listing schema changed; no inventory was inferred.");
  return [...seeds.values()];
}

export async function searchWhatnotListings(card: CardIdentityCandidate, fetcher: typeof fetch, query?: string, signal?: AbortSignal): Promise<ListingSeed[]> {
  if (!hasWhatnotCredentials()) throw new Error("Whatnot token and verified price unit are required.");
  const search = (query ?? `${card.name} ${card.cardNumber}`).trim().slice(0, 250);
  const unit = process.env.WHATNOT_APIFY_PRICE_UNIT as WhatnotPriceUnit;
  return runApifySearch({
    provider: "whatnot", actor: "epicscrapers~whatnot-scraper", build: "0.2.30", memoryMbytes: 256, token: process.env.WHATNOT_APIFY_TOKEN!,
    key: JSON.stringify([card.id, card.language, search, unit]), fetcher, signal,
    input: { mode: "search", vertical: "PRODUCT", includeListings: true, includeLivestreams: false, includeProducts: false, includeUsers: false, includeCategories: false, searchUrls: [], searchQueries: [search], filters: [], maxResults: APIFY_MAX_RESULTS, maxResultsPerQuery: APIFY_MAX_RESULTS, proxyConfiguration: { useApifyProxy: false }, cookies: null },
    parse: (payload, now) => parseWhatnotListings(payload, card, now, unit),
  });
}
