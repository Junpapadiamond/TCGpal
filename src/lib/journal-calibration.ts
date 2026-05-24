import type { DecisionJournalEntry } from "./schemas";

export type GradingCalibration = {
  sampleSize: number;
  assumedAverage: number;
  actualPsa10Rate: number;
  currentProbability: number;
  suggestedProbability: number;
  message: string;
  enoughHistory: boolean;
};

export function getGradingCalibration(
  entries: DecisionJournalEntry[],
  currentProbability: number,
): GradingCalibration {
  const sample = entries
    .filter((entry) => typeof entry.assumedPsa10Probability === "number" && entry.actualGrade && entry.actualGrade !== "UNKNOWN")
    .slice(0, 5);

  if (sample.length < 3) {
    return {
      sampleSize: sample.length,
      assumedAverage: 0,
      actualPsa10Rate: 0,
      currentProbability,
      suggestedProbability: currentProbability,
      enoughHistory: false,
      message: "Not enough grading history yet. Save at least 3 journal entries with assumed PSA10 odds and actual grades.",
    };
  }

  const assumedAverage = roundProbability(
    sample.reduce((total, entry) => total + (entry.assumedPsa10Probability ?? 0), 0) / sample.length,
  );
  const actualPsa10Rate = roundProbability(sample.filter((entry) => entry.actualGrade === "PSA10").length / sample.length);
  const ratio = assumedAverage > 0 ? actualPsa10Rate / assumedAverage : 1;
  const suggestedProbability = roundProbability(clampProbability(currentProbability * ratio));
  const lowerCount = sample.filter((entry) => entry.actualGrade !== "PSA10").length;

  return {
    sampleSize: sample.length,
    assumedAverage,
    actualPsa10Rate,
    currentProbability,
    suggestedProbability,
    enoughHistory: true,
    message:
      lowerCount > 0
        ? `Your last ${sample.length} grading decisions hit PSA10 less often than assumed. Consider adjusting ${formatPercent(
            currentProbability,
          )} to ${formatPercent(suggestedProbability)}.`
        : `Your last ${sample.length} grading decisions matched or beat your PSA10 assumptions. The current ${formatPercent(
            currentProbability,
          )} assumption is not being reduced.`,
  };
}

function clampProbability(value: number) {
  return Math.max(0, Math.min(1, value));
}

function roundProbability(value: number) {
  return Math.round(value * 100) / 100;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
