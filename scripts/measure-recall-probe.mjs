// Explicit, one-shot evaluation; no scheduler, marketplace pages, or raw captures.
// node scripts/measure-recall-probe.mjs
// Optional TARGET, LIMIT (1..20), PACE_MS (>=31000), OUT (local JSON).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PRINT_RECALL_CARDS } from "../src/lib/testing/print-recall-cards.ts";
import { buildCompareRequest, compare, sleep } from "./lib/compare-probe.mjs";

const base = process.env.TARGET || "https://lenstcg.com";
const limit = Number(process.env.LIMIT ?? 20);
if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("LIMIT must be 1..20.");
const pace = Math.max(31_000, Number(process.env.PACE_MS) || 31_000);
const output = process.env.OUT || "output/recall-probe/latest.json";
const cards = [{ id: "pkm-bubble-mew", label: "Mew ex 232/091", game: "pokemon", query: "Mew ex 232/091", name: "Mew ex", setCode: "sv4pt5", cardNumber: "232/091", confirmedCardId: "sv4pt5-232" },
  ...PRINT_RECALL_CARDS.filter(card => card.game === "pokemon").slice(0, 9),
  ...PRINT_RECALL_CARDS.filter(card => card.game === "onePiece").slice(0, 10),
].slice(0, limit);
const run = { method: "bounded-recall-yield-v1", startedAt: new Date().toISOString(), target: base, cards: [] };
const save = () => { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(run, null, 2) + "\n"); };
for (const [index, card] of cards.entries()) {
  if (index) await sleep(pace);
  const started = Date.now();
  try {
    // One comparison per card. Ambiguity is a separate outcome, never an arbitrary print pick.
    const report = await compare(base, buildCompareRequest(card, card.confirmedCardId), { maxAttempts: 1,
      fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }) });
    const checks = report.searchCoverage ?? [];
    const result = { id: card.id, confirmedCardId: report.confirmedCard?.id ?? null, durationMs: Date.now() - started,
      status: report.status, observedAt: report.generatedAt,
      checks: checks.map(check => ({ status: check.status, query: check.query, attempts: check.attempts,
        observedAt: check.observedAt, returnedCount: check.returnedCount, newCount: check.newCount,
        comparableCount: check.comparableCount, unresolvedCount: check.unresolvedCount, baselineCheapestTotal: check.baselineCheapestTotal,
        // Minimal local adjudication evidence only; no seller identifiers, ZIP or raw pages.
        match: check.listing ? { url: check.listing.url, itemPrice: check.listing.price, shipping: check.listing.shipping,
          buyerFee: check.listing.buyerFee, preTaxTotal: check.listing.preTaxTotal,
          condition: check.listing.claimedCondition, printMatch: check.listing.printMatch, humanReviewed: false } : null,
      })),
    };
    run.cards.push(result); console.log(JSON.stringify({ card: card.id, status: result.status, probe: checks.map(check => check.status) }));
  } catch (error) {
    // Deliberately avoid persisting provider bodies, URLs in errors, or credentials.
    run.cards.push({ id: card.id, status: "request_failed", durationMs: Date.now() - started });
    console.log(JSON.stringify({ card: card.id, status: "request_failed", errorType: error.name }));
  }
  save();
}
run.completedAt = new Date().toISOString();
run.counts = run.cards.flatMap(card => card.checks ?? []).reduce((counts, check) => ({ ...counts, [check.status]: (counts[check.status] ?? 0) + 1 }), {});
save(); console.log(JSON.stringify({ completed: run.cards.length, counts: run.counts, output }));
