// The falsifiable test D-OP-BASE-PROOF requires before the rule may be written.
//
// The proposal: let a One Piece *multi-print* base print be proven by the absence
// of any sibling marker. It would recover 9 of the 10 exact-print recall misses,
// and it would also weaken a guardrail that currently stops a cheaper sibling
// artwork from being sold as the confirmed one. PROGRESS.md fixes the terms:
// sample the `unknown` rows from three base cards, count how many are genuinely
// the base print, ship at >=90% precision, kill below 80%.
//
// This script only collects and scores. It does not change ranking, and running
// it does not adopt the rule.
//
//   npm run sample:base-proof                          # collect against production
//   TARGET=http://localhost:3000 PACE_MS=1500 npm run sample:base-proof
//   ONLY=op-nami-op01-016 npm run sample:base-proof
//   npm run sample:base-proof -- --score <sheet.md>     # score the filled sheet
//
// Collect writes a Markdown sheet (one row per listing, blank verdict column)
// plus a JSON sidecar. Adjudicate by opening each URL, then score.
import { readFileSync, writeFileSync } from "node:fs";

import { PRINT_RECALL_CARDS } from "../src/lib/testing/print-recall-cards.ts";
import { resolve as resolveReport, sleep } from "./lib/compare-probe.mjs";
import {
  KILL_PRECISION,
  SHIP_PRECISION,
  enrichmentSuppression,
  parseSheet,
  partitionSample,
  poolBlockers,
  renderSheet,
  scoreByCard,
  toSheetRow,
} from "./lib/base-print-sample.mjs";

// The three cards D-OP-BASE-PROOF names. They are One Piece base prints whose
// collector number is shared by several artworks, which is the only case the
// proposed rule would change.
const DEFAULT_CARD_IDS = ["op-nami-op01-016", "op-zoro-op06-118", "op-shanks-op09-001"];

const BASE = process.env.TARGET || "https://lenstcg.com";
const PACE_MS = Number(process.env.PACE_MS ?? 31_000);
const probe = { log: console.log };

const scoreIndex = process.argv.indexOf("--score");
const pct = (value) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);

if (scoreIndex !== -1) {
  const path = process.argv[scoreIndex + 1];
  if (!path) {
    console.error("usage: npm run sample:base-proof -- --score <sheet.md>");
    process.exit(1);
  }

  const rows = parseSheet(readFileSync(path, "utf8"));
  const { pooled: result, byCard } = scoreByCard(rows);

  console.log(`\n──────── D-OP-BASE-PROOF precision ────────`);
  console.log(`sheet                     ${path}`);
  console.log(`adjudicated               ${result.total}`);
  console.log(`base print                ${result.base}`);
  console.log(`sibling print             ${result.sibling}`);
  console.log(`unclear                   ${result.unclear}`);
  console.log(`\nstrict precision          ${pct(result.strictPrecision)}   <- governs the decision`);
  console.log(`reviewable-only precision ${pct(result.lenientPrecision)}`);
  console.log(`\nthresholds                ship >=${pct(SHIP_PRECISION)}   kill <${pct(KILL_PRECISION)}`);
  console.log(`decision                  ${result.decision.toUpperCase()}`);

  // A pooled pass hiding one failing card is the wrong thing to learn here.
  if (Object.keys(byCard).length > 1) {
    console.log(`\nby card`);
    for (const [card, score] of Object.entries(byCard)) {
      console.log(
        `  ${card.padEnd(34)}${String(score.total).padStart(3)} rows   ` +
        `${pct(score.strictPrecision).padStart(6)}   ${score.decision}`,
      );
    }
    const weakest = Object.entries(byCard).filter(([, score]) => score.decision !== "ship");
    if (result.decision === "ship" && weakest.length) {
      console.log(`\nPooled precision ships but ${weakest.map(([card]) => card).join(", ")} did not.`);
      console.log(`Do not adopt the rule on the pooled number alone.`);
    }
  }

  if (result.decision === "no-sample") {
    console.log("\nNo verdict was filled in. Open the listings and set the verdict column.");
  } else if (result.decision === "inconclusive") {
    console.log("\nBetween the thresholds: do not write the rule. Improve the inspect_first copy instead.");
  } else if (result.decision === "kill") {
    console.log("\nBelow the kill threshold: the absence of a sibling marker does not prove the base print.");
  } else {
    console.log("\nAt or above the ship threshold. Record this evidence in PROGRESS.md before implementing.");
  }
  if (result.unclear > 0) {
    console.log(`${result.unclear} row(s) were unreviewable; strict precision counts them against the rule.`);
  }
  process.exit(0);
}

const ONLY = (process.env.ONLY || "").split(",").map((id) => id.trim()).filter(Boolean);
const wanted = ONLY.length ? ONLY : DEFAULT_CARD_IDS;
const CARDS = PRINT_RECALL_CARDS.filter((card) => wanted.includes(card.id));

if (CARDS.length === 0) {
  console.error(`No cards matched ${wanted.join(", ")}. Known ids are in src/lib/testing/print-recall-cards.ts.`);
  process.exit(1);
}

const OUT = process.env.OUT || `docs/base-print-precision-sample-${new Date().toISOString().slice(0, 10)}.md`;

function tally(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
}

console.log(`target ${BASE}   cards ${CARDS.length}   pace ${PACE_MS}ms\n`);

const cards = [];
for (const [index, card] of CARDS.entries()) {
  let entry;
  try {
    const { report } = await resolveReport(BASE, card, probe);
    const candidates = report.candidates ?? [];
    const { wouldFlip, blockedAnyway, otherBlockers } = partitionSample(candidates);

    entry = {
      label: card.label,
      confirmedCardId: report.confirmedCard?.id ?? card.confirmedCardId ?? "unresolved",
      outcome: report.outcome ?? report.status ?? "—",
      found: candidates.length,
      eligible: candidates.filter((candidate) => candidate.eligible).length,
      printMatchTally: tally(candidates.map((candidate) => candidate.printMatch ?? "absent")),
      wouldFlip: wouldFlip.map(toSheetRow),
      blockedAnyway: blockedAnyway.map(toSheetRow),
      otherBlockers,
    };
  } catch (error) {
    entry = {
      label: card.label,
      confirmedCardId: card.confirmedCardId ?? "unresolved",
      outcome: "ERROR",
      found: 0,
      eligible: 0,
      printMatchTally: {},
      wouldFlip: [],
      blockedAnyway: [],
      otherBlockers: {},
      error: error.message,
    };
  }

  cards.push(entry);
  console.log(
    `${entry.label.padEnd(28)}${String(entry.outcome).padEnd(15)}found ${String(entry.found).padStart(3)}   ` +
    `adjudicate ${String(entry.wouldFlip.length).padStart(3)}   blocked-anyway ${String(entry.blockedAnyway.length).padStart(3)}` +
    (entry.error ? `   ${entry.error}` : ""),
  );
  if (index < CARDS.length - 1) await sleep(PACE_MS);
}

const generatedAt = new Date().toISOString();
writeFileSync(OUT, renderSheet({ cards, generatedAt, target: BASE }));
const jsonPath = OUT.replace(/\.md$/, ".json");
writeFileSync(jsonPath, `${JSON.stringify({ target: BASE, generatedAt, cards }, null, 2)}\n`);

const adjudicable = cards.reduce((sum, card) => sum + card.wouldFlip.length, 0);
const setAside = cards.reduce((sum, card) => sum + card.blockedAnyway.length, 0);

console.log(`\nadjudicable rows          ${adjudicable}   <- the precision denominator`);
console.log(`print-blocked but also excluded elsewhere   ${setAside}`);

// A small denominator has two very different causes, and only one of them is an
// answer about print proof.
const suppression = enrichmentSuppression(poolBlockers(cards));
if (suppression?.dominant) {
  console.log(
    `\n! ${suppression.count} of ${suppression.total} set-aside rows were excluded for an unstated condition,` +
    `\n  which the eBay detail call resolves for only EBAY_DETAIL_BUDGET rows (12 of 50 by default).` +
    `\n  A small denominator here is partly that budget, not evidence about print proof.` +
    `\n  Re-run against a dev server started with EBAY_DETAIL_BUDGET=50 to separate them.`,
  );
}

console.log(`\nwrote ${OUT}`);
console.log(`wrote ${jsonPath}`);

if (adjudicable === 0) {
  console.log("\nNo row is blocked by print proof alone, so the proposed rule would free no supply here.");
} else {
  console.log(`\nNext: open each URL, set the verdict column, then`);
  console.log(`  npm run sample:base-proof -- --score ${OUT}`);
}
