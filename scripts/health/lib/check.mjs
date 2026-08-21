// Shared shape for the daily health checks.
//
// The exit codes carry the whole point. A check that cannot tell "the product
// regressed" from "an upstream provider is having a bad hour" gets muted within
// a week, and a muted check is how the market-anchor bug survived for months.
//
//   0 PASS         — measured, within budget
//   1 FAIL         — measured, out of budget. A real regression. Worth waking an agent.
//   2 INCONCLUSIVE — could not measure (provider down, network). Never pages anyone.
import fs from "node:fs";

export const PASS = 0;
export const FAIL = 1;
export const INCONCLUSIVE = 2;

export function report({ name, status, headline, rows = [], detail = {} }) {
  const label = status === PASS ? "PASS" : status === FAIL ? "FAIL" : "INCONCLUSIVE";
  console.log(`\n[${label}] ${name} — ${headline}`);
  for (const row of rows) console.log(`  ${row}`);

  const payload = { name, status: label, headline, rows, detail, at: new Date().toISOString() };
  if (process.env.HEALTH_JSON) {
    console.log(`::json::${JSON.stringify(payload)}`);
  }
  // GitHub Actions renders this in the job summary, so a failure is readable
  // without opening the log.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [`### ${label}: ${name}`, "", headline, "", ...rows.map((r) => `- ${r}`), ""];
    // Appended, not written: several checks share one summary file.
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
  }
  return status;
}

export const percentile = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function pct(part, whole) {
  return whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(1)}%`;
}
