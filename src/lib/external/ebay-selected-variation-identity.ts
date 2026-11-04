import type { CardIdentityCandidate } from "@/lib/schemas";
import { collectorNumberConflict, collectorNumberPattern, collectorNumbersEquivalent } from "@/lib/comparison/collector-number";
import { assessPrintFidelity } from "@/lib/comparison/print-fidelity";

type VariationDetail = {
  itemId: string;
  title: string;
  price: { value: string; currency: string };
  localizedAspects?: Array<{ name: string; value: string }>;
};

// Call only with the unmerged response from the official getItem request. A
// summary or parent cannot borrow missing structured fields from another row.
// This proves identity only; normal eligibility still owns language, product,
// condition, activity, complete cost and recommendation-review gates.
export function hasSelectedEbayVariationIdentity(input: {
  requestedItemId: string;
  detail: VariationDetail | null;
  card: CardIdentityCandidate;
}) {
  const { requestedItemId, detail, card } = input;
  if (!detail || !/^v1\|\d+\|[1-9]\d*$/.test(requestedItemId) || detail.itemId !== requestedItemId) return false;
  // Restrict recovery to explicit card-selection titles. Ordinary low-match
  // titles keep their original result even when their aspects name this card.
  if (!/\b(?:choose|pick|select)\s+(?:your\s+)?(?:cards?|singles?)\b/i.test(detail.title)) return false;
  const aspects = detail.localizedAspects ?? [];
  const singleClaim = (field: string) => {
    const values = aspects.filter(aspect => normalizedClaim(aspect.name) === normalizedClaim(field));
    return values.length === 1 ? values[0].value.trim() : null;
  };
  const name = singleClaim("Card Name");
  const number = singleClaim("Card Number");
  const set = singleClaim("Set");
  if (!name || !number || !set || !card.name.trim() || !card.setName.trim()) return false;
  if (normalizedClaim(name) !== normalizedClaim(card.name) || !collectorNumbersEquivalent(number, card.cardNumber)) return false;
  const setClaims = [card.setName, card.setCode, `${card.setCode} ${card.setName}`, `${card.setName} ${card.setCode}`]
    .filter(Boolean).map(normalizedClaim);
  if (!setClaims.includes(normalizedClaim(set))) return false;

  // A matching aspect must not hide a contradictory number in the title.
  // Remove matching mentions first so a title containing both numbers still
  // runs through the existing collector-number conflict check.
  const expectedNumber = collectorNumberPattern(card.cardNumber);
  const remainingTitle = expectedNumber ? detail.title.replace(new RegExp(expectedNumber.source, "gi"), "") : detail.title;
  if (collectorNumberConflict(remainingTitle, card.cardNumber)) return false;
  const listingPrice = Number(detail.price.value);
  if (!Number.isFinite(listingPrice) || listingPrice < 0) return false;
  const assessment = assessPrintFidelity({ card, listingPrice, exactMarketAnchor: null,
    matchText: [detail.title, ...aspects.map(aspect => `${aspect.name}: ${aspect.value}`)].join(". ") });
  return assessment.match === "exact" || assessment.match === "compatible";
}

function normalizedClaim(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
