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
  it("passes a complete run that stayed inside its floor", () => {
    const result = interpretAnchorRun({ stdout: line(complete), exitCode: 0 });
    expect(result.status).toBe(PASS);
    expect(result.headline).toBe("every measured set reached a market anchor");
  });

  it("does not claim every set anchored when some gaps are merely recorded", () => {
    const withGaps = { ...complete, knownGaps: ["Pokémon Futsal Collection", "Supreme Victors"] };
    const result = interpretAnchorRun({ stdout: line(withGaps), exitCode: 0 });
    expect(result.status).toBe(PASS);
    expect(result.headline).toBe("no set lost its anchor unexpectedly; 2 recorded gap(s) remain");
  });

  it("names the set that lost its anchor without a recorded reason", () => {
    const regressed = {
      ...complete,
      verdict: "regression",
      setCoverage: 0.9,
      unexplainedGaps: ["Journey Together"],
      knownGaps: ["Pokémon Futsal Collection"],
    };
    const result = interpretAnchorRun({ stdout: line(regressed), exitCode: 1 });
    expect(result.status).toBe(FAIL);
    expect(result.headline).toContain("Journey Together");
    // A gap that is already recorded is still printed, never silently dropped.
    expect(result.rows.join(" ")).toContain("Pokémon Futsal Collection");
  });

  it("passes when every remaining gap is one already recorded", () => {
    const known = { ...complete, verdict: "ok", knownGaps: ["Pokémon Futsal Collection"], unexplainedGaps: [] };
    const result = interpretAnchorRun({ stdout: line(known), exitCode: 0 });
    expect(result.status).toBe(PASS);
    expect(result.rows.join(" ")).toContain("known gap: Pokémon Futsal Collection");
  });

  it("says when a recorded gap started resolving so its entry can go", () => {
    const recovered = { ...complete, verdict: "ok", recoveredGaps: ["Supreme Victors"] };
    const result = interpretAnchorRun({ stdout: line(recovered), exitCode: 0 });
    expect(result.rows.join(" ")).toMatch(/recovered.*Supreme Victors/);
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

  it("prefers the verdict file over stdout, because a reporter can drop stdout", () => {
    const result = interpretAnchorRun({
      stdout: line({ ...complete, verdict: "regression", setCoverage: 0.1 }),
      payloadJson: JSON.stringify(complete),
      exitCode: 0,
    });
    expect(result.status).toBe(PASS);
  });

  it("falls back to stdout when the verdict file was never written", () => {
    expect(interpretAnchorRun({ stdout: line(complete), payloadJson: null, exitCode: 0 }).status).toBe(PASS);
  });
});
