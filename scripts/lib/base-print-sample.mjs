// Pure logic for the D-OP-BASE-PROOF precision sample (PROGRESS.md DECISIONS).
//
// The open decision: may a One Piece *multi-print* base print be proven by the
// absence of any sibling marker? That rule would convert `unknown` print rows
// into comparable supply, and it is 9 of the 10 exact-print recall misses. It
// also trades away a real guardrail, so it may not be written before a sample
// says how often those rows are genuinely the base print.
//
// This module turns a live comparison report into an adjudication sheet and
// scores the filled-in sheet against the decision's own thresholds. It reads
// reports; it never changes ranking.
//
// The one idea worth stating: NOT every `unknown` row belongs in the
// denominator. Relaxing print proof cannot sell a graded slab, a row with
// unknown shipping, or a Japanese listing of an English card — those stay
// excluded on their own codes. Scoring them would measure the wrong rule. Only
// rows whose sole exclusion is the print block would actually reach a buyer, so
// only those are adjudicated; the rest are reported with the code that also
// blocks them.

// src/lib/comparison/ranking.ts adds this when printAssessment.match === "unknown":
// "The listing does not prove it is the exact confirmed artwork".
export const PRINT_PROOF_CODE = "identity_unverified";

// From D-OP-BASE-PROOF: ship at >=90% precision, kill below 80%, and in between
// neither — improve the inspect_first copy instead.
export const SHIP_PRECISION = 0.9;
export const KILL_PRECISION = 0.8;

// `unclear` is deliberately available. A reviewer who cannot tell from the live
// page must be able to say so, because the alternative is a guess recorded as
// evidence.
export const VERDICTS = ["base", "sibling", "unclear"];

const SHEET_COLUMNS = ["id", "verdict", "notes", "total", "photos", "condition", "title", "url", "why unknown"];

// A row excluded because the seller never stated a condition left the denominator
// for a reason unrelated to print proof. The eBay detail call is what resolves
// most of those, and it runs on only EBAY_DETAIL_BUDGET rows (12 of 50 by
// default), so at the default budget this cause can dominate and make the rule
// look useless when it has not been tested. See D-DETAIL-BUDGET.
const ENRICHMENT_BLOCKER = "condition_unstated";

export function poolBlockers(cards) {
  const pooled = new Map();
  for (const card of cards ?? []) {
    for (const [code, count] of Object.entries(card.otherBlockers ?? {})) {
      pooled.set(code, (pooled.get(code) ?? 0) + count);
    }
  }
  return Object.fromEntries([...pooled].sort((a, b) => b[1] - a[1]));
}

export function enrichmentSuppression(otherBlockers) {
  const count = otherBlockers?.[ENRICHMENT_BLOCKER] ?? 0;
  if (count === 0) return null;

  const counts = Object.values(otherBlockers);
  const total = counts.reduce((sum, value) => sum + value, 0);
  const dominant = counts.every((value) => count >= value);
  return { count, total, share: count / total, dominant };
}

function excludeCodes(candidate) {
  return (candidate?.eligibilityIssues ?? [])
    .filter((issue) => issue?.disposition === "exclude")
    .map((issue) => issue.code);
}

export function classifyRow(candidate) {
  if (candidate?.eligible) return "not-print-blocked";
  const codes = excludeCodes(candidate);
  if (!codes.includes(PRINT_PROOF_CODE)) return "not-print-blocked";
  // A sibling mismatch is a different question: that row was assessed and
  // rejected on positive evidence, and the proposed rule does not touch it.
  return codes.every((code) => code === PRINT_PROOF_CODE) ? "would-flip" : "blocked-anyway";
}

export function partitionSample(candidates) {
  const wouldFlip = [];
  const blockedAnyway = [];
  const otherBlockers = new Map();

  for (const candidate of candidates ?? []) {
    const kind = classifyRow(candidate);
    if (kind === "would-flip") {
      wouldFlip.push(candidate);
      continue;
    }
    if (kind !== "blocked-anyway") continue;
    blockedAnyway.push(candidate);
    for (const code of excludeCodes(candidate)) {
      if (code === PRINT_PROOF_CODE) continue;
      otherBlockers.set(code, (otherBlockers.get(code) ?? 0) + 1);
    }
  }

  return {
    wouldFlip,
    blockedAnyway,
    otherBlockers: Object.fromEntries([...otherBlockers].sort((a, b) => b[1] - a[1])),
  };
}

// Flattened so the sheet and the JSON sidecar agree, and so adjudication never
// needs the full report reloaded.
export function toSheetRow(candidate) {
  return {
    id: candidate.id,
    url: candidate.url ?? "",
    title: candidate.title ?? "",
    price: candidate.price ?? null,
    shipping: candidate.shipping ?? null,
    preTaxTotal: candidate.preTaxTotal ?? null,
    photoCount: candidate.evidence?.photoCount ?? 0,
    claimedCondition: candidate.claimedCondition ?? "Unknown",
    listingLanguage: candidate.listingLanguage ?? null,
    printMatchConfidence: candidate.printMatchConfidence ?? null,
    printMatchReasons: candidate.printMatchReasons ?? [],
    verdict: "",
  };
}

// Markdown cells are pipe-delimited and eBay item ids contain pipes ("v1|1|0").
const escapeCell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const unescapeCell = (value) => value.replace(/\\\|/g, "|").trim();

const money = (value) => (typeof value === "number" ? `$${value.toFixed(2)}` : "—");

function sheetRow(row) {
  return `| ${[
    escapeCell(row.id),
    // Left empty rather than padded so the blank cell is a stable string the
    // scorer's round-trip test can target and a reviewer can type into.
    row.verdict,
    escapeCell(row.notes ?? ""),
    money(row.preTaxTotal),
    String(row.photoCount),
    escapeCell(row.claimedCondition),
    escapeCell(row.title.slice(0, 90)),
    escapeCell(row.url),
    escapeCell(row.printMatchReasons.join("; ")),
  ].join(" | ")} |`;
}

export function renderSheet({ cards, generatedAt, target }) {
  const lines = [
    "# D-OP-BASE-PROOF precision sample",
    "",
    `Generated ${generatedAt} against ${target}.`,
    "",
    "Each row below is a live listing the comparison **found** but could not prove is the",
    "confirmed base artwork, and which nothing else excludes. If the proposed rule (base",
    "print proven by the absence of any sibling marker) were adopted, these are the rows",
    "that would become comparable supply.",
    "",
    "Open each URL and set `verdict` to one of:",
    "",
    "- `base` — genuinely the confirmed base print",
    "- `sibling` — a different print of the same number (alt art, manga, parallel, reprint)",
    "- `unclear` — the live page does not let you tell",
    "",
    "Use `notes` for the evidence behind the call — it is what makes this sample",
    "re-reviewable later, and it is preserved by the scorer.",
    "",
    `Then score it: \`npm run sample:base-proof -- --score <this file>\`. Decision rule from`,
    `PROGRESS.md DECISIONS: ship at >=${SHIP_PRECISION * 100}% precision, kill below ${KILL_PRECISION * 100}%.`,
    "",
    "Leave a row blank to exclude it from the score.",
    "",
  ];

  const suppression = enrichmentSuppression(poolBlockers(cards));
  if (suppression?.dominant) {
    lines.push(
      `> **Read the denominator carefully.** ${suppression.count} of the ${suppression.total} set-aside rows`,
      `> were excluded because the seller never stated a condition, not because of print proof.`,
      `> The eBay detail call resolves most of those and runs on only \`EBAY_DETAIL_BUDGET\` rows`,
      `> (12 of 50 by default), so a small adjudicable set here is partly a budget artifact and`,
      `> is **not** evidence that the proposed rule frees no supply. To separate the two, re-run`,
      `> against a dev server started with \`EBAY_DETAIL_BUDGET=50\`. See D-DETAIL-BUDGET.`,
      "",
    );
  }

  for (const card of cards) {
    lines.push(
      `## ${card.label} (${card.confirmedCardId})`,
      "",
      `Found ${card.found} listings. Print match: ${
        Object.entries(card.printMatchTally)
          .map(([key, value]) => `${key} ${value}`)
          .join(", ") || "—"
      }.`,
      `Adjudicate ${card.wouldFlip.length}; ${card.blockedAnyway.length} more are print-blocked but excluded by something else too${
        Object.keys(card.otherBlockers).length
          ? ` (${Object.entries(card.otherBlockers).map(([code, n]) => `${code} ${n}`).join(", ")})`
          : ""
      }.`,
      "",
    );

    if (card.wouldFlip.length === 0) {
      lines.push("_No row for this card is blocked by print proof alone._", "");
      continue;
    }

    lines.push(
      `| ${SHEET_COLUMNS.join(" | ")} |`,
      `|${SHEET_COLUMNS.map(() => "---").join("|")}|`,
      ...card.wouldFlip.map(sheetRow),
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

// Splits on unescaped pipes only, so "v1\|1\|0" stays one cell.
function splitCells(line) {
  const cells = [];
  let current = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\" && line[index + 1] === "|") {
      current += "\\|";
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.slice(1, -1).map(unescapeCell);
}

export function parseSheet(markdown) {
  const rows = [];
  // Rows are attributed to the "## <label> (<cardId>)" heading above them so a
  // per-card precision can be read without a second file.
  let card = "";
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      card = line.slice(3).trim();
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cells = splitCells(line);
    if (cells.length < 2) continue;
    const [id, verdict, notes = ""] = cells;
    if (!id || id === "id" || /^-+$/.test(id)) continue;
    if (!verdict) continue;
    const normalized = verdict.toLowerCase();
    if (!VERDICTS.includes(normalized)) {
      throw new Error(`Unrecognized verdict "${verdict}" for listing ${id}. Use one of: ${VERDICTS.join(", ")}.`);
    }
    rows.push({ id, verdict: normalized, card, ...(notes ? { notes } : {}) });
  }
  return rows;
}

export function scorePrecision(verdicts) {
  const base = verdicts.filter((verdict) => verdict === "base").length;
  const sibling = verdicts.filter((verdict) => verdict === "sibling").length;
  const unclear = verdicts.filter((verdict) => verdict === "unclear").length;
  const total = base + sibling + unclear;

  if (total === 0) {
    return { base, sibling, unclear, total, strictPrecision: null, lenientPrecision: null, decision: "no-sample" };
  }

  // Strict is the number that governs: an unreviewable row is not evidence the
  // rule picks the right artwork. Lenient is reported so a sample that is mostly
  // unclear is visible as a review problem rather than a precision result.
  const strictPrecision = base / total;
  const reviewable = base + sibling;
  const lenientPrecision = reviewable === 0 ? null : base / reviewable;

  const decision = strictPrecision >= SHIP_PRECISION
    ? "ship"
    : strictPrecision < KILL_PRECISION
      ? "kill"
      : "inconclusive";

  return { base, sibling, unclear, total, strictPrecision, lenientPrecision, decision };
}

// A pooled number can clear the ship threshold while one of the three cards is a
// coin flip, which would be the wrong thing to learn from this sample. Report
// both and let the weakest card be visible.
export function scoreByCard(rows) {
  const byCard = {};
  const groups = new Map();

  for (const row of rows) {
    const key = row.card || "(unattributed)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.verdict);
  }
  for (const [card, verdicts] of groups) byCard[card] = scorePrecision(verdicts);

  return { pooled: scorePrecision(rows.map((row) => row.verdict)), byCard };
}
