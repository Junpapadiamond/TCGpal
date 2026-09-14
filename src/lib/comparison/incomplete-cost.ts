import { requiresMarketPriceReview, type NormalizedListing } from "@/lib/schemas";

const missingCostCodes = new Set(["shipping_unknown", "buyer_fee_unknown"]);

// A conditional comparison, never a ranked choice. All non-cost gates still
// apply, including exact print, product exclusions, condition and market review.
export function incompleteCostOpportunity(listing: NormalizedListing, candidates: NormalizedListing[]) {
  if (listing.costComplete || listing.demo || !listing.active || !listing.raw
    || requiresMarketPriceReview(listing)
    || !listing.eligibilityIssues.some((issue) => missingCostCodes.has(issue.code))
    || listing.eligibilityIssues.some((issue) => issue.disposition === "exclude" && !missingCostCodes.has(issue.code))) return null;
  const cheapest = candidates.filter((candidate) => candidate.eligible && candidate.costComplete
    && !candidate.demo && candidate.cardId === listing.cardId && !requiresMarketPriceReview(candidate))
    .sort((a, b) => a.preTaxTotal - b.preTaxTotal || a.id.localeCompare(b.id))[0];
  const knownSubtotal = Math.round((listing.price + (listing.shipping ?? 0) + (listing.buyerFee ?? 0)) * 100) / 100;
  return {
    listingId: listing.id,
    knownSubtotal,
    comparisonListingId: cheapest?.id ?? null,
    missingCostBudget: cheapest ? Math.round((cheapest.preTaxTotal - knownSubtotal) * 100) / 100 : null,
  };
}
