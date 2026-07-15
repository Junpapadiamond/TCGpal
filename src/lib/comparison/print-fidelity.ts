import type { CardIdentityCandidate } from "@/lib/schemas";
import { collectorNumberConflict, collectorNumberPattern } from "@/lib/comparison/collector-number";
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
  return classifyOnePiecePrintIdentity(card, matchText.trim());
}

type WitnessClass = "base" | "alternate" | "special" | "manga" | "wanted_poster" | "super_alternate" | "treasure";

type PrintWitness = {
  id: string;
  artworkClass: WitnessClass;
  treatments: Set<string>;
  exactMarkers: Set<string>;
  markers: Set<string>;
};

function classifyOnePiecePrintIdentity(
  card: CardIdentityCandidate,
  text: string,
): Omit<PrintFidelityAssessment, "priceGuard"> {
  const numberPattern = collectorNumberPattern(card.cardNumber);
  if (!numberPattern?.test(text)) {
    return collectorNumberConflict(text, card.cardNumber)
      ? result("mismatch", "high", "listing_names_different_collector_number")
      : result("unknown", "low", "one_piece_listing_missing_collector_number");
  }
  const cardNameTokens = phraseTokens(card.name).filter((token) => token.length >= 3);
  const listingNameTokens = phraseTokens(text);
  if (cardNameTokens.length > 0 && !cardNameTokens.some((token) => listingNameTokens.includes(token))) {
    return result("unknown", "low", "one_piece_listing_missing_card_name");
  }

  const siblings = buildWitnesses(card.cardNumber);
  const selected = siblings.find((sibling) => sibling.id.toLowerCase() === card.id.toLowerCase());
  if (!selected || siblings.length === 0) {
    return result("unknown", "low", "one_piece_witness_set_unavailable");
  }
  if (/\bgold\b/i.test(text) && /\bsilver\b/i.test(text)) {
    return result("unknown", "low", "listing_names_conflicting_print_treatments");
  }

  const markerOwners = buildMarkerOwners(siblings);
  const normalizedText = normalizePhrase(text);
  const markerEvidence = [...markerOwners.entries()]
    .filter(([marker, owners]) => owners.size < siblings.length && normalizedText.includes(marker));
  const siblingVeto = markerEvidence.find(([, owners]) => !owners.has(selected.id));
  if (siblingVeto) {
    return result("mismatch", "high", "listing_names_sibling_exact_print_marker");
  }

  const observed = detectResearchedPrintFacet(text);
  const evidenceSets: Set<string>[] = markerEvidence.map(([, owners]) => owners);
  if (observed.artworkClass) {
    const observedClass = observed.artworkClass as WitnessClass;
    const owners = new Set(siblings.filter((sibling) => sibling.artworkClass === observedClass).map((sibling) => sibling.id));
    if (!owners.has(selected.id)) {
      return result("mismatch", "high", "listing_names_different_artwork_class");
    }
    evidenceSets.push(owners);
  } else if (/\bbase\s+print\b/i.test(text)) {
    const owners = new Set(siblings.filter((sibling) => sibling.artworkClass === "base").map((sibling) => sibling.id));
    if (!owners.has(selected.id)) return result("mismatch", "high", "listing_names_sibling_print");
    evidenceSets.push(owners);
  }

  if (observed.treatment) {
    const owners = new Set(siblings.filter((sibling) => sibling.treatments.has(observed.treatment!)).map((sibling) => sibling.id));
    if (!owners.has(selected.id)) {
      return result("mismatch", "high", "listing_names_different_print_treatment");
    }
    evidenceSets.push(owners);
  }

  if (evidenceSets.length === 0) {
    return result("unknown", "low", "plain_family_listing_does_not_identify_print");
  }
  const possible = intersectEvidence(siblings, evidenceSets);
  if (!possible.has(selected.id)) {
    return result("mismatch", "high", "listing_evidence_identifies_sibling_print");
  }
  if (possible.size !== 1) {
    return result("unknown", "low", "one_piece_evidence_not_unique_across_siblings");
  }

  const textTokens = phraseTokens(text);
  const hasSelectedExactMarker = [...selected.exactMarkers]
    .some((marker) => phraseTokens(marker).every((token) => textTokens.includes(token)));
  const genericClassOnly = markerEvidence.length === 0
    && !observed.treatment
    && !hasSelectedExactMarker
    && observed.artworkClass !== "manga"
    && observed.artworkClass !== "wanted_poster"
    && observed.artworkClass !== "super_alternate"
    && !/\bbase\s+print\b/i.test(text);
  if (genericClassOnly) {
    return result("unknown", "low", "one_piece_class_evidence_requires_corroboration");
  }

  if (
    (card.competitionTier === "winner" || card.competitionTier === "participation")
    && !/\b\d+(?:st|nd|rd|th)\s+anniversary\b/i.test(text)
  ) {
    return result("unknown", "low", "one_piece_competition_tier_requires_release_proof");
  }
  return result("compatible", "high", "listing_evidence_uniquely_identifies_confirmed_print");
}

function buildWitnesses(cardNumber: string): PrintWitness[] {
  return findOnePieceCatalogVariants(cardNumber).map((sibling) => {
    const id = variantKey(sibling);
    const exactMarkers = (sibling.exact_markers ?? [])
      .map((marker) => marker.trim())
      .filter((marker) => marker.length >= 4 && !isGenericMarker(marker));
    const markers = [
      sibling.set_name ?? "",
      ...(sibling.collector_aliases ?? []),
      ...exactMarkers,
      ...releaseAliases(sibling.set_name ?? ""),
    ]
      .map((marker) => marker.trim())
      .filter((marker) => marker.length >= 4 && !isGenericMarker(marker));
    return {
      id,
      artworkClass: witnessClass(sibling),
      treatments: new Set(sibling.treatments ?? []),
      exactMarkers: new Set(exactMarkers),
      markers: new Set(markers),
    };
  });
}

function witnessClass(sibling: ReturnType<typeof findOnePieceCatalogVariants>[number]): WitnessClass {
  if (sibling.artwork_class === "alternate") return "alternate";
  if (sibling.artwork_class) return sibling.artwork_class;
  const derived = printClass(sibling);
  if (derived === "alt") return "alternate";
  if (derived === "sp") return "special";
  return derived;
}

function buildMarkerOwners(siblings: PrintWitness[]): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const sibling of siblings) {
    for (const marker of sibling.markers) {
      const key = normalizePhrase(marker);
      if (!key) continue;
      const current = owners.get(key) ?? new Set<string>();
      current.add(sibling.id);
      owners.set(key, current);
    }
  }
  return owners;
}

function releaseAliases(releaseName: string): string[] {
  const aliases: string[] = [];
  const anniversary = releaseName.match(/\b(\d+(?:st|nd|rd|th))\s+anniversary\b/i)?.[0];
  if (anniversary) aliases.push(anniversary);
  if (/premium\s+(?:card\s+)?collection/i.test(releaseName)) aliases.push("premium collection");
  if (/one\s+piece\s+card\s+the\s+best/i.test(releaseName)) aliases.push("the best");
  if (/tournament\s+pack/i.test(releaseName)) aliases.push("tournament pack");
  if (/\bwinner\b/i.test(releaseName)) aliases.push("winner");
  return aliases;
}

function isGenericMarker(marker: string): boolean {
  return new Set([
    "altart", "alternateart", "parallel", "specialart", "sp", "manga", "mangaart", "mangarare",
    "wanted", "wantedposter", "posterart", "gold", "silver", "red", "superalt", "superalternateart",
    "anniversary", "promo", "regional", "championship",
  ]).has(normalizePhrase(marker));
}

function intersectEvidence(siblings: PrintWitness[], evidenceSets: Set<string>[]): Set<string> {
  return evidenceSets.reduce(
    (possible, evidence) => new Set([...possible].filter((id) => evidence.has(id))),
    new Set(siblings.map((sibling) => sibling.id)),
  );
}

function detectResearchedPrintFacet(text: string): {
  artworkClass: CardIdentityCandidate["artworkClass"] | null;
  treatment: "gold" | "silver" | "red" | null;
} {
  if (/\bred\s+super\s+(?:alt|alternate(?:\s+art)?)\b/i.test(text)) {
    return { artworkClass: "super_alternate", treatment: "red" };
  }
  if (/\bsuper\s+(?:alt|alternate(?:\s+art)?)\b/i.test(text)) {
    return { artworkClass: "super_alternate", treatment: null };
  }
  if (/\bwanted(?:\s+poster)?\b|\bposter\s+art\b/i.test(text)) {
    return { artworkClass: "wanted_poster", treatment: null };
  }
  if (/\bmanga(?:\s+(?:art|rare))?\b/i.test(text)) {
    return { artworkClass: "manga", treatment: null };
  }
  if (/\bgold\b/i.test(text)) {
    return { artworkClass: /\bSP\b|special[\s-]*art/i.test(text) ? "special" : null, treatment: "gold" };
  }
  if (/\bsilver\b/i.test(text)) {
    return { artworkClass: /\bSP\b|special[\s-]*art/i.test(text) ? "special" : null, treatment: "silver" };
  }
  if (/\bSP\b|special[\s-]*art/i.test(text)) {
    return { artworkClass: "special", treatment: null };
  }
  if (genericAltPattern.test(text)) {
    return { artworkClass: "alternate", treatment: null };
  }
  return { artworkClass: null, treatment: null };
}

function classifyPokemonPrintIdentity(
  card: CardIdentityCandidate,
  matchText: string,
): Omit<PrintFidelityAssessment, "priceGuard"> {
  const normalizedText = normalizePhrase(matchText);
  const numberPattern = collectorNumberPattern(card.cardNumber);
  if (!numberPattern?.test(matchText)) {
    return collectorNumberConflict(matchText, card.cardNumber)
      ? result("mismatch", "high", "listing_names_different_collector_number")
      : result("unknown", "low", "pokemon_listing_missing_full_collector_number");
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

function normalizePhrase(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function phraseTokens(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 2 && token !== "card");
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
    artworkClass: card.artworkClass ?? null,
    treatments: card.treatments ?? [],
    originalSetCode: card.setCode,
    releaseName: card.setName,
    releaseCode: isOnePiecePrint(card) ? null : card.setCode,
    releaseChannel: card.releaseChannel ?? "unknown",
    releaseProvenance: card.releaseProvenance ?? (isOnePiecePrint(card) ? "unknown" : "original_set"),
    competitionTier: card.competitionTier ?? null,
    collectorAliases: card.collectorAliases ?? [],
    exactMarkers: card.exactMarkers ?? [],
    metadataRevision: card.metadataRevision ?? null,
    tcgplayerProductId: card.tcgplayerProductId ?? null,
    tcgplayerGroupId: card.tcgplayerGroupId ?? null,
  };
}
