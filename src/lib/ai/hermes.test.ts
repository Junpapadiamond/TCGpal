import { describe, expect, it } from "vitest";
import { hermesFixtures } from "../../evals/fixtures/hermes-fixtures";
import { runLocalCritic } from "@/lib/ai/critic";
import { getAiConfig, getModelForStep } from "@/lib/ai/config";
import { classifyHermesTask, routeHermes } from "@/lib/ai/hermes";
import { calculateRawVsSlab } from "@/lib/raw-vs-slab";
import {
  generatedPlanSetSchema,
  hermesResponseSchema,
  listingRiskReportSchema,
  rawVsSlabResultSchema,
} from "@/lib/schemas";

describe("Hermes eval harness", () => {
  it("routes fixtures to the expected task type", () => {
    for (const fixture of hermesFixtures) {
      expect(classifyHermesTask(fixture.request)).toBe(fixture.expectedTask);
    }
  });

  it("returns schema-valid fallback outputs when no provider key is configured", async () => {
    for (const fixture of hermesFixtures) {
      const response = await routeHermes(fixture.request);
      expect(hermesResponseSchema.safeParse(response).success).toBe(true);
      expect(response.taskType).toBe(fixture.expectedTask);
      expect(response.trace.length).toBeGreaterThan(1);

      if (response.taskType === "PLAN_GENERATION") {
        expect(generatedPlanSetSchema.safeParse(response.result).success).toBe(true);
      }

      if (response.taskType === "LISTING_RISK_CHECK") {
        expect(listingRiskReportSchema.safeParse(response.result).success).toBe(true);
        const report = listingRiskReportSchema.parse(response.result);
        // Multi-agent listing flow always attaches an authenticity assessment, even on local fallback.
        expect(report.authenticity).toBeTruthy();
        expect(report.authenticity?.authenticityQuestions.length).toBeGreaterThan(0);
        const steps = response.trace.map((step) => step.step);
        expect(steps).toContain("analyze_condition");
        expect(steps).toContain("analyze_authenticity");
      }

      if (response.taskType === "RAW_VS_SLAB_EXPLAIN") {
        expect(rawVsSlabResultSchema.safeParse(response.result).success).toBe(true);
      }
    }
  });

  it("keeps Raw vs Slab math deterministic inside Hermes", async () => {
    const fixture = hermesFixtures.find((item) => item.name === "raw price too close to PSA10");
    expect(fixture?.request.rawInput).toBeTruthy();

    const response = await routeHermes(fixture!.request);
    const result = rawVsSlabResultSchema.parse(response.result);
    const deterministic = calculateRawVsSlab(fixture!.request.rawInput!);

    expect(result.expectedProfit).toBe(deterministic.expectedProfit);
    expect(result.breakEvenPsa10Probability).toBe(deterministic.breakEvenPsa10Probability);
  });

  it("flags missing photo evidence in risky grading listings", async () => {
    const fixture = hermesFixtures.find((item) => item.name === "risky PSA10 listing without back photo");
    const response = await routeHermes(fixture!.request);
    const report = listingRiskReportSchema.parse(response.result);
    const text = [...report.missingInfo, ...report.keyRisks, ...report.sellerQuestions].join(" ").toLowerCase();

    expect(text).toContain("back");
    expect(text).toMatch(/corner|surface|closeup/);
  });

  it("local critic rejects unsafe recommendation language", () => {
    const critic = runLocalCritic({
      recommendation: "This is risk-free and you must buy it for guaranteed profit. It is certainly PSA10.",
    });

    expect(critic.passed).toBe(false);
    expect(critic.flags).toEqual(expect.arrayContaining(["risk-free", "must buy", "guaranteed profit", "certainly psa10"]));
  });

  it("uses cheap model config for classifier and critic while reserving primary for final generation", () => {
    const config = getAiConfig();

    expect(getModelForStep("classifier", config)).toBe(config.cheapModel);
    expect(getModelForStep("critic", config)).toBe(config.cheapModel);
    expect(getModelForStep("primary", config)).toBe(config.primaryModel);
  });
});
