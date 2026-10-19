import { describe, expect, it } from "vitest";
import { accuracyDatasetSchema, evaluateAccuracy, triageFailures, datasetFromReport, replayAccuracyCase } from "./card-accuracy";
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
    const padded = structuredClone(dataset.cases[0]);
    padded.id = "padded-leak"; padded.split = "held_out";
    padded.card.cardNumber = "232/091"; padded.family = "pokemon:232/091";
    expect(() => accuracyDatasetSchema.parse({ ...dataset, cases: [dataset.cases[0], padded] })).toThrow(/family/i);
    const otherPrint = structuredClone(padded);
    otherPrint.card.cardNumber = "193/165"; otherPrint.family = "pokemon:193/165";
    expect(() => accuracyDatasetSchema.parse({ ...dataset, cases: [dataset.cases[0], otherPrint] })).toThrow(/family/i);
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

  it("retains observed rows from partial reports without labeling acquisition gaps as accuracy failures", () => {
    const row = dataset.cases[0];
    const report = { status: "partial", request: { query: "Mew", cardHint: { game: "pokemon" }, buyer: row.buyer,
      sourceListing: { marketplace: "Other", url: "", title: "", price: null }, manualCandidates: [] },
      identityCandidates: [], confirmedCard: row.card, candidates: [], rankedChoices: [], references: [],
      narrative: { summary: "Partial", cautions: [] }, warnings: [], trace: [], platforms: [], webDiscoveries: [],
      outcome: "next_moves", inspectListingId: null, demoMode: false, generatedAt: "2026-10-19T00:00:00Z" };
    // Empty observations are not an evaluation dataset, even with a confirmed card.
    expect(() => datasetFromReport(report)).toThrow();
    const normalized = replayAccuracyCase(accuracyDatasetSchema.parse(dataset).cases[0]);
    const imported = datasetFromReport({ ...report, candidates: [{ ...normalized, demo: false, userSupplied: false, webDiscovered: false }] });
    expect(imported.cases).toHaveLength(1);
    expect(imported.cases[0]).toMatchObject({ labelStatus: "pending", expected: null });
    expect(imported.cases[0].evidence.note).toContain("partial");
  });

  it("scores provisional real labels separately and supports eligibility-only evidence", () => {
    const row = { ...dataset.cases[0], labelStatus: "agent_reviewed", expected: { identity: null, eligible: false },
      listing: { ...dataset.cases[0].listing, shipping: null },
      evidence: { method: "provider_report", sourceUrl: "https://www.ebay.com/itm/123", observedAt: "2026-10-19T00:00:00Z", note: "Shipping was absent in the provider observation." },
      review: { reviewer: "agent:fixture", reviewedAt: "2026-10-19T00:00:00Z", rationale: "Unknown shipping cannot win." } };
    const result = evaluateAccuracy({ ...dataset, cases: [row] }, "all");
    expect(result.accuracy).toBe(1);
    expect(result.humanReviewed.total).toBe(0);
    expect(result.agentReviewed.total).toBe(1);
    expect(result.falseAccepts).toBe(0);
    expect(() => accuracyDatasetSchema.parse({ ...dataset, cases: [{ ...row, expected: { identity: null, eligible: null } }] })).toThrow();
  });

  it("does not send held-out labels or observations to the optimization agent", async () => {
    const pending = { ...dataset, cases: dataset.cases.map(r => ({ ...r, labelStatus: "pending", expected: null })) };
    const result = evaluateAccuracy(pending, "all");
    const calls: unknown[] = [];
    const provider = { completeJson: async (input: { user: unknown }) => {
      calls.push(input.user); return { data: { findings: [] }, model: "test", provider: "test" };
    } };
    await triageFailures(result, provider as never);
    const sent = JSON.stringify(calls);
    for (const row of result.rows.filter(r => r.split === "held_out")) expect(sent).not.toContain(row.id);
    expect(calls).toHaveLength(1);
  });
});
