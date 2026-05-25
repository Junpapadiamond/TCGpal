import type { DecisionJournalEntry } from "./schemas";

export type GradingCalibration = {
  enoughHistory: boolean;
  sampleSize: number;
  assumedAverage: number;
  actualPsa10Rate: number;
  suggestedProbability: number;
  message: string;
};

export function getGradingCalibration(entries: DecisionJournalEntry[], currentProbability: number): GradingCalibration {
  const graded = entries
    .filter((entry) => typeof entry.assumedPsa10Probability === "number" && entry.actualGrade !== "UNKNOWN")
    .slice(0, 5);

  if (graded.length < 3) {
    return {
      enoughHistory: false,
      sampleSize: graded.length,
      assumedAverage: currentProbability,
      actualPsa10Rate: currentProbability,
      suggestedProbability: currentProbability,
      message: "Not enough grading history yet. Save at least 3 journal entries with assumed PSA10 odds and actual grades.",
    };
  }

  const assumedAverage = average(graded.map((entry) => entry.assumedPsa10Probability ?? currentProbability));
  const actualPsa10Rate = graded.filter((entry) => entry.actualGrade === "PSA10").length / graded.length;
  const optimismGap = Math.max(0, assumedAverage - actualPsa10Rate);
  const suggestedProbability = optimismGap > 0.08
    ? Math.max(0.05, Math.min(0.65, actualPsa10Rate))
    : currentProbability;

  return {
    enoughHistory: true,
    sampleSize: graded.length,
    assumedAverage,
    actualPsa10Rate,
    suggestedProbability,
    message:
      optimismGap > 0.08
        ? `Your last ${graded.length} grading decisions underperformed your PSA10 assumptions. Consider adjusting ${Math.round(currentProbability * 100)}% to ${Math.round(suggestedProbability * 100)}%.`
        : `Your recent grading assumptions look reasonably calibrated. ${Math.round(currentProbability * 100)}% can stay as a starting point.`,
  };
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
