import { z } from "zod";
import { assessTitleMatch } from "@/lib/external/ebay";
import { isGradedListing } from "@/lib/comparison/graded-listing";
import type { CardIdentityCandidate, ConditionClaim, ListingSeed } from "@/lib/schemas";

// Whatnot has no buyer-side marketplace API — its own Seller API is scoped to
// `me` and is closed to new applicants — so active buy-now inventory comes
// through a provider actor that reads Whatnot's public GraphQL. Off unless
// WHATNOT_APIFY_TOKEN is set: no token, no agent, no calls.
const ACTOR_ID = "omgr8VWKxGZrtwQKJ";
const RUN_ENDPOINT = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;
// Observed 9-19s across live runs. The provider runs a container per call, so
// this is a floor of its design, not a tunable. The platform fan-out gives this
// agent its own longer budget; see whatnotPlatformAgent.searchTimeoutMs.
const REQUEST_TIMEOUT_MS = 25000;
const MAX_RESULTS = 40;

export function hasWhatnotCredentials() {
  return Boolean(process.env.WHATNOT_APIFY_TOKEN);
}

// Whatnot renders a listing's catalog attributes as one "∙"-delimited string
// ("Near Mint ∙ Evolving Skies"). Slot order is NOT guaranteed — a listing with
// no condition puts the set first, and sellers sometimes land a collector number
// in the set slot — so every segment is matched against a vocabulary instead of
// being read by position.
const CONDITION_FACETS: Record<string, ConditionClaim> = {
  // Whatnot grades above NM ("Mint") collapse to Near Mint: TCGlens has no
  // higher rung, and rounding a claim upward would overstate the seller.
  "mint": "Near Mint",
  "near mint": "Near Mint",
  "light played": "Lightly Played",
  "lightly played": "Lightly Played",
  "moderately played": "Moderately Played",
  "heavily played": "Heavily Played",
  "damaged": "Damaged",
};
const LANGUAGE_FACETS = new Set(["english", "japanese", "traditional chinese", "simplified chinese", "korean", "german", "french", "spanish", "italian"]);
const COLLECTOR_NUMBER = /^\d{1,4}\s*\/\s*\d{1,4}$/;

export type WhatnotFacets = {
  condition: ConditionClaim | null;
  language: string | null;
  setName: string | null;
  graded: boolean;
  sealed: boolean;
};

export function parseWhatnotSubtitle(subtitle: string): WhatnotFacets {
  const facets: WhatnotFacets = { condition: null, language: null, setName: null, graded: false, sealed: false };
  for (const segment of (subtitle ?? "").split("∙")) {
    const part = segment.trim();
    if (!part) continue;
    const key = part.toLowerCase();
    if (key === "graded") facets.graded = true;
    else if (key === "new") facets.sealed = true;
    else if (CONDITION_FACETS[key]) facets.condition = CONDITION_FACETS[key];
    else if (LANGUAGE_FACETS.has(key)) facets.language = part;
    // "Card" is a product-type facet, and a bare collector number is a seller
    // mistake in the set slot. Neither is a set name.
    else if (key !== "card" && !COLLECTOR_NUMBER.test(part)) facets.setName = part;
  }
  return facets;
}

export function whatnotListingUrl(id: string) {
  return `https://www.whatnot.com/listing/${id}`;
}

// Deliberately lenient: this is an undocumented upstream shape, so unknown
// fields are ignored and a single malformed row is skipped rather than failing
// the whole search.
const whatnotItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().default(""),
  subtitle: z.string().nullish(),
  description: z.string().nullish(),
  publicStatus: z.string().nullish(),
  transactionType: z.string().nullish(),
  quantity: z.number().nullish(),
  price: z.object({ amountSafe: z.number().nullish(), currency: z.string().nullish() }).nullish(),
  user: z.object({
    username: z.string().nullish(),
    sellerRating: z.object({ overall: z.number().nullish(), numReviews: z.number().nullish() }).nullish(),
  }).nullish(),
  images: z.array(z.object({ url: z.string().nullish(), label: z.string().nullish() })).nullish(),
});

function toSeed(item: z.infer<typeof whatnotItemSchema>, card: CardIdentityCandidate): ListingSeed {
  const title = item.title ?? "";
  const facets = parseWhatnotSubtitle(item.subtitle ?? "");
  // The facets are structured seller claims, so they belong in the same inert
  // text the deterministic variant/language gates read for eBay item specifics.
  const matchAspectText = [
    facets.condition ? `Condition: ${facets.condition}` : null,
    facets.setName ? `Set: ${facets.setName}` : null,
    facets.language ? `Language: ${facets.language}` : null,
  ].filter(Boolean).join(". ");
  const match = assessTitleMatch([title, facets.setName ?? ""].join(" ").trim(), card);
  const images = (item.images ?? []).map((image) => image.url).filter((url): url is string => Boolean(url));
  const labels = new Set((item.images ?? []).map((image) => image.label));
  const rating = item.user?.sellerRating;

  return {
    id: `whatnot-${item.id}`,
    marketplace: "Whatnot" as const,
    url: whatnotListingUrl(item.id),
    title,
    cardId: card.id,
    matchConfidence: match.confidence,
    matchReasons: match.reasons,
    active: true,
    // A "Graded" facet is Whatnot's own structured claim and is more reliable
    // than reading a slab out of the title; a "New" facet is sealed product.
    // Both are excluded downstream by the raw-single product gate.
    raw: !facets.graded && !facets.sealed && !isGradedListing(title),
    currency: "USD" as const,
    price: Math.round((item.price?.amountSafe ?? 0)) / 100,
    // Whatnot publishes no shipping cost before checkout — its own listing page
    // reads "$X + shipping + taxes". This is not a gap in the provider: the
    // figure does not exist until a buyer address resolves it against the
    // seller's flat-rate profile. Left null so the deterministic cost gate
    // excludes these rows from landed-cost ranking instead of guessing.
    shipping: null,
    claimedCondition: facets.condition ?? "Unknown",
    listingLanguage: facets.language,
    matchAspectText,
    imageUrl: images[0] ?? null,
    imageUrls: images,
    seller: {
      // Whatnot rates out of 5 stars; the ledger stores a percentage.
      feedbackPercentage: typeof rating?.overall === "number" ? (rating.overall / 5) * 100 : null,
      feedbackCount: typeof rating?.numReviews === "number" ? rating.numReviews : null,
      returnsAccepted: null,
      topRated: null,
      buyerProtection: null,
      subRatings: null,
    },
    evidence: {
      photoCount: images.length,
      frontBackExplicit: labels.has("Front") && labels.has("Back"),
      closeupsExplicit: false,
      surfaceExplicit: false,
      identityExplicit: false,
      substantiveConditionNotes: Boolean(item.description && item.description.trim().length > 40),
      missing: [],
    },
    observedAt: new Date().toISOString(),
    demo: false,
    userSupplied: false,
  };
}

export async function searchWhatnotListings(
  card: CardIdentityCandidate,
  fetcher: typeof fetch,
  query?: string,
): Promise<ListingSeed[]> {
  const token = process.env.WHATNOT_APIFY_TOKEN;
  if (!token) return [];
  const search = (query ?? `${card.name} ${card.cardNumber}`).trim();
  if (!search) return [];

  try {
    const response = await fetcher(`${RUN_ENDPOINT}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "search",
        vertical: "PRODUCT",
        includeListings: true,
        includeLivestreams: false,
        includeProducts: false,
        includeUsers: false,
        includeCategories: false,
        searchQueries: [search],
        maxResultsPerQuery: MAX_RESULTS,
        proxyConfiguration: { useApifyProxy: true },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return [];

    const seeds = new Map<string, ListingSeed>();
    for (const row of payload) {
      const parsed = whatnotItemSchema.safeParse(row);
      if (!parsed.success) continue;
      const item = parsed.data;
      // Auctions have a moving price and sold/removed rows are not inventory;
      // neither is a comparable buy-now candidate.
      if (item.transactionType !== "BUY_IT_NOW") continue;
      if (item.publicStatus !== "ACTIVE") continue;
      // One card can come back under several queries in a single run.
      if (seeds.has(item.id)) continue;
      seeds.set(item.id, toSeed(item, card));
    }
    return [...seeds.values()];
  } catch {
    // Failure isolation: a provider outage degrades this one source, and the
    // fan-out reports it as a source failure rather than failing the report.
    return [];
  }
}
