import { describe, expect, it } from "vitest";
import { analyzeAuthenticityRisk } from "./listing-risk-authenticity";
import type { ListingRiskInput } from "./schemas";

const baseInput: ListingRiskInput = {
  title: "One Piece booster box",
  description: "Nice box for collection.",
  price: 120,
  marketplace: "Local community",
  userGoal: "Self-collection",
};

describe("authenticity risk checker", () => {
  it("raises authenticity risk for a resealed sealed box from a new individual seller", () => {
    const report = analyzeAuthenticityRisk({
      ...baseInput,
      title: "One Piece OP01 booster box 重封 verified",
      productType: "Sealed Box",
      sellerType: "Individual",
      sellerRating: "New / No history",
      returnsPolicy: "No returns",
    });

    expect(["Medium-High", "High"]).toContain(report.authenticityRisk);
    expect(report.counterfeitSignals.join(" ").toLowerCase()).toContain("reseal");
    expect(report.authenticityQuestions.length).toBeGreaterThan(0);
  });

  it("flags bootleg/proxy wording on a single card", () => {
    const report = analyzeAuthenticityRisk({
      ...baseInput,
      title: "Charizard proxy custom print",
      productType: "Single Card",
    });

    expect(["Medium", "Medium-High", "High"]).toContain(report.authenticityRisk);
    expect(report.counterfeitSignals.length).toBeGreaterThan(0);
  });

  it("stays low for a clean listing from an official distributor with returns", () => {
    const report = analyzeAuthenticityRisk({
      ...baseInput,
      productType: "Sealed Box",
      sellerType: "Official Distributor",
      sellerRating: "High (98%+)",
      returnsPolicy: "Returns accepted",
    });

    expect(report.authenticityRisk).toBe("Low");
  });

  it("never emits literal authenticity-guarantee phrases the safety critic bans", () => {
    const report = analyzeAuthenticityRisk({
      ...baseInput,
      description: "保真 100% authentic guaranteed authentic",
      productType: "Sealed Box",
    });

    const serialized = JSON.stringify(report).toLowerCase();
    expect(serialized).not.toContain("100% authentic");
    expect(serialized).not.toContain("guaranteed authentic");
  });
});
