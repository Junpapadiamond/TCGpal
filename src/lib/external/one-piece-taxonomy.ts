import type { OnePiecePrintEnrichment } from "@/lib/external/one-piece-print-metadata";
import type { CardIdentityCandidate } from "@/lib/schemas";
import vocabulary from "./one-piece-taxonomy-vocabulary.json";
/**
 * One Piece catalog vocabulary. No inventory, model judgment or research-ledger
 * mappings enter this module. Unknown inputs are observable, never implicit base.
 * Runtime consumers share these definitions; witness intersection and eligibility
 * remain in the comparison engine. Matching contexts retain their documented precedence.
 */
export const ONE_PIECE_ARTWORK_CLASSES = ["base", "alternate", "special", "manga", "wanted_poster", "super_alternate", "treasure", "unknown"] as const;
export const ONE_PIECE_TREATMENTS = ["gold", "silver", "red"] as const;
export const ONE_PIECE_CHANNELS = ["booster", "premium_booster", "starter_deck", "premium_collection", "anniversary", "tournament", "event", "promo", "unknown"] as const;
export const ONE_PIECE_COMPETITION_TIERS = ["champion", "finalist", "participation", "winner"] as const;
export const ONE_PIECE_SELLER_LEXICON = vocabulary.seller;
export const ONE_PIECE_TCGPLAYER_LEXICON = vocabulary.tcgplayer;
export const ONE_PIECE_BASE_PRINT_PATTERN = /\bbase\s+print\b/i;
export const ONE_PIECE_ANNIVERSARY_PATTERN = /\b\d+(?:st|nd|rd|th)\s+anniversary\b/i;

export function hasConflictingOnePieceTreatments(text: string): boolean {
  return /\bgold\b/i.test(text) && /\bsilver\b/i.test(text);
}

export function withoutJapaneseAnniversaryRelease(text: string): string {
  // This official release name is not a seller's card-language declaration.
  return text.replace(/\bjapanese\s+\d+(?:st|nd|rd|th)\s+anniversary\s+set\b/gi, "");
}

export type OnePieceTaxonomyClass = typeof ONE_PIECE_ARTWORK_CLASSES[number];
export type OnePieceTaxonomyTreatment = typeof ONE_PIECE_TREATMENTS[number];
export type OnePieceTaxonomyChannel = typeof ONE_PIECE_CHANNELS[number];
export type OnePieceTaxonomyTier = typeof ONE_PIECE_COMPETITION_TIERS[number];

// Each class owns its catalog spelling, listing vocabulary and retrieval term.
// Listing detection intentionally differs from catalog labels: raw `(Pn)` ordinals
// are not seller evidence. TR case sensitivity in identity is an existing guard.
const classRules = {
  special: { intent: "sp", rarities: ["sp", "sp card"], variant: /^special art/i,
    observed: /\bSP\b|special[\s-]*art/i, ranking: /\bSP\b|special[\s-]*art/i,
    query: "SP", label: "SP (Special Art)", stem: "Special Art" },
  manga: { intent: "manga", rarities: [], variant: /manga/i,
    observed: /\bmanga(?:\s+(?:art|rare))?\b/i, ranking: /\bmanga\b/i,
    query: "manga", label: "manga art", stem: "Manga Art" },
  treasure: { intent: "treasure", rarities: ["tr"], variant: /treasure/i,
    observed: /\btreasure\s+rare\b/i, ranking: /treasure\s*rare|\bTR\b/i,
    query: "treasure rare", label: "Treasure Rare", stem: "Treasure Rare" },
} as const;

const rarities: Record<string, OnePieceTaxonomyClass | null> = {
  C: null, UC: null, R: null, SR: null, SEC: null, L: null, P: null,
  "SP CARD": "special", TR: "treasure",
};
const variants: Record<string, OnePieceTaxonomyClass> = {
  base: "base",
  "Alternate Art": "alternate",
  "Secret Rare Alt": "alternate",
  "Special Art": "special",
  "Treasure Rare": "treasure",
};

// Exact release names protect against a theme word (captain, battle, collection)
// claiming an unrelated deck/event. Names come from the pinned snapshot.
const retailReleases: Record<string, OnePieceTaxonomyChannel> = Object.fromEntries([
  ...[
    "Romance Dawn", "Paramount War", "Pillars Of Strength", "Kingdoms Of Intrigue",
    "Awakening Of The New Era", "Wings Of The Captain", "500 Years In The Future",
    "Two Legends", "Emperors In The New World", "Royal Blood", "A Fist Of Divine Speed",
    "Legacy Of The Master", "Carrying On His Will", "The Azure Sea’s Seven",
    "Adventure On Kami's Island", "The Time Of Battle", "Memorial Collection",
    "Anime 25th Collection", "One Piece Heroines Edition",
  ].map((name) => [name.toLowerCase(), "booster"]),
  ...[
    "Straw Hat Crew", "Worst Generation", "The Seven Warlords Of The Sea", "Animal Kingdom Pirates",
    "One Piece Film Edition", "Absolute Justice", "Big Mom Pirates", "Monkey D. Luffy",
    "Yamato", "The Three Captains", "Uta", "Zoro & Sanji", "The Three Brothers", "3d2y",
    "Red Edward.newgate", "Green Uta", "Blue Donquixote Doflamingo", "Purple Monkey.d.luffy",
    "Black Smoker", "Yellow Charlotte Katakuri", "Gear5", "Ace & Newgate", "Red Shanks",
    "Green Jewelry Bonney", "Blue Buggy", "Purple/black Monkey.d.luffy", "Black Marshall.d.teach",
    "Green/yellow Yamato", "Egghead", "Luffy & Ace", "Learn Together Deck Set",
  ].map((name) => [name.toLowerCase(), "starter_deck"]),
]) as Record<string, OnePieceTaxonomyChannel>;

const releasePatterns: readonly { pattern: RegExp; channel: OnePieceTaxonomyChannel }[] = [
  { pattern: /championship|regional|treasure cup|tournament|finalist|\bchampion\b|\bwinner\b|\bcs 25-26\b|pirates league/i, channel: "tournament" },
  { pattern: /anniversary/i, channel: "anniversary" },
  { pattern: /pre.?release|release event|sealed battle|event|pirates party|heroines battle|store.*battle|grand battle|uta deck battle/i, channel: "event" },
  { pattern: /^one piece card the best(?: vol\.2)?$/i, channel: "premium_booster" },
  { pattern: /premium card collection|gift collection|binder|playmat|illustration box|special goods set/i, channel: "premium_collection" },
  { pattern: /promotion|promo|magazine|dash pack/i, channel: "promo" },
];

// Explicit unresolved seams are visible, finite and reviewable. No catch-all
// admits a future release. These names alone do not establish distribution.
const unresolvedReleases = new Set([
  "ST-14", "Anime Expo 2023", "Bandai Card Games Fest 25-26", "Dodgers One Piece Night",
  "Dreamhack Dallas 2024", "One Piece Day Dallas -card Game Celebration",
].map((name) => name.toLowerCase()));

export function onePieceReleaseChannel(releaseName: string): OnePieceTaxonomyChannel {
  return retailReleases[releaseName.trim().toLowerCase()]
    ?? releasePatterns.find(({ pattern }) => pattern.test(releaseName))?.channel
    ?? "unknown";
}

export function onePieceReferenceGroupAliases(releaseName: string): string[] {
  const channel = onePieceReleaseChannel(releaseName);
  if (channel === "premium_booster") {
    return [/\bvol\.?\s*2\b/i.test(releaseName) ? "Premium Booster -The Best- Vol. 2" : "Premium Booster -The Best-"];
  }
  // Promotion Cards is a heterogeneous provider bucket. It admits candidate
  // discovery only; the product's own release wording must still prove one print.
  if (["promo", "event", "anniversary", "tournament", "premium_collection", "starter_deck"].includes(channel)) {
    return ["One Piece Promotion Cards"];
  }
  return [];
}

export function isOnePieceReferenceGroupAlias(groupName: string, releaseName: string): boolean {
  return onePieceReferenceGroupAliases(releaseName).some((alias) => normalizePhrase(alias) === normalizePhrase(groupName));
}

export function isOnePiecePromotionGroup(groupName: string): boolean {
  return normalizePhrase(groupName) === normalizePhrase("One Piece Promotion Cards");
}

export type OnePieceTaxonomy = {
  artworkClass: OnePieceTaxonomyClass;
  treatments: OnePieceTaxonomyTreatment[];
  releaseChannel: OnePieceTaxonomyChannel;
  competitionTier: OnePieceTaxonomyTier | null;
  provenance: "reprint" | "unknown";
  /** Diagnostics make newly introduced catalog values fail completeness. */
  unmapped: string[];
};

export function deriveOnePieceTaxonomy(input: {
  rarity?: string | null;
  variant?: string | null;
  set_name?: string | null;
  card_image_id?: string | null;
}): OnePieceTaxonomy {
  const rarity = input.rarity?.trim().toUpperCase() ?? "";
  const variant = (input.variant ?? "base").replace(/\s*\([PR]\d+\)/gi, "").trim();
  const release = input.set_name?.trim() ?? "";
  const releaseFacets = deriveOnePieceReleaseFacets(release, input.card_image_id ?? "", null);
  const unmapped: string[] = [];
  if (!Object.hasOwn(rarities, rarity)) unmapped.push(`rarity: ${rarity}`);
  if (!Object.hasOwn(variants, variant)) unmapped.push(`variant: ${variant}`);
  const releaseChannel = onePieceReleaseChannel(release);
  if (releaseChannel === "unknown" && !unresolvedReleases.has(release.toLowerCase())) unmapped.push(`release: ${release}`);
  return {
    artworkClass: unmapped.some((issue) => issue.startsWith("rarity:") || issue.startsWith("variant:"))
      ? "unknown" : witnessClass(input),
    // Raw catalog colors/foil words are not reviewed print-treatment facts.
    treatments: [],
    releaseChannel,
    competitionTier: releaseFacets.competitionTier,
    provenance: /_r\d+$/i.test(input.card_image_id ?? "") ? "reprint" : "unknown",
    unmapped,
  };
}

export type PrintClass = "base" | "alt" | "sp" | "manga" | "treasure";
export type WitnessClass = Exclude<OnePieceTaxonomyClass, "unknown">;

// Runtime vocabulary migrated without changing detector precedence or witness proof.
export const genericAltPattern = /\b(alt(?:ernate)?(?:[\s.]*art)?|parallel|full[\s-]*art|art\s*rare|aa)\b/i;

export function witnessClass(sibling: { rarity?: string | null; variant?: string | null; artwork_class?: WitnessClass | null }): WitnessClass {
  if (sibling.artwork_class === "alternate") return "alternate";
  if (sibling.artwork_class) return sibling.artwork_class;
  const derived = printClass(sibling);
  if (derived === "alt") return "alternate";
  if (derived === "sp") return "special";
  return derived;
}

export const releaseClaimPatterns: { pattern: RegExp; aliases: string[]; kind?: "starter_deck" }[] = [
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

export function releaseAliases(releaseName: string): string[] {
  const aliases: string[] = [];
  // Real provider product names omit the catalog's editorial "Included In".
  // Keep the full remainder, including year/volume, as the release proof.
  if (/^included in /i.test(releaseName)) aliases.push(releaseName.replace(/^included in /i, ""));
  // Catalog Tournament Kit 2025 Vol.2 is the provider's Tournament Pack 2025
  // Vol. 2. This spelling alias does not erase the competition tier or volume.
  if (/^tournament kit 2025 vol\.\s*2$/i.test(releaseName)) aliases.push("Tournament Pack 2025 Vol. 2");
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

export function isGenericMarker(marker: string): boolean {
  return new Set([
    "altart", "alternateart", "parallel", "specialart", "sp", "manga", "mangaart", "mangarare",
    "wanted", "wantedposter", "posterart", "gold", "silver", "red", "superalt", "superalternateart",
    "anniversary", "promo", "regional", "championship",
  ]).has(normalizePhrase(marker));
}

export function detectResearchedPrintFacet(text: string): {
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
  if (classRules.manga.observed.test(text)) {
    return { artworkClass: "manga", treatment: null };
  }
  // Treasure Rare is its own class; see the census for its actual distribution. Unseen here, a "Treasure Rare"
  // listing read as silence and the silence rule handed it to the base print —
  // the one substitution in the 4,571-print audit. "TR" is matched case-
  // sensitively: it is the printed rarity, and lower-case "tr" is noise.
  if (classRules.treasure.observed.test(text) || /\bTR\b/.test(text)) {
    return { artworkClass: "treasure", treatment: null };
  }
  if (/\bgold\b/i.test(text)) {
    return { artworkClass: classRules.special.observed.test(text) ? "special" : null, treatment: "gold" };
  }
  if (/\bsilver\b/i.test(text)) {
    return { artworkClass: classRules.special.observed.test(text) ? "special" : null, treatment: "silver" };
  }
  if (classRules.special.observed.test(text)) {
    return { artworkClass: "special", treatment: null };
  }
  if (genericAltPattern.test(text)) {
    return { artworkClass: "alternate", treatment: null };
  }
  return { artworkClass: null, treatment: null };
}

export function printClass(print: { rarity?: string | null; variant?: string | null }): PrintClass {
  const rarity = (print.rarity ?? "").trim().toLowerCase();
  const variant = (print.variant ?? "").trim().toLowerCase();
  for (const rule of Object.values(classRules)) {
    if ((rule.rarities as readonly string[]).includes(rarity) || rule.variant.test(variant)) return rule.intent;
  }
  return variant ? "alt" : "base";
}

function normalizePhrase(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ""); }

export const altArtTitlePattern = /\b(alt(?:ernate)?[\s.]*art|parallel|manga|full[\s-]*art|special[\s-]*art|art\s*rare|treasure\s*rare)\b/i;

export const specificVariantMarkers: ReadonlyArray<{
  intent: Exclude<PrintClass, "base" | "alt">;
  pattern: RegExp;
  label: string;
}> = Object.values(classRules).map((rule) => ({ intent: rule.intent, pattern: rule.ranking, label: rule.label }));

export function variantIntentLabel(intent: PrintClass): string {
  const specific = specificVariantMarkers.find((marker) => marker.intent === intent);
  if (specific) return specific.label;
  return intent === "alt" ? "alternate-art" : "base";
}

export const VARIANT_QUERY_TOKENS: Partial<Record<PrintClass, string>> = {
  ...Object.fromEntries(Object.values(classRules).map((rule) => [rule.intent, rule.query])),
  alt: "alt art",
};

export function researchedPrintQueryToken(card: CardIdentityCandidate): string | null {
  if (card.treatments?.includes("gold")) return "gold";
  if (card.treatments?.includes("silver")) return "silver";
  if (card.treatments?.includes("red") && card.artworkClass === "super_alternate") return "red super alt";
  if (card.artworkClass === "manga") return "manga";
  if (card.artworkClass === "wanted_poster") return "wanted poster";
  if (card.artworkClass === "super_alternate") return "super alt";
  const aliases = card.collectorAliases ?? [];
  for (const token of [
    "tournament winner",
    "tournament pack",
    "treasure cup",
    "regional champion",
    "regional finalist",
    "regional participation",
    "premium collection",
    "championship",
    "anniversary",
    "promo",
  ]) {
    if (aliases.some((alias) => alias.toLowerCase().includes(token))) return token;
  }
  return null;
}

export function printClassQueryToken(card: CardIdentityCandidate): string | null {
  return researchedPrintQueryToken(card) ?? VARIANT_QUERY_TOKENS[printClass(card)] ?? null;
}

export function sellerVocabularyPrintQueryToken(card: CardIdentityCandidate): string | null {
  const researched = researchedPrintQueryToken(card);
  if (researched) return researched;
  const classToken = VARIANT_QUERY_TOKENS[printClass(card)] ?? null;
  if (!classToken) return null;
  // The catalog's release name is seller-facing vocabulary (unlike `_pN`). It
  // supplies the corroborating witness that broad class words such as "SP" or
  // "alt art" cannot provide by themselves. The following plain-query attempt
  // remains the recall fallback when sellers omit the release name.
  const releaseName = card.variant?.trim() ? card.setName.trim() : "";
  return [classToken, releaseName].filter(Boolean).join(" ");
}

// Preserve the current public-schema subset during this vocabulary migration.
export type OnePieceArtworkClass = Exclude<OnePieceTaxonomyClass, "base" | "treasure" | "unknown">;

export type OnePiecePrintTreatment = OnePieceTaxonomyTreatment;

export type OnePieceReleaseChannel = Exclude<OnePieceTaxonomyChannel, "starter_deck">;

export type OnePieceReleaseMetadata = {
  channel: OnePieceReleaseChannel;
  competitionTier: OnePieceTaxonomyTier | null;
  provenance: "original_set" | "reprint" | "promotion" | "unknown";
};

export function normalizeCanonicalPrintId(value: string) {
  return value.trim().replace(/_([pr])(\d+)$/i, (_, kind: string, number: string) => `_${kind.toLowerCase()}${number}`).toUpperCase().replace(/_([PR])(\d+)$/, (_, kind: string, number: string) => `_${kind.toLowerCase()}${number}`);
}

export function deriveOnePieceCatalogPrintEnrichment(input: {
  canonicalPrintId: string;
  isAlternateArt: boolean;
  rarity: string | null | undefined;
  releaseName: string | null | undefined;
}): OnePiecePrintEnrichment | null {
  if (!input.isAlternateArt) return null;
  const releaseName = input.releaseName?.trim() ?? "";
  const isSpecialRarity = input.rarity?.trim().toUpperCase() === "SP CARD";
  const isSpecialRelease = /anniversary|championship|regional|treasure cup|tournament|winner|premium card collection|promo/i.test(releaseName);
  if (!isSpecialRarity && !isSpecialRelease) return null;

  const artworkClass: OnePieceArtworkClass = isSpecialRarity ? "special" : "alternate";
  const semanticAliases = [
    /treasure cup/i.test(releaseName) ? "treasure cup" : null,
    /tournament pack/i.test(releaseName) ? "tournament pack" : null,
    /winner/i.test(releaseName) ? "tournament winner" : null,
    /\bchampion\b/i.test(releaseName) ? "regional champion" : null,
    /finalist/i.test(releaseName) ? "regional finalist" : null,
    /participation/i.test(releaseName) ? "regional participation" : null,
    /championship/i.test(releaseName) ? "championship" : null,
    /regional/i.test(releaseName) ? "regional" : null,
    /anniversary/i.test(releaseName) ? "anniversary" : null,
    /premium card collection/i.test(releaseName) ? "premium collection" : null,
    /promo/i.test(releaseName) ? "promo" : null,
  ].filter((alias): alias is string => Boolean(alias));
  const displayLabel = `${releaseName || "Catalog"} ${isSpecialRarity ? "Special Art" : "Art"}`;
  const id = normalizeCanonicalPrintId(input.canonicalPrintId);
  const promotion = isSpecialRelease && !/premium card collection/i.test(releaseName);

  return Object.freeze({
    canonicalPrintId: id,
    artworkClass,
    treatments: Object.freeze([]),
    displayLabel,
    collectorAliases: Object.freeze([displayLabel, releaseName, ...semanticAliases].filter(Boolean)),
    exactMarkers: Object.freeze([releaseName, ...semanticAliases].filter(Boolean)),
    tcgplayerProductId: null,
    tcgplayerGroupId: null,
    evidence: Object.freeze([
      Object.freeze({ source: "bundled-catalog" as const, productId: null, checkedAt: "2026-07-11" as const }),
    ]),
    verification: "catalog_derived",
    metadataSource: "bundled-catalog",
    releaseProvenance: /_r\d+$/i.test(id) ? "reprint" : promotion ? "promotion" : "unknown",
  });
}

export function deriveOnePieceReleaseFacets(
  releaseName: string,
  canonicalPrintId: string,
  enrichment: OnePiecePrintEnrichment | null,
): OnePieceReleaseMetadata {
  const normalized = releaseName.toLowerCase();
  let channel: OnePieceReleaseChannel = enrichment?.releaseChannel ?? "unknown";
  if (channel !== "unknown") {
    // Curated release metadata takes precedence over ambiguous catalog wording.
  } else if (/championship|regional|treasure cup|tournament|finalist|\bchampion\b|\bwinner\b/.test(normalized)) channel = "tournament";
  else if (/anniversary/.test(normalized)) channel = "anniversary";
  else if (/pre.?release|release event|sealed battle|event/.test(normalized)) channel = "event";
  else if (/one piece card the best|premium booster/.test(normalized)) channel = "premium_booster";
  // Extra Boosters are retail sets. Two of them carry "Collection" in the name,
  // which the premium-collection test below would otherwise claim, tagging the
  // ordinary EB01/EB02 print as a boxed-set reprint.
  else if (/memorial collection|anime 25th collection|heroines edition|extra booster/.test(normalized)) channel = "booster";
  else if (/premium card collection|binder|collection/.test(normalized)) channel = "premium_collection";
  else if (/promo|promotion|magazine|store/.test(normalized)) channel = "promo";
  else if (/romance dawn|paramount war|pillars of strength|kingdoms of intrigue|new era|captain|future|two legends|new world|royal blood|divine speed|master|will|seven|battle|island/.test(normalized)) channel = "booster";

  const competitionTier = enrichment?.competitionTier ?? (/\bchampion\b/.test(normalized)
    ? "champion" as const
    : /finalist/.test(normalized)
      ? "finalist" as const
      : /participation/.test(normalized)
        ? "participation" as const
        : /winner/.test(normalized)
          ? "winner" as const
          : null);
  const provenance = enrichment?.releaseProvenance
    ?? (channel === "anniversary" || channel === "tournament" || channel === "event" || channel === "promo"
      ? "promotion"
      : /_r\d+$/i.test(canonicalPrintId)
        ? "reprint"
        : "unknown");

  return { channel, competitionTier, provenance };
}
