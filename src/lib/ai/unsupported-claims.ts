// The claims no model-written surface may make, in one place. `forbiddenAnswer`
// is the original assistant list; the verdict note adds the promise-flavored
// phrases a one-line buy recommendation is most likely to reach for.
export const forbiddenAnswer = [
  /\bguaranteed\b/i,
  /\bscam\b/i,
  /\bwill grade\b/i,
  /\bpsa\s*10\b/i,
  /\bsold comps? (show|prove|confirm)/i,
  /\bsold[-\s]?comp/i,
  /\bsold transaction/i,
  /\b[a-z]+-v\d+\|/i,
];

// Advice and certainty language the product guardrails forbid: no "must buy",
// no risk-free framing, no authenticity or grading verdicts, no investment
// claims. Chinese equivalents are listed because the note is written in the
// buyer's language, not translated from English.
export const forbiddenVerdictNote = [
  /\bmust[- ]buy\b/i,
  /\bmust buy\b/i,
  /\bno[- ]brainer\b/i,
  /\brisk[- ]free\b/i,
  /\bno risk\b/i,
  /\bcan'?t (go wrong|lose)\b/i,
  /\bsteal\b/i,
  /\bauthentic(ated|ity)?\b/i,
  /\bfake\b/i,
  /\bcounterfeit\b/i,
  /\bwill (appreciate|go up|rise|hold value)\b/i,
  /\b(good |smart )?investment\b/i,
  /\bprofit\b/i,
  /\bflip\b/i,
  /\bgem mint\b/i,
  /\bpristine\b/i,
  /必买|必入|稳赚|包赚|保真|正品保证|假货|骗子|绝对|一定升值|零风险|无风险/,
];

export function findUnsupportedClaim(text: string, patterns: RegExp[]) {
  return patterns.find((pattern) => pattern.test(text)) ?? null;
}
