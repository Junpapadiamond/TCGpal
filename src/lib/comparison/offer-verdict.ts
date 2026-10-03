import type { EligibilityIssue, Marketplace, NormalizedListing } from "@/lib/schemas";
import { incompleteCostOpportunity } from "./incomplete-cost";
import { rankListings } from "./ranking";

export type OfferVerdictKind = "consider" | "conditional" | "inspect" | "pass";
export type MissingOfferCharge = "shipping" | "buyer_fee";
export type OfferVerdict = {
  kind: OfferVerdictKind;
  issues: EligibilityIssue[];
  primaryIssue: EligibilityIssue | null;
  missingCharges: MissingOfferCharge[];
  // Sum of observed charges only. This is never a complete checkout total
  // when missingCharges is nonempty.
  knownSubtotal: number;
  identityConfirmed: boolean;
  conditionConfirmed: boolean;
  priceNeedsReview: boolean;
  comparison: ReturnType<typeof incompleteCostOpportunity>;
};

const hardDisqualifiers = new Set([
  "excluded_product_type", "not_raw_single", "identity_sibling_mismatch",
  "identity_variant_mismatch", "language_conflict", "listing_inactive",
  "unsupported_currency", "condition_below_requested", "title_condition_below_requested",
]);
const costCodes = new Set(["shipping_unknown", "buyer_fee_unknown"]);

function issuePriority(issue: EligibilityIssue) {
  if (hardDisqualifiers.has(issue.code)) return 0;
  if (issue.category === "price") return 1;
  if (issue.category === "identity") return 2;
  if (issue.category === "condition") return 3;
  if (issue.category === "cost") return 4;
  return 5;
}

// A decision about one observed offer, separate from production lens winners.
// Conditional offers describe what would need to be true before comparing
// checkout costs; they never promote unknown charges or identity to evidence.
export function buildOfferVerdict(listing: NormalizedListing, candidates: NormalizedListing[]): OfferVerdict {
  const issues = [...listing.eligibilityIssues];
  const add = (code: string, category: EligibilityIssue["category"], message: string) => {
    if (!issues.some((issue) => issue.code === code)) issues.push({ code, category, disposition: "exclude", message });
  };
  // Keep the assessment conservative even for old/partial cached payloads.
  if (!listing.active) add("listing_inactive", "availability", "Listing is not active.");
  if (!listing.raw) add("not_raw_single", "product", "Listing is not a raw single card.");
  if (listing.printMatch === "mismatch") add("identity_sibling_mismatch", "identity", "Listing evidence identifies another print.");
  const printConfirmed = listing.printMatch === "exact" || listing.printMatch === "compatible";
  const identityConfirmed = printConfirmed && listing.matchConfidence !== "low";
  if (!printConfirmed) add("identity_unverified", "identity", "Listing evidence does not prove the confirmed print.");
  if (listing.matchConfidence === "low") add("identity_low_confidence", "identity", "Card/version match is low confidence.");
  if (listing.claimedCondition === "Unknown" && listing.conditionCompatibilityScore === 0) {
    add("condition_unstated", "condition", "Seller condition is not stated; confirm the requested condition.");
  } else if (listing.claimedCondition !== "Unknown" && listing.conditionCompatibilityScore === 0) {
    add("condition_below_requested", "condition", "Seller condition is below the requested condition.");
  }
  if (listing.shipping === null) add("shipping_unknown", "cost", "Shipping cost is unknown.");
  if (listing.buyerFee === null) add("buyer_fee_unknown", "cost", "Mandatory buyer fees are unknown.");
  if (listing.printPriceGuard && listing.printPriceGuard !== "none" && !issues.some((issue) => issue.category === "price")) {
    add("identity_price_guard", "price", "The price needs review against the confirmed print.");
  }
  issues.sort((a, b) => issuePriority(a) - issuePriority(b) || a.code.localeCompare(b.code));
  const missingCharges: MissingOfferCharge[] = [
    ...(listing.shipping === null ? ["shipping" as const] : []),
    ...(listing.buyerFee === null ? ["buyer_fee" as const] : []),
  ];
  const knownSubtotal = [listing.price, listing.shipping, listing.buyerFee]
    .reduce<number>((cents, value) => cents + (value === null ? 0 : Math.round(value * 100)), 0) / 100;
  const conditionConfirmed = listing.claimedCondition !== "Unknown" && listing.conditionCompatibilityScore > 0
    && !issues.some((issue) => issue.category === "condition" && issue.disposition === "exclude");
  const priceNeedsReview = issues.some((issue) => issue.category === "price");
  const hardFailure = issues.some((issue) => hardDisqualifiers.has(issue.code));
  const unresolved = priceNeedsReview || !identityConfirmed
    || issues.some((issue) => issue.disposition === "exclude" && !costCodes.has(issue.code));
  const kind: OfferVerdictKind = hardFailure ? "pass"
    : unresolved ? "inspect"
      : missingCharges.length > 0 ? "conditional"
        : listing.eligible && listing.costComplete ? "consider" : "inspect";
  return {
    kind, issues, primaryIssue: issues[0] ?? null, missingCharges, knownSubtotal,
    identityConfirmed, conditionConfirmed, priceNeedsReview,
    comparison: kind === "conditional" ? incompleteCostOpportunity({ ...listing, eligibilityIssues: issues }, candidates) : null,
  };
}

// One useful offer to inspect within a market, not an additional global Buy.
// Valid complete offers retain existing Best Value behavior; otherwise prefer
// resolved print/condition evidence before an incomplete asking-price saving.
export function selectMarketOffer(candidates: NormalizedListing[], marketplace: Marketplace): NormalizedListing | null {
  const assessed = candidates.filter((listing) => listing.marketplace === marketplace)
    .map((listing) => ({ listing, verdict: buildOfferVerdict(listing, candidates) }))
    .filter(({ verdict }) => verdict.kind !== "pass");
  const comparable = assessed.filter(({ verdict }) => verdict.kind === "consider").map(({ listing }) => listing);
  const ranked = rankListings(comparable).find((choice) => choice.role === "best_value");
  if (ranked) return comparable.find((listing) => listing.id === ranked.listingId) ?? null;
  return assessed.sort((a, b) =>
    Number(a.verdict.priceNeedsReview) - Number(b.verdict.priceNeedsReview)
    || Number(b.verdict.identityConfirmed) - Number(a.verdict.identityConfirmed)
    || Number(b.verdict.conditionConfirmed) - Number(a.verdict.conditionConfirmed)
    || Number(a.verdict.kind !== "conditional") - Number(b.verdict.kind !== "conditional")
    || a.verdict.knownSubtotal - b.verdict.knownSubtotal
    || a.listing.id.localeCompare(b.listing.id)
  )[0]?.listing ?? null;
}
