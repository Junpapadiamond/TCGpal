type CollectorRun = { kind: "alpha" | "number"; value: string };
type CollectorGroup = { runs: CollectorRun[] };

export type ParsedCollectorNumber = {
  kind: "fraction" | "code";
  groups: CollectorGroup[];
  denominatorGroups: CollectorGroup[];
  canonical: string;
};

const INTERNAL_PRINT_SUFFIX = /_[pr]\d+$/i;
const FRACTION_CANDIDATE = /[A-Za-z]{0,6}\d{1,5}\s*\/\s*[A-Za-z]{0,6}\d{1,5}/g;
const SEPARATED_CODE_CANDIDATE = /[A-Za-z]{1,8}\d{0,4}[-_\s]+\d{1,5}/g;

export function parseCollectorNumber(value: string): ParsedCollectorNumber | null {
  const trimmed = value.trim();
  if (!trimmed || INTERNAL_PRINT_SUFFIX.test(trimmed)) return null;

  const fractionParts = trimmed.split("/");
  if (fractionParts.length === 2) {
    const groups = parseGroups(fractionParts[0]);
    const denominatorGroups = parseGroups(fractionParts[1]);
    if (!groups || !denominatorGroups) return null;
    return {
      kind: "fraction",
      groups,
      denominatorGroups,
      canonical: `${canonicalGroups(groups)}/${canonicalGroups(denominatorGroups)}`,
    };
  }
  if (fractionParts.length !== 1) return null;

  const groups = parseGroups(trimmed);
  if (!groups || !groups.some((group) => group.runs.some((run) => run.kind === "number"))) return null;
  return { kind: "code", groups, denominatorGroups: [], canonical: canonicalGroups(groups) };
}

export function normalizeCollectorNumber(value: string): string {
  return parseCollectorNumber(value)?.canonical ?? "";
}

export function collectorNumbersEquivalent(left: string, right: string): boolean {
  const parsedLeft = parseCollectorNumber(left);
  const parsedRight = parseCollectorNumber(right);
  return Boolean(
    parsedLeft
    && parsedRight
    && parsedLeft.kind === parsedRight.kind
    && parsedLeft.canonical === parsedRight.canonical,
  );
}

export function collectorNumberPattern(value: string): RegExp | null {
  const parsed = parseCollectorNumber(value);
  if (!parsed) return null;
  const numerator = groupsPattern(parsed.groups);
  const body = parsed.kind === "fraction"
    ? `${numerator}\\s*\\/\\s*${groupsPattern(parsed.denominatorGroups)}`
    : numerator;
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, "i");
}

export function collectorNumberNumerator(value: string): string {
  const parsed = parseCollectorNumber(value);
  if (!parsed) return "";
  return canonicalGroups(parsed.groups).replace(/-/g, "").toLowerCase();
}

export function collectorNumberParts(value: string): { number: string; total: string } {
  const parsed = parseCollectorNumber(value);
  if (!parsed) return { number: "", total: "" };
  return {
    number: canonicalGroups(parsed.groups).replace(/-/g, ""),
    total: parsed.kind === "fraction"
      ? canonicalGroups(parsed.denominatorGroups).replace(/-/g, "")
      : "",
  };
}

export function collectorNumberConflict(text: string, expectedValue: string): boolean {
  const expected = parseCollectorNumber(expectedValue);
  if (!expected) return false;
  if (collectorNumberPattern(expectedValue)?.test(text)) return false;

  const candidates = expected.kind === "fraction"
    ? text.match(FRACTION_CANDIDATE) ?? []
    : codeCandidates(text, expected);
  return candidates.some((candidate) => {
    const parsed = parseCollectorNumber(candidate);
    return Boolean(parsed && sameScheme(parsed, expected) && parsed.canonical !== expected.canonical);
  });
}

function parseGroups(value: string): CollectorGroup[] | null {
  const trimmed = value.trim();
  if (!trimmed || !/^[A-Za-z0-9\s_-]+$/.test(trimmed)) return null;
  const rawGroups = trimmed.split(/[\s_-]+/).filter(Boolean);
  if (rawGroups.length === 0) return null;
  const groups = rawGroups.map((group) => {
    const rawRuns = group.match(/[A-Za-z]+|\d+/g);
    if (!rawRuns || rawRuns.join("").length !== group.length) return null;
    return {
      runs: rawRuns.map((run): CollectorRun => /^[A-Za-z]+$/.test(run)
        ? { kind: "alpha", value: run.toUpperCase() }
        : { kind: "number", value: stripLeadingZeros(run) }),
    };
  });
  return groups.every((group): group is CollectorGroup => group !== null) ? groups : null;
}

function canonicalGroups(groups: CollectorGroup[]): string {
  return groups.map((group) => group.runs.map((run) => run.value).join("")).join("-");
}

function groupsPattern(groups: CollectorGroup[]): string {
  return groups.map((group) => group.runs.map((run) => run.kind === "alpha"
    ? escapeRegExp(run.value)
    : numericPattern(run.value)).join("[-\\s_]*")).join("[-\\s_]+");
}

function numericPattern(value: string): string {
  return value === "0" ? "0+" : `0*${escapeRegExp(value)}`;
}

function stripLeadingZeros(value: string): string {
  return value.replace(/^0+(?=\d)/, "");
}

function sameScheme(candidate: ParsedCollectorNumber, expected: ParsedCollectorNumber): boolean {
  if (candidate.kind !== expected.kind) return false;
  const candidateAlpha = alphaSignature(candidate);
  const expectedAlpha = alphaSignature(expected);
  return candidateAlpha === expectedAlpha;
}

function alphaSignature(parsed: ParsedCollectorNumber): string {
  const signature = (groups: CollectorGroup[]) => groups
    .map((group) => group.runs.filter((run) => run.kind === "alpha").map((run) => run.value).join(""))
    .join("-");
  return parsed.kind === "fraction"
    ? `${signature(parsed.groups)}/${signature(parsed.denominatorGroups)}`
    : signature(parsed.groups).split("-")[0] ?? "";
}

function codeCandidates(text: string, expected: ParsedCollectorNumber): string[] {
  const separated = text.match(SEPARATED_CODE_CANDIDATE) ?? [];
  const leadingAlpha = expected.groups[0]?.runs.find((run) => run.kind === "alpha")?.value;
  if (!leadingAlpha) return separated;
  const compact = text.match(new RegExp(`(?<![a-z0-9])${escapeRegExp(leadingAlpha)}\\d{1,8}(?![a-z0-9])`, "gi")) ?? [];
  return [...separated, ...compact];
}

/**
 * The same collector number with the set total zero-padded to three digits, or
 * null when that changes nothing.
 *
 * Modern Pokemon sets print the total padded — a Paldean Fates card reads
 * "232/091" — and both sellers and catalogues copy what is printed. The Pokemon
 * TCG API reports `printedTotal` as the number 91, so our identity string is
 * "232/91" and any keyword search built from it asks for a string almost nobody
 * wrote. Measured 2026-08-15 on eBay: "Mew ex 232/91" returned 6 rows against 50
 * for "Mew ex 232/091". Measured 2026-08-18 on SNKRDUNK: "Mega Charizard X ex
 * 130/94" returned nothing, "130/094" returned the exact print.
 *
 * Padding cannot simply replace the original everywhere. Vintage sets print the
 * total unpadded and no field says which convention a set follows — "Charizard
 * 4/102" returned 50 eBay rows where "4/002" returned one — so a caller that can
 * afford two searches unions them, and a caller that gets one link picks the
 * form its target actually indexes. Only the total is padded, never the card's
 * own number, and codes without a total (every One Piece number) return null.
 */
export function paddedCollectorNumber(cardNumber: string): string | null {
  const parts = cardNumber.trim().match(/^([A-Za-z]{0,4}\d{1,3})\s*\/\s*([A-Za-z]{0,4})(\d{1,3})$/);
  if (!parts) return null;
  const [, number, totalPrefix, total] = parts;
  if (total.length >= 3) return null;
  return `${number}/${totalPrefix}${total.padStart(3, "0")}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
