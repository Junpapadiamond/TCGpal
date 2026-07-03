import {
  normalizedListingSchema,
  rankedChoiceSchema,
  type BuyerContext,
  type ListingEvidence,
  type ListingSeed,
  type Marketplace,
  type NormalizedListing,
  type RankedChoice,
  type RiskLabel,
  type SellerTrustSignals,
} from "@/lib/schemas";

const exclusionPatterns = [
  /\b(psa|bgs|cgc|sgc)\s*\d/i,
  /\bslab(?:bed)?\b/i,
  /\bsealed\b/i,
  /\bbooster\b/i,
  /\blot\b/i,
  /\bproxy\b/i,
  /\breprint\b/i,
  /\bcustom\b/i,
  /\bdigital\b/i,
  // Novelty / replica items that carry the exact card name + number but are not
  // the real raw single (the dominant noise in cheap eBay search results).
  /\bgold\s+metal\b/i,
  /\bmetal\s+card\b/i,
  /\bsticker\b/i,
  /\bdecal\b/i,
  /\bcredit\s+card\b/i,
  /\bdiy\b/i,
  /\bfor\s+display\b/i,
  /\breplica\b/i,
  /\bacrylic\b/i,
  /\bfan[\s-]?made\b/i,
  /\bmagnet\b/i,
  /\bkeychain\b/i,
  /\bplush\b/i,
  /\bnon[\s-]?textured\b/i,
];

// Platform baseline trust (a data-driven table, not a ranking branch):
// marketplaces with built-in buyer protection earn a floor so that missing
// seller data is neutral coverage, never a systematic penalty ("unknown ≠ risky").
const platformTrustPriors: Record<Marketplace, number> = {
  TCGplayer: 55,
  eBay: 45,
  Mercari: 40,
  Whatnot: 35,
  "Local shop": 30,
  Facebook: 20,
  Reddit: 20,
  Other: 20,
};

export function getPlatformTrustPrior(marketplace: Marketplace) {
  return platformTrustPriors[marketplace] ?? platformTrustPriors.Other;
}

// True when we have no seller track record at all — the listing is scored with
// the platform baseline and labeled "unverified" instead of "higher risk".
export function isSellerUnverified(signals: SellerTrustSignals) {
  return signals.feedbackPercentage === null && signals.feedbackCount === null;
}

// Coverage-aware trust: known signals earn their points; unknown signals earn
// at the platform's baseline rate instead of counting as zero. Full data gives
// a pure evidence score; no data gives exactly the platform prior.
export function calculateSellerTrustScore(signals: SellerTrustSignals, marketplace: Marketplace = "Other") {
  let earned = 0;
  let covered = 0;

  if (signals.feedbackPercentage !== null) {
    covered += 40;
    if (signals.feedbackPercentage >= 99.5) earned += 40;
    else if (signals.feedbackPercentage >= 99) earned += 30;
    else if (signals.feedbackPercentage >= 98) earned += 20;
    else if (signals.feedbackPercentage >= 95) earned += 10;
  }

  if (signals.feedbackCount !== null) {
    covered += 20;
    if (signals.feedbackCount >= 1000) earned += 20;
    else if (signals.feedbackCount >= 100) earned += 15;
    else if (signals.feedbackCount >= 10) earned += 10;
  }

  if (signals.returnsAccepted !== null) {
    covered += 20;
    if (signals.returnsAccepted) earned += 20;
  }
  if (signals.topRated !== null) {
    covered += 10;
    if (signals.topRated) earned += 10;
  }
  if (signals.buyerProtection !== null) {
    covered += 10;
    if (signals.buyerProtection) earned += 10;
  }

  const prior = getPlatformTrustPrior(marketplace);
  return Math.min(100, Math.round(earned + (prior / 100) * (100 - covered)));
}

export function calculateEvidenceCompletenessScore(evidence: ListingEvidence) {
  let score = 0;

  if (evidence.photoCount >= 6) score += 30;
  else if (evidence.photoCount >= 4) score += 20;
  else if (evidence.photoCount >= 2) score += 10;

  if (evidence.frontBackExplicit) score += 20;
  if (evidence.closeupsExplicit) score += 15;
  if (evidence.surfaceExplicit) score += 15;
  if (evidence.identityExplicit) score += 10;
  if (evidence.substantiveConditionNotes) score += 10;

  return Math.min(100, score);
}

export function normalizeListing(input: {
  listing: ListingSeed;
  buyer: BuyerContext;
  marketPrice?: number | null;
}) {
  const { listing, buyer } = input;
  const shipping = listing.shipping ?? 0;
  const preTaxTotal = roundMoney(listing.price + shipping);
  const estimatedTax = buyer.taxRate === null ? null : roundMoney(listing.price * buyer.taxRate);
  const estimatedLandedCost = estimatedTax === null ? null : roundMoney(preTaxTotal + estimatedTax);
  const sellerTrustScore = calculateSellerTrustScore(listing.seller, listing.marketplace);
  const evidenceCompletenessScore = calculateEvidenceCompletenessScore(listing.evidence);
  const safetyScore = Math.round((sellerTrustScore * 0.6) + (evidenceCompletenessScore * 0.4));
  const unverified = isSellerUnverified(listing.seller);
  // The risk label reflects the seller's track record, not evidence volume:
  // search-API rows legitimately carry thin evidence (no full description or
  // photo data), and that thinness has its own verdict tag. Grading risk on it
  // would systematically mislabel one platform's listings "higher risk" (R4).
  const riskLabel: RiskLabel = unverified
    ? "unverified"
    : sellerTrustScore >= 75
      ? "low_risk"
      : sellerTrustScore >= 50
        ? "some_risk"
        : "higher_risk";
  const prior = getPlatformTrustPrior(listing.marketplace);
  const trustNotes = unverified
    ? [`No seller track record was available, so this listing is unverified — scored with the ${listing.marketplace} platform baseline (${prior}/100), not marked higher risk.`]
    : [];
  const exclusionReasons = getExclusionReasons(listing, input.marketPrice ?? null);

  return normalizedListingSchema.parse({
    ...listing,
    estimatedTax,
    preTaxTotal,
    estimatedLandedCost,
    sellerTrustScore,
    evidenceCompletenessScore,
    safetyScore,
    riskLabel,
    trustNotes,
    eligible: exclusionReasons.length === 0,
    exclusionReasons,
  });
}

export function rankListings(
  listings: NormalizedListing[],
  context: { marketPrice?: number | null } = {},
): RankedChoice[] {
  const eligible = listings.filter((listing) => listing.eligible);
  if (!eligible.length) return [];

  const marketPrice = context.marketPrice ?? null;
  const selected = new Set<string>();
  const choices: RankedChoice[] = [];

  const cheapest = [...eligible].sort((a, b) => {
    const aCost = a.estimatedLandedCost ?? a.preTaxTotal;
    const bCost = b.estimatedLandedCost ?? b.preTaxTotal;
    return aCost - bCost || b.safetyScore - a.safetyScore;
  })[0];

  choices.push(makeChoice(
    "lowest_landed_cost",
    cheapest,
    "Lowest landed cost",
    (cheapest.estimatedTax === null
      ? `Lowest pre-tax total at $${cheapest.preTaxTotal.toFixed(2)}; tax is not included.`
      : `Lowest estimated landed cost at $${cheapest.estimatedLandedCost?.toFixed(2)}.`)
      + aboveMarketContext(cheapest, marketPrice, true),
  ));
  selected.add(cheapest.id);

  const safest = pickDistinct(
    [...eligible].sort((a, b) => b.safetyScore - a.safetyScore || a.preTaxTotal - b.preTaxTotal),
    selected,
  );
  if (safest) {
    choices.push(makeChoice(
      "safest_listing",
      safest,
      "Safest listing",
      `Highest combined seller and listing-evidence score (${safest.safetyScore}/100).`
        + aboveMarketContext(safest, marketPrice),
    ));
    selected.add(safest.id);
  }

  const bestEvidence = pickDistinct(
    [...eligible].sort((a, b) =>
      b.evidenceCompletenessScore - a.evidenceCompletenessScore
      || b.sellerTrustScore - a.sellerTrustScore
      || a.preTaxTotal - b.preTaxTotal
    ),
    selected,
  );
  if (bestEvidence) {
    choices.push(makeChoice(
      "best_condition_evidence",
      bestEvidence,
      "Best condition evidence",
      `Most complete photo and condition evidence (${bestEvidence.evidenceCompletenessScore}/100); this is not a grade prediction.`
        + aboveMarketContext(bestEvidence, marketPrice),
    ));
  }

  return choices;
}

// Honesty label: a pick that beats the field but not the market must say so.
// For the cheapest lens this means supply is thin right now.
function aboveMarketContext(listing: NormalizedListing, marketPrice: number | null, cheapestLens = false) {
  if (marketPrice === null || marketPrice <= 0 || listing.demo) return "";
  const total = listing.estimatedLandedCost ?? listing.preTaxTotal;
  const delta = (total - marketPrice) / marketPrice;
  if (delta <= 0.02) return "";
  const pct = Math.round(delta * 100);
  return cheapestLens
    ? ` Supply is thin right now — even the cheapest eligible copy is +${pct}% over the $${marketPrice.toFixed(2)} TCGplayer market reference.`
    : ` Note: this copy costs +${pct}% over the $${marketPrice.toFixed(2)} TCGplayer market reference; it leads on evidence, not price.`;
}

// A genuine raw single never costs a tiny fraction of its catalog market price;
// items that do are almost always replicas, proxies, stickers, or mislabeled.
// The threshold is deliberately conservative so real underpriced/played copies stay.
const MARKET_FLOOR_RATIO = 0.25;

function getExclusionReasons(
  listing: Pick<NormalizedListing, "active" | "raw" | "currency" | "matchConfidence" | "title" | "price">,
  marketPrice: number | null,
) {
  const reasons: string[] = [];
  if (!listing.active) reasons.push("Listing is not active.");
  if (!listing.raw) reasons.push("Listing is not a raw single card.");
  if (listing.currency !== "USD") reasons.push("Listing is not priced in USD.");
  if (listing.matchConfidence === "low") reasons.push("Exact card/version match is low confidence.");
  if (exclusionPatterns.some((pattern) => pattern.test(listing.title))) reasons.push("Title suggests a slab, lot, sealed item, proxy, or other excluded product.");
  if (marketPrice !== null && marketPrice > 0 && listing.price < marketPrice * MARKET_FLOOR_RATIO) {
    reasons.push("Priced far below market — likely a replica, proxy, or mislabeled item.");
  }
  return reasons;
}

function pickDistinct(listings: NormalizedListing[], selected: Set<string>) {
  return listings.find((listing) => !selected.has(listing.id)) ?? null;
}

function makeChoice(
  role: RankedChoice["role"],
  listing: NormalizedListing,
  label: string,
  reason: string,
) {
  return rankedChoiceSchema.parse({
    role,
    listingId: listing.id,
    label,
    reason,
    confidence: listing.matchConfidence === "high" && listing.safetyScore >= 70 ? "high" : "medium",
  });
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
