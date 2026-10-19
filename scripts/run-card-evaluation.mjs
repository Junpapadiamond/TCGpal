// Offline CI replay plus an explicitly authorized, once-per-UTC-day local batch.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createJiti } from "jiti";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("node scripts/run-card-evaluation.mjs [--live] [--ai] [--models model1,model2]\nDefault: offline frozen regression check. --live: once per UTC day, two eBay-only searches, one per game. --ai: at most one strong-model review of fresh tuning observations. No retries, automatic labels or deployment. Local reports: output/accuracy-eval/automation/latest.json and latest.md.");
  process.exit(0);
}
const modelIndex = args.indexOf("--models");
if (modelIndex >= 0 && (!args[modelIndex + 1] || args[modelIndex + 1].startsWith("--"))) throw new Error("Missing models");
const models = modelIndex >= 0 ? args[modelIndex + 1] : process.env.CARD_EVAL_MODELS || null;
const flags = args.filter((_, i) => i !== modelIndex + 1 || modelIndex < 0);
if (flags.some(a => !["--live", "--ai", "--models"].includes(a))) throw new Error("Unknown option");
if (args.includes("--ai") && !args.includes("--live")) throw new Error("AI review requires the reserved live batch");
const jiti = createJiti(import.meta.url, { alias: { "@/": `${process.cwd()}/src/` } });
const { evaluateAccuracy, accuracyDatasetSchema } = await jiti.import("../src/lib/evaluation/card-accuracy.ts");
const { compareAutomationBaseline, selectDailyCards, reserveDailyRun } = await jiti.import("../src/lib/evaluation/automation.ts");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const root = path.resolve("output/accuracy-eval/automation");
fs.mkdirSync(root, { recursive: true });
const report = { version: 1, startedAt: new Date().toISOString(), status: "ok", offline: [], live: null, ai: { status: "off", findings: [] } };
let reservation;
const save = () => {
  report.completedAt = new Date().toISOString();
  if (["already_reserved", "blocked_lock"].includes(report.status)) {
    console.log(JSON.stringify({ status: report.status, report: path.join(root, "latest.md") }));
    return; // Keep the actual daily findings; a duplicate wakeup is not a new report.
  }
  const markdown = ["# Automatic card evaluation", "", `Run: ${report.startedAt}; status: ${report.status}.`, "",
    ...report.offline.map(r => `- ${r.datasetId}: ${r.passed}/${r.scored} provisional agreement; ${r.regressions.length} new regressions; ${r.knownFailures.length} known failures; ${r.pending} pending.`),
    `- Live: ${report.live?.status ?? "not requested"}; AI: ${report.ai.status}.`,
    ...(report.live?.cards ?? []).map(c => `- ${c.id}: ${c.status}, ${c.candidateCount ?? 0} candidates; recall: ${(c.coverage ?? []).map(p => p.status).join(", ") || "unavailable"}.`),
    "", "AI findings are hypotheses, new labels remain pending. Known failures are not passes. No human/artwork accuracy or exhaustive price recall is implied.",
    ...report.ai.findings.map(f => `- ${f.caseId}: ${f.hypothesis} Next test: ${f.nextTest}`), ""].join("\n");
  for (const [file, contents] of [["latest.json", JSON.stringify(report, null, 2)], ["latest.md", markdown]]) {
    if (reservation?.status === "reserved") fs.writeFileSync(path.join(reservation.runDirectory, file), contents);
    const temporary = path.join(root, `${file}.${process.pid}.tmp`);
    fs.writeFileSync(temporary, contents);
    fs.renameSync(temporary, path.join(root, file));
  }
  console.log(JSON.stringify({ status: report.status, report: path.join(root, "latest.md"),
    offline: report.offline, live: report.live?.status ?? "off", ai: report.ai.status }, null, 2));
};
try {
  const baseline = read("src/lib/evaluation/automation-baseline.json");
  for (const entry of baseline.datasets) {
    const result = evaluateAccuracy(read(entry.path), "all");
    report.offline.push({ datasetId: result.datasetId, scored: result.scored,
      passed: result.rows.filter(r => r.pass === true).length, pending: result.total - result.scored,
      ...compareAutomationBaseline(entry, result) });
  }
  if (report.offline.some(r => r.regressions.length)) { report.status = "regression"; process.exitCode = 1; }
  else if (args.includes("--live")) {
    reservation = reserveDailyRun(path.join(root, "daily"), new Date());
    report.live = { status: reservation.status, cards: [] };
    if (reservation.status === "reserved") {
      const cards = selectDailyCards(read("src/lib/evaluation/real-card-cohort.json").cards, new Date());
      const out = path.join(reservation.runDirectory, "observations");
      // Fixed target and scope; environment cannot expand this job into paid fan-out.
      const child = spawnSync(process.execPath, ["scripts/collect-card-benchmark.mjs"], {
        env: { ...process.env, ONLY: cards.map(c => c.id).join(","), OUT: out, TARGET: "https://lenstcg.com" },
        encoding: "utf8", timeout: 210000, maxBuffer: 1024 * 1024, windowsHide: true,
      });
      const run = fs.existsSync(path.join(out, "run.json")) ? read(path.join(out, "run.json")) : { cards: [] };
      report.live.cards = run.cards;
      const healthy = !child.error && child.status === 0 && run.completedAt && run.cards.length === 2
        && run.cards.every(c => c.status === "complete" && c.candidateCount > 0 && c.confirmedCardId);
      report.live.status = healthy ? "complete" : "inconclusive";
      if (!healthy) report.status = "inconclusive";
      const cases = cards.filter(c => c.split === "tuning").flatMap(card => {
        const file = path.join(out, `${card.id}.json`);
        if (!fs.existsSync(file)) return [];
        const dataset = accuracyDatasetSchema.parse(read(file));
        const winners = new Set(run.cards.find(c => c.id === card.id)?.rankedChoices?.map(c => c.caseId));
        return [...dataset.cases].sort((a, b) => Number(winners.has(b.id)) - Number(winners.has(a.id))).slice(0, 6);
      });
      if (args.includes("--ai") && cases.length) {
        // Child timeout bounds headers AND body parsing. Failure spends today's slot.
        const input = path.join(reservation.runDirectory, "pending-tuning.json");
        fs.writeFileSync(input, JSON.stringify(accuracyDatasetSchema.parse({ version: 1, id: `daily-${report.startedAt}`, cases }), null, 2));
        const childArgs = ["scripts/evaluate-card-accuracy.mjs", "--dataset", input, "--ai", ...(models ? ["--models", models] : [])];
        const review = spawnSync(process.execPath, childArgs, { encoding: "utf8", timeout: 75000,
          maxBuffer: 2 * 1024 * 1024, windowsHide: true });
        report.ai = { status: "unavailable", findings: [] };
        if (!review.error && review.status === 0) {
          const start = review.stdout.indexOf('{\n  "output":');
          if (start >= 0) {
            const output = JSON.parse(review.stdout.slice(start)).output;
            const relative = path.relative(path.resolve("output/accuracy-eval"), path.resolve(output));
            if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid review output");
            report.ai = read(path.join(output, "result.json")).triage;
          }
        }
        if (["unavailable", "rejected"].includes(report.ai.status)) report.status = "inconclusive";
      } else if (args.includes("--ai")) report.ai.status = "skipped_held_out_or_no_data";
    } else if (reservation.status === "locked") { report.status = "blocked_lock"; process.exitCode = 2; }
    else report.status = "already_reserved";
  }
} catch (error) {
  report.status = "failed";
  report.errorType = error.name; // Never echo provider bodies, credentials or environment.
  process.exitCode = 2;
} finally {
  try { save(); } finally { if (reservation?.status === "reserved") reservation.release(); }
}
