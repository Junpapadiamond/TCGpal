import type { RawVsSlabInput, RawVsSlabResult } from "./schemas";

const money = (value: number) => Math.round(value * 100) / 100;

export function netSaleValue(soldPrice: number, marketplaceFeeRate: number, shippingCost: number) {
  return money(soldPrice * (1 - marketplaceFeeRate) - shippingCost);
}

export function calculateRawVsSlab(input: RawVsSlabInput): RawVsSlabResult {
  const otherProbability = Math.max(0, 1 - input.psa10Probability - input.psa9Probability);
  const psa10NetValue = netSaleValue(input.psa10Price, input.marketplaceFeeRate, input.shippingCost);
  const psa9NetValue = netSaleValue(input.psa9Price, input.marketplaceFeeRate, input.shippingCost);
  const otherNetValue = netSaleValue(input.otherPrice, input.marketplaceFeeRate, input.shippingCost);
  const totalCost = input.rawPrice + input.gradingCost;

  const expectedReturn =
    input.psa10Probability * psa10NetValue +
    input.psa9Probability * psa9NetValue +
    otherProbability * otherNetValue;
  const expectedProfit = money(expectedReturn - totalCost);
  const worstCaseOutcome = money(otherNetValue - totalCost);

  const breakEvenPsa10Probability = getBreakEvenPsa10Probability({
    psa10NetValue,
    psa9NetValue,
    otherNetValue,
    rawPrice: input.rawPrice,
    gradingCost: input.gradingCost,
    psa9Probability: input.psa9Probability,
  });

  return {
    psa10NetValue,
    psa9NetValue,
    otherNetValue,
    expectedProfit,
    worstCaseOutcome,
    breakEvenPsa10Probability,
    recommendation: getRecommendation(input, expectedProfit, worstCaseOutcome, breakEvenPsa10Probability),
    explanation: getExplanation(input, expectedProfit, breakEvenPsa10Probability),
    assumptions: [
      `Marketplace fee is ${(input.marketplaceFeeRate * 100).toFixed(1)}%.`,
      `Sale shipping is $${input.shippingCost.toFixed(2)} per completed sale.`,
      `The model treats outcomes below PSA9 as an "other" result worth $${input.otherPrice.toFixed(2)} before fees.`,
      "The calculation does not include taxes, opportunity cost, grading turnaround risk, or price movement during grading.",
    ],
  };
}

function getBreakEvenPsa10Probability(input: {
  psa10NetValue: number;
  psa9NetValue: number;
  otherNetValue: number;
  rawPrice: number;
  gradingCost: number;
  psa9Probability: number;
}) {
  const totalCost = input.rawPrice + input.gradingCost;
  const denominator = input.psa10NetValue - input.otherNetValue;

  if (denominator <= 0) {
    return null;
  }

  const fixedReturn = input.psa9Probability * input.psa9NetValue + (1 - input.psa9Probability) * input.otherNetValue;
  return Math.min(1, Math.max(0, money((totalCost - fixedReturn) / denominator)));
}

function getRecommendation(
  input: RawVsSlabInput,
  expectedProfit: number,
  worstCaseOutcome: number,
  breakEvenPsa10Probability: number | null,
) {
  if (expectedProfit < 0 && input.psa10Price <= input.rawPrice + input.gradingCost + 25) {
    return "Direct PSA10 is cleaner if you mainly want certainty; the raw route depends too much on a perfect grade.";
  }

  if (expectedProfit < 0) {
    return "Avoid the raw grading route at the current inputs unless better condition evidence or a lower entry price appears.";
  }

  if (worstCaseOutcome < -50) {
    return "Raw can be considered only with strong condition evidence because the downside is meaningful if it misses PSA9/10.";
  }

  if (breakEvenPsa10Probability !== null && input.psa10Probability < breakEvenPsa10Probability + 0.1) {
    return "This is sensitive to PSA10 probability; verify surface, corners, centering, and back photos before acting.";
  }

  return "The raw route is numerically reasonable, but it should still be treated as conditional on verified condition and clear version.";
}

function getExplanation(input: RawVsSlabInput, expectedProfit: number, breakEvenPsa10Probability: number | null) {
  const breakEvenText =
    breakEvenPsa10Probability === null
      ? "A break-even PSA10 probability cannot be calculated because the PSA10 net value is not above the lower-grade outcome."
      : `The raw route needs roughly ${(breakEvenPsa10Probability * 100).toFixed(1)}% PSA10 probability to break even under these assumptions.`;

  if (expectedProfit >= 0) {
    return `The expected value is positive, but the conclusion still depends on grading accuracy and liquidity. ${breakEvenText}`;
  }

  return `The expected value is negative at the current inputs. ${breakEvenText} Consider lowering raw cost, improving condition confidence, or buying an already graded copy.`;
}
