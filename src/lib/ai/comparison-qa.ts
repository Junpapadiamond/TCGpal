import { createAiProvider } from "@/lib/ai/provider";
import { getAiConfig } from "@/lib/ai/config";
import { comparisonQuestionResponseSchema, type ComparisonQuestionResponse, type ComparisonReport, type NormalizedListing } from "@/lib/schemas";

const forbiddenAnswer = [
  /\bguaranteed\b/i,
  /\bscam\b/i,
  /\bwill grade\b/i,
  /\bpsa\s*10\b/i,
  /\bsold comps? (show|prove|confirm)/i,
  /\bsold[-\s]?comp/i,
  /\bsold transaction/i,
  /\b[a-z]+-v\d+\|/i,
];

export async function answerComparisonQuestion(
  report: ComparisonReport,
  question: string,
  targetListingId?: string,
): Promise<ComparisonQuestionResponse> {
  const local = localAnswer(report, question, targetListingId);
  const provider = createAiProvider(getAiConfig());

  try {
    const response = await provider.completeJson({
      role: "critic",
      schemaName: "comparison_question_answer",
      schema: comparisonQuestionResponseSchema.omit({ usedAi: true }),
      system: [
        "You answer buyer questions about one TCGpal comparison report.",
        "Use only the supplied sanitized report facts. Never browse, infer hidden seller data, invent sold comps, predict grades, or call a seller a scam.",
        "If targetListingId is supplied, answer about that exact listing even when the question is short or vague.",
        "Do not introduce sold comps, sold-history, or sold-transaction language; this report is active-listing and reference-price evidence only.",
        "Do not mention internal listing ids. Refer to listings by marketplace, title, price, and human risk labels.",
        "If the report does not contain enough evidence, say what is missing.",
        "Keep the answer under 120 words and mention the concrete score/price evidence that matters.",
        "Do not repeat generic buying cautions unless they directly answer the question.",
      ].join("\n"),
      user: {
        question,
        report: sanitizeReportForQuestion(report, targetListingId),
      },
    });
    const parsed = comparisonQuestionResponseSchema.parse({ ...response.data, usedAi: true });
    if (forbiddenAnswer.some((pattern) => pattern.test(`${parsed.answer} ${parsed.cautions.join(" ")}`))) {
      throw new Error("Critic rejected an unsupported answer.");
    }
    return parsed;
  } catch {
    return local;
  }
}

function localAnswer(report: ComparisonReport, question: string, targetListingId?: string): ComparisonQuestionResponse {
  const listingById = new Map(report.candidates.map((listing) => [listing.id, listing]));
  const bestChoice = report.rankedChoices.find((choice) => choice.role === "best_value") ?? report.rankedChoices[0] ?? null;
  const best = bestChoice ? listingById.get(bestChoice.listingId) ?? null : null;
  const target = targetListingId ? listingById.get(targetListingId) ?? null : findQuestionTarget(report, question);

  if (best && target && target.id !== best.id) {
    const exclusion = target.eligible
      ? ""
      : ` It was also excluded from winner selection: ${target.exclusionReasons.join("; ") || "the deterministic eligibility gate rejected it"}.`;
    const risk = asksAboutRisk(question)
      ? ` Its seller risk label is ${formatRiskLabel(target.riskLabel)}, with seller trust ${target.sellerTrustScore}/100 and evidence ${target.evidenceCompletenessScore}/100.`
      : "";
    return comparisonQuestionResponseSchema.parse({
      answer: `${target.marketplace} "${target.title}" was not the top pick because its value score was ${target.valueScore}/100 versus ${best.valueScore}/100 for the recommendation. The main differences were seller trust (${target.sellerTrustScore}/100 vs ${best.sellerTrustScore}/100), evidence (${target.evidenceCompletenessScore}/100 vs ${best.evidenceCompletenessScore}/100), and total cost (${money(target.estimatedLandedCost ?? target.preTaxTotal)} vs ${money(best.estimatedLandedCost ?? best.preTaxTotal)}).${risk}${exclusion}`,
      cautions: [...target.exclusionReasons, ...target.trustNotes].slice(0, 2),
      usedAi: false,
    });
  }

  if (best && target && target.id === best.id) {
    const risk = asksAboutRisk(question)
      ? ` Its seller risk label is ${formatRiskLabel(target.riskLabel)}, with seller trust ${target.sellerTrustScore}/100 and evidence ${target.evidenceCompletenessScore}/100.`
      : "";
    return comparisonQuestionResponseSchema.parse({
      answer: `${target.marketplace} "${target.title}" is the current recommendation because it has the best value score (${target.valueScore}/100) among eligible listings, with total cost ${money(target.estimatedLandedCost ?? target.preTaxTotal)}.${risk} Still inspect the live listing because TCGpal does not grade the card from photos.`,
      cautions: [...target.trustNotes, ...report.narrative.cautions].slice(0, 2),
      usedAi: false,
    });
  }

  if (best) {
    return comparisonQuestionResponseSchema.parse({
      answer: `The current recommendation is ${best.marketplace} "${best.title}" because it has the best value score (${best.valueScore}/100) among eligible listings, with seller trust ${best.sellerTrustScore}/100 and evidence ${best.evidenceCompletenessScore}/100. The result still depends on the listed evidence; TCGpal does not grade the card from photos.`,
      cautions: [],
      usedAi: false,
    });
  }

  return comparisonQuestionResponseSchema.parse({
    answer: "There is not enough eligible listing evidence in this report to answer that comparison. Check the source status, paste a specific listing, or retry the search.",
    cautions: report.warnings.slice(0, 2),
    usedAi: false,
  });
}

function findQuestionTarget(report: ComparisonReport, question: string) {
  if (asksAboutCheapest(question)) {
    const listingById = new Map(report.candidates.map((listing) => [listing.id, listing]));
    const choice = report.rankedChoices.find((rankedChoice) => rankedChoice.role === "lowest_landed_cost");
    const choiceListing = choice ? listingById.get(choice.listingId) ?? null : null;
    if (choiceListing) return choiceListing;

    return [...report.candidates]
      .filter((listing) => listing.eligible)
      .sort((a, b) => (a.estimatedLandedCost ?? a.preTaxTotal) - (b.estimatedLandedCost ?? b.preTaxTotal))[0] ?? null;
  }

  const prices = [...question.matchAll(/\$?\s*(\d+(?:\.\d{1,2})?)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
  if (prices.length === 0) return null;
  const targetPrice = prices[0];
  return [...report.candidates]
    .sort((a, b) => Math.abs((a.estimatedLandedCost ?? a.preTaxTotal) - targetPrice) - Math.abs((b.estimatedLandedCost ?? b.preTaxTotal) - targetPrice))[0] ?? null;
}

function asksAboutCheapest(question: string) {
  return /\b(cheapest|lowest|least expensive|low price|lowest price)\b/i.test(question)
    || /最便宜|最低价|低价/.test(question);
}

function asksAboutRisk(question: string) {
  return /\b(risk|risky|unsafe|seller|trust|unproven|thin evidence)\b/i.test(question)
    || /风险|卖家|證據|证据|不稳/.test(question);
}

function formatRiskLabel(label: NormalizedListing["riskLabel"]) {
  switch (label) {
    case "low_risk": return "low risk";
    case "some_risk": return "some risk";
    case "unverified": return "unverified";
    case "higher_risk": return "higher risk";
  }
}

function sanitizeReportForQuestion(report: ComparisonReport, targetListingId?: string) {
  const targetListing = targetListingId ? report.candidates.find((listing) => listing.id === targetListingId) ?? null : null;
  const recommendationListingId = report.rankedChoices.find((choice) => choice.role === "best_value")?.listingId ?? report.rankedChoices[0]?.listingId ?? null;
  const recommendationListing = recommendationListingId ? report.candidates.find((listing) => listing.id === recommendationListingId) ?? null : null;
  return {
    status: report.status,
    demoMode: report.demoMode,
    card: report.confirmedCard
      ? {
        name: report.confirmedCard.name,
        setName: report.confirmedCard.setName,
        setCode: report.confirmedCard.setCode,
        cardNumber: report.confirmedCard.cardNumber,
        variant: report.confirmedCard.variant ?? null,
        marketMid: report.confirmedCard.marketMid ?? null,
        marketSource: report.confirmedCard.marketSource ?? null,
        marketAsOf: report.confirmedCard.marketAsOf ?? null,
      }
      : null,
    choices: report.rankedChoices.map((choice) => ({
      role: choice.role,
      label: choice.label,
      reason: choice.reason,
    })),
    targetListing: targetListing ? sanitizeListingForQuestion(targetListing, recommendationListingId) : null,
    recommendationListing: recommendationListing ? sanitizeListingForQuestion(recommendationListing, recommendationListingId) : null,
    candidates: report.candidates.slice(0, 30).map((listing) => sanitizeListingForQuestion(listing, recommendationListingId)),
    references: report.references.map((reference) => ({
      label: reference.label,
      status: reference.status,
      note: reference.note,
      rawMid: reference.rawMid,
    })),
    trace: report.trace.map((step) => ({
      step: step.step,
      actor: step.actor,
      summary: step.summary,
      status: step.status,
    })),
  };
}

function sanitizeListingForQuestion(listing: NormalizedListing, recommendationListingId: string | null) {
  return {
    isRecommendation: listing.id === recommendationListingId,
    marketplace: listing.marketplace,
    title: listing.title,
    price: listing.price,
    shipping: listing.shipping,
    estimatedTax: listing.estimatedTax,
    estimatedLandedCost: listing.estimatedLandedCost,
    preTaxTotal: listing.preTaxTotal,
    claimedCondition: listing.claimedCondition,
    sellerTrustScore: listing.sellerTrustScore,
    evidenceCompletenessScore: listing.evidenceCompletenessScore,
    safetyScore: listing.safetyScore,
    valueScore: listing.valueScore,
    riskLabel: formatRiskLabel(listing.riskLabel),
    eligible: listing.eligible,
    exclusionReasons: listing.exclusionReasons,
    trustNotes: listing.trustNotes,
  };
}

function money(value: number) {
  return `$${value.toFixed(2)}`;
}
