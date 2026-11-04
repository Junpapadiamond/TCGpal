const GRADED_LISTING_PATTERNS: readonly RegExp[] = [
  /\b(?:psa|bgs|cgc|sgc|ace|tag|ags|pcg)[\s:._#-]*(?:(?:pristine|perfect|gem\s+mint|mint|black\s+label)\s+)?(?:authentic|\d{1,2}(?:\.\d)?)\b/i,
  /\bgraded\b/i,
  /\b(?:grading\s+)?slab(?:bed)?\b/i,
];

export function isGradedListing(value: string): boolean {
  // A hoped-for grade or explicit denial is not an existing slab. Remove only
  // that local claim; another actual grading claim elsewhere still excludes.
  const text = value
    .replace(/\b(?:psa|bgs|cgc|sgc|ace|tag|ags|pcg)\s*\d{1,2}(?:\.\d)?\s+(?:candidate|contender|potential)\b/gi, "")
    .replace(/\b(?:not|never|non)[\s-]+(?:yet\s+)?(?:been\s+)?(?:professionally\s+)?graded\b/gi, "")
    .replace(/\b(?:ready\s+)?to\s+(?:be|get)\s+(?:professionally\s+)?graded\b/gi, "")
    .replace(/\b(?:can|could|will|should)\s+be\s+(?:professionally\s+)?graded\b/gi, "")
    .replace(/\bgraded\s+(?:candidate|contender|potential)\b/gi, "");
  return GRADED_LISTING_PATTERNS.some((pattern) => pattern.test(text));
}
