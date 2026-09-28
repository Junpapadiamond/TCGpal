import type { CardIdentityCandidate } from "@/lib/schemas";

export const hasBrowseReference = (card: CardIdentityCandidate) => typeof card.marketMid === "number" && card.marketMid > 0
    && Boolean(card.marketUrl && card.marketSource && card.marketAsOf && Number.isFinite(Date.parse(card.marketAsOf)));

export function budgetBrowseCandidates(cards: CardIdentityCandidate[], max: number) {
  return {
    within: cards.filter(card => hasBrowseReference(card) && card.marketMid! <= max),
    above: cards.filter(card => hasBrowseReference(card) && card.marketMid! > max),
    unknown: cards.filter(card => !hasBrowseReference(card)),
  };
}
