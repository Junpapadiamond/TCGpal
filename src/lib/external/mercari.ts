import { z } from "zod";
import { assessTitleMatch } from "@/lib/external/ebay";
import { isGradedListing } from "@/lib/comparison/graded-listing";
import { APIFY_MAX_RESULTS, httpsImageUrls, observationTime, providerRows, runApifySearch, sellerCardCondition } from "./apify";
import type { CardIdentityCandidate, ListingSeed } from "@/lib/schemas";

export function hasMercariCredentials() {
  return process.env.CROSS_MARKET_PRICE_PILOT_ENABLED === "1" && process.env.MERCARI_APIFY_PROXY_ENABLED === "1"
    && Boolean(process.env.MERCARI_APIFY_TOKEN?.trim());
}
const itemSchema = z.object({
  type: z.string().optional(), listing_id: z.string().regex(/^m\d+$/),
  url: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && ["www.mercari.com", "mercari.com"].includes(url.hostname)
      && !url.username && !url.password && !url.port && /^\/us\/item\/m\d+\/?$/.test(url.pathname);
  }),
  title: z.string().min(1).max(2000), price: z.number(), currency: z.string().nullish(), listing_status: z.string().nullish(),
  shipping_payer: z.string().nullish(), shipping_fee: z.number().nonnegative().nullish(),
  thumbnail_url: z.string().nullish(), media: z.object({ image_urls: z.array(z.string()).nullish() }).nullish(),
  seller_review_count: z.number().int().nonnegative().nullish(),
  scrape_context: z.object({ scraped_time: z.number().nullish() }).nullish(),
});

export function parseMercariListings(payload: unknown, card: CardIdentityCandidate, now: Date): ListingSeed[] {
  const rows = providerRows(payload);
  const seeds = new Map<string, ListingSeed>();
  let valid = 0;
  for (const row of rows) {
    const parsed = itemSchema.safeParse(row);
    if (!parsed.success) continue;
    valid += 1;
    const item = parsed.data;
    if ((item.type && item.type !== "listing") || !["active", "on_sale"].includes(item.listing_status ?? "")
      || item.currency !== "USD" || item.price <= 0) continue;
    if (new URL(item.url).pathname.replace(/\/$/, "") !== `/us/item/${item.listing_id}`) throw new Error("Mercari item id conflicts with its listing URL.");
    const price = Math.round(item.price * 100) / 100;
    if (price <= 0) continue;
    const match = assessTitleMatch(item.title, card);
    const images = httpsImageUrls([item.thumbnail_url, ...(item.media?.image_urls ?? [])]);
    const shipping = item.shipping_payer === "seller" ? 0 : item.shipping_payer === "buyer" ? item.shipping_fee ?? null : null;
    seeds.set(item.listing_id, {
      id: `mercari-${item.listing_id}`, marketplace: "Mercari", url: `https://www.mercari.com/us/item/${item.listing_id}/`,
      title: item.title, cardId: card.id, matchConfidence: match.confidence, matchReasons: match.reasons,
      active: true, raw: !isGradedListing(item.title), currency: "USD", price, shipping,
      // The provider does not expose the checkout Buyer Protection fee. Mercari
      // documents 3.6% for current listings but legacy exceptions exist; do not
      // pass a policy estimate off as an observed complete checkout total.
      buyerFee: null, claimedCondition: sellerCardCondition(item.title),
      imageUrl: images[0] ?? null, imageUrls: images,
      seller: { feedbackPercentage: null, feedbackCount: item.seller_review_count && item.seller_review_count > 0 ? item.seller_review_count : null, returnsAccepted: null, topRated: null, buyerProtection: null, subRatings: null },
      evidence: { photoCount: images.length, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: false, substantiveConditionNotes: false, missing: ["Buyer Protection fee requires checkout confirmation.", ...(shipping === null ? ["Shipping requires checkout confirmation."] : [])] },
      observedAt: observationTime(item.scrape_context?.scraped_time, now), demo: false, userSupplied: false,
    });
  }
  if (rows.length > 0 && valid === 0) throw new Error("Mercari listing schema changed; no inventory was inferred.");
  return [...seeds.values()];
}

export async function searchMercariListings(card: CardIdentityCandidate, fetcher: typeof fetch, query?: string, signal?: AbortSignal): Promise<ListingSeed[]> {
  if (!hasMercariCredentials()) throw new Error("Mercari provider token is required.");
  const search = (query ?? `${card.name} ${card.cardNumber}`).trim().slice(0, 250);
  return runApifySearch({
    provider: "mercari", actor: "getascraper~mercari-us-scraper", build: "0.3.2", memoryMbytes: 2048, token: process.env.MERCARI_APIFY_TOKEN!,
    key: JSON.stringify([card.id, card.language, search]), fetcher, signal,
    input: { startUrls: [], keyword: search, sort: "relevance", status: ["on_sale"], limit: APIFY_MAX_RESULTS,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "US" } },
    parse: (payload, now) => parseMercariListings(payload, card, now),
  });
}
