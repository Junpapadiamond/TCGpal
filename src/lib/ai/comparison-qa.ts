import { createAiProvider } from "@/lib/ai/provider";
import { getAiConfig } from "@/lib/ai/config";
import { isTavilyConfigured, searchTavilyContext } from "@/lib/external/tavily";
import {
  comparisonQuestionResponseSchema,
  type ComparisonQuestionResponse,
  type ComparisonReport,
  type NormalizedListing,
  type RankedChoice,
  type WebCitation,
} from "@/lib/schemas";

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
  options: { webContext?: "auto" | "off" | "force"; activeRole?: RankedChoice["role"] } = {},
): Promise<ComparisonQuestionResponse> {
  const local = localAnswer(report, question, targetListingId, options.activeRole);
  const webMode = options.webContext ?? "off";
  if (shouldUseWebContext(question, webMode)) {
    return answerWithWebContext(report, question, targetListingId, local);
  }

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
        activeRole: options.activeRole,
        report: sanitizeReportForQuestion(report, targetListingId, options.activeRole),
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

async function answerWithWebContext(
  report: ComparisonReport,
  question: string,
  targetListingId: string | undefined,
  local: ComparisonQuestionResponse,
): Promise<ComparisonQuestionResponse> {
  if (!isTavilyConfigured()) {
    return comparisonQuestionResponseSchema.parse({
      ...local,
      cautions: [...local.cautions, "Web context was requested, but Tavily is not configured."].slice(0, 3),
    });
  }

  let citations: WebCitation[] = [];
  try {
    const context = await searchTavilyContext({ query: buildWebContextQuery(report, question), maxResults: 5 });
    citations = context.citations;
  } catch {
    return comparisonQuestionResponseSchema.parse({
      ...local,
      cautions: [...local.cautions, "Web context could not be checked; this answer uses the report only."].slice(0, 3),
    });
  }
  if (citations.length === 0) {
    return comparisonQuestionResponseSchema.parse({
      ...webContextFallback(citations),
      webContextChecked: true,
      webCitations: [],
    });
  }

  const webFallback = webContextFallback(citations);
  const provider = createAiProvider(getAiConfig());
  try {
    const response = await provider.completeJson({
      role: "critic",
      schemaName: "comparison_question_answer_with_web_context",
      schema: comparisonQuestionResponseSchema.omit({ usedAi: true, webContextChecked: true, webCitations: true }),
      system: [
        "You answer buyer questions about one TCGpal comparison report with optional cited web context.",
        "Use report facts for rankings, prices, seller risk, and listing evidence. Web context is only for source legitimacy, translation, reference discovery, or card identity help.",
        "Never treat Tavily results as fetched marketplace inventory, sold comps, ranked listings, seller history, or price evidence.",
        "Do not browse beyond the supplied citations. If citations are weak, say what is missing.",
        "If targetListingId is supplied, answer about that exact listing when the question is report/ranking related.",
        "Do not introduce sold comps, sold-history, or sold-transaction language; this report is active-listing and reference-price evidence only.",
        "Do not call a source or seller a scam. Say what the cited pages do and do not prove.",
        "Keep the answer under 140 words.",
      ].join("\n"),
      user: {
        question,
        report: sanitizeReportForQuestion(report, targetListingId),
        webCitations: citations.map((citation) => ({
          title: citation.title,
          url: citation.url,
          snippet: citation.snippet,
        })),
      },
    });
    const parsed = comparisonQuestionResponseSchema.parse({
      ...response.data,
      usedAi: true,
      webContextChecked: true,
      webCitations: citations,
    });
    if (forbiddenAnswer.some((pattern) => pattern.test(`${parsed.answer} ${parsed.cautions.join(" ")}`))) {
      throw new Error("Critic rejected an unsupported answer.");
    }
    return parsed;
  } catch {
    return comparisonQuestionResponseSchema.parse({
      ...webFallback,
      webContextChecked: true,
      webCitations: citations,
    });
  }
}

function localAnswer(
  report: ComparisonReport,
  question: string,
  targetListingId?: string,
  activeRole: RankedChoice["role"] = "best_value",
): ComparisonQuestionResponse {
  const listingById = new Map(report.candidates.map((listing) => [listing.id, listing]));
  const lensChoice = report.rankedChoices.find((choice) => choice.role === activeRole)
    ?? report.rankedChoices.find((choice) => choice.role === "best_value")
    ?? report.rankedChoices[0]
    ?? null;
  const best = lensChoice ? listingById.get(lensChoice.listingId) ?? null : null;
  const target = targetListingId ? listingById.get(targetListingId) ?? null : findQuestionTarget(report, question);
  const lens = lensLabel(lensChoice?.role ?? activeRole);

  if (best && target && target.id !== best.id) {
    const exclusion = target.eligible
      ? ""
      : ` It was also excluded from winner selection: ${target.exclusionReasons.join("; ") || "the deterministic eligibility gate rejected it"}.`;
    const risk = asksAboutRisk(question)
      ? ` Its seller risk label is ${formatRiskLabel(target.riskLabel)}, with seller trust ${target.sellerTrustScore}/100 and evidence ${target.evidenceCompletenessScore}/100.`
      : "";
    return comparisonQuestionResponseSchema.parse({
      answer: `${target.marketplace} "${target.title}" does not lead the ${lens} lens: ${lensEvidence(target, lensChoice?.role ?? activeRole)} versus ${lensEvidence(best, lensChoice?.role ?? activeRole)} for the lens winner. Seller trust is ${target.sellerTrustScore}/100 versus ${best.sellerTrustScore}/100, evidence is ${target.evidenceCompletenessScore}/100 versus ${best.evidenceCompletenessScore}/100, and comparable cost is ${money(target.estimatedLandedCost ?? target.preTaxTotal)} versus ${money(best.estimatedLandedCost ?? best.preTaxTotal)}.${risk}${exclusion}`,
      cautions: [...target.exclusionReasons, ...target.trustNotes].slice(0, 2),
      usedAi: false,
    });
  }

  if (best && target && target.id === best.id) {
    const risk = asksAboutRisk(question)
      ? ` Its seller risk label is ${formatRiskLabel(target.riskLabel)}, with seller trust ${target.sellerTrustScore}/100 and evidence ${target.evidenceCompletenessScore}/100.`
      : "";
    return comparisonQuestionResponseSchema.parse({
      answer: `${target.marketplace} "${target.title}" leads the ${lens} lens because it has ${lensEvidence(target, lensChoice?.role ?? activeRole)} among eligible listings, with comparable cost ${money(target.estimatedLandedCost ?? target.preTaxTotal)}.${risk} Still inspect the live listing because TCGpal does not grade the card from photos.`,
      cautions: [...target.trustNotes, ...report.narrative.cautions].slice(0, 2),
      usedAi: false,
    });
  }

  if (best) {
    return comparisonQuestionResponseSchema.parse({
      answer: `The ${lens} leader is ${best.marketplace} "${best.title}" with ${lensEvidence(best, lensChoice?.role ?? activeRole)}, seller trust ${best.sellerTrustScore}/100, and evidence ${best.evidenceCompletenessScore}/100. The result still depends on the listed evidence; TCGpal does not grade the card from photos.`,
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

function lensLabel(role: RankedChoice["role"]) {
  switch (role) {
    case "lowest_landed_cost": return "Cheapest";
    case "safest_listing": return "Safest";
    case "best_condition_evidence": return "Best documented";
    default: return "Best Value";
  }
}

function lensEvidence(listing: NormalizedListing, role: RankedChoice["role"]) {
  switch (role) {
    case "lowest_landed_cost":
      return `${money(listing.estimatedLandedCost ?? listing.preTaxTotal)} ${listing.estimatedTax === null ? "pre-tax total" : "estimated checkout total"}`;
    case "safest_listing":
      return `the highest seller-and-evidence score (${listing.safetyScore}/100)`;
    case "best_condition_evidence":
      return `the strongest photo-and-condition evidence score (${listing.evidenceCompletenessScore}/100)`;
    default:
      return `the highest complete-cost, condition, seller, and evidence score (${listing.valueScore}/100)`;
  }
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

function shouldUseWebContext(question: string, mode: "auto" | "off" | "force") {
  if (mode === "off") return false;
  if (mode === "force") return true;
  if (asksReportOnlyQuestion(question)) return false;
  return asksForOutsideContext(question);
}

function asksReportOnlyQuestion(question: string) {
  return /\b(why|why not|top pick|recommend|winner|cheapest|safest|score|value|seller trust|risk|risky|evidence|missing|excluded)\b/i.test(question)
    || /为什么|為什麼|不选|不選|推荐|推薦|最便宜|风险|風險|证据|證據|分数|分數/.test(question);
}

function asksForOutsideContext(question: string) {
  return /\b(japan|japanese|jp|source|legit|trustworthy|official|translate|translation|title mean|verify|reference|where else|card rush|yuyutei|snkrdunk|yahoo auctions|promo|variant|set name|print variant)\b/i.test(question)
    || /日本|日文|翻译|翻譯|标题|標題|来源|來源|可靠|正版|官方|核验|核實|参考|參考|哪里|哪裡|版本|异画|異畫|促销|促銷/.test(question);
}

function buildWebContextQuery(report: ComparisonReport, question: string) {
  const card = report.confirmedCard
    ? [
      report.confirmedCard.name,
      report.confirmedCard.cardNumber,
      report.confirmedCard.setName,
      report.confirmedCard.setCode,
      report.confirmedCard.language,
    ].filter(Boolean).join(" ")
    : "";
  const game = report.request.cardHint?.game;
  const trustedReferenceTerms = asksForVerificationSources(question)
    ? game === "onePiece"
      ? "official One Piece Card Game card list Carddass Card Rush Yuyutei"
      : "Pokemon TCG official card database TCGplayer Bulbapedia"
    : "trading card reference official source";
  return [question, card, trustedReferenceTerms].filter(Boolean).join(" ").slice(0, 500);
}

function asksForVerificationSources(question: string) {
  return /\b(verify|where else|reference|check this card|card database|official database)\b/i.test(question)
    || /核验|核實|哪里|哪裡|参考|參考|资料库|資料庫|官方/.test(question);
}

function webContextFallback(citations: WebCitation[]): ComparisonQuestionResponse {
  if (citations.length === 0) {
    return comparisonQuestionResponseSchema.parse({
      answer: "I checked web context but did not find a useful cited reference. The comparison ranking still comes only from the report evidence.",
      cautions: ["Tavily context is not marketplace inventory and did not affect the ranking."],
      usedAi: false,
    });
  }

  const labels = citations.slice(0, 3).map((citation) => citation.title).join(", ");
  return comparisonQuestionResponseSchema.parse({
    answer: `I checked web context and found references to inspect: ${labels}. Treat them as citation context only; they were not fetched as live inventory and did not affect the ranked recommendation.`,
    cautions: ["Open the cited pages yourself before relying on a source, translation, or variant clue."],
    usedAi: false,
  });
}

function formatRiskLabel(label: NormalizedListing["riskLabel"]) {
  switch (label) {
    case "low_risk": return "low risk";
    case "some_risk": return "some risk";
    case "unverified": return "unverified";
    case "higher_risk": return "higher risk";
  }
}

function sanitizeReportForQuestion(
  report: ComparisonReport,
  targetListingId?: string,
  activeRole: RankedChoice["role"] = "best_value",
) {
  const targetListing = targetListingId ? report.candidates.find((listing) => listing.id === targetListingId) ?? null : null;
  const recommendationListingId = report.rankedChoices.find((choice) => choice.role === activeRole)?.listingId
    ?? report.rankedChoices.find((choice) => choice.role === "best_value")?.listingId
    ?? report.rankedChoices[0]?.listingId
    ?? null;
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
    listingLanguage: listing.listingLanguage,
    costComplete: listing.costComplete,
    conditionCompatibilityScore: listing.conditionCompatibilityScore,
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
