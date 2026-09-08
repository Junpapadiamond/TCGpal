export function referenceReviewStatus({ productCount, officialObserved, observedProductImages, uniqueCandidate }) {
  if (!productCount) return "no_catalog_product_found";
  if (!officialObserved || observedProductImages < productCount) return "image_check_unavailable";
  return uniqueCandidate ? "machine_candidate_needs_review" : "alignment_unresolved";
}
