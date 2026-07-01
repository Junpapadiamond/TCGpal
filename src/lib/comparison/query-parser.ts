import type { TcgGame } from "@/lib/schemas";

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
  // "" = not detected; caller applies the schema default ("English").
  language: string;
  variant: string;
  gradingClaim: string;
};

const GAME_TOKENS: Array<{ pattern: RegExp; game: TcgGame }> = [
  { pattern: /\bone\s*piece\b/i, game: "onePiece" },
  { pattern: /\bpok[eé]mon\b/i, game: "pokemon" },
];

// Full words only (no 2-3 letter abbreviations like "JP"/"EN") — a wrong game/
// language guess is worse than no guess, and short abbreviations are exactly the
// kind of token that collides with unrelated text.
const LANGUAGE_TOKENS: Array<{ pattern: RegExp; language: string }> = [
  { pattern: /\bjapanese\b/i, language: "Japanese" },
  { pattern: /\benglish\b/i, language: "English" },
  { pattern: /\bchinese\b/i, language: "Chinese" },
  { pattern: /\bkorean\b/i, language: "Korean" },
];

const GRADING_COMPANY_PATTERN = /\b(psa|bgs|cgc|sgc)\s*(\d{1,2}(?:\.\d)?)\b/i;

// Longest/most-specific phrases first so "Trainer Gallery" matches whole rather
// than leaving a dangling "Gallery".
const VARIANT_KEYWORDS = [
  "Trainer Gallery",
  "Alternate Art",
  "Alt Art",
  "Gold Star",
  "1st Edition",
  "Reverse Holo",
  "Promo",
];

// Fraction-style collector numbers (215/203, TG23/TG30) — mirrors the pattern
// used for auto-fetched eBay titles elsewhere in the comparison pipeline.
const FRACTION_CODE_PATTERN = /\b(?:[A-Za-z]{1,4})?\d{1,3}\s*\/\s*(?:[A-Za-z]{1,4})?\d{1,3}\b/;

// Letter-prefix codes (P-096, OP01-024, SWSH144). Requires at least one digit
// immediately after the letters, so ordinary words never match.
const PREFIX_CODE_PATTERN = /\b[A-Za-z]{1,4}-?\d{1,4}(?:-\d{1,3})?\b/;

export function parseCardQuery(query: string): ParsedCardQuery {
  let remaining = query;

  const grading = extractFirst(remaining, [GRADING_COMPANY_PATTERN]);
  if (grading) {
    remaining = removeMatch(remaining, grading);
  }
  const gradingClaim = grading ? normalizeWhitespace(grading[0]) : "";

  let variant = "";
  for (const keyword of VARIANT_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword.replace(/\s+/g, "\\s+")}\\b`, "i");
    const match = remaining.match(pattern);
    if (match) {
      variant = keyword;
      remaining = removeMatch(remaining, match);
      break;
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

  // A real card has one collector-number format; only try the letter-prefix
  // pattern (which could otherwise collide with a language/variant word that
  // happens to end in digits) once the fraction style has had first refusal.
  const codeMatch = remaining.match(FRACTION_CODE_PATTERN) ?? remaining.match(PREFIX_CODE_PATTERN);
  const cardNumber = codeMatch ? normalizeWhitespace(codeMatch[0]) : "";
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

  return {
    game,
    name: normalizeWhitespace(remaining),
    cardNumber,
    language,
    variant,
    gradingClaim,
  };
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
