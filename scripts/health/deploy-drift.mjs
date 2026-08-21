// Is a finished fix sitting on a branch instead of in front of buyers?
//
// This check exists because that is literally what happened. The promo-group
// alias fix was committed on 2026-08-19 and production still did not have it on
// 2026-08-21, so a buyer hit "Exact TCGplayer mapping unavailable" on a card the
// repository already knew how to price. No test could have caught that: the code
// was correct and the suite was green. The defect was in the distance between
// the branch and the deployment.
//
// Only `fix:` commits count. Unreleased features are a roadmap decision;
// unreleased fixes are a bug that is still reaching users.
//
// Usage: node scripts/health/deploy-drift.mjs   (needs full history: fetch-depth 0)
import { execFileSync } from "node:child_process";
import { FAIL, PASS, report } from "./lib/check.mjs";

const DEPLOYED_REF = process.env.DEPLOYED_REF || "origin/main";
const MAX_DRIFT_DAYS = Number(process.env.MAX_DRIFT_DAYS || 3);

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const branches = git("for-each-ref", "--format=%(refname:short)", "refs/remotes/origin")
  .split("\n")
  .map((line) => line.trim())
  .filter((name) => name && name !== DEPLOYED_REF && !name.endsWith("/HEAD"));

const stranded = [];
for (const branch of branches) {
  // Space-separated on purpose: a sha and a unix timestamp cannot contain one,
  // so the subject is simply everything after the second space, however it is
  // punctuated.
  const log = git("log", "--no-merges", "--format=%H %ct %s", `${DEPLOYED_REF}..${branch}`);
  if (!log) continue;
  for (const line of log.split("\n")) {
    const [sha, committedAt, ...rest] = line.split(" ");
    const subject = rest.join(" ");
    if (!/^fix[(:]/i.test(subject)) continue;
    stranded.push({
      sha: sha.slice(0, 8),
      branch,
      subject,
      ageDays: (Date.now() / 1000 - Number(committedAt)) / 86400,
    });
  }
}

// One commit can live on several branches; report it once, on its oldest sighting.
const bySha = new Map();
for (const entry of stranded) {
  const seen = bySha.get(entry.sha);
  if (!seen || entry.ageDays > seen.ageDays) bySha.set(entry.sha, entry);
}
const unique = [...bySha.values()].sort((a, b) => b.ageDays - a.ageDays);
const overdue = unique.filter((entry) => entry.ageDays > MAX_DRIFT_DAYS);

const rows = unique.slice(0, 15).map((entry) =>
  `${entry.ageDays > MAX_DRIFT_DAYS ? "OVERDUE" : "       "} ${entry.ageDays.toFixed(1).padStart(6)}d  ${entry.sha}  ${entry.branch.padEnd(34)} ${entry.subject.slice(0, 66)}`,
);
if (unique.length > 15) rows.push(`... and ${unique.length - 15} more unreleased fix commits`);

process.exit(report({
  name: "deploy-drift",
  status: overdue.length > 0 ? FAIL : PASS,
  headline: overdue.length > 0
    ? `${overdue.length} fix commit${overdue.length === 1 ? "" : "s"} unreleased for more than ${MAX_DRIFT_DAYS} days`
    : `no fix commit has been waiting longer than ${MAX_DRIFT_DAYS} days`,
  rows,
  detail: { deployedRef: DEPLOYED_REF, maxDriftDays: MAX_DRIFT_DAYS, overdue },
}));
