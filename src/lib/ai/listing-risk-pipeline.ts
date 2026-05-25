import type { AiProvider } from "@/lib/ai/provider";
import { analyzeListingRiskText, runRawVsSlabCalculator } from "@/lib/ai/tools";
import {
  listingEvidenceSchema,
  pipelineCriticResultSchema,
  riskScoreSchema,
  type AgentTraceStep,
  type ListingEvidence,
  type ListingRiskInput,
  type PipelineCriticResult,
  type PipelineMathResult,
  type RiskScore,
} from "@/lib/schemas";

const bannedPhrases = [
  /guaranteed profit/i,
  /must buy/i,
  /certainly psa[ ]?10/i,
  /definitely.*psa/i,
  /risk[- ]?free/i,
  /sure.*to grade/i,
  /can't lose/i,
  /100% safe/i,
];

export type PipelineStageName = "evidence" | "risk" | "math" | "critic";

export type PipelineStagePayload =
  | { stage: "evidence"; evidence: ListingEvidence; trace: AgentTraceStep; warnings: string[]; fallbackUsed: boolean }
  | { stage: "risk"; riskScore: RiskScore; trace: AgentTraceStep; warnings: string[]; fallbackUsed: boolean }
  | { stage: "math"; math: PipelineMathResult; trace: AgentTraceStep; warnings: string[]; fallbackUsed: boolean }
  | { stage: "critic"; critic: PipelineCriticResult; trace: AgentTraceStep; warnings: string[]; fallbackUsed: boolean };

export async function runEvidenceStage(input: {
  listingInput: ListingRiskInput;
  provider: AiProvider;
  primaryModel: string;
}): Promise<Extract<PipelineStagePayload, { stage: "evidence" }>> {
  const warnings: string[] = [];

  try {
    const ai = await input.provider.completeJson({
      role: "primary",
      schemaName: "listing_evidence",
      schema: listingEvidenceSchema,
      system: [
        "You are an Evidence Extraction Agent for TCG listing analysis.",
        "Your only job is to extract structured evidence from the listing. Do not judge, recommend, or rank.",
        "If a field is not explicitly stated, return null. Do not infer card numbers or set codes.",
        "Seller hype phrases like PSA10 quality, mint, or looks gradeable are seller_claim with low confidence.",
        "Only mark photo categories true if the seller explicitly says that evidence exists.",
        "Always populate missingEvidence with concise human-readable missing facts.",
        "Return only JSON matching the listing_evidence schema.",
      ].join("\n"),
      user: input.listingInput,
    });

    return {
      stage: "evidence",
      evidence: ai.data,
      warnings,
      fallbackUsed: false,
      trace: {
        step: "evidence_extraction",
        agent: "Evidence Agent",
        model: ai.model,
        toolsUsed: [],
        summary: "Extracted structured listing evidence without making a buy/sell judgment.",
      },
    };
  } catch (error) {
    warnings.push(`Evidence Agent used local fallback. ${getErrorMessage(error)}`);
    return {
      stage: "evidence",
      evidence: extractEvidenceLocally(input.listingInput),
      warnings,
      fallbackUsed: true,
      trace: {
        step: "evidence_extraction",
        agent: "Evidence Agent",
        model: "local fallback",
        toolsUsed: ["extractEvidenceLocally"],
        summary: "Extracted evidence with deterministic text rules because AI was unavailable.",
      },
    };
  }
}

export async function runRiskStage(input: {
  listingInput: ListingRiskInput;
  evidence: ListingEvidence;
  provider: AiProvider;
}): Promise<Extract<PipelineStagePayload, { stage: "risk" }>> {
  const warnings: string[] = [];
  const baseline = scoreRiskLocally(input.listingInput, input.evidence);

  try {
    const ai = await input.provider.completeJson({
      role: "primary",
      schemaName: "risk_score",
      schema: riskScoreSchema,
      system: [
        "You are a Risk Scoring Agent for TCG listings.",
        "You receive structured evidence and a rule-based baseline score.",
        "Accept the rule-based scores as baseline. Adjust each dimension by at most 15 points only when evidence justifies it.",
        "Never lower a score below 40 if evidence shows no return policy, missing back photo, seller hype language, or unclear version.",
        "For each dimension, write 1-3 short reasons users can verify themselves.",
        "Return only JSON matching the risk_score schema.",
      ].join("\n"),
      user: {
        listingInput: input.listingInput,
        evidence: input.evidence,
        ruleBaseline: baseline,
      },
    });

    return {
      stage: "risk",
      riskScore: clampRiskAgainstBaseline(baseline, ai.data),
      warnings,
      fallbackUsed: false,
      trace: {
        step: "risk_scoring",
        agent: "Risk Agent",
        model: ai.model,
        toolsUsed: ["scoreRiskLocally baseline"],
        summary: "Scored condition, version, price, policy, and grading viability from evidence.",
      },
    };
  } catch (error) {
    warnings.push(`Risk Agent used local fallback. ${getErrorMessage(error)}`);
    return {
      stage: "risk",
      riskScore: baseline,
      warnings,
      fallbackUsed: true,
      trace: {
        step: "risk_scoring",
        agent: "Risk Agent",
        model: "local fallback",
        toolsUsed: ["scoreRiskLocally"],
        summary: "Scored risk dimensions with deterministic rules because AI was unavailable.",
      },
    };
  }
}

export function runMathStage(input: {
  listingInput: ListingRiskInput;
  evidence: ListingEvidence;
  riskScore: RiskScore;
}): Extract<PipelineStagePayload, { stage: "math" }> {
  const psa10Probability = input.riskScore.overall >= 70 ? 0.18 : input.riskScore.overall >= 45 ? 0.25 : 0.32;
  const psa9Probability = input.riskScore.overall >= 70 ? 0.36 : 0.4;
  const rawPrice = input.listingInput.price;
  const psa10Price = Math.max(rawPrice * 2.35, rawPrice + 60);
  const psa9Price = Math.max(rawPrice * 1.15, rawPrice + 15);
  const otherPrice = Math.max(rawPrice * 0.55, 1);

  const calcInput = {
    rawPrice,
    psa10Price,
    psa9Price,
    otherPrice,
    gradingCost: 35,
    marketplaceFeeRate: 0.13,
    shippingCost: 5,
    psa10Probability,
    psa9Probability,
  };

  return {
    stage: "math",
    math: {
      input: calcInput,
      result: runRawVsSlabCalculator(calcInput),
      toolUsed: "calculateRawVsSlab",
      assumptionNotes: [
        "AI did not do arithmetic; the deterministic calculator tool produced the numbers.",
        `Raw price came from the pasted listing: $${rawPrice.toFixed(2)}.`,
        `PSA10 probability used a conservative evidence-based default: ${(psa10Probability * 100).toFixed(0)}%.`,
      ],
    },
    warnings: [],
    fallbackUsed: false,
    trace: {
      step: "raw_vs_slab_impact",
      agent: "Math Agent",
      model: "deterministic TypeScript",
      toolsUsed: ["calculateRawVsSlab"],
      summary: "Selected conservative grading assumptions and called the calculator tool; no model math was used.",
    },
  };
}

export async function runCriticStage(input: {
  evidence: ListingEvidence;
  riskScore: RiskScore;
  math: PipelineMathResult;
  provider: AiProvider;
  cheapModel: string;
}): Promise<Extract<PipelineStagePayload, { stage: "critic" }>> {
  const local = buildLocalFinalRecommendation(input.riskScore, input.math);
  const localFlags = findBannedPhrases(local);

  try {
    const ai = await input.provider.completeJson({
      role: "critic",
      schemaName: "pipeline_critic_result",
      schema: pipelineCriticResultSchema,
      system: [
        "You are a Critic Agent for a cautious TCG listing-risk pipeline.",
        "Write one final recommendation from evidence, risk score, and deterministic calculator result.",
        "Do not use banned phrases: guaranteed profit, must buy, certainly PSA10, definitely PSA, risk-free, sure to grade, can't lose, 100% safe.",
        "Use cautious, conditional language and mention missing evidence when relevant.",
        "Return only JSON matching the pipeline_critic_result schema.",
      ].join("\n"),
      user: input,
    });
    const banned = findBannedPhrases(ai.data.finalRecommendation);
    return {
      stage: "critic",
      critic: {
        ...ai.data,
        passed: ai.data.passed && banned.length === 0,
        bannedPhrasesFlagged: Array.from(new Set([...ai.data.bannedPhrasesFlagged, ...banned])),
      },
      warnings: banned.length ? [`Critic flagged banned phrases: ${banned.join(", ")}`] : [],
      fallbackUsed: false,
      trace: {
        step: "critic_review",
        agent: "Critic Agent",
        model: ai.model,
        toolsUsed: ["banned_phrase_scan"],
        summary: "Reviewed the final recommendation for overconfident or profit-promise language.",
      },
    };
  } catch (error) {
    return {
      stage: "critic",
      critic: {
        passed: localFlags.length === 0,
        finalRecommendation: local,
        warnings: localFlags.length ? [`Local critic flagged: ${localFlags.join(", ")}`] : [],
        bannedPhrasesFlagged: localFlags,
      },
      warnings: [`Critic Agent used local fallback. ${getErrorMessage(error)}`],
      fallbackUsed: true,
      trace: {
        step: "critic_review",
        agent: "Critic Agent",
        model: `local + ${input.cheapModel} fallback`,
        toolsUsed: ["banned_phrase_scan"],
        summary: "Used local banned-language scan because AI critic was unavailable.",
      },
    };
  }
}

function extractEvidenceLocally(input: ListingRiskInput): ListingEvidence {
  const text = `${input.title} ${input.description}`;
  const lower = text.toLowerCase();
  const titleLower = input.title.toLowerCase();
  const setMatch = text.match(/\b(?:EB|OP|ST|PRB|SV|SWSH|SM|XY|LOB|MRD|IOC)[- ]?\d{1,3}\b/i);
  const numberMatch = text.match(/#?\b\d{1,3}\/\d{1,3}\b|#\d{1,4}\b/i);
  const language = lower.includes("japanese") || lower.includes(" jp ") || titleLower.includes(" jp")
    ? "Japanese"
    : lower.includes("english")
      ? "English"
      : null;
  const returns = lower.includes("no returns") || lower.includes("no return")
    ? "none"
    : lower.includes("returns accepted") || lower.includes("return accepted")
      ? "allowed"
      : "unspecified";
  const conditionClaims = ["psa10", "psa 10", "mint", "gem mint", "pack fresh", "great condition"]
    .filter((claim) => lower.includes(claim))
    .map((claim) => ({ claim, source: "seller_claim" as const, confidence: "low" as const }));
  const photosClaimed = {
    front: /front|pictured|photos?|image/i.test(text),
    back: /back photo|back pic|front\/back|front and back/i.test(text),
    corners: /corner|closeup/i.test(text),
    edges: /edge/i.test(text),
    surface: /surface|scratch/i.test(text),
  };

  const missingEvidence = [
    !setMatch ? "set code not clearly stated" : "",
    !numberMatch ? "card number not stated" : "",
    !language ? "language not explicitly stated" : "",
    !photosClaimed.back ? "back photo not mentioned" : "",
    !photosClaimed.corners ? "corner closeups not mentioned" : "",
    !photosClaimed.surface ? "surface condition not described" : "",
    returns === "unspecified" ? "return policy not stated" : "",
  ].filter(Boolean);

  return listingEvidenceSchema.parse({
    cardName: { value: input.title.replace(/\b(mint|psa10|psa 10|great condition|no returns)\b/gi, "").trim(), confidence: "medium", source: "explicit_title" },
    setCode: { value: setMatch?.[0] ?? null, confidence: setMatch ? "high" : "low", source: setMatch ? "explicit_title" : "unknown" },
    cardNumber: { value: numberMatch?.[0] ?? null, confidence: numberMatch ? "high" : "low", source: numberMatch ? "explicit_title" : "unknown" },
    language: { value: language, confidence: language ? "high" : "low", source: language ? "explicit_title" : "unknown" },
    conditionClaims,
    sellerPolicy: { returns, shipping: null },
    photosClaimed,
    missingEvidence,
  });
}

function scoreRiskLocally(input: ListingRiskInput, evidence: ListingEvidence): RiskScore {
  const textReport = analyzeListingRiskText(input);
  const condition = dimension(
    scoreFrom([
      !evidence.photosClaimed.back,
      !evidence.photosClaimed.corners,
      !evidence.photosClaimed.surface,
      evidence.conditionClaims.length > 0,
    ], [24, 18, 14, 18]),
    [
      !evidence.photosClaimed.back ? "Back photo is missing or not mentioned." : "",
      !evidence.photosClaimed.corners ? "Corner closeups are missing." : "",
      evidence.conditionClaims.length ? "Condition confidence depends on seller claims." : "",
    ],
    textReport.missingInfo,
  );
  const versionClarity = dimension(
    scoreFrom([!evidence.setCode.value, !evidence.cardNumber.value, !evidence.language.value], [25, 20, 15]),
    [
      !evidence.setCode.value ? "Set code is unclear." : "Set code appears stated.",
      !evidence.cardNumber.value ? "Card number is not stated." : "",
      !evidence.language.value ? "Language is not explicitly stated." : "",
    ],
    evidence.missingEvidence.filter((item) => /set|number|language/i.test(item)),
  );
  const priceVsComps = dimension(
    input.price >= 150 ? 65 : input.price >= 80 ? 52 : 35,
    [
      "No sold comparable data is connected yet.",
      input.price >= 80 ? "Listed price is high enough to require comp discipline." : "Price is low enough that comp risk is moderate.",
    ],
    ["sold_comps_not_connected"],
  );
  const sellerPolicy = dimension(
    evidence.sellerPolicy.returns === "none" ? 90 : evidence.sellerPolicy.returns === "unspecified" ? 60 : 25,
    [
      evidence.sellerPolicy.returns === "none" ? "Seller states no returns." : "",
      evidence.sellerPolicy.returns === "unspecified" ? "Return policy is not stated." : "",
      evidence.sellerPolicy.returns === "allowed" ? "Returns appear allowed." : "",
    ],
    [`returns_${evidence.sellerPolicy.returns}`],
  );
  const gradingViability = dimension(
    scoreFrom([input.userGoal === "Grading", !evidence.photosClaimed.back, !evidence.photosClaimed.corners, !evidence.photosClaimed.surface], [12, 26, 22, 18]),
    [
      input.userGoal === "Grading" ? "Grading goal requires stricter evidence." : "",
      !evidence.photosClaimed.back ? "Back condition is unknown." : "",
      !evidence.photosClaimed.surface ? "Surface evidence is missing." : "",
    ],
    ["grading_evidence_check"],
  );
  const dimensions = { condition, versionClarity, priceVsComps, sellerPolicy, gradingViability };
  const overall = Math.round(
    (condition.score * 0.28) +
      (versionClarity.score * 0.17) +
      (priceVsComps.score * 0.15) +
      (sellerPolicy.score * 0.18) +
      (gradingViability.score * 0.22),
  );
  const level = overall >= 85 ? "critical" : overall >= 70 ? "high" : overall >= 40 ? "medium" : "low";
  const verdictPrefix = level === "critical" ? "CRITICAL RISK" : level === "high" ? "HIGH RISK" : level === "medium" ? "MEDIUM RISK" : "LOW RISK";

  return riskScoreSchema.parse({
    overall,
    level,
    verdict: `${verdictPrefix} — ${overall >= 70 ? "Ask for missing evidence before buying" : "Continue only with clear evidence"}`,
    dimensions,
  });
}

function clampRiskAgainstBaseline(baseline: RiskScore, ai: RiskScore): RiskScore {
  const dimensions = Object.fromEntries(
    Object.entries(ai.dimensions).map(([key, value]) => {
      const base = baseline.dimensions[key as keyof RiskScore["dimensions"]];
      return [key, { ...value, score: Math.min(100, Math.max(Math.max(0, base.score - 15), Math.min(100, base.score + 15, value.score))) }];
    }),
  ) as RiskScore["dimensions"];
  const overall = Math.round(Object.values(dimensions).reduce((sum, item) => sum + item.score, 0) / 5);
  return riskScoreSchema.parse({ ...ai, overall, dimensions });
}

function dimension(score: number, reasons: string[], triggeredRules: string[]) {
  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    reasons: reasons.filter(Boolean).slice(0, 3),
    triggeredRules: triggeredRules.filter(Boolean),
  };
}

function scoreFrom(flags: boolean[], weights: number[]) {
  return Math.min(100, Math.round(flags.reduce((sum, flag, index) => sum + (flag ? weights[index] : 0), 15)));
}

function buildLocalFinalRecommendation(risk: RiskScore, math: PipelineMathResult) {
  const ev = math.result.expectedProfit;
  const breakEven = math.result.breakEvenPsa10Probability;
  const breakEvenText = breakEven === null ? "break-even PSA10 odds are unclear" : `break-even PSA10 odds are ${(breakEven * 100).toFixed(0)}%`;

  if (risk.overall >= 70 || ev < 0) {
    return `Pass for now or ask for missing photos first. Risk is ${risk.overall}/100, EV is $${ev.toFixed(2)}, and ${breakEvenText}.`;
  }

  return `Continue reviewing only if the seller provides missing evidence. Risk is ${risk.overall}/100 and EV is $${ev.toFixed(2)} under conservative assumptions.`;
}

function findBannedPhrases(text: string) {
  return bannedPhrases.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}
