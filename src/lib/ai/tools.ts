import { analyzeListingRisk } from "@/lib/listing-risk";
import { calculateRawVsSlab } from "@/lib/raw-vs-slab";
import type {
  DecisionJournalEntry,
  GeneratedPlanSet,
  JournalDraft,
  ListingRiskInput,
  ListingRiskReport,
  RawVsSlabInput,
  RawVsSlabResult,
} from "@/lib/schemas";

export function analyzeListingRiskText(input: ListingRiskInput): ListingRiskReport {
  return analyzeListingRisk(input);
}

export function runRawVsSlabCalculator(input: RawVsSlabInput): RawVsSlabResult {
  return calculateRawVsSlab(input);
}

export function buildJournalDraft(input: {
  plan?: GeneratedPlanSet;
  riskReport?: ListingRiskReport;
  rawResult?: RawVsSlabResult;
  journalEntry?: DecisionJournalEntry;
  cardName?: string;
}): JournalDraft {
  if (input.journalEntry) {
    return buildJournalReflection(input.journalEntry);
  }

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

function buildJournalReflection(entry: DecisionJournalEntry): JournalDraft {
  return {
    cardName: entry.cardName,
    actionType: entry.actionType,
    thesis: entry.thesis,
    buyCondition: entry.buyCondition || "Move forward only if evidence, price, and goal still match the original thesis.",
    sellCondition: entry.sellCondition || "Review after the stated holding period or when the reason for holding changes.",
    stopCondition: entry.stopCondition || "Pause if the decision depends on missing condition evidence, unclear version, or optimistic grading assumptions.",
    risks: entry.risks || "Condition evidence, version clarity, liquidity, and budget discipline need another pass.",
    missingInfo: entry.missingInfo || "Recent sold comps, clear condition photos, and a concrete review date.",
    reviewPrompt: buildReviewPrompt(entry),
  };
}

function buildReviewPrompt(entry: DecisionJournalEntry) {
  const date = entry.reviewDate ? `Review on ${entry.reviewDate}` : "Set a review date";
  const watchReason = entry.watchReason || entry.thesis;
  const outcome = entry.finalOutcome ? ` Outcome recorded: ${entry.finalOutcome}` : "";
  return `${date}. Compare the current decision against this reason: ${watchReason}.${outcome}`;
}
