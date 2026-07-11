import type { CardIdentityCandidate } from "@/lib/schemas";
import { findOnePieceCatalogVariants } from "@/lib/external/one-piece-catalog";
import { variantKey } from "@/lib/external/one-piece-tcg";

export const PRINT_IDENTITY_EXCLUDE_RATIO = 0.45;
export const PRINT_IDENTITY_REVIEW_RATIO = 0.70;

export type PrintMatch = "exact" | "compatible" | "unknown" | "mismatch";
export type PrintPriceGuard = "none" | "inspect" | "exclude";

export type PrintFidelityAssessment = {
  match: PrintMatch;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  priceGuard: PrintPriceGuard;
};

type PrintClass = "base" | "alt" | "sp" | "manga" | "treasure";

const genericAltPattern = /\b(alt(?:ernate)?[\s.]*art|parallel|full[\s-]*art|art\s*rare)\b/i;
const specialPatterns: ReadonlyArray<{ kind: Exclude<PrintClass, "base" | "alt">; pattern: RegExp }> = [
  { kind: "sp", pattern: /\bSP\b|special[\s-]*art/i },
  { kind: "manga", pattern: /\bmanga\b/i },
  { kind: "treasure", pattern: /treasure\s*rare|\bTR\b/i },
];

export function assessPrintFidelity(input: {
  card: CardIdentityCandidate;
  matchText: string;
  listingPrice: number;
  exactMarketAnchor: number | null;
}): PrintFidelityAssessment {
  const identity = classifyPrintIdentity(input.card, input.matchText);
  if (identity.match !== "unknown" || input.exactMarketAnchor === null || input.exactMarketAnchor <= 0) {
    return { ...identity, priceGuard: "none" };
  }

  const ratio = input.listingPrice / input.exactMarketAnchor;
  if (ratio < PRINT_IDENTITY_EXCLUDE_RATIO) {
    return {
      ...identity,
      reasons: [...identity.reasons, "price_far_below_exact_print_anchor"],
      priceGuard: "exclude",
    };
  }
  if (ratio < PRINT_IDENTITY_REVIEW_RATIO) {
    return {
      ...identity,
      reasons: [...identity.reasons, "price_below_exact_print_review_band"],
      priceGuard: "inspect",
    };
  }
  return { ...identity, priceGuard: "none" };
}

function classifyPrintIdentity(
  card: CardIdentityCandidate,
  matchText: string,
): Omit<PrintFidelityAssessment, "priceGuard"> {
  if (!isOnePiecePrint(card)) {
    return classifyPokemonPrintIdentity(card, matchText);
  }

  const text = matchText.trim();
  const selectedSuffix = printSuffix(card.id);
  const observedSuffix = explicitPrintSuffix(text, card.cardNumber);
  if (observedSuffix) {
    if (observedSuffix === (selectedSuffix ?? "base")) {
      return result("exact", "high", "canonical_print_id_matches");
    }
    return result("mismatch", "high", "canonical_print_id_names_sibling");
  }

  const selectedClass = printClass(card);
  const detectedSpecial = specialPatterns.find(({ pattern }) => pattern.test(text))?.kind ?? null;
  if (detectedSpecial && detectedSpecial !== selectedClass) {
    return result("mismatch", "high", "listing_names_different_print_class");
  }

  const siblings = findOnePieceCatalogVariants(card.cardNumber);
  const normalizedText = normalizePhrase(text);
  const selectedReleaseNamed = normalizePhrase(card.setName).length >= 8
    && normalizedText.includes(normalizePhrase(card.setName));
  const namedSiblingRelease = siblings.find((sibling) => {
    const siblingId = variantKey(sibling);
    const release = normalizePhrase(sibling.set_name ?? "");
    return siblingId !== card.id
      && release.length >= 8
      && release !== normalizePhrase(card.setName)
      && normalizedText.includes(release);
  });
  if (namedSiblingRelease && !selectedReleaseNamed) {
    return result("mismatch", "high", "listing_names_sibling_release");
  }
  if (selectedClass === "base") {
    if (detectedSpecial || genericAltPattern.test(text)) {
      return result("mismatch", "high", "listing_names_sibling_print");
    }
    if (siblings.length > 1) {
      return result("unknown", "low", "plain_family_listing_does_not_identify_print");
    }
    return result("compatible", "medium", "plain_family_listing_matches_base_print");
  }

  if (selectedClass === "alt") {
    if (!genericAltPattern.test(text)) {
      return result("unknown", "low", "listing_does_not_prove_selected_print");
    }
    const alternateSiblings = siblings.filter((sibling) => printClass(sibling) === "alt");
    if (alternateSiblings.length === 1) {
      return result("compatible", "medium", "generic_variant_is_unique_for_card_number");
    }
    return result("unknown", "low", "multiple_sibling_prints_share_generic_variant");
  }

  const sameClassSiblings = siblings.filter((sibling) => printClass(sibling) === selectedClass);
  if (detectedSpecial === selectedClass && sameClassSiblings.length === 1) {
    return result("compatible", "medium", "named_print_class_is_unique_for_card_number");
  }
  if (genericAltPattern.test(text)) {
    return result("mismatch", "high", "listing_names_generic_alternate_sibling");
  }
  return result("unknown", "low", "listing_does_not_prove_selected_print");
}

function classifyPokemonPrintIdentity(
  card: CardIdentityCandidate,
  matchText: string,
): Omit<PrintFidelityAssessment, "priceGuard"> {
  const normalizedText = normalizePhrase(matchText);
  const numberPattern = new RegExp(
    `(?:^|[^a-z0-9])${card.cardNumber
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s*")}(?:[^a-z0-9]|$)`,
    "i",
  );
  if (!numberPattern.test(matchText)) {
    return result("unknown", "low", "pokemon_listing_missing_full_collector_number");
  }

  const genericNameTokens = new Set(["card", "pokemon", "v", "vmax", "vstar", "ex", "gx"]);
  const meaningfulNameTokens = card.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !genericNameTokens.has(token));
  const nameMatches = meaningfulNameTokens.length > 0
    && meaningfulNameTokens.every((token) => normalizedText.includes(token));
  const setName = normalizePhrase(card.setName);
  const setCode = normalizePhrase(card.setCode);
  const setMatches = (setName.length >= 4 && normalizedText.includes(setName))
    || (setCode.length >= 3 && normalizedText.includes(setCode));

  if (!nameMatches && !setMatches) {
    return result("unknown", "low", "pokemon_listing_missing_name_or_set_proof");
  }
  return result(
    "compatible",
    "high",
    nameMatches ? "pokemon_full_number_and_name_match" : "pokemon_full_number_and_set_match",
  );
}

function result(match: PrintMatch, confidence: "high" | "medium" | "low", reason: string) {
  return { match, confidence, reasons: [reason] };
}

function isOnePiecePrint(card: Pick<CardIdentityCandidate, "cardNumber" | "id">) {
  return /^(?:OP|ST|EB|PRB|P)-?\d/i.test(card.cardNumber) || /^(?:OP|ST|EB|PRB|P)\d/i.test(card.id);
}

function printClass(print: { rarity?: string | null; variant?: string | null }): PrintClass {
  const rarity = (print.rarity ?? "").trim().toLowerCase();
  const variant = (print.variant ?? "").trim().toLowerCase();
  if (rarity === "sp" || rarity === "sp card" || variant.startsWith("special art")) return "sp";
  if (variant.includes("manga")) return "manga";
  if (rarity === "tr" || variant.includes("treasure")) return "treasure";
  return variant ? "alt" : "base";
}

function printSuffix(id: string) {
  return id.match(/_([a-z]\d+)$/i)?.[1]?.toLowerCase() ?? null;
}

function explicitPrintSuffix(text: string, familyId: string) {
  const escapedFamily = familyId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const canonical = text.match(new RegExp(`${escapedFamily}[_-]([a-z]\\d+)`, "i"))?.[1]?.toLowerCase();
  if (canonical) return canonical;
  const variant = text.match(/\(([a-z]\d+)\)/i)?.[1]?.toLowerCase();
  if (variant) return variant;
  const bareVariant = text.match(/\b([pr]\d+)\b/i)?.[1]?.toLowerCase();
  if (bareVariant) return bareVariant;
  if (/\bbase\s+print\b/i.test(text)) return "base";
  return null;
}

function normalizePhrase(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function canonicalPrintIdentity(card: CardIdentityCandidate) {
  const bundled = findOnePieceCatalogVariants(card.cardNumber).find((candidate) => variantKey(candidate) === card.id);
  return {
    canonicalPrintId: card.id,
    familyId: card.cardNumber,
    game: isOnePiecePrint(card) ? "onePiece" as const : "pokemon" as const,
    setName: card.setName,
    setCode: card.setCode,
    collectorNumber: card.cardNumber,
    rarity: card.rarity ?? null,
    variantLabel: card.variant ?? null,
    imageUrl: card.imageUrl ?? null,
    catalogVerified: Boolean(bundled) || !isOnePiecePrint(card),
  };
}
