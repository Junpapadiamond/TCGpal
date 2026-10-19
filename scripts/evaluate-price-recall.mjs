import fs from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("node scripts/evaluate-price-recall.mjs [--ai] [--models model1,model2]\nReplays frozen real price opportunities. Optional one-call AI review sees tuning rows only. Does not fetch marketplaces or change ranking.");
  process.exit(0);
}
for (const arg of args.filter(a => a.startsWith("--"))) if (!["--ai", "--models"].includes(arg)) throw new Error("Unknown argument");
const jiti = createJiti(import.meta.url, { alias: { "@/": `${process.cwd()}/src/` } });
const { assessPriceRecall, triagePriceOpportunities } = await jiti.import("../src/lib/evaluation/price-recall.ts");
const input = JSON.parse(fs.readFileSync("src/lib/evaluation/real-price-opportunities.json", "utf8"));
const rows = input.observations.map(row => ({ ...assessPriceRecall(row), historical: row.historical, observedAt: row.observedAt }));
let triage = { status: "off", findings: [] };
if (args.includes("--ai")) {
  const { default: nextEnv } = await import("@next/env"); nextEnv.loadEnvConfig(process.cwd());
  const { getAiConfig } = await jiti.import("../src/lib/ai/config.ts");
  const { createAiProvider } = await jiti.import("../src/lib/ai/provider.ts");
  const { selectEvaluationModel, evaluationHistorySchema } = await jiti.import("../src/lib/evaluation/model-routing.ts");
  const config = getAiConfig();
  const index = args.indexOf("--models");
  if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith("--"))) throw new Error("Missing --models value");
  const models = (index >= 0 ? args[index + 1] : config.provider === "anthropic" ? config.anthropicModel : config.primaryModel).split(",").map(s => s.trim());
  if (models.some(m => config.provider === "anthropic" ? !m.startsWith("claude-") : !m.startsWith("gpt-"))) throw new Error("Models must use the configured provider.");
  const historyFile = "output/accuracy-eval/price-model-history.json";
  const history = fs.existsSync(historyFile) ? evaluationHistorySchema.parse(JSON.parse(fs.readFileSync(historyFile, "utf8"))) : [];
  const model = selectEvaluationModel(models, history);
  triage = await triagePriceOpportunities(input.observations, createAiProvider({ ...config, anthropicModel: model, primaryModel: model, cheapModel: model }));
  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify([...history, { model, status: triage.status }].slice(-100), null, 2));
}
const output = path.resolve("output/accuracy-eval", `price-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ version: 1, rows, triage, warning: "Provisional bounded sample; no current stock, complete recall or human approval implied." }, null, 2));
console.log(JSON.stringify({ output, rows, triage }, null, 2));
