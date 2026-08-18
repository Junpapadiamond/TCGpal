import { VALUE_WEIGHTS } from "@/lib/comparison/ranking";
import type { NormalizedListing } from "@/lib/schemas";

// Unknown shipping is the one exclusion this section is designed to survive:
// Whatnot publishes no shipping or tax before checkout, so every Whatnot row
// carries `shipping_unknown` and none can join the landed-cost ranking.
const SHIPPING_UNKNOWN = "shipping_unknown";

/**
 * Whatnot rows worth showing as an item-price-only reference.
 *
 * A row qualifies only when unknown shipping is the *sole* reason it cannot be
 * ranked — so it would have been a comparable candidate if Whatnot published a
 * shipping cost. Every other exclusion still applies: graded slabs, keychains
 * and other non-singles, sibling prints, and condition misses stay out. Showing
 * them "because they came from Whatnot" would put junk the ranked comparison
 * deliberately rejected back in front of the buyer under a friendlier heading.
 */
export function selectWhatnotReferenceListings(candidates: NormalizedListing[]): NormalizedListing[] {
  return candidates
    .filter((candidate) => candidate.marketplace === "Whatnot" && candidate.active && candidate.raw)
    .filter((candidate) => {
      const blocking = candidate.eligibilityIssues.filter((issue) => issue.disposition === "exclude");
      return blocking.length > 0 && blocking.every((issue) => issue.code === SHIPPING_UNKNOWN);
    })
    .sort((a, b) => a.price - b.price);
}


// The comparison's own value balance with the price term dropped and the rest
// renormalized. Derived from VALUE_WEIGHTS rather than restated, so a change to
// the product's weighting carries here instead of silently diverging.
//
// Price is dropped rather than down-weighted because a Whatnot item price is not
// comparable to anything: without shipping there is no total to reward, and
// letting the bare item price score would rank the row that hides the most cost
// highest. Condition, seller record, and evidence are all fully known here, so
// the rank rests only on what Whatnot actually publishes.
const COST_FREE_TOTAL = VALUE_WEIGHTS.condition + VALUE_WEIGHTS.seller + VALUE_WEIGHTS.evidence;

export const WHATNOT_VALUE_WEIGHTS = {
  condition: VALUE_WEIGHTS.condition / COST_FREE_TOTAL,
  seller: VALUE_WEIGHTS.seller / COST_FREE_TOTAL,
  evidence: VALUE_WEIGHTS.evidence / COST_FREE_TOTAL,
};

export type WhatnotRankedListing = NormalizedListing & { whatnotScore: number };

export function scoreWhatnotListing(listing: NormalizedListing): number {
  return Math.round(
    listing.conditionCompatibilityScore * WHATNOT_VALUE_WEIGHTS.condition
    + listing.sellerTrustScore * WHATNOT_VALUE_WEIGHTS.seller
    + listing.evidenceCompletenessScore * WHATNOT_VALUE_WEIGHTS.evidence,
  );
}

/**
 * Whatnot rows ranked among themselves, best first.
 *
 * Deliberately scoped to Whatnot: an item-only price cannot be ranked against
 * eBay's landed cost, so this never produces a cross-marketplace claim. Ties
 * fall to the cheaper item price so the order is deterministic.
 */
export function rankWhatnotReferenceListings(candidates: NormalizedListing[]): WhatnotRankedListing[] {
  return selectWhatnotReferenceListings(candidates)
    .map((listing) => ({ ...listing, whatnotScore: scoreWhatnotListing(listing) }))
    .sort((a, b) => b.whatnotScore - a.whatnotScore || a.price - b.price);
}
