import { z } from "zod";
import { assessTitleMatch } from "@/lib/external/ebay";
import { isGradedListing } from "@/lib/comparison/graded-listing";
import type { CardIdentityCandidate, ConditionClaim, ListingSeed } from "@/lib/schemas";

// Mercari US has no buyer-side marketplace API, so active listings come through
// a provider actor. Off unless MERCARI_APIFY_TOKEN is set.
const ACTOR_ID = "getascraper~mercari-us-scraper";
const RUN_ENDPOINT = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;
// Measured ~45s on live runs — slower than Whatnot, and well past the shared
// fan-out budget. See mercariPlatformAgent.searchTimeoutMs.
const REQUEST_TIMEOUT_MS = 60000;
const MAX_RESULTS = 40;

export function hasMercariCredentials() {
  return Boolean(process.env.MERCARI_APIFY_TOKEN);
}

/**
 * The card grade a Mercari seller actually wrote in the title.
 *
 * Mercari's own `condition_id` is a general-goods vocabulary — `new`,
 * `like_new`, `good`, `fair`, `poor` — shared across sneakers and phones. It is
 * not a card grade: a live run returned `new` for eleven copies of a 2023
 * single, and `like_new` is not a claim of Near Mint. Mapping it onto the
 * condition ladder would manufacture a seller claim that nobody made, so the
 * only condition trusted here is one the seller spelled out. Everything else
 * stays Unknown and is excluded by the normal condition gate.
 */
export function parseMercariTitleCondition(title: string): ConditionClaim {
  const found: ConditionClaim[] = [];
  if (/\b(?:damaged|dmg|creased?|poor)\b/i.test(title)) found.push("Damaged");
  if (/\bheavily\s*played\b|\bHP\b/i.test(title)) found.push("Heavily Played");
  if (/\bmoderately\s*played\b|\bMP\b/i.test(title)) found.push("Moderately Played");
  if (/\blightly\s*played\b|\bLP\b/i.test(title)) found.push("Lightly Played");
  if (/\bnear\s*mint\b|\bNM\b|\bmint\b/i.test(title)) found.push("Near Mint");
  if (found.length === 0) return "Unknown";
  // A stated range ("NM-LP") is a claim of its worst case, matching how the
  // comparison already reads condition ranges in eBay titles.
  const rank: Record<ConditionClaim, number> = {
    Unknown: 0, Damaged: 1, "Heavily Played": 2, "Moderately Played": 3, "Lightly Played": 4, "Near Mint": 5,
  };
  return found.sort((a, b) => rank[a] - rank[b])[0];
}

const mercariItemSchema = z.object({
  listing_id: z.string().min(1),
  url: z.string().nullish(),
  title: z.string().default(""),
  price: z.number().nullish(),
  currency: z.string().nullish(),
  listing_status: z.string().nullish(),
  condition_id: z.string().nullish(),
  brand: z.string().nullish(),
  category_path: z.array(z.string()).nullish(),
  media: z.object({ image_urls: z.array(z.string()).nullish() }).nullish(),
  seller_review_count: z.number().nullish(),
});

function toSeed(item: z.infer<typeof mercariItemSchema>, card: CardIdentityCandidate): ListingSeed {
  const title = item.title ?? "";
  const images = (item.media?.image_urls ?? []).filter(Boolean);
  const match = assessTitleMatch(title, card);
  const reviews = item.seller_review_count ?? 0;

  return {
    id: `mercari-${item.listing_id}`,
    marketplace: "Mercari" as const,
    url: item.url ?? `https://www.mercari.com/us/item/${item.listing_id}/`,
    title,
    cardId: card.id,
    matchConfidence: match.confidence,
    matchReasons: match.reasons,
    active: true,
    raw: !isGradedListing(title),
    currency: "USD" as const,
    // Mercari reports whole dollars, unlike Whatnot's cents.
    price: item.price ?? 0,
    // Not published in the listing payload; see the module note on Whatnot for
    // why an unknown stays unknown rather than becoming a guess.
    shipping: null,
    claimedCondition: parseMercariTitleCondition(title),
    listingLanguage: null,
    // Brand and category are the only structured identity signals Mercari gives;
    // the resale `condition_id` is deliberately excluded so it can never be read
    // as a card grade by a downstream gate.
    matchAspectText: [
      item.brand ? `Brand: ${item.brand}` : null,
      item.category_path?.length ? `Category: ${item.category_path.join(" > ")}` : null,
    ].filter(Boolean).join(". "),
    imageUrl: images[0] ?? null,
    imageUrls: images,
    seller: {
      // A seller with no reviews is unverified, not a zero-rated seller.
      feedbackPercentage: null,
      feedbackCount: reviews > 0 ? reviews : null,
      returnsAccepted: null,
      topRated: null,
      buyerProtection: null,
      subRatings: null,
    },
    evidence: {
      photoCount: images.length,
      frontBackExplicit: false,
      closeupsExplicit: false,
      surfaceExplicit: false,
      identityExplicit: false,
      substantiveConditionNotes: false,
      missing: [],
    },
    observedAt: new Date().toISOString(),
    demo: false,
    userSupplied: false,
  };
}

export async function searchMercariListings(
  card: CardIdentityCandidate,
  fetcher: typeof fetch,
  query?: string,
): Promise<ListingSeed[]> {
  const token = process.env.MERCARI_APIFY_TOKEN;
  if (!token) return [];
  const keyword = (query ?? `${card.name} ${card.cardNumber}`).trim();
  if (!keyword) return [];

  try {
    const response = await fetcher(`${RUN_ENDPOINT}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        keyword,
        status: ["on_sale"],
        limit: MAX_RESULTS,
        proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "US" },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return [];

    const seeds = new Map<string, ListingSeed>();
    for (const row of payload) {
      const parsed = mercariItemSchema.safeParse(row);
      if (!parsed.success) continue;
      const item = parsed.data;
      if (item.listing_status !== "on_sale") continue;
      if ((item.currency ?? "USD") !== "USD") continue;
      if (seeds.has(item.listing_id)) continue;
      seeds.set(item.listing_id, toSeed(item, card));
    }
    return [...seeds.values()];
  } catch {
    return [];
  }
}
