import { describe, expect, it } from "vitest";
import { evaluateBuySell } from "./buy-sell";
import { analyzeListingRisk } from "./listing-risk";
import { analyzeAuthenticityRisk } from "./listing-risk-authenticity";
import type { BuySellInput, ListingRiskInput } from "./schemas";

const baseBuy: BuySellInput = {
  cardName: "Test card",
  action: "Evaluate buy",
  askingPrice: 100,
  soldComp: 100,
  budget: 300,
  monthlyBudget: 300,
  goal: "Collection + resale",
  riskLevel: "Medium",
  holdingPeriod: "3-6 months",
  collectionNeed: "Nice to have",
  restockRisk: "Unknown",
  versionNotes: "",
};

describe("buy/sell decision engine", () => {
  it("leans buy when well below comp with no risk signals", () => {
    const decision = evaluateBuySell({ ...baseBuy, askingPrice: 80, collectionNeed: "Core want / deck need" });
    expect(decision.stance).toBe("Lean buy");
    expect(decision.action).toBe("Evaluate buy");
  });

  it("never leans fully buy when authenticity risk is high", () => {
    const listingInput: ListingRiskInput = {
      title: "Sealed box 重封 cheap",
      description: "No returns",
      price: 30,
      marketplace: "Local community",
      userGoal: "Resale",
      productType: "Sealed Box",
      sellerType: "Individual",
      sellerRating: "New / No history",
      returnsPolicy: "No returns",
    };
    const authenticity = analyzeAuthenticityRisk(listingInput);
    const listingReport = analyzeListingRisk(listingInput);

    const decision = evaluateBuySell({ ...baseBuy, askingPrice: 30 }, { authenticity, listingReport });
    expect(authenticity.authenticityRisk).toBe("High");
    expect(decision.stance).toBe("Lean pass");
    expect(decision.passConditions.join(" ").toLowerCase()).toContain("authenticity");
  });

  it("keeps numeric fields and flags over-concentration", () => {
    const decision = evaluateBuySell({ ...baseBuy, askingPrice: 200, monthlyBudget: 300 });
    expect(decision.budgetFit).toContain("%");
    expect(decision.risks.join(" ").toLowerCase()).toContain("concentration");
  });

  it("derives a sell stance when comps already meet the target", () => {
    const decision = evaluateBuySell({
      ...baseBuy,
      action: "Evaluate sell",
      askingPrice: 90,
      soldComp: 110,
      holdingPeriod: "Short-term",
    });
    expect(["Lean sell", "Partial sell"]).toContain(decision.stance);
    expect(decision.sellConditions.length).toBeGreaterThan(0);
  });
});
