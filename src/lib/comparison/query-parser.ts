import { z } from "zod";
import { tcgGameSchema, type TcgGame } from "@/lib/schemas";

// Deterministic-first extraction from one free-text search string (the hero
// search box) into structured card-identity hints. This is the "one box, one
// click" front door: it never invents a card identity — it only splits the
// string into the same fields the multi-field form already collects, so the
// existing identity-resolution and confirmation flow (auto-confirm on an
// unambiguous name+number, one-tap confirm otherwise) is completely unchanged
// downstream. An empty/unrecognized field here just means "not detected" —
// the caller falls back to whatever the structured form fields already hold.
export type ParsedCardQuery = {
  // null = no confident game signal in the text; caller keeps the current toggle.
  game: TcgGame | null;
  name: string;
  cardNumber: string;
  // "" = not detected. One Piece only today ("OP-15") — a bare set code with no
  // "-NNN" suffix names a SET, distinct from cardNumber which names one PRINT.
  setCode: string;
  // "" = not detected; caller applies the schema default ("English").
  language: string;
  variant: string;
  gradingClaim: string;
};

export const parsedCardQuerySchema = z.object({
  game: tcgGameSchema.nullable(),
  name: z.string().trim().default(""),
  cardNumber: z.string().trim().default(""),
  setCode: z.string().trim().default(""),
  language: z.string().trim().default(""),
  variant: z.string().trim().default(""),
  gradingClaim: z.string().trim().default(""),
});

const GAME_TOKENS: Array<{ pattern: RegExp; game: TcgGame }> = [
  { pattern: /\bone\s*piece\b/i, game: "onePiece" },
  { pattern: /\bpok[eé]mon\b/i, game: "pokemon" },
];

// Card-code shapes that belong to exactly one game are a confident game signal
// on their own — a buyer types "Luffy OP01-024" without ever writing the words
// "one piece". OP/ST/EB/PRB prefixes are One Piece set codes; SWSH/SV/SM/XY/TG
// promo-style codes and fraction collector numbers (215/203) exist only in
// Pokémon. Ambiguous shapes (P-096 appears in both games) stay null.
const ONE_PIECE_CODE_PATTERN = /\b(?:OP|ST|EB|PRB)\d{1,2}(?:-\d{1,3})?\b/i;
// The separator is optional because Black Star Promos are printed with one:
// a Scarlet & Violet promo reads "SVP EN 052", and sellers write both "SVP 052"
// and "SVP052". Only the glued form used to count as a Pokemon signal.
const POKEMON_CODE_PATTERN = /\b(?:SWSH|SVP?|SM|XY|BW|TG|GG|DP|HGSS)[\s-]?\d{1,4}\b/i;
const ONE_PIECE_CHARACTER_HINT_PATTERN = /\b(?:nami|luffy|zoro|sanji|shanks|ace|sabo|yamato|robin|chopper|hancock|law)\b/i;

// Full words only (no 2-3 letter abbreviations like "JP"/"EN") — a wrong game/
// language guess is worse than no guess, and short abbreviations are exactly the
// kind of token that collides with unrelated text.
const LANGUAGE_TOKENS: Array<{ pattern: RegExp; language: string }> = [
  { pattern: /\bjapanese\b/i, language: "Japanese" },
  { pattern: /\benglish\b/i, language: "English" },
  { pattern: /\bchinese\b/i, language: "Chinese" },
  { pattern: /\bkorean\b/i, language: "Korean" },
];

const GRADING_COMPANY_PATTERN = /\b(psa|bgs|cgc|sgc|ace|tag)\s*(\d{1,2}(?:\.\d)?)\b/i;

// Longest/most-specific phrases first so "Trainer Gallery" matches whole rather
// than leaving a dangling "Gallery".
const VARIANT_KEYWORDS = [
  "Serial Numbered",
  "Serialized",
  "Premium Collection",
  "Signature",
  "Signed",
  "Stamped",
  "Textured",
  "Tournament Winner",
  "Tournament Pack",
  "Treasure Cup",
  "Championship",
  "Anniversary",
  "Red Super Alternate Art",
  "Super Alternate Art",
  "Wanted Poster",
  "Manga Art",
  "Trainer Gallery",
  "Alternate Art",
  "Alt Art",
  "Gold Star",
  "1st Edition",
  "Reverse Holo",
  "ACE SPEC",
  "Promo",
  "Gold",
  "Silver",
];

const VARIANT_ALIASES: Record<string, string> = {
  Serialized: "Serial Numbered",
  Signed: "Signature",
};

// Short rarity codes collectors actually type in a search box ("Luffy sp",
// "Pikachu sir") rather than the full phrase above. Word-boundary matched and
// case-insensitive. A wrong rarity guess only narrows results (the caller
// falls back to the unfiltered list when the guess matches nothing), so the
// small false-positive risk of a short token is acceptable here in a way it
// would not be for the game/language detectors below.
const RARITY_CODE_KEYWORDS: Array<{ pattern: RegExp; variant: string }> = [
  { pattern: /\bsir\b/i, variant: "Special Illustration Rare" },
  { pattern: /\bsar\b/i, variant: "Special Art Rare" },
  { pattern: /\bchr\b/i, variant: "Character Rare" },
  { pattern: /\bcsr\b/i, variant: "Character Super Rare" },
  { pattern: /\bhr\b/i, variant: "Hyper Rare" },
  { pattern: /\bur\b/i, variant: "Ultra Rare" },
  { pattern: /\bir\b/i, variant: "Illustration Rare" },
  { pattern: /\bsec\b/i, variant: "Secret Rare" },
  { pattern: /\bsr\b/i, variant: "Super Rare" },
  { pattern: /\bsp\b/i, variant: "SP" },
  // One Piece's SP-rarity parallels are the ones collectors call "manga rare"
  // (hand-drawn manga-style art) — the catalog only tags them as "SP CARD", so
  // route the collector term to the same filter value.
  { pattern: /\bmanga\b/i, variant: "Manga Art" },
  { pattern: /\bwanted(?:\s+poster)?\b/i, variant: "Wanted Poster" },
  { pattern: /\bred\s+super\s+(?:alt|alternate(?:\s+art)?)\b/i, variant: "Red Super Alternate Art" },
  { pattern: /\bsuper\s+(?:alt|alternate(?:\s+art)?)\b/i, variant: "Super Alternate Art" },
  { pattern: /\bgold\b/i, variant: "Gold" },
  { pattern: /\bsilver\b/i, variant: "Silver" },
];

const ONE_PIECE_RELEASE_PHRASES: Array<{ pattern: RegExp; variant: string }> = [
  { pattern: /\b(?:\d+(?:st|nd|rd|th)\s+)?anniversary\s+winner\b/i, variant: "Tournament Winner" },
  { pattern: /\bregional\s+champion\b/i, variant: "Regional Champion" },
  { pattern: /\bregional\s+finalist\b/i, variant: "Regional Finalist" },
  { pattern: /\bregional\s+participation\b/i, variant: "Regional Participation" },
];

// A bare "OP15" / "ST01" / "EB02" (no "-NNN" suffix) names a SET, not one print —
// real collector numbers always look like "OP01-024". Extracted separately (and
// before the generic collector-number pattern below) so a set-only query narrows
// results to that set instead of being half-parsed as a broken card number and
// then silently ignored.
const ONE_PIECE_SET_ONLY_PATTERN = /\b(OP|ST|EB|PRB)(\d{1,2})\b(?!-\d)/i;

// Black Star Promos print their collector number next to the release code —
// "SVP EN 052", "SWSH050", "SM229" — and the generic patterns below only ever
// matched the glued spelling. A buyer typing the spaced form they can read off
// the card left "SVP 052" sitting inside the card NAME, so the catalog searched
// for a Pokemon literally called "Mewtwo SVP 052" and confirmed whatever else
// the relaxed name ladder happened to reach.
//
// The two promo families store that number differently, so they parse
// differently. Scarlet & Violet promos live in their own set with a bare,
// zero-padded number ("052"), which is also how TCGplayer publishes them. Every
// earlier release glues the prefix onto the number itself ("SWSH050", "SM229"),
// which is the catalog's own key, so a spaced query is re-glued rather than
// split.
const SV_PROMO_CODE_PATTERN = /\bSVP[\s-]*(\d{1,4})\b/i;
const LEGACY_PROMO_CODE_PATTERN = /\b(SWSH|SM|XY|BW|DP|HGSS)[\s-]+(\d{1,4})\b/i;

const COMMON_ALIAS_HINTS: Array<{
  pattern: RegExp;
  game: TcgGame;
  name: string;
  cardNumber: string;
  variant: string;
}> = [
  {
    pattern: /\bmoon\s*breon\b/i,
    game: "pokemon",
    name: "Umbreon VMAX",
    cardNumber: "215/203",
    variant: "Alternate Art",
  },
];

// Fraction-style collector numbers (215/203, TG23/TG30) — mirrors the pattern
// used for auto-fetched eBay titles elsewhere in the comparison pipeline.
const FRACTION_CODE_PATTERN = /\b(?:[A-Za-z]{1,4})?\d{1,3}\s*\/\s*(?:[A-Za-z]{1,4})?\d{1,3}\b/;

// Letter-prefix codes (P-096, OP01-024, SWSH144). Requires at least one digit
// immediately after the letters, so ordinary words never match.
const PREFIX_CODE_PATTERN = /\b[A-Za-z]{1,4}-?\d{1,4}(?:-\d{1,3})?\b/;

export function parseCardQuery(query: string): ParsedCardQuery {
  let remaining = query;
  const alias = COMMON_ALIAS_HINTS.find((hint) => hint.pattern.test(query)) ?? null;

  const grading = extractFirst(remaining, [GRADING_COMPANY_PATTERN]);
  if (grading) {
    remaining = removeMatch(remaining, grading);
  }
  const gradingClaim = grading ? normalizeWhitespace(grading[0]) : "";

  let variant = "";
  for (const { pattern, variant: candidate } of ONE_PIECE_RELEASE_PHRASES) {
    const match = remaining.match(pattern);
    if (match) {
      variant = candidate;
      remaining = removeMatch(remaining, match);
      break;
    }
  }
  for (const keyword of variant ? [] : VARIANT_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword.replace(/\s+/g, "\\s+")}\\b`, "i");
    const match = remaining.match(pattern);
    if (match) {
      variant = VARIANT_ALIASES[keyword] ?? keyword;
      remaining = removeMatch(remaining, match);
      break;
    }
  }
  if (!variant) {
    for (const { pattern, variant: candidate } of RARITY_CODE_KEYWORDS) {
      const match = remaining.match(pattern);
      if (match) {
        variant = candidate;
        remaining = removeMatch(remaining, match);
        break;
      }
    }
  }

  let game: TcgGame | null = null;
  for (const { pattern, game: candidate } of GAME_TOKENS) {
    const match = remaining.match(pattern);
    if (match) {
      game = candidate;
      remaining = removeMatch(remaining, match);
      break;
    }
  }
  if (game === null) {
    if (ONE_PIECE_CODE_PATTERN.test(remaining)) {
      game = "onePiece";
    } else if (POKEMON_CODE_PATTERN.test(remaining) || FRACTION_CODE_PATTERN.test(remaining)) {
      game = "pokemon";
    }
  }
  if (game === null && alias) game = alias.game;
  const onePieceSpecialVariants = new Set([
    "SP",
    "Manga Art",
    "Gold",
    "Silver",
    "Wanted Poster",
    "Super Alternate Art",
    "Red Super Alternate Art",
    "Signature",
    "Serial Numbered",
    "Stamped",
    "Textured",
  ]);
  if (game === null && onePieceSpecialVariants.has(variant) && ONE_PIECE_CHARACTER_HINT_PATTERN.test(query)) {
    game = "onePiece";
  }

  // Claim a bare One Piece set code ("OP15") before the generic collector-number
  // pattern gets a chance to half-match it as an incomplete print number.
  let setCode = "";
  const setOnlyMatch = remaining.match(ONE_PIECE_SET_ONLY_PATTERN);
  if (setOnlyMatch) {
    setCode = `${setOnlyMatch[1].toUpperCase()}-${setOnlyMatch[2].padStart(2, "0")}`;
    remaining = removeMatch(remaining, setOnlyMatch);
  }

  // Promo codes are claimed before the generic patterns below, which would
  // otherwise take "SVP" for a card number's letter prefix and leave the digits
  // stranded in the name.
  let promoNumber = "";
  const svPromoMatch = remaining.match(SV_PROMO_CODE_PATTERN);
  const legacyPromoMatch = svPromoMatch ? null : remaining.match(LEGACY_PROMO_CODE_PATTERN);
  if (svPromoMatch) {
    setCode = "SVP";
    promoNumber = svPromoMatch[1].padStart(3, "0");
    remaining = removeMatch(remaining, svPromoMatch);
  } else if (legacyPromoMatch) {
    promoNumber = `${legacyPromoMatch[1].toUpperCase()}${legacyPromoMatch[2]}`;
    remaining = removeMatch(remaining, legacyPromoMatch);
  }

  // A real card has one collector-number format; only try the letter-prefix
  // pattern (which could otherwise collide with a language/variant word that
  // happens to end in digits) once the fraction style has had first refusal.
  const codeMatch = promoNumber
    ? null
    : remaining.match(FRACTION_CODE_PATTERN) ?? remaining.match(PREFIX_CODE_PATTERN);
  const cardNumber = promoNumber || (codeMatch ? normalizeWhitespace(codeMatch[0]) : alias?.cardNumber ?? "");
  if (codeMatch) {
    remaining = removeMatch(remaining, codeMatch);
  }

  let language = "";
  for (const { pattern, language: candidate } of LANGUAGE_TOKENS) {
    const match = remaining.match(pattern);
    if (match) {
      language = candidate;
      remaining = removeMatch(remaining, match);
      break;
    }
  }

  return parsedCardQuerySchema.parse({
    game,
    name: alias?.name ?? normalizeWhitespace(remaining),
    cardNumber,
    setCode,
    language,
    variant: variant || alias?.variant || "",
    gradingClaim,
  });
}

function extractFirst(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

function removeMatch(text: string, match: RegExpMatchArray) {
  if (match.index === undefined) return text;
  return text.slice(0, match.index) + text.slice(match.index + match[0].length);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
