const GRADED_LISTING_PATTERNS: readonly RegExp[] = [
  /\b(?:psa|bgs|cgc|sgc|ace|tag)[\s:._#-]*(?:authentic|\d{1,2}(?:\.\d)?)\b/i,
  /\bgraded\s*\d{1,2}(?:\.\d)?\b/i,
  /\b(?:grading\s+)?slab(?:bed)?\b/i,
];

export function isGradedListing(value: string): boolean {
  return GRADED_LISTING_PATTERNS.some((pattern) => pattern.test(value));
}
