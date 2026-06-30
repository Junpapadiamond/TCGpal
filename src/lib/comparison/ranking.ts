import {
  normalizedListingSchema,
  rankedChoiceSchema,
  type BuyerContext,
  type ListingEvidence,
  type NormalizedListing,
  type RankedChoice,
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

export function calculateSellerTrustScore(signals: SellerTrustSignals) {
  let score = 0;

  if (signals.feedbackPercentage !== null) {
    if (signals.feedbackPercentage >= 99.5) score += 40;
    else if (signals.feedbackPercentage >= 99) score += 30;
    else if (signals.feedbackPercentage >= 98) score += 20;
    else if (signals.feedbackPercentage >= 95) score += 10;
  }

  if (signals.feedbackCount !== null) {
    if (signals.feedbackCount >= 1000) score += 20;
    else if (signals.feedbackCount >= 100) score += 15;
    else if (signals.feedbackCount >= 10) score += 10;
  }

  score += signals.returnsAccepted === true ? 20 : signals.returnsAccepted === null ? 5 : 0;
  if (signals.topRated) score += 10;
  if (signals.buyerProtection) score += 10;

  return Math.min(100, score);
}

export function calculateEvidenceCompletenessScore(evidence: ListingEvidence) {
  // Photo count is the one evidence signal we can actually verify on an auto-fetched
  // listing, so it carries the score. The content flags (front/back, corners, surface,
  // condition notes) only add when they are genuinely known — i.e. a buyer asserted
  // them on a manually-entered listing — never guessed from marketplace prose.
  let score = 0;

  if (evidence.photoCount >= 8) score += 55;
  else if (evidence.photoCount >= 6) score += 45;
  else if (evidence.photoCount >= 4) score += 30;
  else if (evidence.photoCount >= 2) score += 16;
  else if (evidence.photoCount >= 1) score += 8;

  if (evidence.frontBackExplicit) score += 18;
  if (evidence.closeupsExplicit) score += 14;
  if (evidence.surfaceExplicit) score += 8;
  if (evidence.substantiveConditionNotes) score += 5;

  return Math.min(100, score);
}

export function normalizeListing(input: {
  listing: Omit<
    NormalizedListing,
    | "estimatedTax"
    | "preTaxTotal"
    | "estimatedLandedCost"
    | "sellerTrustScore"
    | "evidenceCompletenessScore"
    | "safetyScore"
    | "eligible"
    | "exclusionReasons"
  >;
  buyer: BuyerContext;
  marketPrice?: number | null;
}) {
  const { listing, buyer } = input;
  const shipping = listing.shipping ?? 0;
  const preTaxTotal = roundMoney(listing.price + shipping);
  // Tax the pre-tax total (item + shipping), not the item alone: that is what eBay
  // charges in most states and it keeps the math reconcilable — pre-tax, tax, and the
  // landed total now satisfy landed === preTax × (1 + rate).
  const estimatedTax = buyer.taxRate === null ? null : roundMoney(preTaxTotal * buyer.taxRate);
  const estimatedLandedCost = estimatedTax === null ? null : roundMoney(preTaxTotal + estimatedTax);
  const sellerTrustScore = calculateSellerTrustScore(listing.seller);
  const evidenceCompletenessScore = calculateEvidenceCompletenessScore(listing.evidence);
  const safetyScore = Math.round((sellerTrustScore * 0.6) + (evidenceCompletenessScore * 0.4));
  const exclusionReasons = getExclusionReasons(listing, input.marketPrice ?? null);

  return normalizedListingSchema.parse({
    ...listing,
    estimatedTax,
    preTaxTotal,
    estimatedLandedCost,
    sellerTrustScore,
    evidenceCompletenessScore,
    safetyScore,
    eligible: exclusionReasons.length === 0,
    exclusionReasons,
  });
}

export function rankListings(listings: NormalizedListing[]): RankedChoice[] {
  const eligible = listings.filter((listing) => listing.eligible);
  if (!eligible.length) return [];

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
    cheapest.estimatedTax === null
      ? `Lowest pre-tax total at $${cheapest.preTaxTotal.toFixed(2)}; tax is not included.`
      : `Lowest estimated landed cost at $${cheapest.estimatedLandedCost?.toFixed(2)}.`,
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
      `Highest combined seller and listing-evidence score (${safest.safetyScore}/100).`,
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
      `Most complete photo and condition evidence (${bestEvidence.evidenceCompletenessScore}/100); this is not a grade prediction.`,
    ));
  }

  return choices;
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
