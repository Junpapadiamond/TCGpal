import { describe, expect, it } from "vitest";
import { referenceReviewStatus } from "./one-piece-reference-review.mjs";

describe("reference review evidence states", () => {
  it("does not call the observed CDN access failure an artwork ambiguity", () => {
    expect(referenceReviewStatus({ productCount: 3, officialObserved: true, observedProductImages: 0, uniqueCandidate: false }))
      .toBe("image_check_unavailable");
  });
  it("cannot verify a print when its official reference is missing", () => {
    expect(referenceReviewStatus({ productCount: 3, officialObserved: false, observedProductImages: 3, uniqueCandidate: true }))
      .toBe("image_check_unavailable");
  });
  it("cannot claim uniqueness while a competing product image is unavailable", () => {
    expect(referenceReviewStatus({ productCount: 3, officialObserved: true, observedProductImages: 2, uniqueCandidate: true }))
      .toBe("image_check_unavailable");
  });
  it("separates missing catalog data from non-unique image evidence", () => {
    expect(referenceReviewStatus({ productCount: 0, officialObserved: true, observedProductImages: 0, uniqueCandidate: false }))
      .toBe("no_catalog_product_found");
    expect(referenceReviewStatus({ productCount: 3, officialObserved: true, observedProductImages: 3, uniqueCandidate: false }))
      .toBe("alignment_unresolved");
  });
  it("keeps a unique machine candidate pending review", () => {
    expect(referenceReviewStatus({ productCount: 3, officialObserved: true, observedProductImages: 3, uniqueCandidate: true }))
      .toBe("machine_candidate_needs_review");
  });
});
