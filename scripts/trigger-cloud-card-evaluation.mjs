// GitHub holds only a narrowly scoped trigger secret. Provider/Redis keys stay on Vercel.
import fs from "node:fs";
const mode = process.env.CARD_EVAL_MODE || "daily";
if (!["daily", "verify"].includes(mode)) throw new Error("Invalid mode");
const secret = process.env.CARD_EVAL_CRON_SECRET;
if (!secret) throw new Error("Cloud trigger secret missing");
const response = await fetch("https://lenstcg.com/api/internal/card-evaluation", {
  method: "POST", headers: { authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
  body: JSON.stringify({ mode }), signal: AbortSignal.timeout(310000), redirect: "error",
});
if (!response.ok) throw new Error(`Cloud evaluation HTTP ${response.status}; no automatic retry`);
const result = await response.json();
if (result.version !== 1 || result.mode !== mode || !Array.isArray(result.offline) || !Array.isArray(result.cards)) {
  throw new Error("Invalid cloud report");
}
const root = "output/accuracy-eval/cloud";
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(`${root}/latest.json`, JSON.stringify(result, null, 2));
const markdown = ["# Cloud card evaluation", "", `Date: ${result.date}; mode: ${mode}; status: ${result.status}.`,
  mode === "verify" ? "Deployment check of frozen real observations; no fresh searches." : "Daily bounded eBay sample; not exhaustive price recall.", "",
  ...result.offline.map(r => `- ${r.datasetId}: ${r.passed}/${r.scored} provisional agreement; ${r.regressions.length} regressions; ${r.knownFailures.length} known failures.`),
  ...result.cards.map(r => `- ${r.id}: ${r.status}, ${r.candidateCount} candidates; recall ${r.coverage.map(c => c.status).join(", ") || "unavailable"}.`),
  `- AI: ${result.ai.status}; model: ${result.ai.selectedModel ?? "not called"}; findings: ${result.ai.findings.length}.`,
  ...(result.ai.diagnostic ? [`- AI diagnostic: ${result.ai.diagnostic.code}; HTTP ${result.ai.diagnostic.httpStatus ?? "n/a"}.`] : []),
  "", "Observations remain pending. AI findings are hypotheses, never gold or automatic code changes.", ""].join("\n");
fs.writeFileSync(`${root}/latest.md`, markdown);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(JSON.stringify({ date: result.date, mode, status: result.status, ai: result.ai.status }));
if (result.status !== "ok") process.exitCode = 1;
