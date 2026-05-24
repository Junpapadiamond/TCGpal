import { describe, expect, it } from "vitest";
import { analyzeListingRisk } from "./listing-risk";

describe("listing risk checker", () => {
  it("raises risk for PSA10 claims without back photos", () => {
    const report = analyzeListingRisk({
      title: "Tony Tony Chopper EB01 Alt Art Japanese One Piece Mint",
      description: "Great condition, looks PSA10. No returns.",
      price: 120,
      marketplace: "eBay",
      userGoal: "Grading",
    });

    expect(["Medium-High", "High"]).toContain(report.score);
    expect(report.missingInfo).toContain("Clear back photo");
    expect(report.keyRisks.join(" ")).toContain("condition");
  });

  it("is stricter for grading than personal collection", () => {
    const base = {
      title: "Pikachu promo Japanese card",
      description: "Nice card for collection.",
      price: 70,
      marketplace: "eBay" as const,
    };

    const collectionReport = analyzeListingRisk({ ...base, userGoal: "Self-collection" });
    const gradingReport = analyzeListingRisk({ ...base, userGoal: "Grading" });

    expect(gradingReport.keyRisks.length).toBeGreaterThan(collectionReport.keyRisks.length);
    expect(gradingReport.suitability).toContain("grading");
  });
});
