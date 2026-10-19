import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createJiti } from "jiti";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("npm run eval:cards -- [--split tuning|held_out|all] [--dataset file.json] [--import-report file.json] [--baseline result.json] [--ai] [--models model1,model2]\nOutputs are local in output/accuracy-eval. Default: offline tuning split, no network. --ai makes at most one existing-provider call for up to 12 tuning review cases. Model routing uses local availability history, never changes provider credentials, never uses Haiku. Import creates pending labels, never gold.");
  process.exit(0);
}
function option(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Missing value for ${name}`);
  return args[i + 1];
}
const split = option("--split", "tuning");
if (!["tuning", "held_out", "all"].includes(split)) throw new Error("Invalid split");
const known = new Set(["--split", "--dataset", "--import-report", "--baseline", "--ai", "--models"]);
for (const arg of args.filter(a => a.startsWith("--"))) if (!known.has(arg)) throw new Error(`Unknown option ${arg}`);
const jiti = createJiti(import.meta.url, { alias: { "@/": `${process.cwd()}/src/` } });
const { evaluateAccuracy, datasetFromReport } = await jiti.import("../src/lib/evaluation/card-accuracy.ts");
const readJson = file => {
  if (fs.statSync(file).size > 10 * 1024 * 1024) throw new Error("Input exceeds 10 MiB");
  return JSON.parse(fs.readFileSync(file, "utf8"));
};
const out = path.resolve("output/accuracy-eval", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(out, { recursive: true });
const input = option("--import-report", null);
if (input && split === "all") throw new Error("Choose one family split when importing a report");
const dataset = input ? datasetFromReport(readJson(input), split)
  : readJson(option("--dataset", "src/lib/evaluation/card-accuracy-dataset.json"));
if (input) fs.writeFileSync(path.join(out, "pending-dataset.json"), JSON.stringify(dataset, null, 2));
const result = evaluateAccuracy(dataset, split);
let commit = "unknown";
try { commit = execFileSync("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* metadata only */ }
const baselineFile = option("--baseline", null);
let baseline = null;
if (baselineFile) {
  const old = readJson(baselineFile);
  if (old.datasetHash !== result.datasetHash || old.split !== result.split) throw new Error("Baseline dataset/split differs; do not compare different cohorts");
  if (!Array.isArray(old.rows) || old.rows.length !== result.rows.length) throw new Error("Invalid baseline rows");
  const oldPass = new Map(old.rows.map(r => [r.id, r.pass]));
  if (result.rows.some(r => !oldPass.has(r.id))) throw new Error("Baseline case ids differ");
  baseline = { regressions: result.rows.filter(r => oldPass.get(r.id) === true && r.pass === false).map(r => r.id),
    recoveries: result.rows.filter(r => oldPass.get(r.id) === false && r.pass === true).map(r => r.id) };
}
let triage = { status: "off", findings: [] };
if (args.includes("--ai")) {
  const { default: nextEnv } = await import("@next/env");
  nextEnv.loadEnvConfig(process.cwd());
  const { getAiConfig } = await jiti.import("../src/lib/ai/config.ts");
  const { createAiProvider } = await jiti.import("../src/lib/ai/provider.ts");
  const { evaluationHistorySchema, reviewWithModels } = await jiti.import("../src/lib/evaluation/model-routing.ts");
  const config = getAiConfig();
  const models = option("--models", config.provider === "anthropic" ? config.anthropicModel : config.primaryModel).split(",").map(s => s.trim());
  if (models.some(m => config.provider === "anthropic" ? !m.startsWith("claude-") : !m.startsWith("gpt-"))) throw new Error("Models must use the configured provider and credentials.");
  const historyFile = path.resolve("output/accuracy-eval/model-history.json");
  const history = fs.existsSync(historyFile) ? evaluationHistorySchema.parse(readJson(historyFile)) : [];
  const reviewed = await reviewWithModels(result, models, history, model => createAiProvider({ ...config,
    anthropicModel: model, primaryModel: model, cheapModel: model }));
  triage = { ...reviewed.triage, selectedModel: reviewed.selectedModel };
  fs.writeFileSync(historyFile, JSON.stringify(reviewed.history, null, 2));
}
const payload = { ...result, generatedAt: new Date().toISOString(), commit, baseline, triage };
fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(payload, null, 2));
const pct = n => n === null ? "not measured" : `${(n * 100).toFixed(1)}%`;
const lines = ["# Card accuracy evaluation", "", `Dataset: ${result.datasetId}; split: ${split}; commit: ${commit}.`, "",
  "This replays listing identity and eligibility. It does not measure search coverage, live availability, or population buy accuracy.", "",
  `- Cases: ${result.total}; labeled: ${result.scored}; expectation agreement: ${pct(result.accuracy)}.`,
  `- Human-reviewed cases: ${result.humanReviewed.total}; agreement: ${pct(result.humanReviewed.accuracy)}.`,
  `- Agent-reviewed cases (provisional, not human gold): ${result.agentReviewed.total}; agreement: ${pct(result.agentReviewed.accuracy)}.`,
  `- False identity accepts: ${result.falseAccepts}; false rejects/abstentions: ${result.falseRejects}; unsafe eligible: ${result.unsafeEligible}.`,
  `- Review queue: ${result.reviewQueue.length}; AI triage: ${triage.status}.`, "",
  "## Review queue", "", ...result.reviewQueue.map(r => `- ${r.id}: ${r.labelStatus}; expected ${JSON.stringify(r.expected)}; observed ${JSON.stringify(r.actual)}. ${r.reasons.join("; ")}`), "",
  "Do not tune against held-out rows. Review source evidence before promoting pending labels. AI hypotheses never change gold or production rules.", ""];
fs.writeFileSync(path.join(out, "report.md"), lines.join("\n"));
console.log(JSON.stringify({ output: out, total: result.total, scored: result.scored, agreement: result.accuracy, humanReviewed: result.humanReviewed,
  falseAccepts: result.falseAccepts, falseRejects: result.falseRejects, unsafeEligible: result.unsafeEligible,
  failures: result.failures.map(r => ({ id: r.id, expected: r.expected, actual: r.actual })), triage: triage.status, baseline }, null, 2));
if (!result.total || result.failures.length || baseline?.regressions.length) process.exitCode = 1;
