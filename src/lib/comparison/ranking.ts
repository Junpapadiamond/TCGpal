import {
  normalizedListingSchema,
  rankedChoiceSchema,
  type BuyerContext,
  type ConditionClaim,
  type ListingEvidence,
  type ListingSeed,
  type Marketplace,
  type NormalizedListing,
  type RankedChoice,
  type RiskLabel,
  type SellerTrustSignals,
} from "@/lib/schemas";

const exclusionPatterns = [
  // Graded slabs. The grade can be joined to the grader by a space, colon, hash,
  // or nothing at all in real titles ("PSA 10", "CGC: 9", "BGS9.5", "PSA#10"), so
  // the separator is optional and permissive — but a digit must follow so a bare
  // brand mention never trips it. A separate "graded 9" guard covers the spelled-out
  // form without catching "ungraded"/"not graded" (no digit follows those).
  /\b(psa|bgs|cgc|sgc|ace)[\s:._#-]*\d/i,
  /\bgraded\s*\d/i,
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
  /\baltered\b/i,
  /\bmagnet\b/i,
  /\bkeychain\b/i,
  /\bplush\b/i,
  /\bnon[\s-]?textured\b/i,
];

// Which print the buyer confirmed: the plain base card, a generic alternate-art /
// parallel, or one of the specific special classes (SP, manga, treasure). One Piece
// reuses the same card number across all of these at very different prices, so a
// comparison must stay on the exact confirmed class — an SP buyer must never be
// recommended a regular alt art.
export type VariantIntent = "base" | "alt" | "sp" | "manga" | "treasure";

// Free-text markers that a listing is an alternate art / parallel / special print
// rather than the base. Kept deliberately specific so a base comparison is not
// polluted by (pricier) alt-art listings, and an alt-art comparison does not show
// base copies. Titles that merely say "holo"/"foil" are NOT alt-art signals.
const altArtTitlePattern = /\b(alt(?:ernate)?[\s.]*art|parallel|manga|full[\s-]*art|special[\s-]*art|art\s*rare|treasure\s*rare)\b/i;

// Specific special-print classes, checked before the generic alt marker: a title
// carrying one of these belongs to that class only, in both directions of the gate.
const specificVariantMarkers: ReadonlyArray<{
  intent: Exclude<VariantIntent, "base" | "alt">;
  pattern: RegExp;
  label: string;
}> = [
  { intent: "sp", pattern: /\bSP\b|special[\s-]*art/i, label: "SP (Special Art)" },
  { intent: "manga", pattern: /\bmanga\b/i, label: "manga art" },
  { intent: "treasure", pattern: /treasure\s*rare|\bTR\b/i, label: "Treasure Rare" },
];

// One Piece card keys ("OP01-016", "EB01-001_p2", "ST01-004", promo "P-096") are the
// only catalog whose numbers span multiple prints, so they alone get variant handling.
export function isOnePieceCardKey(cardNumber: string, id: string) {
  return /^(?:OP|ST|EB|PRB|P)-?\d/i.test(cardNumber) || /^(?:OP|ST|EB|PRB|P)\d/i.test(id);
}

// Map a confirmed catalog print (rarity + variant text as bundled in the One Piece
// catalog) onto the variant class the comparison must stay inside. "Secret Rare Alt"
// parallels behave as generic alternate arts: sellers title them with alt/parallel
// markers, and the base SEC print maps to "base".
export function deriveVariantIntent(print: { rarity?: string | null; variant?: string | null }): VariantIntent {
  const rarity = (print.rarity ?? "").trim().toLowerCase();
  const variant = (print.variant ?? "").trim().toLowerCase();
  if (rarity === "sp" || rarity === "sp card" || variant.startsWith("special art")) return "sp";
  if (variant.includes("manga")) return "manga";
  if (rarity === "tr" || variant.includes("treasure")) return "treasure";
  if (variant) return "alt";
  return "base";
}

// Human label for a variant class, used in exclusion reasons and abstention copy.
export function variantIntentLabel(intent: VariantIntent): string {
  const specific = specificVariantMarkers.find((marker) => marker.intent === intent);
  if (specific) return specific.label;
  return intent === "alt" ? "alternate-art" : "base";
}

// All variant-gate exclusion reasons carry this phrase; the abstention builder
// uses it to count "supply exists, but it's a different print" exclusions.
export function isVariantMismatchReason(reason: string) {
  return reason.includes("you're comparing");
}

// The variant gate, applied only to listings whose print must be inferred from free
// text (eBay and future auto-sourced marketplaces). TCGplayer rows are resolved to
// the exact product upstream, and a user-pasted listing is an explicit choice — so
// neither is second-guessed from its title.
function variantMismatchReason(
  listing: Pick<NormalizedListing, "title" | "marketplace" | "userSupplied">,
  intent: VariantIntent | null,
): string | null {
  if (!intent || listing.userSupplied || listing.marketplace === "TCGplayer") return null;
  const detected = specificVariantMarkers.filter((marker) => marker.pattern.test(listing.title));
  if (intent === "base") {
    if (detected.length > 0) {
      return `Title looks like a ${detected[0].label} print — you're comparing the base version.`;
    }
    if (altArtTitlePattern.test(listing.title)) {
      return "Title looks like an alternate-art / parallel print — you're comparing the base version.";
    }
    return null;
  }
  const own = specificVariantMarkers.find((marker) => marker.intent === intent) ?? null;
  const foreign = detected.find((marker) => marker.intent !== intent) ?? null;
  if (foreign) {
    return `Title looks like a ${foreign.label} print — you're comparing ${own ? `the ${own.label}` : "an alternate-art"} print.`;
  }
  if (own) {
    return own.pattern.test(listing.title)
      ? null
      : `Title has no ${own.label} marker — you're comparing the ${own.label} print.`;
  }
  return altArtTitlePattern.test(listing.title)
    ? null
    : "Title has no alternate-art marker — you're comparing an alternate-art print.";
}

// Platform baseline trust (a data-driven table, not a ranking branch):
// marketplaces with built-in buyer protection earn a floor so that missing
// seller data is neutral coverage, never a systematic penalty ("unknown ≠ risky").
const platformTrustPriors: Partial<Record<Marketplace, number>> = {
  TCGplayer: 55,
  eBay: 45,
  Mercari: 40,
  Whatnot: 35,
  Cardmarket: 45,
  SNKRDUNK: 35,
  "Local shop": 30,
  Facebook: 20,
  Reddit: 20,
  Other: 20,
};

export function getPlatformTrustPrior(marketplace: Marketplace) {
  return platformTrustPriors[marketplace] ?? platformTrustPriors.Other ?? 20;
}

// True when we have no seller track record at all — the listing is scored with
// the platform baseline and labeled "unverified" instead of "higher risk".
export function isSellerUnverified(signals: SellerTrustSignals) {
  return signals.feedbackPercentage === null
    && signals.feedbackCount === null
    && !hasKnownSellerSubRating(signals);
}

// Coverage-aware trust: known signals earn their points; unknown signals earn
// at the platform's baseline rate instead of counting as zero. Full data gives
// a pure evidence score; no data gives exactly the platform prior.
export function calculateSellerTrustScore(signals: SellerTrustSignals, marketplace: Marketplace = "Other") {
  const baseScore = calculateBaseSellerTrustScore(signals, marketplace);
  if (!hasKnownSellerSubRating(signals)) return baseScore;

  const subRatingScore = calculateSellerSubRatingScore(signals, marketplace);
  return Math.min(100, Math.round(baseScore * 0.85 + subRatingScore * 0.15));
}

function calculateBaseSellerTrustScore(signals: SellerTrustSignals, marketplace: Marketplace = "Other") {
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

function hasKnownSellerSubRating(signals: SellerTrustSignals) {
  const ratings = signals.subRatings;
  return Boolean(ratings && Object.values(ratings).some((value) => value !== null));
}

function calculateSellerSubRatingScore(signals: SellerTrustSignals, marketplace: Marketplace) {
  const ratings = signals.subRatings;
  const prior = getPlatformTrustPrior(marketplace);
  if (!ratings) return prior;

  const weights = {
    accurateDescription: 0.7,
    shippingCost: 0.1,
    shippingSpeed: 0.1,
    communication: 0.1,
  } as const;

  return Object.entries(weights).reduce((score, [key, weight]) => {
    const value = ratings[key as keyof typeof weights];
    return score + (value === null ? prior : sellerSubRatingToScore(value)) * weight;
  }, 0);
}

function sellerSubRatingToScore(value: number) {
  return Math.max(0, Math.min(100, ((value - 1) / 4) * 100));
}

// Maps a listing's price relative to the market anchor onto a 0-100 component: at
// or below 70% of market scores 100 (clearly below market — a strong "best value"
// signal), at market (100%) scores 50, 30%+ above market scores 0. When no market
// price is known, returns a neutral midpoint so the composite still ranks on
// safety/evidence alone rather than collapsing to zero.
export function calculatePriceComponent(landedOrPreTaxTotal: number, marketPrice: number | null) {
  if (marketPrice === null || marketPrice <= 0) return 50;
  const ratio = landedOrPreTaxTotal / marketPrice;
  if (ratio <= 0.7) return 100;
  // "+ 0" normalizes -0 (floating-point rounding can land exactly on a boundary,
  // e.g. ratio === 1.3, and produce -0, which fails strict equality against 0).
  if (ratio <= 1.0) return Math.round(100 - ((ratio - 0.7) / 0.3) * 50) + 0;
  if (ratio <= 1.3) return Math.round(50 - ((ratio - 1.0) / 0.3) * 50) + 0;
  return 0;
}

// Best Value uses four independent signals. Evidence is deliberately not hidden
// inside a second "safety" input and counted twice.
export const VALUE_WEIGHTS = { price: 0.4, condition: 0.25, seller: 0.2, evidence: 0.15 };

// Safety blends the two trust signals; exported so the UI's "check the math"
// receipt derives its displayed formula from the same constants.
export const SAFETY_WEIGHTS = { seller: 0.6, evidence: 0.4 };

export function calculateValueScore(input: {
  priceComponent: number;
  conditionCompatibilityScore: number;
  sellerTrustScore: number;
  evidenceCompletenessScore: number;
}) {
  return Math.round(
    input.priceComponent * VALUE_WEIGHTS.price
    + input.conditionCompatibilityScore * VALUE_WEIGHTS.condition
    + input.sellerTrustScore * VALUE_WEIGHTS.seller
    + input.evidenceCompletenessScore * VALUE_WEIGHTS.evidence,
  );
}

const CONDITION_RANK: Record<Exclude<ConditionClaim, "Unknown">, number> = {
  Damaged: 1,
  "Heavily Played": 2,
  "Moderately Played": 3,
  "Lightly Played": 4,
  "Near Mint": 5,
};

// Sellers routinely state a condition — or a range like "NM-LP" — in the title
// while the structured condition field says Near Mint. The stated range counts
// as its worst case, so this reads the lowest grade the title itself admits.
// "HP" is only Heavily Played in an explicit condition context (spelled out,
// parenthesized, or paired with another grade); bare "70 HP" is a Pokémon stat.
// Only ever used to gate DOWN, never to upgrade a claim.
export function titleConditionFloor(title: string): Exclude<ConditionClaim, "Unknown"> | null {
  const floors: Array<Exclude<ConditionClaim, "Unknown">> = [];
  if (/\b(?:damaged|dmg|for\s*parts|poor)\b/i.test(title)) floors.push("Damaged");
  if (
    /\bheavily\s*played\b/i.test(title)
    || /\b(?:NM|LP|MP)\s*[/\-–~]+\s*HP\b/i.test(title)
    || /\(\s*HP\s*\)/i.test(title)
    || /\bHP\s*[/\-–~]+\s*(?:MP|LP|DMG|damaged)\b/i.test(title)
  ) floors.push("Heavily Played");
  if (/\bmoderately\s*played\b|\bMP\b/i.test(title)) floors.push("Moderately Played");
  if (/\blightly\s*played\b|\bLP\b/i.test(title)) floors.push("Lightly Played");
  // Generic "played" with no grade attached still contradicts a Near Mint claim.
  if (floors.length === 0 && /\bplayed\b/i.test(title)) floors.push("Lightly Played");
  if (floors.length === 0) return null;
  return floors.sort((a, b) => CONDITION_RANK[a] - CONDITION_RANK[b])[0];
}

const CONDITION_SCORE: Record<ConditionClaim, number> = {
  Unknown: 25,
  Damaged: 10,
  "Heavily Played": 30,
  "Moderately Played": 55,
  "Lightly Played": 80,
  "Near Mint": 100,
};

export function calculateConditionCompatibilityScore(
  claimed: ConditionClaim,
  desired: ConditionClaim,
) {
  if (desired === "Unknown") return CONDITION_SCORE[claimed];
  if (claimed === "Unknown") return 0;
  return CONDITION_RANK[claimed] >= CONDITION_RANK[desired] ? 100 : 0;
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
  listing: ListingSeed;
  buyer: BuyerContext;
  marketPrice?: number | null;
  variantIntent?: VariantIntent | null;
  cardLanguage?: string | null;
}) {
  const { listing, buyer } = input;
  const costComplete = listing.shipping !== null;
  const shipping = listing.shipping ?? 0;
  const preTaxTotal = roundMoney(listing.price + shipping);
  // Tax the pre-tax total (item + shipping), not the item alone: that is what eBay
  // charges in most states and it keeps the math reconcilable — pre-tax, tax, and the
  // landed total now satisfy landed === preTax × (1 + rate).
  const estimatedTax = !costComplete || buyer.taxRate === null ? null : roundMoney(preTaxTotal * buyer.taxRate);
  const estimatedLandedCost = estimatedTax === null ? null : roundMoney(preTaxTotal + estimatedTax);
  const sellerTrustScore = calculateSellerTrustScore(listing.seller, listing.marketplace);
  const evidenceCompletenessScore = calculateEvidenceCompletenessScore(listing.evidence);
  const conditionCompatibilityScore = calculateConditionCompatibilityScore(listing.claimedCondition, buyer.desiredCondition);
  const safetyScore = Math.round((sellerTrustScore * SAFETY_WEIGHTS.seller) + (evidenceCompletenessScore * SAFETY_WEIGHTS.evidence));
  const marketPrice = input.marketPrice ?? null;
  // A condition-sensitive request may use the exact-print market anchor after
  // incompatible copies have been removed. "Any condition" deliberately does
  // not compare played copies against one blended anchor.
  // TCGCSV does not expose condition-level SKUs. Only an explicit NM request
  // paired with an NM seller claim gets the approximate aggregate-market read;
  // played-condition rows never borrow that anchor or appear "under market."
  const marketComparable = marketPrice !== null
    && marketPrice > 0
    && buyer.desiredCondition === "Near Mint"
    && listing.claimedCondition === "Near Mint";
  const priceScore = costComplete
    ? calculatePriceComponent(estimatedLandedCost ?? preTaxTotal, marketComparable ? marketPrice : null)
    : 0;
  const valueScore = calculateValueScore({
    priceComponent: priceScore,
    conditionCompatibilityScore,
    sellerTrustScore,
    evidenceCompletenessScore,
  });
  const exclusionReasons = getExclusionReasons(
    listing,
    buyer,
    marketPrice,
    input.variantIntent ?? null,
    input.cardLanguage ?? null,
  );

  // The risk label reflects the seller's track record, not evidence volume:
  // search-API rows legitimately carry thin evidence (no full description or
  // photo data), and that thinness has its own verdict. Grading risk on it
  // would systematically mislabel a whole platform's listings "higher risk".
  const unverified = isSellerUnverified(listing.seller);
  const riskLabel: RiskLabel = unverified
    ? "unverified"
    : sellerTrustScore >= 75
      ? "low_risk"
      : sellerTrustScore >= 50
        ? "some_risk"
        : "higher_risk";
  const prior = getPlatformTrustPrior(listing.marketplace);
  const trustNotes = [
    ...(unverified
    ? [`No seller track record was available, so this listing is unverified — scored with the ${listing.marketplace} platform baseline (${prior}/100), not marked higher risk.`]
      : []),
    ...sellerSubRatingTrustNotes(listing.seller),
  ];

  return normalizedListingSchema.parse({
    ...listing,
    costComplete,
    estimatedTax,
    preTaxTotal,
    estimatedLandedCost,
    sellerTrustScore,
    evidenceCompletenessScore,
    conditionCompatibilityScore,
    marketComparable,
    priceScore,
    safetyScore,
    valueScore,
    riskLabel,
    trustNotes,
    eligible: exclusionReasons.length === 0,
    exclusionReasons,
  });
}

function sellerSubRatingTrustNotes(signals: SellerTrustSignals) {
  const ratings = signals.subRatings;
  if (!ratings || !hasKnownSellerSubRating(signals)) return [];
  const labels: Array<[keyof NonNullable<SellerTrustSignals["subRatings"]>, string]> = [
    ["accurateDescription", "Accurate Description"],
    ["shippingCost", "Reasonable Shipping Cost"],
    ["shippingSpeed", "Shipping Speed"],
    ["communication", "Communication"],
  ];
  const known = labels
    .flatMap(([key, label]) => ratings[key] === null ? [] : `${label} ${formatRating(ratings[key])}/5`);
  return known.length ? [`eBay seller sub-ratings used: ${known.join(", ")}.`] : [];
}

function formatRating(value: number | null) {
  if (value === null) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// When a condition-level market anchor is unavailable, price still matters — but
// only relative to the compatible listings in this report. This prevents a played
// copy from borrowing an NM aggregate reference while keeping Best Value honest.
export function finalizeListingScores(listings: NormalizedListing[]) {
  const field = listings.filter((listing) =>
    listing.eligible && listing.costComplete && !listing.marketComparable
  );
  const costs = field.map(comparableCost);
  const min = costs.length > 0 ? Math.min(...costs) : null;
  const max = costs.length > 0 ? Math.max(...costs) : null;

  return listings.map((listing) => {
    if (!listing.eligible || !listing.costComplete || listing.marketComparable || min === null || max === null) {
      return listing;
    }
    const priceScore = max === min
      ? 50
      : Math.round(100 - ((comparableCost(listing) - min) / (max - min)) * 100);
    const valueScore = calculateValueScore({
      priceComponent: priceScore,
      conditionCompatibilityScore: listing.conditionCompatibilityScore,
      sellerTrustScore: listing.sellerTrustScore,
      evidenceCompletenessScore: listing.evidenceCompletenessScore,
    });
    return normalizedListingSchema.parse({ ...listing, priceScore, valueScore });
  });
}

export function rankListings(
  listings: NormalizedListing[],
  context: { marketPrice?: number | null } = {},
): RankedChoice[] {
  const eligible = finalizeListingScores(listings).filter((listing) => listing.eligible);
  if (!eligible.length) return [];

  const marketPrice = context.marketPrice ?? null;
  const choices: RankedChoice[] = [];

  // Best Value leads: the flagship recommendation — a deterministic composite of
  // price-vs-market, seller trust, and evidence, not just "cheapest." This is the
  // product's default answer to "which one do I buy."
  const bestValue = [...eligible].sort((a, b) => b.valueScore - a.valueScore || comparableCost(a) - comparableCost(b))[0];
  choices.push(makeChoice(
    "best_value",
    bestValue,
    "Best value",
    `Best combination of complete cost, condition fit, seller trust, and evidence (${bestValue.valueScore}/100).`
      + aboveMarketContext(bestValue, marketPrice),
  ));

  const cheapest = [...eligible].sort((a, b) =>
    comparableCost(a) - comparableCost(b) || b.safetyScore - a.safetyScore
  )[0];
  if (cheapest) {
    choices.push(makeChoice(
      "lowest_landed_cost",
      cheapest,
      "Cheapest",
      (cheapest.estimatedTax === null
        ? `Lowest pre-tax total at $${cheapest.preTaxTotal.toFixed(2)}; tax is not included.`
        : `Lowest estimated landed cost at $${cheapest.estimatedLandedCost?.toFixed(2)}.`)
        + aboveMarketContext(cheapest, marketPrice, true),
    ));
  }

  const safest = [...eligible].sort((a, b) =>
    b.safetyScore - a.safetyScore || comparableCost(a) - comparableCost(b)
  )[0];
  if (safest) {
    choices.push(makeChoice(
      "safest_listing",
      safest,
      "Safest buy",
      `Highest combined seller and listing-evidence score (${safest.safetyScore}/100).`
        + aboveMarketContext(safest, marketPrice),
    ));
  }

  const bestEvidence = [...eligible].sort((a, b) =>
    b.evidenceCompletenessScore - a.evidenceCompletenessScore
    || b.sellerTrustScore - a.sellerTrustScore
    || comparableCost(a) - comparableCost(b)
  )[0];
  if (bestEvidence) {
    choices.push(makeChoice(
      "best_condition_evidence",
      bestEvidence,
      "Best documented",
      `Most complete photo and condition evidence (${bestEvidence.evidenceCompletenessScore}/100); this is not a grade prediction.`
        + aboveMarketContext(bestEvidence, marketPrice),
    ));
  }

  return choices;
}

// Honesty label (R8): a pick that beats the field but not the market must say
// so. For the cheapest lens this means supply is thin right now.
function aboveMarketContext(listing: NormalizedListing, marketPrice: number | null, cheapestLens = false) {
  if (marketPrice === null || marketPrice <= 0 || listing.demo || !listing.marketComparable || !listing.costComplete) return "";
  const total = listing.estimatedLandedCost ?? listing.preTaxTotal;
  const delta = (total - marketPrice) / marketPrice;
  if (delta <= 0.02) return "";
  const pct = Math.round(delta * 100);
  return cheapestLens
    ? ` Supply is thin right now — even the cheapest eligible copy is +${pct}% over the $${marketPrice.toFixed(2)} TCGplayer market reference.`
    : ` Note: this copy costs +${pct}% over the $${marketPrice.toFixed(2)} TCGplayer market reference; it leads the field, not the market.`;
}

// A genuine raw single never costs a tiny fraction of its catalog market price;
// items that do are almost always replicas, proxies, stickers, or mislabeled.
// The threshold is deliberately conservative so real underpriced/played copies stay.
const MARKET_FLOOR_RATIO = 0.25;

function getExclusionReasons(
  listing: Pick<NormalizedListing, "active" | "raw" | "currency" | "matchConfidence" | "title" | "price" | "shipping" | "claimedCondition" | "marketplace" | "userSupplied">
    & { listingLanguage?: string | null },
  buyer: BuyerContext,
  marketPrice: number | null,
  variantIntent: VariantIntent | null = null,
  cardLanguage: string | null = null,
) {
  const reasons: string[] = [];
  if (!listing.active) reasons.push("Listing is not active.");
  if (!listing.raw) reasons.push("Listing is not a raw single card.");
  if (listing.currency !== "USD") reasons.push("Listing is not priced in USD.");
  if (listing.shipping === null) reasons.push("Shipping cost is unknown, so the checkout total cannot be compared safely.");
  if (listing.matchConfidence === "low") reasons.push("Exact card/version match is low confidence.");
  if (buyer.desiredCondition !== "Unknown") {
    if (listing.claimedCondition === "Unknown") {
      reasons.push(`Seller condition is not stated; the buyer requested ${buyer.desiredCondition} or better.`);
    } else if (CONDITION_RANK[listing.claimedCondition] < CONDITION_RANK[buyer.desiredCondition]) {
      reasons.push(`Seller claims ${listing.claimedCondition}; the buyer requested ${buyer.desiredCondition} or better.`);
    }
    // The title is also the seller's claim: "NM-LP" with a structured Near Mint
    // field still admits Lightly Played, and the worst stated case governs.
    // User-entered rows are an explicit choice and are not second-guessed.
    const conditionFloor = listing.userSupplied || listing.marketplace === "TCGplayer"
      ? null
      : titleConditionFloor(listing.title);
    if (conditionFloor && CONDITION_RANK[conditionFloor] < CONDITION_RANK[buyer.desiredCondition]) {
      reasons.push(`Title itself mentions ${conditionFloor} — a stated condition range counts as its worst case; the buyer requested ${buyer.desiredCondition} or better.`);
    }
  }
  if (exclusionPatterns.some((pattern) => pattern.test(listing.title))) reasons.push("Title suggests a slab, lot, sealed item, proxy, or other excluded product.");
  const marketFloorApplies = buyer.desiredCondition === "Near Mint" || buyer.desiredCondition === "Lightly Played";
  if (marketFloorApplies && marketPrice !== null && marketPrice > 0 && listing.price < marketPrice * MARKET_FLOOR_RATIO) {
    reasons.push("Priced far below market — likely a replica, proxy, or mislabeled item.");
  }
  const variantReason = variantMismatchReason(listing, variantIntent);
  if (variantReason) reasons.push(variantReason);
  const languageReason = languageMismatchReason(listing.title, cardLanguage, listing.listingLanguage ?? null);
  if (languageReason) reasons.push(languageReason);
  return reasons;
}

function languageMismatchReason(title: string, targetLanguage: string | null, listingLanguage: string | null) {
  if (!targetLanguage) return null;
  const target = targetLanguage.toLowerCase();
  const englishTarget = target === "en" || target.includes("english");
  const japaneseTarget = target === "jp" || target === "jpn" || target.includes("japanese");
  const languageEvidence = `${listingLanguage ?? ""} ${title}`;
  const explicitJapanese = /\b(japanese|jpn|jp)\b|日本語|日版/i.test(languageEvidence);
  const explicitEnglish = /\b(english|eng)\b/i.test(languageEvidence);
  const explicitOther = /\b(korean|chinese|french|german|spanish|italian|portuguese)\b/i.test(languageEvidence);

  if (englishTarget && (explicitJapanese || explicitOther)) {
    return "Title explicitly names a non-English card; the confirmed version is English.";
  }
  if (japaneseTarget && (explicitEnglish || explicitOther)) {
    return "Title explicitly names a non-Japanese card; the confirmed version is Japanese.";
  }
  return null;
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
    confidence: listing.matchConfidence === "high"
      && listing.costComplete
      && listing.conditionCompatibilityScore === 100
      && listing.safetyScore >= 70
      ? "high"
      : "medium",
  });
}

function comparableCost(listing: NormalizedListing) {
  return listing.estimatedLandedCost ?? listing.preTaxTotal;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
