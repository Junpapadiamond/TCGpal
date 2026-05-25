import { describe, expect, it } from "vitest";
import {
  runCriticStage,
  runEvidenceStage,
  runMathStage,
  runRiskStage,
} from "@/lib/ai/listing-risk-pipeline";
import type { AiProvider } from "@/lib/ai/provider";
import type { ListingRiskInput } from "@/lib/schemas";

const unavailableProvider: AiProvider = {
  async completeJson() {
    throw new Error("provider unavailable in eval");
  },
};

const riskyListing: ListingRiskInput = {
  title: "Tony Tony Chopper EB01 Alt Art Japanese One Piece Mint",
  description: "Great condition, looks PSA10. No returns.",
  price: 120,
  marketplace: "eBay",
  userGoal: "Grading",
};

describe("Listing Risk Agent Review Pipeline", () => {
  it("extracts editable evidence with local fallback", async () => {
    const stage = await runEvidenceStage({
      listingInput: riskyListing,
      provider: unavailableProvider,
      primaryModel: "gpt-5.4-mini",
    });

    expect(stage.evidence.cardName.value).toContain("Tony Tony Chopper");
    expect(stage.evidence.language.value).toBe("Japanese");
    expect(stage.evidence.sellerPolicy.returns).toBe("none");
    expect(stage.evidence.missingEvidence).toContain("back photo not mentioned");
  });

  it("scores five risk dimensions from evidence", async () => {
    const evidence = (await runEvidenceStage({
      listingInput: riskyListing,
      provider: unavailableProvider,
      primaryModel: "gpt-5.4-mini",
    })).evidence;
    const stage = await runRiskStage({
      listingInput: riskyListing,
      evidence,
      provider: unavailableProvider,
    });

    expect(Object.keys(stage.riskScore.dimensions)).toEqual([
      "condition",
      "versionClarity",
      "priceVsComps",
      "sellerPolicy",
      "gradingViability",
    ]);
    expect(stage.riskScore.overall).toBeGreaterThanOrEqual(60);
  });

  it("uses deterministic calculator tool for math", async () => {
    const evidence = (await runEvidenceStage({
      listingInput: riskyListing,
      provider: unavailableProvider,
      primaryModel: "gpt-5.4-mini",
    })).evidence;
    const riskScore = (await runRiskStage({ listingInput: riskyListing, evidence, provider: unavailableProvider })).riskScore;
    const stage = runMathStage({ listingInput: riskyListing, evidence, riskScore });

    expect(stage.math.toolUsed).toBe("calculateRawVsSlab");
    expect(stage.math.input.psa10Probability).toBeLessThanOrEqual(0.25);
    expect(stage.math.result.breakEvenPsa10Probability).not.toBeNull();
  });

  it("critic returns cautious final recommendation and no banned language", async () => {
    const evidence = (await runEvidenceStage({
      listingInput: riskyListing,
      provider: unavailableProvider,
      primaryModel: "gpt-5.4-mini",
    })).evidence;
    const riskScore = (await runRiskStage({ listingInput: riskyListing, evidence, provider: unavailableProvider })).riskScore;
    const math = runMathStage({ listingInput: riskyListing, evidence, riskScore }).math;
    const stage = await runCriticStage({
      evidence,
      riskScore,
      math,
      provider: unavailableProvider,
      cheapModel: "gpt-5.4-nano",
    });

    expect(stage.critic.finalRecommendation).toMatch(/Pass for now|Continue reviewing/);
    expect(stage.critic.bannedPhrasesFlagged).toHaveLength(0);
  });
});
