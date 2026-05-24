import { describe, expect, it } from "vitest";
import { getGradingCalibration } from "./journal-calibration";
import type { DecisionJournalEntry } from "./schemas";

const baseEntry: DecisionJournalEntry = {
  id: "entry",
  cardName: "Test card",
  version: "",
  date: "2026-05-24",
  actionType: "Sent for grading",
  price: 100,
  userGoal: "Grading play",
  thesis: "Testing grading calibration.",
  buyCondition: "",
  sellCondition: "",
  stopCondition: "",
  risks: "",
  missingInfo: "",
  reviewDate: "",
  finalOutcome: "",
  lessonsLearned: "",
  actualGrade: "UNKNOWN",
  source: "manual",
  createdAt: "2026-05-24T00:00:00.000Z",
};

describe("grading journal calibration", () => {
  it("does not recommend adjustment with fewer than three grading outcomes", () => {
    const result = getGradingCalibration(
      [
        { ...baseEntry, id: "1", assumedPsa10Probability: 0.3, actualGrade: "PSA9" },
        { ...baseEntry, id: "2", assumedPsa10Probability: 0.3, actualGrade: "PSA10" },
      ],
      0.3,
    );

    expect(result.enoughHistory).toBe(false);
    expect(result.suggestedProbability).toBe(0.3);
  });

  it("adjusts current PSA10 probability downward from recent outcomes", () => {
    const result = getGradingCalibration(
      [
        { ...baseEntry, id: "1", assumedPsa10Probability: 0.3, actualGrade: "PSA9" },
        { ...baseEntry, id: "2", assumedPsa10Probability: 0.3, actualGrade: "PSA9" },
        { ...baseEntry, id: "3", assumedPsa10Probability: 0.3, actualGrade: "PSA8_OR_LOWER" },
        { ...baseEntry, id: "4", assumedPsa10Probability: 0.3, actualGrade: "PSA10" },
        { ...baseEntry, id: "5", assumedPsa10Probability: 0.3, actualGrade: "PSA9" },
      ],
      0.3,
    );

    expect(result.enoughHistory).toBe(true);
    expect(result.actualPsa10Rate).toBe(0.2);
    expect(result.suggestedProbability).toBe(0.2);
    expect(result.message).toContain("Consider adjusting 30% to 20%");
  });
});
