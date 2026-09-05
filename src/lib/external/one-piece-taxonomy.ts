/**
 * One Piece catalog vocabulary. No inventory, model judgment or research-ledger
 * mappings enter this module. Unknown inputs are observable, never implicit base.
 * Phase 1: completeness contract only; runtime consumers migrate individually.
 */
export const ONE_PIECE_ARTWORK_CLASSES = ["base", "alternate", "special", "manga", "wanted_poster", "super_alternate", "treasure", "unknown"] as const;
export const ONE_PIECE_TREATMENTS = ["gold", "silver", "red"] as const;
export const ONE_PIECE_CHANNELS = ["booster", "premium_booster", "starter_deck", "premium_collection", "anniversary", "tournament", "event", "promo", "unknown"] as const;
export const ONE_PIECE_COMPETITION_TIERS = ["champion", "finalist", "participation", "winner"] as const;

export type OnePieceTaxonomyClass = typeof ONE_PIECE_ARTWORK_CLASSES[number];
export type OnePieceTaxonomyTreatment = typeof ONE_PIECE_TREATMENTS[number];
export type OnePieceTaxonomyChannel = typeof ONE_PIECE_CHANNELS[number];
export type OnePieceTaxonomyTier = typeof ONE_PIECE_COMPETITION_TIERS[number];

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
  const unmapped: string[] = [];
  if (!Object.hasOwn(rarities, rarity)) unmapped.push(`rarity: ${rarity}`);
  if (!Object.hasOwn(variants, variant)) unmapped.push(`variant: ${variant}`);
  const releaseChannel = retailReleases[release.toLowerCase()]
    ?? releasePatterns.find(({ pattern }) => pattern.test(release))?.channel
    ?? "unknown";
  if (releaseChannel === "unknown" && !unresolvedReleases.has(release.toLowerCase())) unmapped.push(`release: ${release}`);
  const competitionTier = ONE_PIECE_COMPETITION_TIERS.find((tier) => new RegExp(`\\b${tier}\\b`, "i").test(release)) ?? null;
  return {
    artworkClass: unmapped.some((issue) => issue.startsWith("rarity:") || issue.startsWith("variant:"))
      ? "unknown" : rarities[rarity] ?? variants[variant],
    // Raw catalog colors/foil words are not reviewed print-treatment facts.
    treatments: [],
    releaseChannel,
    competitionTier,
    provenance: /_r\d+$/i.test(input.card_image_id ?? "") ? "reprint" : "unknown",
    unmapped,
  };
}
