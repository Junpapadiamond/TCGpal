import type { ComparisonSnapshot } from "@/lib/comparison/report-snapshot";
import type { NormalizedListing, RankedChoice } from "@/lib/schemas";

function listingCost(listing: NormalizedListing) {
  return listing.estimatedLandedCost ?? listing.preTaxTotal;
}

function sortListingsForRole(listings: NormalizedListing[], role: RankedChoice["role"] | null) {
  return [...listings].sort((a, b) => {
    switch (role) {
      case "lowest_landed_cost":
        return listingCost(a) - listingCost(b) || b.safetyScore - a.safetyScore;
      case "safest_listing":
        return b.safetyScore - a.safetyScore || listingCost(a) - listingCost(b);
      case "best_condition_evidence":
        return b.evidenceCompletenessScore - a.evidenceCompletenessScore
          || b.sellerTrustScore - a.sellerTrustScore
          || listingCost(a) - listingCost(b);
      default:
        return b.valueScore - a.valueScore || listingCost(a) - listingCost(b);
    }
  });
}

export function buildReceiptModel(snapshot: ComparisonSnapshot) {
  const { report } = snapshot;
  const listingMap = new Map(report.candidates.map((listing) => [listing.id, listing]));
  const choice = report.rankedChoices.find((entry) => entry.role === "best_value")
    ?? report.rankedChoices.find((entry) => entry.role === "safest_listing")
    ?? report.rankedChoices[0]
    ?? null;
  const primaryListing = choice ? listingMap.get(choice.listingId) ?? null : null;
  const eligible = report.candidates.filter((listing) => listing.eligible);
  const ordered = sortListingsForRole(eligible, choice?.role ?? null);
  const alternative = primaryListing
    ? ordered.find((listing) => listing.id !== primaryListing.id) ?? null
    : null;
  const inspectListing = report.inspectListingId
    ? listingMap.get(report.inspectListingId) ?? null
    : null;
  const listingsToReview = primaryListing
    ? [primaryListing, ...(alternative ? [alternative] : [])]
    : inspectListing ? [inspectListing] : [];

  return {
    snapshot,
    report,
    card: report.confirmedCard,
    outcome: report.outcome ?? (primaryListing ? "best_buy" : inspectListing ? "inspect_first" : "next_moves"),
    primary: primaryListing && choice ? { listing: primaryListing, choice } : null,
    alternative,
    inspectListing,
    listingsToReview,
    eligibleCount: eligible.length,
    excluded: report.candidates.filter((listing) => !listing.eligible),
  };
}

export function buildReceiptRecheckPath(snapshot: ComparisonSnapshot) {
  const { report } = snapshot;
  const query = report.request.query?.trim()
    || [report.confirmedCard?.name, report.confirmedCard?.cardNumber].filter(Boolean).join(" ")
    || report.request.cardHint.name;
  const params = new URLSearchParams({
    agent: "1",
    game: report.request.cardHint.game,
    q: query,
    condition: report.request.buyer.desiredCondition,
  });
  if (report.confirmedCard?.id) params.set("card", report.confirmedCard.id);
  return `/?${params.toString()}`;
}

export function formatReceiptMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function receiptListingCost(listing: NormalizedListing) {
  return listingCost(listing);
}
