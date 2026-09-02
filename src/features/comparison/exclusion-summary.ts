import type { EligibilityIssue, NormalizedListing } from "@/lib/schemas";

/**
 * A buyer-readable account of what the search actually saw.
 *
 * An empty result that says only "no trustworthy buy yet" is indistinguishable
 * from a broken product: the buyer cannot tell whether eBay had nothing, or
 * whether we found twenty copies and rejected every one. The report already
 * carries the typed reason each candidate was dropped — this collapses that into
 * a short, honest count the empty state can show without opening the trace.
 *
 * Counts must add up. A listing excluded for several reasons is attributed to
 * exactly one of them (the most decisive), so `excluded` always equals the sum
 * of the group counts and the sentence stays arithmetically true.
 */
export type ExclusionGroupCode =
  | "product"
  | "identity"
  | "price_floor"
  | "condition"
  | "cost"
  | "language"
  | "availability"
  | "other";

export type ExclusionSummary = {
  /** Live rows the sources returned, before any gate ran. */
  found: number;
  excluded: number;
  groups: { code: ExclusionGroupCode; count: number }[];
};

// Most decisive first. A graded slab priced below the floor is excluded because
// it is a slab — reporting the price is technically true and tells the buyer
// nothing about what to change.
const GROUP_PRIORITY: ExclusionGroupCode[] = [
  "product",
  "identity",
  "price_floor",
  "condition",
  "language",
  "cost",
  "availability",
  "other",
];

// The price category holds exactly the two market-floor gates, and both mean the
// same thing to a buyer: the row was too cheap to be the confirmed print. Every
// other code maps to its own category, so the table stays small on purpose.
const CODE_GROUPS: Record<string, ExclusionGroupCode> = {
  price_far_below_market: "price_floor",
  identity_price_guard: "price_floor",
};

function groupFor(issue: EligibilityIssue): ExclusionGroupCode {
  return CODE_GROUPS[issue.code] ?? issue.category;
}

export function summarizeExclusions(candidates: NormalizedListing[]): ExclusionSummary {
  const counts = new Map<ExclusionGroupCode, number>();
  let excluded = 0;

  for (const candidate of candidates) {
    if (candidate.eligible) continue;
    excluded += 1;
    // `review` issues never excluded anything; counting them would overstate the
    // gates and understate the inventory.
    const groups = new Set(
      (candidate.eligibilityIssues ?? [])
        .filter((issue) => issue.disposition === "exclude")
        .map(groupFor),
    );
    const primary = GROUP_PRIORITY.find((code) => groups.has(code)) ?? "other";
    counts.set(primary, (counts.get(primary) ?? 0) + 1);
  }

  const groups = [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    // Size first so the dominant reason leads; the fixed priority order breaks
    // ties so the same report never renders two different sentences.
    .sort((a, b) => b.count - a.count || GROUP_PRIORITY.indexOf(a.code) - GROUP_PRIORITY.indexOf(b.code));

  return { found: candidates.length, excluded, groups };
}
