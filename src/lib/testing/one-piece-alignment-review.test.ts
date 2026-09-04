import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import {
  auditOnePieceAlignment,
  familiesWithPrefix,
  isBasePrintRow,
  isRetailFamily,
  type AlignmentRow,
} from "@/lib/testing/one-piece-alignment";

// Founder instrument, not a gate: writes the honest-abstention list — every print
// whose own listing the classifier cannot prove — so the ones worth curating can
// be picked by hand. The hard invariants live in one-piece-alignment.test.ts.
//
//   npm run review:one-piece-alignment
const ENABLED = process.env.ONE_PIECE_ALIGNMENT_REVIEW === "1";

const FAMILIES = [
  ...new Set([
    ...familiesWithPrefix(["EB01", "EB02", "EB03", "EB04", "PRB01", "PRB02", "P"]),
    "OP01-001", "OP01-016", "OP01-120", "OP02-013", "OP03-114", "OP03-123", "OP04-119",
    "OP05-069", "OP05-119", "OP06-118", "OP06-119", "OP07-053", "OP07-119", "OP09-001",
    "OP09-027", "OP11-118", "OP13-118", "ST01-001", "ST01-012",
  ]),
];

function group(rows: AlignmentRow[]) {
  const byReason = new Map<string, AlignmentRow[]>();
  for (const row of rows) {
    const list = byReason.get(row.selfReason) ?? [];
    list.push(row);
    byReason.set(row.selfReason, list);
  }
  return [...byReason.entries()].sort((a, b) => b[1].length - a[1].length);
}

describe.skipIf(!ENABLED)("One Piece alignment review", () => {
  it("writes the abstention ledger", () => {
    const audit = auditOnePieceAlignment(FAMILIES);
    const date = new Date().toISOString().slice(0, 10);
    const path = `docs/one-piece-alignment-audit-${date}.md`;
    const unknown = audit.rows.filter((row) => row.self === "unknown");
    const promo = unknown.filter((row) => !isRetailFamily(row.cardNumber));
    const retail = unknown.filter((row) => isRetailFamily(row.cardNumber));

    const lines = [
      `# One Piece exact-print alignment audit — ${date}`,
      "",
      "Every print in EB01–EB04, PRB01–PRB02, the P- promo pool, and the flagship chase numbers,",
      "checked with the production classifier against the seller-visible description of itself and of",
      "each sibling. Hard invariants (no substitutions, no self-rejections, every retail base print",
      "accepted, every marked print accepted) are enforced in `one-piece-alignment.test.ts`.",
      "",
      `| prints | self accepted | honest abstentions | self-rejected | substitutions |`,
      `|---:|---:|---:|---:|---:|`,
      `| ${audit.summary.prints} | ${audit.summary.selfAccepted} | ${audit.summary.selfUnknown} | ${audit.summary.selfMismatch} | ${audit.summary.substitutions} |`,
      "",
      "## Honest abstentions",
      "",
      "A print here is one whose own careful listing the classifier returns `unknown` for: nothing a",
      "seller writes separates it from at least one sibling. That is the correct runtime answer — the",
      "buyer is sent to inspect, never to a sibling — but each is a candidate for a reviewed marker in",
      "`src/lib/external/one-piece-print-metadata.ts` if a seller-visible distinguishing phrase exists.",
      "",
      `### Retail families (${retail.length})`,
      "",
    ];
    for (const [reason, rows] of group(retail)) {
      lines.push(`#### \`${reason}\` (${rows.length})`, "", "| print | base? | variant | release | siblings |", "|---|---|---|---|---:|");
      for (const row of rows) {
        lines.push(`| \`${row.printId}\` | ${isBasePrintRow(row) ? "yes" : ""} | ${row.variant ?? ""} | ${row.release} | ${row.siblingCount} |`);
      }
      lines.push("");
    }
    lines.push(`### Promo families (${promo.length})`, "", "Promo numbers have no ordinary print, so a plain \"promo\" title proves none of them by design.", "");
    for (const [reason, rows] of group(promo)) {
      lines.push(`#### \`${reason}\` (${rows.length})`, "", "| print | variant | release | siblings |", "|---|---|---|---:|");
      for (const row of rows) {
        lines.push(`| \`${row.printId}\` | ${row.variant ?? ""} | ${row.release} | ${row.siblingCount} |`);
      }
      lines.push("");
    }
    writeFileSync(path, `${lines.join("\n")}\n`);
    process.stderr.write(`Wrote ${path}: ${audit.summary.prints} prints, ${unknown.length} honest abstentions (${retail.length} retail, ${promo.length} promo).\n`);
  });
});
