// One Piece buy accuracy: of the cards a buyer searches, how often is the listing
// behind the link we recommend actually the card we confirmed?
//
// This is a stricter question than `measure:print-recall`, which scores whether a
// report ended in `best_buy`. A `best_buy` on a sibling artwork counts as recall
// but is a miss here, and an abstention counts as a miss here even though the
// product is right to abstain. Both instruments drive the same public endpoint
// with the same buyer context (scripts/lib/compare-probe.mjs), so their numbers
// describe the same run.
//
//   npm run measure:buy-accuracy                        # against production
//   TARGET=http://localhost:3000 PACE_MS=1500 npm run measure:buy-accuracy
//   ONLY=op-nami-op01-016 npm run measure:buy-accuracy
//   npm run measure:buy-accuracy -- --score <sheet.md>  # score the filled sheet
//
// Collect writes a Markdown sheet (one row per card, blank verdict column) plus a
// JSON sidecar. Adjudicate by opening each URL, then score.
import { readFileSync, writeFileSync } from "node:fs";

import { PRINT_RECALL_CARDS } from "../src/lib/testing/print-recall-cards.ts";
import { resolve as resolveReport, sleep } from "./lib/compare-probe.mjs";
import {
  TARGET_ACCURACY,
  autoVerdict,
  exclusionCodes,
  parseSheet,
  renderSheet,
  score,
  selectWinner,
  tally,
  toSheetRow,
} from "./lib/buy-accuracy.mjs";

const BASE = process.env.TARGET || "https://lenstcg.com";
const PACE_MS = Number(process.env.PACE_MS ?? 31_000);
const probe = { log: console.log };
const pct = (value) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);

const scoreIndex = process.argv.indexOf("--score");
if (scoreIndex !== -1) {
  const path = process.argv[scoreIndex + 1];
  if (!path) {
    console.error("usage: npm run measure:buy-accuracy -- --score <sheet.md>");
    process.exit(1);
  }

  const result = score(parseSheet(readFileSync(path, "utf8")));
  console.log(`\n──────── One Piece buy accuracy ────────`);
  console.log(`sheet                     ${path}`);
  console.log(`rows                      ${result.total}`);
  console.log(`adjudicated               ${result.adjudicated}${result.unscored ? `  (${result.unscored} still blank)` : ""}`);
  console.log(`accurate                  ${result.accurate}`);
  console.log(`\naccuracy                  ${pct(result.accuracy)}   target >=${pct(TARGET_ACCURACY)}`);
  console.log(`verdicts                  ${Object.entries(result.byVerdict).map(([k, v]) => `${k} ${v}`).join(", ") || "—"}`);
  console.log(`decision                  ${result.meetsTarget ? "MEETS TARGET" : "BELOW TARGET"}`);
  if (result.unscored) console.log(`\n${result.unscored} row(s) have no verdict. Open the URLs and fill them in.`);
  process.exit(result.meetsTarget ? 0 : 1);
}

const ONLY = (process.env.ONLY || "").split(",").map((id) => id.trim()).filter(Boolean);
const CARDS = PRINT_RECALL_CARDS
  .filter((card) => card.game === "onePiece")
  .filter((card) => ONLY.length === 0 || ONLY.includes(card.id));

if (CARDS.length === 0) {
  console.error(`No One Piece cards matched. Known ids are in src/lib/testing/print-recall-cards.ts.`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const OUT = process.env.OUT || `docs/one-piece-buy-accuracy-${today}.md`;

console.log(`target ${BASE}   cards ${CARDS.length}   pace ${PACE_MS}ms\n`);
console.log(`${"card".padEnd(40)}${"outcome".padEnd(15)}${"found".padStart(6)}${"elig".padStart(6)}  winner`);

const rows = [];
const details = [];
for (const [index, card] of CARDS.entries()) {
  let row;
  let detail;
  try {
    const { report } = await resolveReport(BASE, card, probe);
    const winner = selectWinner(report);
    const verdict = autoVerdict(report, winner);
    const candidates = report.candidates ?? [];

    row = toSheetRow(card, report, winner, verdict);
    detail = {
      id: card.id,
      label: card.label,
      requestedCardId: card.confirmedCardId ?? null,
      resolvedCardId: report.confirmedCard?.id ?? null,
      outcome: report.outcome ?? report.status ?? null,
      lens: winner.lens,
      winnerId: winner.listing?.id ?? null,
      winnerUrl: winner.listing?.url ?? null,
      winnerTitle: winner.listing?.title ?? null,
      winnerPrintMatch: winner.listing?.printMatch ?? null,
      winnerTotal: winner.listing?.estimatedLandedCost ?? winner.listing?.preTaxTotal ?? null,
      found: candidates.length,
      eligible: candidates.filter((candidate) => candidate.eligible).length,
      printMatch: tally(candidates.map((candidate) => candidate.printMatch ?? "absent")),
      codes: exclusionCodes(candidates),
      abstentionReason: report.abstention?.reason ?? null,
      autoVerdict: verdict,
    };
  } catch (error) {
    row = { card: card.id, verdict: "error", confirmed: "—", printMatch: "—", total: "—", title: error.message.slice(0, 120), url: "", notes: "" };
    detail = { id: card.id, label: card.label, error: error.message };
  }

  rows.push(row);
  details.push(detail);
  console.log(
    `${card.label.padEnd(40)}${String(detail.outcome ?? "ERROR").padEnd(15)}` +
    `${String(detail.found ?? 0).padStart(6)}${String(detail.eligible ?? 0).padStart(6)}  ` +
    (detail.winnerUrl ? `${detail.winnerPrintMatch} ${detail.winnerUrl}` : detail.autoVerdict ?? detail.error ?? "—"),
  );
  if (index < CARDS.length - 1) await sleep(PACE_MS);
}

const auto = rows.filter((row) => row.verdict);
console.log(`\n──────── collected ────────`);
console.log(`cards                     ${rows.length}`);
console.log(`with a recommendation     ${rows.length - auto.length}   <- these need adjudication`);
console.log(`already settled           ${Object.entries(tally(auto.map((row) => row.verdict))).map(([k, v]) => `${k} ${v}`).join(", ") || "—"}`);
console.log(`\nsheet                     ${OUT}`);
console.log(`sidecar                   ${OUT.replace(/\.md$/, ".json")}`);
console.log(`\nOpen each URL, set the verdict column, then:`);
console.log(`  npm run measure:buy-accuracy -- --score ${OUT}`);

writeFileSync(OUT, renderSheet(rows, { date: today, target: BASE }));
writeFileSync(OUT.replace(/\.md$/, ".json"), `${JSON.stringify({ target: BASE, collectedAt: new Date().toISOString(), cards: details }, null, 2)}\n`);
