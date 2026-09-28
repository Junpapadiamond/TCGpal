import { deriveVariantIntent, isOnePieceCardKey, normalizeListing, rankListings } from "./ranking";
import { recallCoverageSchema, requiresMarketPriceReview, type BuyerContext, type CardIdentityCandidate, type ListingSeed, type Marketplace, type NormalizedListing, type SearchAttempt } from "@/lib/schemas";

export type RecallObservation = {
  marketplace: Marketplace;
  attempts: SearchAttempt[];
  query: Pick<SearchAttempt, "kind" | "value"> | null;
  status: "complete" | "failed" | "disabled";
  observedAt: string;
  returnedCount: number;
  seeds: ListingSeed[];
};

// A probe is a small incremental sample, never a claim about population recall.
// Ranking owns every gate, including price review and condition compatibility.
export function buildRecallCoverage({ card, buyer, baseline, observation }: {
  card: CardIdentityCandidate;
  buyer: BuyerContext;
  baseline: NormalizedListing[];
  observation: RecallObservation;
}) {
  const known = new Set(baseline.map(row => row.id));
  const unique = [...new Map(observation.seeds.map(row => [row.id, row])).values()];
  const rows = unique.filter(row => !known.has(row.id)).map(listing => normalizeListing({
    listing, buyer, confirmedCard: card, marketPrice: card.marketMid ?? null,
    cardLanguage: card.language,
    variantIntent: isOnePieceCardKey(card.cardNumber, card.id) ? deriveVariantIntent(card) : null,
  }));
  const cheapest = (listings: NormalizedListing[]) => {
    const choice = rankListings(listings, { marketPrice: card.marketMid ?? null }).find(row => row.role === "lowest_landed_cost");
    return listings.find(row => row.id === choice?.listingId) ?? null;
  };
  const current = cheapest(baseline);
  const found = cheapest(rows);
  const comparable = rows.filter(row => row.eligible && row.costComplete && !requiresMarketPriceReview(row));
  const recoverable = new Set(["condition_unstated", "shipping_unknown", "buyer_fee_unknown", "identity_unverified"]);
  const unresolved = rows.filter(row => {
    const exclusions = row.eligibilityIssues.filter(issue => issue.disposition === "exclude");
    return exclusions.some(issue => recoverable.has(issue.code)) && exclusions.every(issue => recoverable.has(issue.code));
  });
  const cheaper = found && current && found.preTaxTotal < current.preTaxTotal;
  const status = observation.status !== "complete" ? observation.status
    : cheaper ? "cheaper_found" : found && !current ? "additional_match"
      : unresolved.length ? "inconclusive" : "no_cheaper_found";
  return recallCoverageSchema.parse({
    marketplace: observation.marketplace, attempts: observation.attempts, query: observation.query,
    status, observedAt: observation.observedAt, returnedCount: observation.returnedCount,
    newCount: rows.length, comparableCount: comparable.length, unresolvedCount: unresolved.length,
    baselineCheapestTotal: current?.preTaxTotal ?? null,
    listing: status === "cheaper_found" || status === "additional_match" ? found : null,
    // Item price is the only honest ordering when excluded rows have unknown charges.
    excluded: rows.filter(row => !row.eligible || requiresMarketPriceReview(row))
      .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id)).slice(0, 3),
  });
}
