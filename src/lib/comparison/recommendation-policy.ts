import type { NormalizedListing } from "@/lib/schemas";

// Conservative product policy, not a fraud probability. See the dated decision
// record. Missing evidence keeps the offer inspectable, without a Buy lens.
export const HIGH_VALUE_REVIEW_USD = 500;
type ReviewListing = Pick<NormalizedListing, "price" | "shipping" | "buyerFee" | "seller" | "evidence" | "sellerTrustScore" | "evidenceCompletenessScore" | "demo" | "imageKind">;

export function highValueReviewReasons(listing: ReviewListing): Array<"seller_record" | "photos"> {
  if (listing.demo || listing.price + (listing.shipping ?? 0) + (listing.buyerFee ?? 0) < HIGH_VALUE_REVIEW_USD) return [];
  const reasons: Array<"seller_record" | "photos"> = [];
  if ((listing.seller.feedbackCount ?? 0) < 100 || (listing.seller.feedbackPercentage ?? 0) < 99 || listing.sellerTrustScore < 60) reasons.push("seller_record");
  if (listing.imageKind === "catalog_reference" || listing.imageKind === "listing_preview"
    || listing.evidence.photoCount < 4 || listing.evidenceCompletenessScore < 50) reasons.push("photos");
  return reasons;
}

export function requiresHighValueReview(listing: ReviewListing) {
  return highValueReviewReasons(listing).length > 0;
}
