import type { CardIdentityCandidate } from "@/lib/schemas";

// One freshness rule for both the daily feed and inline catalog fallback.
// The source date is not the time TCGlens retrieved the record.
export const MARKET_REFERENCE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
type ReferenceCard = Pick<CardIdentityCandidate, "marketMid" | "marketAsOf"> & Partial<Pick<CardIdentityCandidate, "id">>;

// The current Base catalog id spans editions; it does not carry a reviewed
// Unlimited / Shadowless / First Edition selection. Do not silently choose one.
export function hasUnresolvedCatalogEdition(card: Partial<Pick<CardIdentityCandidate, "id">>) {
  return /^base1-/i.test(card.id ?? "");
}

export function marketReferenceState(card: ReferenceCard | null | undefined, now = new Date()) {
  if (!card || typeof card.marketMid !== "number" || !Number.isFinite(card.marketMid) || card.marketMid <= 0) return "unavailable";
  const asOf = card.marketAsOf ? Date.parse(card.marketAsOf) : NaN;
  if (!Number.isFinite(asOf) || asOf > now.getTime()) return "unknown";
  return now.getTime() - asOf > MARKET_REFERENCE_MAX_AGE_MS ? "stale" : "fresh";
}

export function usableMarketPrice(card: ReferenceCard | null | undefined, now = new Date()): number | null {
  return card && !hasUnresolvedCatalogEdition(card) && marketReferenceState(card, now) === "fresh" ? card.marketMid! : null;
}
