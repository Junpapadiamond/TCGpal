import { describe, expect, it } from "vitest";
import type { EligibilityIssue, NormalizedListing } from "@/lib/schemas";
import { summarizeExclusions } from "@/features/comparison/exclusion-summary";

function listing(id: string, eligible: boolean, issues: Partial<EligibilityIssue>[] = []): NormalizedListing {
  return {
    id,
    eligible,
    eligibilityIssues: issues.map((issue) => ({
      code: issue.code ?? "unknown",
      category: issue.category ?? "identity",
      disposition: issue.disposition ?? "exclude",
      message: issue.message ?? "",
    })),
    exclusionReasons: [],
  } as unknown as NormalizedListing;
}

describe("summarizeExclusions", () => {
  it("counts what was seen and buckets each excluded listing under one reason", () => {
    const summary = summarizeExclusions([
      listing("kept", true),
      listing("slab", false, [{ code: "excluded_product_type", category: "product" }]),
      listing("slab-2", false, [{ code: "not_raw_single", category: "product" }]),
      listing("floor", false, [{ code: "price_far_below_market", category: "price" }]),
    ]);

    expect(summary.found).toBe(4);
    expect(summary.excluded).toBe(3);
    expect(summary.groups).toEqual([
      { code: "product", count: 2 },
      { code: "price_floor", count: 1 },
    ]);
  });

  it("attributes a listing with several exclusions to its single most decisive reason", () => {
    // A graded slab that is also priced below the floor is excluded because it is
    // a slab; reporting it under both would make the counts exceed what was seen.
    const summary = summarizeExclusions([
      listing("both", false, [
        { code: "price_far_below_market", category: "price" },
        { code: "excluded_product_type", category: "product" },
      ]),
    ]);

    expect(summary.excluded).toBe(1);
    expect(summary.groups).toEqual([{ code: "product", count: 1 }]);
  });

  it("ignores review-only issues, which never excluded anything", () => {
    const summary = summarizeExclusions([
      listing("reviewable", true, [{ code: "language_unverified", category: "language", disposition: "review" }]),
    ]);

    expect(summary.excluded).toBe(0);
    expect(summary.groups).toEqual([]);
  });

  it("buckets an excluded listing that carries no typed issue as other", () => {
    const summary = summarizeExclusions([listing("mystery", false)]);
    expect(summary.groups).toEqual([{ code: "other", count: 1 }]);
  });

  it("orders groups by size so the dominant reason reads first", () => {
    const summary = summarizeExclusions([
      listing("a", false, [{ code: "identity_unverified", category: "identity" }]),
      listing("b", false, [{ code: "excluded_product_type", category: "product" }]),
      listing("c", false, [{ code: "identity_unverified", category: "identity" }]),
    ]);
    expect(summary.groups).toEqual([
      { code: "identity", count: 2 },
      { code: "product", count: 1 },
    ]);
  });
});
