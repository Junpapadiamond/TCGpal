// Explicit one-shot, eBay-only research. No automatic retries or paid providers.
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";
import { buildCompareRequest, compare, sleep } from "./lib/compare-probe.mjs";

const jiti = createJiti(import.meta.url, { alias: { "@/": `${process.cwd()}/src/` } });
const { datasetFromReport } = await jiti.import("../src/lib/evaluation/card-accuracy.ts");
const cards = JSON.parse(fs.readFileSync("src/lib/evaluation/real-card-cohort.json", "utf8"));
const only = (process.env.ONLY || "").split(",").filter(Boolean);
const selected = cards.cards.filter(card => !only.length || only.includes(card.id));
if (!selected.length || only.some(id => !cards.cards.some(c => c.id === id))) throw new Error("Unknown cohort card.");
const out = path.resolve(process.env.OUT || `output/accuracy-eval/real-${new Date().toISOString().replace(/[:.]/g, "-")}`);
fs.mkdirSync(out, { recursive: true });
const run = { version: 1, cohortId: cards.id, startedAt: new Date().toISOString(), cards: [] };
for (const [i, card] of selected.entries()) {
  if (i) await sleep(31000);
  const start = Date.now();
  try {
    const request = { ...buildCompareRequest(card, card.confirmedCardId), marketScope: "single" };
    request.buyer.postalCode = "";
    const report = await compare(process.env.TARGET || "https://lenstcg.com", request, { maxAttempts: 1,
      fetchImpl: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(60000) }) });
    const row = { id: card.id, split: card.split, status: report.status, observedAt: report.generatedAt,
      durationMs: Date.now() - start, confirmedCardId: report.confirmedCard?.id ?? null,
      candidateCount: report.candidates?.length ?? 0, coverage: report.searchCoverage ?? [],
      rankedChoices: report.rankedChoices ?? [], outcome: report.outcome };
    if (["complete", "partial"].includes(report.status) && report.candidates.length && report.confirmedCard?.id?.toLowerCase() === card.confirmedCardId.toLowerCase()) {
      const dataset = datasetFromReport(report, card.split);
      fs.writeFileSync(path.join(out, `${card.id}.json`), JSON.stringify(dataset, null, 2));
      // Reuse import privacy boundary for all retained primary and probe observations.
      const probes = (report.searchCoverage ?? []).flatMap(c => [c.listing, ...(c.excluded ?? [])].filter(Boolean));
      const all = datasetFromReport({ ...report, candidates: [...report.candidates, ...probes] }, card.split);
      const sourceIds = [...report.candidates, ...probes].map(r => r.id);
      row.rankedChoices = row.rankedChoices.map(c => ({ role: c.role, caseId: all.cases[sourceIds.indexOf(c.listingId)]?.id ?? null }));
      row.coverage = row.coverage.map(c => ({ status: c.status, observedAt: c.observedAt,
        returnedCount: c.returnedCount, newCount: c.newCount, comparableCount: c.comparableCount,
        unresolvedCount: c.unresolvedCount, baselineCheapestTotal: c.baselineCheapestTotal,
        listingCaseId: c.listing ? all.cases[sourceIds.indexOf(c.listing.id)]?.id ?? null : null,
        probeTotal: c.listing?.costComplete ? c.listing.preTaxTotal : null }));
      row.sources = report.platforms.map(p => ({ id: p.id, status: p.status, count: p.count }));
      fs.writeFileSync(path.join(out, `${card.id}.json`), JSON.stringify(all, null, 2));
    } else { row.coverage = []; row.rankedChoices = []; }
    run.cards.push(row);
    console.log(JSON.stringify({ id: card.id, status: row.status, candidates: row.candidateCount, coverage: row.coverage.map(c => c.status) }));
  } catch (error) {
    run.cards.push({ id: card.id, split: card.split, status: "request_failed", errorType: error.name, durationMs: Date.now() - start });
    console.log(JSON.stringify({ id: card.id, status: "request_failed", errorType: error.name }));
  }
  fs.writeFileSync(path.join(out, "run.json"), JSON.stringify(run, null, 2));
}
run.completedAt = new Date().toISOString();
fs.writeFileSync(path.join(out, "run.json"), JSON.stringify(run, null, 2));
console.log(JSON.stringify({ output: out, cards: run.cards.length }));
