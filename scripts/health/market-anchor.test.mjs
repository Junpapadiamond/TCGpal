import { describe, expect, it } from "vitest";
import { FAIL, INCONCLUSIVE, PASS } from "./lib/check.mjs";
import { interpretAnchorRun } from "./market-anchor.mjs";

const line = (payload) => `some vitest noise\n::anchor::${JSON.stringify(payload)}\nmore noise\n`;

const complete = {
  verdict: "ok",
  cardCoverage: 0.99,
  setCoverage: 1,
  cardsAudited: 174,
  cardsResolved: 172,
  setsVisited: 174,
  setsTotal: 174,
  setsWithoutAnchor: [],
  unreadableSets: 0,
  unauditedCards: 0,
  feedErrors: 0,
  elapsedMs: 400000,
  minSetCoverage: 0.98,
  minCardCoverage: 0.97,
};

describe("market-anchor verdict", () => {
  it("passes a complete run that stayed inside both floors", () => {
    expect(interpretAnchorRun({ stdout: line(complete), exitCode: 0 }).status).toBe(PASS);
  });

  it("fails a complete run that lost a set's anchor", () => {
    const regressed = { ...complete, verdict: "regression", setCoverage: 0.9, setsWithoutAnchor: ["Journey Together"] };
    const result = interpretAnchorRun({ stdout: line(regressed), exitCode: 1 });
    expect(result.status).toBe(FAIL);
    expect(result.rows.join(" ")).toContain("Journey Together");
  });

  it("is inconclusive when the run ran out of time instead of measuring", () => {
    const cut = { ...complete, verdict: "inconclusive", setsVisited: 90, unauditedCards: 40 };
    const result = interpretAnchorRun({ stdout: line(cut), exitCode: 0 });
    expect(result.status).toBe(INCONCLUSIVE);
    expect(result.headline).toMatch(/90\/174/);
  });

  it("is inconclusive, not failing, when the run died before it reported anything", () => {
    const result = interpretAnchorRun({ stdout: "Error: Test timed out in 600000ms.", exitCode: 1 });
    expect(result.status).toBe(INCONCLUSIVE);
    expect(result.headline).toMatch(/no measurement/i);
  });

  it("reads the last verdict when a retry printed more than one", () => {
    const stdout = line({ ...complete, verdict: "regression", setCoverage: 0.5 }) + line(complete);
    expect(interpretAnchorRun({ stdout, exitCode: 0 }).status).toBe(PASS);
  });
});
