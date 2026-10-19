const GRADED_LISTING_PATTERNS: readonly RegExp[] = [
  /\b(?:psa|bgs|cgc|sgc|ace|tag|ags|pcg)[\s:._#-]*(?:(?:pristine|perfect|gem\s+mint|mint|black\s+label)\s+)?(?:authentic|\d{1,2}(?:\.\d)?)\b/i,
  /\bgraded\s*\d{1,2}(?:\.\d)?\b/i,
  /\b(?:grading\s+)?slab(?:bed)?\b/i,
];

export function isGradedListing(value: string): boolean {
  // A seller's hoped-for grade is not an existing slab. Remove only that local
  // claim; another actual grading claim elsewhere in the title still excludes.
  const text = value.replace(/\b(?:psa|bgs|cgc|sgc|ace|tag|ags|pcg)\s*\d{1,2}(?:\.\d)?\s+(?:candidate|contender|potential)\b/gi, "");
  return GRADED_LISTING_PATTERNS.some((pattern) => pattern.test(text));
}
