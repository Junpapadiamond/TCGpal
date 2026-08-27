import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findStrandedFixes, loadAdjudications } from "./deploy-drift.mjs";

// The check answers one question: is a finished fix sitting on a branch instead
// of in front of buyers? Every case below is one way that question can be
// answered wrongly, and each one was observed on this repository.
let repo;
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const commit = (file, body, message) => {
  writeFileSync(path.join(repo, file), body);
  git("add", "-A");
  git("commit", "-m", message);
  return git("rev-parse", "HEAD");
};

let squashedFixSha;
let strandedFixSha;

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "drift-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "health@example.test");
  git("config", "user.name", "Health Check");
  commit("ranking.ts", "one\ntwo\nthree\n", "chore: base");
  commit("other.ts", "alpha\n", "chore: second file");

  // A pull request merged with squash: two commits on the branch, one commit on
  // main whose sha and patch-id match neither of them.
  git("checkout", "-q", "-b", "fix/squashed");
  commit("ranking.test.ts", "covers the fix\n", "test: cover the language conflict");
  squashedFixSha = commit("ranking.ts", "one\ntwo\nthree\nrejects conflicts\n", "fix: reject language conflicts");
  git("checkout", "-q", "main");
  commit("ranking.ts", "one\ntwo\nthree\nrejects conflicts\n", "Reject language conflicts (#3)");

  // A fix nobody ever merged. This is the signal the check exists to raise.
  git("checkout", "-q", "-b", "fix/stranded");
  strandedFixSha = commit("other.ts", "alpha\nbeta\n", "fix: recover the missing anchor");

  // An unreleased feature is a roadmap decision, not a bug reaching users.
  git("checkout", "-q", "-b", "feat/parked");
  commit("other.ts", "alpha\ngamma\n", "feat: add a second marketplace");
  git("checkout", "-q", "main");
});

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

const run = (options = {}) =>
  findStrandedFixes({ cwd: repo, deployedRef: "main", refsGlob: "refs/heads", ...options });

describe("deploy-drift stranded fix detection", () => {
  it("does not report a fix that reached main through a squash merge", () => {
    const shas = run().map((entry) => entry.sha);
    expect(shas).not.toContain(squashedFixSha.slice(0, 8));
  });

  it("still reports a fix that never reached main", () => {
    const stranded = run().find((entry) => entry.sha === strandedFixSha.slice(0, 8));
    expect(stranded).toBeDefined();
    expect(stranded.subject).toBe("fix: recover the missing anchor");
  });

  it("ignores unreleased features", () => {
    expect(run().map((entry) => entry.subject)).not.toContain("feat: add a second marketplace");
  });

  it("treats an adjudicated commit as settled and says why", () => {
    const entries = run({ adjudicated: { [strandedFixSha]: "superseded by the measured kill" } });
    const stranded = entries.find((entry) => entry.sha === strandedFixSha.slice(0, 8));
    expect(stranded.adjudicated).toBe("superseded by the measured kill");
  });

  it("refuses an adjudication that carries no reason", () => {
    expect(() => run({ adjudicated: { [strandedFixSha]: "  " } })).toThrow(/reason/i);
  });

  it("reads the checked-in adjudications and ignores the note keys in them", () => {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "superseded-fixes.json");
    const entries = Object.entries(loadAdjudications(file));
    expect(entries.length).toBeGreaterThan(0);
    for (const [sha, reason] of entries) {
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      expect(reason.trim().length).toBeGreaterThan(0);
    }
  });
});
