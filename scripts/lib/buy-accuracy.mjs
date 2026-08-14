// Pure logic for the One Piece buy-accuracy sheet (docs/plan-one-piece-accuracy-2026-08-14.md).
//
// `measure:print-recall` scores recall: did the report end in `best_buy`. That is
// not the same question a buyer asks. A report can reach `best_buy` on a sibling
// artwork and still be wrong, and recall would call it a hit. Buy accuracy asks
// instead: is the listing behind the link we recommend the card we confirmed?
//
// Only a human can answer that, by opening the URL. This module turns a live
// report into one adjudicable row per card and scores the filled-in sheet. It
// reads reports; it never changes ranking.

// The lens the product recommends by default. Buy accuracy scores that one row,
// because it is the one a buyer acts on without changing anything.
export const DEFAULT_LENS = "best_value";

// Verdicts. `abstained` is recorded by the collector, not the reviewer: a report
// with no listing at all has no link to adjudicate, and scoring it any other way
// would let an abstention pass as accuracy.
//
// An `inspect_first` row IS adjudicated. The question this instrument answers is
// whether the eBay link the product puts in front of a buyer is the confirmed
// print, and the inspect row is a link the buyer sees and clicks. Scoring it as an
// automatic miss would measure outcome confidence instead of link accuracy — the
// `lens` column keeps the two distinguishable when reading a filled sheet.
export const REVIEWER_VERDICTS = ["correct", "wrong-print", "dead-link", "unclear"];
export const AUTO_VERDICTS = ["abstained", "unresolved", "error"];

// Only `correct` counts. `unclear` counts against accuracy for the same reason it
// does in the base-print sample: a reviewer who cannot tell is not evidence that
// we were right.
export const ACCURATE_VERDICTS = ["correct"];

export const TARGET_ACCURACY = 0.8;

const SHEET_COLUMNS = ["card", "verdict", "lens", "confirmed", "printMatch", "total", "title", "url", "notes"];

function excludeCodes(candidate) {
  return (candidate?.eligibilityIssues ?? [])
    .filter((issue) => issue?.disposition === "exclude")
    .map((issue) => issue.code);
}

export function tally(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
}

export function exclusionCodes(candidates) {
  const counts = new Map();
  for (const candidate of candidates ?? []) {
    if (candidate?.eligible) continue;
    for (const code of excludeCodes(candidate)) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
}

/**
 * The listing a buyer would act on: whichever candidate the default lens named.
 * Falls back to the inspect row so an `inspect_first` outcome is still visible in
 * the sheet — it is reported, but it is never scored as accurate.
 */
export function selectWinner(report) {
  const candidates = report?.candidates ?? [];
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  const choices = report?.rankedChoices ?? [];
  const choice = choices.find((entry) => entry.role === DEFAULT_LENS) ?? choices[0] ?? null;
  if (choice) {
    const listing = byId.get(choice.listingId) ?? null;
    return { lens: choice.role, listing, label: choice.label ?? "" };
  }

  if (report?.inspectListingId) {
    return { lens: "inspect_first", listing: byId.get(report.inspectListingId) ?? null, label: "" };
  }
  return { lens: null, listing: null, label: "" };
}

/**
 * The verdict the collector can settle without a reviewer. Returns null when the
 * report produced a real recommendation, which is exactly the case a human has to
 * open.
 */
export function autoVerdict(report, winner) {
  if (!report) return "error";
  if (report.status === "needs_confirmation" || !report.confirmedCard) return "unresolved";
  if (report.outcome === "next_moves") return "abstained";
  if (!winner?.listing) return "abstained";
  return null;
}

export function toSheetRow(card, report, winner, verdict) {
  const listing = winner?.listing ?? null;
  const total = listing?.estimatedLandedCost ?? listing?.preTaxTotal ?? null;
  return {
    card: card.id,
    verdict: verdict ?? "",
    lens: winner?.lens ?? "—",
    confirmed: report?.confirmedCard?.id ?? card.confirmedCardId ?? "unresolved",
    printMatch: listing?.printMatch ?? "—",
    total: total === null ? "—" : `$${total.toFixed(2)}`,
    title: (listing?.title ?? "").replace(/\|/g, "/").slice(0, 120),
    url: listing?.url ?? "",
    notes: "",
  };
}

export function renderSheet(rows, meta) {
  const lines = [];
  lines.push(`# One Piece buy-accuracy sample — ${meta.date}`);
  lines.push("");
  lines.push(`Target ${meta.target}. Cards ${rows.length}. Buyer context: Near Mint, ZIP 10001, English.`);
  lines.push("");
  lines.push("Open each URL and set `verdict`:");
  lines.push("");
  lines.push("- `correct` — live listing, and it is the confirmed print.");
  lines.push("- `wrong-print` — sibling artwork, wrong number, or wrong language.");
  lines.push("- `dead-link` — 404, ended, or redirected to search.");
  lines.push("- `unclear` — cannot tell from the page. Counts against accuracy.");
  lines.push("");
  lines.push("`lens` says how the link was presented: `best_value` is a recommendation, `inspect_first` is a");
  lines.push("row the product asked the buyer to check. Both are links a buyer clicks, so both are scored.");
  lines.push("");
  lines.push(`Rows already carrying \`${AUTO_VERDICTS.join("`, `")}\` need no review; they have no link to open.`);
  lines.push("");
  lines.push(`| ${SHEET_COLUMNS.join(" | ")} |`);
  lines.push(`|${SHEET_COLUMNS.map(() => "---").join("|")}|`);
  for (const row of rows) {
    lines.push(`| ${SHEET_COLUMNS.map((column) => String(row[column] ?? "")).join(" | ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function parseSheet(markdown) {
  const rows = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
    if (cells.length < SHEET_COLUMNS.length) continue;
    if (cells[0] === "card" || /^-+$/.test(cells[0])) continue;
    const row = Object.fromEntries(SHEET_COLUMNS.map((column, index) => [column, cells[index] ?? ""]));
    rows.push(row);
  }
  return rows;
}

export function score(rows) {
  const scored = rows.filter((row) => row.verdict);
  const accurate = scored.filter((row) => ACCURATE_VERDICTS.includes(row.verdict));
  const accuracy = scored.length === 0 ? null : accurate.length / scored.length;
  return {
    total: rows.length,
    adjudicated: scored.length,
    unscored: rows.length - scored.length,
    accurate: accurate.length,
    accuracy,
    byVerdict: tally(scored.map((row) => row.verdict)),
    meetsTarget: accuracy !== null && accuracy >= TARGET_ACCURACY,
  };
}
