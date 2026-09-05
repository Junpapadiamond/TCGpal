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

// Every way a seller says "not the base art" without naming which. A bare
// "Alt" ("SEC Alt", "Alt Foil") and the shorthand "AA" are as common in titles as
// "Alt Art", and the catalog itself labels secret-rare parallels "Secret Rare
// Alt" — a detector that needed the word "art" read those as silence, and the
// silence rule then handed a parallel's own listing to the base print.
const genericAltPattern = /\b(alt(?:ernate)?(?:[\s.]*art)?|parallel|full[\s-]*art|art\s*rare|aa)\b/i;

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

  if (namesReleaseNoSiblingOwns(card, siblings, text)) {
    return result("mismatch", "high", "listing_names_release_outside_catalogued_prints");
  }

  if (statedStatsConflict(card, text)) {
    return result("mismatch", "high", "listing_stats_contradict_confirmed_print");
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

  // 61.8% of One Piece collector numbers carry exactly one catalogued print. For
  // those the number plus the card name — both already checked above — is the
  // whole proof, which is the standard the Pokemon path applies to a print-unique
  // number. The sibling-marker rules below cannot express this: buildMarkerOwners
  // keeps only markers owned by fewer than every sibling, which nothing satisfies
  // when the witness set has one member, so every plain title fell through to
  // "unknown" and was excluded as unverified. Measured on 2026-08-10, ST01-001
  // returned 50 live listings and zero eligible for exactly this reason.
  //
  // This is not a relaxation of the guardrail: the artwork-class and treatment
  // vetoes have already run, so a listing claiming an alternate art, manga rare,
  // or gold treatment this number does not have is still a mismatch. Only the
  // requirement to name a distinguishing marker is dropped, and only where there
  // is nothing to distinguish from.
  if (siblings.length === 1) {
    return requiresCompetitionReleaseProof(card, text)
      ? result("unknown", "low", "one_piece_competition_tier_requires_release_proof")
      : result("compatible", "high", "one_piece_single_print_number_is_unambiguous");
  }

  // A title that names nothing but the card is describing the ordinary print.
  //
  // Every sibling of a retail number is worth several times the base and is sold
  // on that fact: a seller with an alternate art, manga, special art, or event
  // print writes it in the title, because the price makes no sense otherwise.
  // The gate was reading the absence of that word as the absence of evidence and
  // sending every plain listing to `unknown`, which the ranking gates exclude.
  // On 2026-08-14 that was eight of twelve adjudicated cards — all base prints,
  // all `inspect_first`, every winning title naming the original release and
  // nothing else ("Roronoa Zoro OP06-118 Secret Rare Wings of the Captain").
  //
  // The rule is one-way and runs after every veto. A class word, a treatment, a
  // release no sibling owns, or a stat conflict has already produced a mismatch
  // by this point; a title naming a reprint release lands on the reprint's owners
  // and never reaches the base. Silence proves the base and nothing else: it
  // cannot prove an alt art, and it proves nothing among promos, where every
  // print of a P- number is a promo and none is the ordinary one.
  const silent = !observed.artworkClass && !observed.treatment && !/\bbase\s+print\b/i.test(text);
  if (silent && selected.artworkClass === "base" && isOrdinaryRetailNumber(card.cardNumber)) {
    const baseOwners = new Set(siblings.filter((sibling) => sibling.artworkClass === "base").map((sibling) => sibling.id));
    const possible = intersectEvidence(siblings, [...evidenceSets, baseOwners]);
    if (!possible.has(selected.id)) {
      return result("mismatch", "high", "listing_evidence_identifies_sibling_print");
    }
    if (possible.size === 1) {
      return result("compatible", "high", "one_piece_plain_title_describes_base_print");
    }
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
  // "Alt art" and "SP" are loose words: with several non-base siblings a seller
  // may reach for either to describe a manga or a special art, so on their own
  // they need a release or marker to corroborate which sibling is meant. That
  // hazard needs a wrong sibling to exist. In a two-print family — the shape of
  // most of EB01 through EB04, a base and one alternate — the class word can
  // point at exactly one print, and demanding corroboration only sent every
  // "Alt Art Memorial Collection" listing to inspect. A base mislabelled as the
  // alt is caught by the market floor against the alt's own anchor.
  const otherNonBasePrints = siblings.filter((sibling) => sibling.id !== selected.id && sibling.artworkClass !== "base").length;
  const genericClassOnly = markerEvidence.length === 0
    && !observed.treatment
    && !hasSelectedExactMarker
    && observed.artworkClass !== "manga"
    && observed.artworkClass !== "wanted_poster"
    && observed.artworkClass !== "super_alternate"
    && !/\bbase\s+print\b/i.test(text)
    && otherNonBasePrints > 0;
  if (genericClassOnly) {
    return result("unknown", "low", "one_piece_class_evidence_requires_corroboration");
  }

  if (requiresCompetitionReleaseProof(card, text)) {
    return result("unknown", "low", "one_piece_competition_tier_requires_release_proof");
  }
  return result("compatible", "high", "listing_evidence_uniquely_identifies_confirmed_print");
}

// A tournament print shares its artwork with the release it commemorates, so the
// listing has to name that release before the competition version can be claimed.
// Naming it means the anniversary the 3rd Anniversary packs are known by, or the
// print's own full release name — "Winner Pack 2025 Vol.2" is proof of the Winner
// Pack 2025 Vol.2 print. Nothing looser counts: "tournament pack" alone could be
// any of the numbered packs the catalog does not carry.
function requiresCompetitionReleaseProof(card: CardIdentityCandidate, text: string) {
  if (card.competitionTier !== "winner" && card.competitionTier !== "participation") return false;
  if (/\b\d+(?:st|nd|rd|th)\s+anniversary\b/i.test(text)) return false;
  const release = normalizePhrase(card.setName);
  return !(release.length >= 4 && normalizePhrase(text).includes(release));
}

function buildWitnesses(cardNumber: string): PrintWitness[] {
  return findOnePieceCatalogVariants(cardNumber).map((sibling) => {
    const id = variantKey(sibling);
    // A phrase every listing of this card carries — because it is the card's
    // name or number — cannot tell one print from another. Starter decks are
    // named for their leader ("Yamato", "The Three Brothers"), and a few
    // reprints are catalogued under the bare set code ("ST-14"), so without
    // this the base release is a marker that vetoes every sibling's own listing.
    const unavoidable = [normalizePhrase(sibling.card_name), normalizePhrase(sibling.card_set_id)];
    const distinguishing = (marker: string) => {
      const key = normalizePhrase(marker);
      return key.length >= 4 && !isGenericMarker(marker) && !unavoidable.some((phrase) => phrase.includes(key));
    };
    const exactMarkers = (sibling.exact_markers ?? [])
      .map((marker) => marker.trim())
      .filter(distinguishing);
    const markers = [
      sibling.set_name ?? "",
      ...(sibling.collector_aliases ?? []),
      ...exactMarkers,
      ...releaseAliases(sibling.set_name ?? ""),
    ]
      .map((marker) => marker.trim())
      .filter(distinguishing);
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

// A marker is owned by every sibling whose own release wording contains it, not
// only the sibling it was written for. Release names nest: "Event Pack" sits
// inside "Cs 25-26 Event Pack", which sits inside "Cs 25-26 Event Pack Finalist
// Ver."; "Regional Participation" sits inside a base print's release name that
// the catalog never tagged. Ownership by origin made each of those a marker some
// sibling's own careful listing contained but did not own, and the sibling veto
// rejected the print's own listing as a different print — thirteen promo prints
// in the 2026-09-04 audit. Ownership by containment cannot admit a wrong print:
// a sibling only gains a marker its own release wording already carries.
function buildMarkerOwners(siblings: PrintWitness[]): Map<string, Set<string>> {
  const wording = siblings.map((sibling) => ({
    id: sibling.id,
    markers: [...sibling.markers].map(normalizePhrase).filter(Boolean),
  }));
  const owners = new Map<string, Set<string>>();
  for (const key of new Set(wording.flatMap((sibling) => sibling.markers))) {
    owners.set(key, new Set(
      wording.filter((sibling) => sibling.markers.some((marker) => marker.includes(key))).map((sibling) => sibling.id),
    ));
  }
  return owners;
}

// eBay's card item specifics carry the printed cost and power, and they travel in
// `matchAspectText` alongside the title. Those two numbers are printed on the card
// itself, so a listing whose specifics disagree with the catalogued print is not
// describing that print — whatever its title claims.
//
// This is the only gate here that reads a fact the seller stated about the card
// rather than a word they chose, which makes it the strongest signal available
// short of looking at the photo. It also catches the case a title never can: on
// 2026-08-14 two listings titled for OP02-013 and OP07-119 both pictured the
// OP16-118 Ace, and one became a $59 Best Value recommendation.
//
// Silence is not a conflict. Only rows that received the eBay item-detail call
// carry specifics at all, so a missing or non-numeric value must leave the row
// exactly where it was.
const STAT_ASPECT_PATTERNS: { pattern: RegExp; field: "cost" | "power" }[] = [
  { pattern: /\b(?:card\s+)?cost:\s*(\d{1,2})\b/i, field: "cost" },
  { pattern: /\b(?:attack\s*\/\s*power|attack|power):\s*(\d{3,6})\b/i, field: "power" },
];

function statedStatsConflict(card: CardIdentityCandidate, text: string) {
  const print = findOnePieceCatalogVariants(card.cardNumber).find((sibling) => variantKey(sibling) === card.id);
  if (!print) return false;

  // Every print of a number shares the printed cost and power, so a disagreement
  // is evidence about the card, not about which sibling artwork this is.
  const catalogued = {
    cost: Number.parseInt(print.card_cost ?? "", 10),
    power: Number.parseInt(print.card_power ?? "", 10),
  };

  return STAT_ASPECT_PATTERNS.some(({ pattern, field }) => {
    const expected = catalogued[field];
    if (!Number.isFinite(expected)) return false;
    const stated = Number.parseInt(text.match(pattern)?.[1] ?? "", 10);
    return Number.isFinite(stated) && stated !== expected;
  });
}

// Commemorative and promotional runs, phrased the way sellers phrase them. Each
// names one distinct release, so a listing carrying the phrase is describing that
// release rather than the ordinary set print.
//
// The bundled catalog does not know every promotional run — Shanks OP09-001 alone
// has a 2nd Anniversary Set print and a 2025 PSA Magazine Promo print, neither of
// which is catalogued. Without this check no sibling witness owns the marker, so
// nothing vetoes the listing and a $150 promo sits in the results as an `unknown`
// row eligible to be shown for a $2 base card. Six of the nine sibling rows in the
// 2026-08-14 adjudication were exactly this.
//
// `aliases` is the fallback when the exact phrase is absent from our markers: a
// broader word that, if any sibling's release carries it, means the family plausibly
// includes this release and the veto should stand down. Deliberately permissive —
// under-firing leaves a row `unknown`, over-firing hides a real listing.
const releaseClaimPatterns: { pattern: RegExp; aliases: string[]; kind?: "starter_deck" }[] = [
  { pattern: /\b\d+(?:st|nd|rd|th)\s+anniversary\b/i, aliases: ["anniversary"] },
  { pattern: /\bmagazine\s+promo(?:tion)?\b/i, aliases: ["magazine"] },
  { pattern: /\bpromo(?:tion)?\s+cards?\b/i, aliases: ["promo", "promotion"] },
  { pattern: /\bstarter\s+deck\s*\d+\b/i, aliases: ["starterdeck"], kind: "starter_deck" },
  { pattern: /\btournament\s+pack\b/i, aliases: ["tournamentpack"] },
  { pattern: /\btreasure\s+cup\b/i, aliases: ["treasurecup"] },
  { pattern: /\bgift\s+collection\b/i, aliases: ["giftcollection"] },
  { pattern: /\bpremium\s+card\s+collection\b/i, aliases: ["premiumcardcollection", "premiumcollection"] },
  // Bandai's Revision Pack reprints keep the artwork and change the card text, so
  // nothing in a title or an artwork comparison separates them from the original
  // print — only the release name does. Observed as a $50 recommendation for a
  // ST01-001 whose ordinary print trades near $2.
  { pattern: /\brevision\s+pack\b/i, aliases: ["revisionpack"] },
];

function namesReleaseNoSiblingOwns(card: CardIdentityCandidate, siblings: PrintWitness[], text: string) {
  const owned = siblings.flatMap((sibling) => [...sibling.markers].map(normalizePhrase));
  return releaseClaimPatterns.some(({ pattern, aliases, kind }) => {
    const match = text.match(pattern);
    if (!match) return false;
    if (kind === "starter_deck" && ownsStarterDeckNumber(card, match[0])) return false;
    const normalizedClaim = normalizePhrase(match[0]);
    return !owned.some((marker) =>
      marker.includes(normalizedClaim)
      || aliases.some((alias) => marker.includes(normalizePhrase(alias))));
  });
}

// An ST card's own release is a numbered starter deck, and the catalog names it by
// theme ("Straw Hat Crew"), never by number — so the marker check alone would
// reject the ordinary supply for every starter-deck card in the game. The number in
// the collector id is the deck number, so compare against that instead.
function ownsStarterDeckNumber(card: CardIdentityCandidate, claimed: string) {
  const deck = Number.parseInt(card.cardNumber.match(/^ST(\d+)-/i)?.[1] ?? "", 10);
  const stated = Number.parseInt(claimed.match(/(\d+)\s*$/)?.[1] ?? "", 10);
  return Number.isFinite(deck) && Number.isFinite(stated) && deck === stated;
}

// The forms a release name takes in a real title. Sellers shorten: "Gift
// Collection 2023" is listed as "Gift Collection", "One Piece Card The Best
// Vol.2" as "The Best Vol 2" or "Premium Booster", "Memorial Collection" as
// "Memorial". Every alias here is seller-visible wording, never an internal id,
// and a bare year is never one — "2023" names Gift Collection and Sealed Battle
// alike and would veto the wrong print.
function releaseAliases(releaseName: string): string[] {
  const aliases: string[] = [];
  const anniversary = releaseName.match(/\b(\d+(?:st|nd|rd|th))\s+anniversary\b/i)?.[0];
  if (anniversary) aliases.push(anniversary);
  if (/premium\s+(?:card\s+)?collection/i.test(releaseName)) aliases.push("premium collection");
  if (/one\s+piece\s+card\s+the\s+best/i.test(releaseName)) aliases.push("the best", "premium booster");
  if (/tournament\s+pack/i.test(releaseName)) aliases.push("tournament pack");
  if (/\bwinner\b/i.test(releaseName)) aliases.push("winner");
  if (/memorial\s+collection/i.test(releaseName)) aliases.push("memorial");
  if (/anime\s+25th\s+collection/i.test(releaseName)) aliases.push("anime 25th");
  if (/heroines/i.test(releaseName)) aliases.push("heroines");

  // A trailing year or volume is the part sellers drop first, so the stem is its
  // own alias. The volume is kept separately: it is what tells "The Best" from
  // "The Best Vol.2" on the three numbers printed in both.
  const qualifier = /\s*(?:\b20\d\d\b|\bvol\.?\s*\d+)\s*$/i;
  const stem = releaseName.replace(qualifier, "").replace(qualifier, "").trim();
  if (stem && stem !== releaseName.trim()) aliases.push(stem);
  const volume = releaseName.match(/\bvol\.?\s*(\d+)/i)?.[1];
  if (volume) aliases.push(`vol ${volume}`);
  return aliases;
}

// Class and treatment words that name a kind of print, not one print. They are
// read by the facet detector, never used as sibling markers — "alt art" on its
// own cannot be evidence for one alternate art over another. Exported so the
// alignment audit judges marker uniqueness by the same rule.
export function isGenericMarker(marker: string): boolean {
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
  artworkClass: WitnessClass | null;
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
  // Treasure Rare is its own class (OP16 onward). Unseen here, a "Treasure Rare"
  // listing read as silence and the silence rule handed it to the base print —
  // the one substitution in the 4,571-print audit. "TR" is matched case-
  // sensitively: it is the printed rarity, and lower-case "tr" is noise.
  if (/\btreasure\s+rare\b/i.test(text) || /\bTR\b/.test(text)) {
    return { artworkClass: "treasure", treatment: null };
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

// Booster, starter, extra booster, and premium booster numbers have one ordinary
// retail print that the market treats as the default. Promo numbers do not: every
// P- print is an event or campaign card, so "promo" on a title picks none of them.
function isOrdinaryRetailNumber(cardNumber: string) {
  return /^(?:OP|ST|EB|PRB)\d/i.test(cardNumber.trim());
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
