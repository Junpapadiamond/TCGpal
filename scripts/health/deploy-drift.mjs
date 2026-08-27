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
// "Released" is decided by CONTENT, not by sha or patch-id. The first version of
// this check asked whether the commit was reachable from main, and every
// squash-merged pull request therefore looked unreleased forever: PR #3 shipped
// on 2026-08-21 and the check was still paging about it five days later, because
// squashing two branch commits into one produces a sha and a patch-id that match
// neither. A check that cries wolf about shipped work gets muted, and a muted
// check is how the original bug survived for months. So instead: reverse-apply
// the commit's own diff against the deployed tree. If it applies cleanly, the
// change is already there, however it got there.
//
// Usage: node scripts/health/deploy-drift.mjs   (needs full history: fetch-depth 0)
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FAIL, PASS, report } from "./lib/check.mjs";

// git's empty tree, so a root commit still has something to diff against.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const MAX_BUFFER = 64 * 1024 * 1024;

const git = (args, options = {}) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: MAX_BUFFER, ...options }).trim();

/**
 * Is this commit's change already present in the deployed tree?
 *
 * Reverse-applying the patch to a scratch index answers that without caring how
 * the change arrived — squashed, rebased, cherry-picked, or retyped by hand.
 * The scratch index is why this never touches the working tree: the check runs
 * on whatever branch CI happens to have checked out.
 *
 * A patch that fails to apply is reported as unreleased. That is the safe
 * direction to be wrong in: surrounding code drifting far enough to break the
 * context raises a false alarm a human can dismiss in seconds, where the
 * opposite error hides a bug that is still reaching buyers.
 */
export function isPatchReleased({ sha, deployedRef, cwd }) {
  const scratch = mkdtempSync(path.join(tmpdir(), "deploy-drift-"));
  const indexFile = path.join(scratch, "index");
  try {
    git(["read-tree", deployedRef], { cwd, env: { ...process.env, GIT_INDEX_FILE: indexFile } });
    let parent = EMPTY_TREE;
    try {
      parent = git(["rev-parse", `${sha}^`], { cwd, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      // Root commit; the empty tree is the right parent.
    }
    const patch = execFileSync("git", ["diff", "--binary", parent, sha], {
      cwd,
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
    });
    if (!patch.trim()) return true;
    execFileSync("git", ["apply", "--cached", "--reverse", "--check", "-"], {
      cwd,
      input: patch,
      env: { ...process.env, GIT_INDEX_FILE: indexFile },
      stdio: ["pipe", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Commits the repository has decided are settled, so the check stops asking.
 *
 * This is an adjudication record, not a mute switch. An entry needs a written
 * reason, every entry is printed in the report whether or not anything else is
 * wrong, and the entry stays visible until someone deletes the branch. The case
 * it exists for: a commit whose useful parts shipped separately and whose
 * remaining part was killed by measurement. Content alone cannot see that — the
 * patch will never apply, so the commit would page someone every day forever.
 */
export function loadAdjudications(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    // Keys starting with `_` are notes to whoever opens the file, not commits.
    return Object.fromEntries(Object.entries(parsed).filter(([key]) => !key.startsWith("_")));
  } catch {
    return {};
  }
}

export function findStrandedFixes({
  cwd = process.cwd(),
  deployedRef = "origin/main",
  refsGlob = "refs/remotes/origin",
  adjudicated = {},
  now = Date.now(),
} = {}) {
  for (const [sha, reason] of Object.entries(adjudicated)) {
    if (typeof reason !== "string" || reason.trim() === "") {
      throw new Error(`Adjudicated commit ${sha} needs a written reason; an unexplained entry is a mute switch.`);
    }
  }

  // `refs/remotes/origin` matches the bare `origin` ref as well as the branches
  // under it, which would report a branch literally named "origin".
  const namespace = refsGlob.split("/").pop();
  const branches = git(["for-each-ref", "--format=%(refname:short)", refsGlob], { cwd })
    .split("\n")
    .map((line) => line.trim())
    .filter((name) => name && name !== deployedRef && name !== namespace && !name.endsWith("/HEAD"));

  const stranded = [];
  for (const branch of branches) {
    // Space-separated on purpose: a sha and a unix timestamp cannot contain one,
    // so the subject is simply everything after the second space, however it is
    // punctuated.
    const log = git(["log", "--no-merges", "--format=%H %ct %s", `${deployedRef}..${branch}`], { cwd });
    if (!log) continue;
    for (const line of log.split("\n")) {
      const [sha, committedAt, ...rest] = line.split(" ");
      const subject = rest.join(" ");
      if (!/^fix[(:]/i.test(subject)) continue;
      const adjudication = adjudicated[sha] ?? null;
      if (!adjudication && isPatchReleased({ sha, deployedRef, cwd })) continue;
      stranded.push({
        sha: sha.slice(0, 8),
        branch,
        subject,
        adjudicated: adjudication,
        ageDays: (now / 1000 - Number(committedAt)) / 86400,
      });
    }
  }

  // One commit can live on several branches; report it once, on its oldest sighting.
  const bySha = new Map();
  for (const entry of stranded) {
    const seen = bySha.get(entry.sha);
    if (!seen || entry.ageDays > seen.ageDays) bySha.set(entry.sha, entry);
  }
  return [...bySha.values()].sort((a, b) => b.ageDays - a.ageDays);
}

function main() {
  const deployedRef = process.env.DEPLOYED_REF || "origin/main";
  const maxDriftDays = Number(process.env.MAX_DRIFT_DAYS || 3);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const adjudicated = loadAdjudications(path.join(here, "superseded-fixes.json"));

  const unique = findStrandedFixes({ deployedRef, adjudicated });
  const overdue = unique.filter((entry) => !entry.adjudicated && entry.ageDays > maxDriftDays);

  const rows = unique.slice(0, 15).map((entry) => {
    const label = entry.adjudicated ? "SETTLED" : entry.ageDays > maxDriftDays ? "OVERDUE" : "       ";
    return `${label} ${entry.ageDays.toFixed(1).padStart(6)}d  ${entry.sha}  ${entry.branch.padEnd(34)} ${entry.subject.slice(0, 66)}`;
  });
  if (unique.length > 15) rows.push(`... and ${unique.length - 15} more unreleased fix commits`);
  for (const entry of unique) {
    if (entry.adjudicated) rows.push(`   ${entry.sha} settled: ${entry.adjudicated}`);
  }

  process.exit(report({
    name: "deploy-drift",
    status: overdue.length > 0 ? FAIL : PASS,
    headline: overdue.length > 0
      ? `${overdue.length} fix commit${overdue.length === 1 ? "" : "s"} unreleased for more than ${maxDriftDays} days`
      : `no fix commit has been waiting longer than ${maxDriftDays} days`,
    rows,
    detail: { deployedRef, maxDriftDays, overdue },
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
