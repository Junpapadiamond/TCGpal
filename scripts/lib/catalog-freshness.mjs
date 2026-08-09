// Pure logic for the catalog freshness monitor. It answers one question:
// which sets does TCGCSV already know about that TCGlens identity cannot
// resolve? The market anchor is a live daily feed while identity comes from a
// live English API (Pokemon) and a committed snapshot (One Piece), so identity
// is the leg that silently falls behind the anchor.
//
// Coverage is measured by CARD NUMBER, never by set name. Reprint decks such as
// ST-31 ship numbers belonging to older sets (OP01-016, ST21-001); a set-name
// check would report a false gap for every one of them.

export const DEFAULT_LOOKBACK_DAYS = 240;

const MISSING_SAMPLE_LIMIT = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

// In this feed a real release date is always exact midnight with no zone
// ("2026-07-31T00:00:00"). A `publishedOn` carrying a wall-clock time is the
// moment TCGplayer wrote the group, which happens when it backfills legacy
// products — observed 2026-08-08, when 1998 vending machine cards and the 2004
// EX Trainer Kits were all re-stamped with that day's clock time. Counting how
// many groups share a stamp does NOT separate these: the backfills arrive in
// batches as small as two. The midnight test does.
//
// Trade-off: a genuinely new group written with a wall-clock time would be
// skipped, so callers report how many groups this rule dropped.
export function isReleaseDate(publishedOn) {
  return /T00:00:00$/.test(String(publishedOn ?? ""));
}

export function countBackfilledGroups(groups) {
  return groups.filter((group) => group?.publishedOn && !isReleaseDate(group.publishedOn)).length;
}

// Unreleased sets are kept deliberately: an announced set that identity cannot
// resolve is exactly the warning worth having before street date.
export function selectRecentGroups(groups, options = {}) {
  const { now = new Date(), lookbackDays = DEFAULT_LOOKBACK_DAYS } = options;
  const floor = now.getTime() - lookbackDays * DAY_MS;

  return groups
    .filter((group) => {
      const stamp = group?.publishedOn;
      if (!stamp || !isReleaseDate(stamp)) return false;
      const at = new Date(stamp).getTime();
      return Number.isFinite(at) && at >= floor;
    })
    .sort((a, b) => String(a.publishedOn).localeCompare(String(b.publishedOn)));
}

export function normalizeCardNumber(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

export function buildNumberIndex(cards) {
  const index = new Set();
  for (const card of cards) {
    const key = normalizeCardNumber(card?.card_set_id);
    if (key) index.add(key);
  }
  return index;
}

// Sealed product (booster boxes, packs, decks) carries no printed number and is
// never something a buyer searches for by card. Dropping it keeps a pre-release
// group from reading as a catalog gap.
export function numberedProducts(products) {
  const rows = [];
  for (const product of products) {
    const entry = (product?.extendedData ?? []).find((field) => field?.name === "Number");
    const number = String(entry?.value ?? "").trim();
    if (number) rows.push({ number, name: product?.name ?? "" });
  }
  return rows;
}

export function assessGroupCoverage(group, products, index) {
  const rows = numberedProducts(products);

  // Parallels repeat their base number, so distinct numbers are the unit.
  const distinct = new Map();
  for (const row of rows) {
    const key = normalizeCardNumber(row.number);
    if (key && !distinct.has(key)) distinct.set(key, row.number);
  }

  const missingNumbers = [...distinct.entries()]
    .filter(([key]) => !index.has(key))
    .map(([, printed]) => printed);
  const numbered = distinct.size;
  const resolved = numbered - missingNumbers.length;

  const status = numbered === 0
    ? "pending-singles"
    : missingNumbers.length === 0
      ? "covered"
      : resolved === 0
        ? "missing"
        : "partial";

  return {
    groupId: group.groupId,
    name: group.name,
    abbreviation: group.abbreviation ?? null,
    publishedOn: group.publishedOn ?? null,
    status,
    products: products.length,
    numbered,
    resolved,
    missingNumbers,
    missingSample: missingNumbers.slice(0, MISSING_SAMPLE_LIMIT),
  };
}

// A set TCGplayer has listed but nobody has printed yet cannot be a staleness
// bug on our side. Report the gap, do not fail on it.
export function applyReleaseTiming(assessment, now = new Date()) {
  if (assessment.status === "covered") return assessment;
  const at = new Date(assessment.publishedOn ?? "").getTime();
  if (!Number.isFinite(at) || at <= now.getTime()) return assessment;
  return { ...assessment, status: "pending-release" };
}

// TCGplayer prefixes English Pokemon groups with their own set code
// ("ME05: Pitch Black"); pokemontcg.io carries the bare name.
export function normalizeSetName(name) {
  return String(name ?? "")
    .replace(/^[A-Za-z0-9]{1,6}:\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchPokemonSet(groupName, setNames) {
  const wanted = normalizeSetName(groupName);
  if (!wanted) return null;
  return setNames.find((setName) => normalizeSetName(setName) === wanted) ?? null;
}

export function summarizeReport(entries) {
  const counts = {
    covered: 0,
    partial: 0,
    missing: 0,
    "pending-singles": 0,
    "pending-release": 0,
    unsupported: 0,
  };
  for (const entry of entries) {
    if (entry.status in counts) counts[entry.status] += 1;
  }
  // `pending-singles` is upstream timing and `unsupported` is a known
  // architectural gap. Failing on either would make the weekly signal noise.
  return { ok: counts.partial === 0 && counts.missing === 0, counts };
}
