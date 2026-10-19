import { describe, expect, it } from "vitest";
import { accuracyDatasetSchema, evaluateAccuracy, triageFailures, datasetFromReport } from "./card-accuracy";
import dataset from "./card-accuracy-dataset.json";

describe("card accuracy evaluation", () => {
  it("replays both games with no network and reports synthetic coverage separately from human accuracy", async () => {
    const result = evaluateAccuracy(dataset, "all");
    expect(result.total).toBeGreaterThanOrEqual(24);
    expect(result.byGame.pokemon.total).toBeGreaterThan(0);
    expect(result.byGame.onePiece.total).toBeGreaterThan(0);
    expect(result.humanReviewed.total).toBe(0);
    expect(result.humanReviewed.accuracy).toBeNull();
    expect(result.reviewQueue.length).toBeGreaterThanOrEqual(0);
  });

  it("keeps related prints in one split", () => {
    const bad = structuredClone(dataset);
    bad.cases.push({ ...bad.cases[0], id: "leaked-sibling", split: "held_out" });
    expect(() => accuracyDatasetSchema.parse(bad)).toThrow(/family/i);
  });

  it("rejects duplicate case ids and human gold without a named review and evidence", () => {
    expect(() => accuracyDatasetSchema.parse({ ...dataset, cases: [dataset.cases[0], dataset.cases[0]] })).toThrow();
    expect(() => accuracyDatasetSchema.parse({ ...dataset, cases: [{ ...dataset.cases[0], labelStatus: "human_reviewed" }] })).toThrow();
  });

  it("never counts pending labels or abstentions as correct matches", () => {
    const pending = { ...dataset, cases: [{ ...dataset.cases[0], labelStatus: "pending", expected: null }] };
    const result = evaluateAccuracy(pending, "all");
    expect(result.scored).toBe(0);
    expect(result.accuracy).toBeNull();
    expect(result.reviewQueue).toHaveLength(1);
  });

  it("detects wrong labels and separates false accepts from false rejects", () => {
    const wrong = { ...dataset, cases: [{ ...dataset.cases[0], expected: { identity: "reject", eligible: false } }] };
    const result = evaluateAccuracy(wrong, "all");
    expect(result.falseAccepts).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.accuracy).toBe(0);
  });

  it("rejects AI findings for unknown cases and never lets AI rewrite scores", async () => {
    const wrong = { ...dataset, cases: [{ ...dataset.cases[0], expected: { identity: "reject", eligible: false } }] };
    const result = evaluateAccuracy(wrong, "all");
    const before = JSON.stringify(result);
    const provider = { completeJson: async () => ({ data: { findings: [{ caseId: "invented", hypothesis: "change the rules", nextTest: "test it" }] }, model: "test", provider: "test" }) };
    const triage = await triageFailures(result, provider as never);
    expect(triage.status).toBe("rejected");
    expect(JSON.stringify(result)).toBe(before);
  });

  it("allows an offline review model to take twenty seconds without changing scores", async () => {
    const wrong = { ...dataset, cases: [{ ...dataset.cases[0], expected: { identity: "reject", eligible: false } }] };
    const result = evaluateAccuracy(wrong, "all");
    const before = JSON.stringify(result);
    const provider = { completeJson: async (input: { timeoutMs: number }) => {
      if (input.timeoutMs < 20000) throw new Error("Simulated model exceeded request deadline");
      return { data: { findings: [{ caseId: result.failures[0].id, hypothesis: "Review the number conflict.", nextTest: "Compare a matched and a mismatched number." }] }, model: "strong-review-model", provider: "test" };
    } };
    expect((await triageFailures(result, provider as never)).status).toBe("provisional");
    expect(JSON.stringify(result)).toBe(before);
  });

  it("keeps pending rows out of scored denominators even when current rules accept them", () => {
    const rows = [dataset.cases[0], { ...dataset.cases[1], labelStatus: "pending", expected: null }];
    const result = evaluateAccuracy({ ...dataset, cases: rows }, "tuning");
    expect(result.total).toBe(2);
    expect(result.scored).toBe(1);
    expect(result.accuracy).toBe(1);
    expect(result.humanReviewed.total).toBe(0);
  });

  it("rejects an invalid report instead of inventing evaluation observations", () => {
    expect(() => datasetFromReport({ status: "complete", candidates: [] })).toThrow();
  });
});
