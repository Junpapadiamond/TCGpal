import { evaluateBuySell, type DecisionSignals } from "@/lib/buy-sell";
import { analyzeListingRisk } from "@/lib/listing-risk";
import { analyzeAuthenticityRisk } from "@/lib/listing-risk-authenticity";
import { calculateRawVsSlab } from "@/lib/raw-vs-slab";
import type {
  AuthenticityAssessment,
  BuySellDecision,
  BuySellInput,
  GeneratedPlanSet,
  JournalDraft,
  ListingRiskInput,
  ListingRiskReport,
  RawVsSlabInput,
  RawVsSlabResult,
} from "@/lib/schemas";

export function runBuySellEvaluator(input: BuySellInput, signals: DecisionSignals = {}): BuySellDecision {
  return evaluateBuySell(input, signals);
}

export function analyzeListingRiskText(input: ListingRiskInput): ListingRiskReport {
  return analyzeListingRisk(input);
}

export function analyzeListingAuthenticity(input: ListingRiskInput): AuthenticityAssessment {
  return analyzeAuthenticityRisk(input);
}

export function runRawVsSlabCalculator(input: RawVsSlabInput): RawVsSlabResult {
  return calculateRawVsSlab(input);
}

export function buildJournalDraft(input: {
  plan?: GeneratedPlanSet;
  riskReport?: ListingRiskReport;
  rawResult?: RawVsSlabResult;
  cardName?: string;
}): JournalDraft {
  const firstPlan = input.plan?.plans[1] ?? input.plan?.plans[0];
  const risks = [
    ...(firstPlan?.risks ?? []),
    ...(input.riskReport?.keyRisks ?? []),
    input.rawResult?.recommendation,
  ].filter(Boolean);

  return {
    cardName: input.cardName || input.plan?.input.theme || "Card under review",
    actionType: "Considering purchase",
    thesis:
      firstPlan?.summary ||
      "I am considering this card only if the listing evidence and math support my stated goal and risk tolerance.",
    buyCondition:
      firstPlan?.buyConditions.join(" ") ||
      "Buy only if version, condition evidence, and price assumptions are clear.",
    sellCondition:
      firstPlan?.sellConditions.join(" ") ||
      "Review after the holding period or if net return meets the prewritten target.",
    stopCondition:
      firstPlan?.doNotBuyConditions.join(" ") ||
      "Do not buy if condition, version, or raw-vs-slab assumptions are unclear.",
    risks: risks.join(" "),
    missingInfo: input.riskReport?.missingInfo.join(", ") || "Recent sold comps and clear condition evidence.",
    reviewPrompt: "Review whether the actual outcome matched the original thesis and which assumptions were wrong.",
  };
}
