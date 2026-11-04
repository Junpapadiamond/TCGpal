import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EligibilityIssue, NormalizedListing } from "@/lib/schemas";
import { listingFixture } from "@/lib/ai/verdict-note-fixtures";
import { summarizeExclusions } from "@/features/comparison/exclusion-summary";
import { SearchSummary } from "./SearchSummary";

const { sawSummary } = vi.hoisted(() => ({ sawSummary: vi.fn((...counts: number[]) => counts.join(" / ")) }));
vi.mock("./i18n", () => ({
  useLang: () => ({ lang: "en" }),
  useT: () => ({ result: { sawSummary, exclusionGroups: { other: (count: number) => String(count) } } }),
}));

function listing(id: string, eligible: boolean, issues: Partial<EligibilityIssue>[] = []): NormalizedListing {
  return listingFixture({
    id,
    price: 100,
    shipping: 0,
    eligible,
    eligibilityIssues: issues.map((issue) => ({
      code: issue.code ?? "unknown",
      category: issue.category ?? "identity",
      disposition: issue.disposition ?? "exclude",
      message: issue.message ?? "",
    })),
    exclusionReasons: [],
  });
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

  it("separates missing facts from observed contradictions without changing the total or legacy groups", () => {
    const rows = [
      listing("condition-missing", false, [{ code: "condition_unstated", category: "condition" }]),
      listing("charges-missing", false, [{ code: "shipping_unknown", category: "cost" }, { code: "buyer_fee_unknown", category: "cost" }]),
      listing("identity-missing", false, [{ code: "identity_unverified", category: "identity" }, { code: "identity_low_confidence", category: "identity" }]),
      listing("played", false, [{ code: "condition_below_requested", category: "condition" }]),
      listing("wrong-print", false, [{ code: "identity_sibling_mismatch", category: "identity" }, { code: "shipping_unknown", category: "cost" }]),
      listing("price-guard", false, [{ code: "identity_price_guard", category: "identity" }, { code: "condition_unstated", category: "condition" }]),
    ];
    const summary = summarizeExclusions(rows);
    expect(summary.incomplete).toBe(3);
    expect(summary.excluded).toBe(6);
    expect(summary.groups.reduce((sum, group) => sum + group.count, 0)).toBe(summary.excluded);
  });

  it("does not guess missing evidence for unknown issues or excluded rows without an explanation", () => {
    const summary = summarizeExclusions([
      listing("unknown", false, [{ code: "future_gate", category: "other" }]),
      listing("no-reason", false),
      listing("incomplete-with-conflict", false, [{ code: "shipping_unknown", category: "cost" }, { code: "language_conflict", category: "language" }]),
    ]);
    expect(summary.incomplete).toBe(0);
  });

  it("shows disjoint excluded, incomplete and hard-review counts while soft language warnings remain rankable", () => {
    const rows = [
      listing("buyable", true),
      listing("soft-language", true, [{ code: "language_unverified", category: "language", disposition: "review" }]),
      listing("shipping", false, [{ code: "shipping_unknown", category: "cost" }]),
      listing("identity", false, [{ code: "identity_low_confidence", category: "identity" }]),
      listing("played", false, [{ code: "condition_below_requested", category: "condition" }]),
      listing("price", false, [{ code: "price_far_below_market", category: "price" }]),
      listing("hard-review", true, [{ code: "catalog_edition_unresolved", category: "identity", disposition: "review" }]),
    ];
    sawSummary.mockClear();
    renderToStaticMarkup(createElement(SearchSummary, { candidates: rows }));
    expect(sawSummary).toHaveBeenCalledWith(7, 2, 2, 1);
  });
});
