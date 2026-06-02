import { z } from "zod";
import { runCriticAgent } from "@/lib/ai/critic";
import { getAiConfig, getModelForStep, getPrimaryAgentForTask, type AiConfig } from "@/lib/ai/config";
import { createAiProvider, type AiProvider } from "@/lib/ai/provider";
import {
  analyzeListingAuthenticity,
  analyzeListingRiskText,
  buildJournalDraft,
  runBuySellEvaluator,
  runRawVsSlabCalculator,
} from "@/lib/ai/tools";
import { generatePlan } from "@/lib/plan-generator";
import {
  authenticityAssessmentSchema,
  buySellDecisionSchema,
  generatedPlanSetSchema,
  hermesRequestSchema,
  hermesResponseSchema,
  journalDraftSchema,
  listingRiskReportSchema,
  type AgentTraceStep,
  type AuthenticityAssessment,
  type BuySellDecision,
  type HermesRequest,
  type HermesResponse,
  type HermesTaskType,
  type ListingRiskReport,
  type RawVsSlabResult,
} from "@/lib/schemas";

export async function routeHermes(rawRequest: HermesRequest): Promise<HermesResponse> {
  const request = hermesRequestSchema.parse(rawRequest);
  const config = getAiConfig();
  const provider = createAiProvider(config);
  const trace: AgentTraceStep[] = [];
  const warnings: string[] = [];
  let fallbackUsed = false;

  const taskType = classifyHermesTask(request);
  trace.push({
    step: "classify_task",
    agent: "Hermes Router",
    model: `rules + ${getModelForStep("classifier", config)} reserved`,
    toolsUsed: [],
    summary: `Hermes routed this request to ${taskType}.`,
  });

  const context = {
    profile: request.profile,
    journalSummary: request.journalSummary,
  };

  let result: HermesResponse["result"];

  if (taskType === "PLAN_GENERATION") {
    if (!request.planInput) throw new Error("PLAN_GENERATION requires planInput.");
    const localPlan = generatePlan(request.planInput);

    try {
      const ai = await provider.completeJson({
        role: "primary",
        schemaName: "generated_plan_set",
        schema: generatedPlanSetSchema,
        system: buildPlanSystemPrompt(),
        user: {
          context,
          planInput: request.planInput,
          deterministicBaseline: localPlan,
        },
      });

      result = ai.data;
      trace.push({
        step: "generate_plan",
        agent: "Plan Agent",
        model: ai.model,
        toolsUsed: ["generatePlan baseline"],
        summary: "Plan Agent generated conservative, balanced, and aggressive plans with schema validation.",
      });
    } catch (error) {
      fallbackUsed = true;
      result = localPlan;
      warnings.push(`Plan Agent used local fallback. ${getErrorMessage(error)}`);
      trace.push({
        step: "generate_plan",
        agent: "Plan Agent",
        model: `${config.provider} unavailable`,
        toolsUsed: ["generatePlan fallback"],
        summary: "Plan Agent fell back to deterministic mock plan generation.",
      });
    }
  } else if (taskType === "LISTING_RISK_CHECK") {
    if (!request.listingInput) throw new Error("LISTING_RISK_CHECK requires listingInput.");
    const listingInput = request.listingInput;
    const conditionRule = analyzeListingRiskText(listingInput);
    const authenticityRule = analyzeListingAuthenticity(listingInput);

    // Two specialist sub-agents run in parallel, each with its own deterministic fallback.
    const [conditionOutcome, authenticityOutcome] = await Promise.all([
      runSubAgent({
        provider,
        config,
        schemaName: "listing_risk_report",
        schema: listingRiskReportSchema,
        system: buildListingRiskSystemPrompt(),
        user: { context, listingInput, ruleReport: conditionRule },
        fallback: conditionRule,
        agentName: "Condition & Version Agent",
      }),
      runSubAgent({
        provider,
        config,
        schemaName: "authenticity_assessment",
        schema: authenticityAssessmentSchema,
        system: buildAuthenticitySystemPrompt(),
        user: { context, listingInput, authenticityRule },
        fallback: authenticityRule,
        agentName: "Authenticity & Seller Agent",
      }),
    ]);

    const mergedCondition = conditionOutcome.fallback
      ? conditionRule
      : mergeRiskReports(conditionRule, conditionOutcome.data);
    const mergedAuthenticity = authenticityOutcome.fallback
      ? authenticityRule
      : mergeAuthenticity(authenticityRule, authenticityOutcome.data);

    result = { ...mergedCondition, authenticity: mergedAuthenticity };

    if (conditionOutcome.fallback || authenticityOutcome.fallback) fallbackUsed = true;
    if (conditionOutcome.warning) warnings.push(conditionOutcome.warning);
    if (authenticityOutcome.warning) warnings.push(authenticityOutcome.warning);

    trace.push({
      step: "analyze_condition",
      agent: "Condition & Version Agent",
      model: conditionOutcome.model,
      toolsUsed: ["analyzeListingRiskText"],
      summary: conditionOutcome.fallback
        ? "Condition & Version Agent fell back to deterministic text-risk logic."
        : "Condition & Version Agent combined rule-based screening with AI explanation.",
    });
    trace.push({
      step: "analyze_authenticity",
      agent: "Authenticity & Seller Agent",
      model: authenticityOutcome.model,
      toolsUsed: ["analyzeListingAuthenticity"],
      summary: authenticityOutcome.fallback
        ? "Authenticity & Seller Agent fell back to deterministic counterfeit and seller-credibility heuristics."
        : "Authenticity & Seller Agent assessed counterfeit and seller-credibility signals on top of the rule baseline.",
    });
  } else if (taskType === "BUY_SELL_DECISION") {
    if (!request.decisionInput) throw new Error("BUY_SELL_DECISION requires decisionInput.");
    const decisionInput = request.decisionInput;

    // Orchestrate the deterministic tools the decision depends on.
    let listingReport: ListingRiskReport | undefined;
    let authenticity: AuthenticityAssessment | undefined;
    if (decisionInput.listingInput) {
      listingReport = analyzeListingRiskText(decisionInput.listingInput);
      authenticity = analyzeListingAuthenticity(decisionInput.listingInput);
      trace.push({
        step: "screen_listing",
        agent: "Listing Risk + Authenticity Tools",
        model: "deterministic TypeScript",
        toolsUsed: ["analyzeListingRiskText", "analyzeListingAuthenticity"],
        summary: `Screened the linked listing: risk ${listingReport.score}, authenticity ${authenticity.authenticityRisk}.`,
      });
    }

    let rawResult: RawVsSlabResult | undefined = request.rawResult;
    if (!rawResult && decisionInput.rawInput) {
      rawResult = runRawVsSlabCalculator(decisionInput.rawInput);
    }
    if (rawResult) {
      trace.push({
        step: "calculate_raw_vs_slab",
        agent: "Calculation Agent",
        model: "deterministic TypeScript",
        toolsUsed: ["calculateRawVsSlab"],
        summary: `Raw-vs-slab expected profit ${Math.round(rawResult.expectedProfit)}.`,
      });
    }

    const baseline = runBuySellEvaluator(decisionInput, { listingReport, authenticity, rawResult });
    trace.push({
      step: "evaluate_buy_sell",
      agent: "Decision Baseline",
      model: "deterministic TypeScript",
      toolsUsed: ["evaluateBuySell"],
      summary: `Deterministic stance: ${baseline.stance}.`,
    });

    const outcome = await runSubAgent({
      provider,
      config,
      schemaName: "buy_sell_decision",
      schema: buySellDecisionSchema,
      system: buildBuySellSystemPrompt(),
      user: { context, decisionInput, deterministicBaseline: baseline, signals: { listingReport, authenticity, rawResult } },
      fallback: baseline,
      agentName: "Buy/Sell Decision Agent",
    });

    result = outcome.fallback ? baseline : mergeBuySell(baseline, outcome.data);
    if (outcome.fallback) fallbackUsed = true;
    if (outcome.warning) warnings.push(outcome.warning);
    trace.push({
      step: "decision_synthesis",
      agent: "Buy/Sell Decision Agent",
      model: outcome.model,
      toolsUsed: [],
      summary: outcome.fallback
        ? "Decision Agent fell back to the deterministic buy/sell evaluation."
        : "Decision Agent added reasoning and conditions on top of the deterministic baseline.",
    });
  } else if (taskType === "RAW_VS_SLAB_EXPLAIN") {
    if (!request.rawInput) throw new Error("RAW_VS_SLAB_EXPLAIN requires rawInput.");
    result = request.rawResult ?? runRawVsSlabCalculator(request.rawInput);
    trace.push({
      step: "calculate_raw_vs_slab",
      agent: "Calculation Agent",
      model: "deterministic TypeScript",
      toolsUsed: ["calculateRawVsSlab"],
      summary: "Calculator returned deterministic expected value, downside, and break-even probability.",
    });
  } else {
    result = buildJournalDraft({
      rawResult: request.rawResult,
      cardName: request.planInput?.theme || request.listingInput?.title,
    });
    const parsedDraft = journalDraftSchema.parse(result);
    result = parsedDraft;
    trace.push({
      step: "draft_journal",
      agent: "Journal Reflection Agent",
      model: "deterministic TypeScript",
      toolsUsed: ["buildJournalDraft"],
      summary: "Journal Reflection Agent created a local decision journal draft.",
    });
  }

  const critic = await runCriticAgent({
    payload: result,
    provider,
    cheapModel: getModelForStep("critic", config),
    trace,
    warnings,
  });

  if (!critic.passed) {
    warnings.push(`Critic flagged output: ${critic.flags.join(", ")}`);
  }

  trace.push({
    step: "return_result",
    agent: getPrimaryAgentForTask(taskType),
    model: fallbackUsed ? "local fallback" : config.primaryModel,
    toolsUsed: [],
    summary: fallbackUsed ? "Returned fallback result with warnings." : "Returned AI-assisted result.",
  });

  return hermesResponseSchema.parse({
    taskType,
    result,
    trace,
    warnings,
    fallbackUsed,
  });
}

export function classifyHermesTask(request: HermesRequest): HermesTaskType {
  if (request.taskHint) return request.taskHint;
  if (request.decisionInput) return "BUY_SELL_DECISION";
  if (request.listingInput) return "LISTING_RISK_CHECK";
  if (request.planInput) return "PLAN_GENERATION";
  if (request.rawInput || request.rawResult) return "RAW_VS_SLAB_EXPLAIN";
  return "JOURNAL_DRAFT";
}

function buildPlanSystemPrompt() {
  return [
    "You are the Plan Agent for CardPlan AI, a cautious planning layer for TCG collectors and small sellers.",
    "Generate exactly three plans: Conservative, Balanced, Aggressive.",
    "Use conditional language. Do not promise profit. Do not say the user must buy anything.",
    "Every plan must include budget split, buy conditions, do-not-buy conditions, sell conditions, risks, and next actions.",
    "Respect the user's budget, goal, risk level, holding period, market, and grading preference.",
    "Return only JSON matching the generated_plan_set schema.",
  ].join("\n");
}

function buildListingRiskSystemPrompt() {
  return [
    "You are the Listing Risk Agent for CardPlan AI.",
    "Analyze pasted marketplace listing text for version, condition, pricing, and seller/listing risk.",
    "Use the ruleReport as a baseline. You may clarify and enrich it, but do not remove important missing evidence.",
    "Do not accuse the seller of fraud. Use risk-indicator language.",
    "Do not claim a card is certainly PSA10 or safe for grading without evidence.",
    "Return only JSON matching the listing_risk_report schema.",
  ].join("\n");
}

function buildAuthenticitySystemPrompt() {
  return [
    "You are the Authenticity & Seller Agent for CardPlan AI.",
    "Assess counterfeit and authenticity risk for TCG listings: resealed or non-genuine sealed product, bootleg or proxy single cards, and seller credibility.",
    "Use the authenticityRule baseline. You may clarify and enrich it, but do not remove important counterfeit or seller-credibility signals.",
    "Do not accuse the seller of fraud and do not declare the item fake. Use risk-indicator and verification language.",
    "Be especially cautious with sealed boxes, high-value singles, individual or low-history sellers, and domestic-premium markets.",
    "Return only JSON matching the authenticity_assessment schema.",
  ].join("\n");
}

function buildBuySellSystemPrompt() {
  return [
    "You are the Buy/Sell Decision Agent for CardPlan AI.",
    "You receive a deterministic baseline decision plus screening signals (listing risk, authenticity, raw-vs-slab).",
    "Do not change the baseline stance, price-vs-comp, budget-fit, expected-value notes, or any number; those are computed deterministically.",
    "You may add clearer reasoning, buy/pass/sell conditions, risks, missing information, and next actions that respect the user's goal, risk level, holding period, deck need, version notes, and reprint risk.",
    "Use conditional language. Do not promise profit, do not say the user must buy, and do not guarantee authenticity or grades.",
    "Return only JSON matching the buy_sell_decision schema, keeping the baseline stance and numeric fields unchanged.",
  ].join("\n");
}

function mergeBuySell(rule: BuySellDecision, ai: BuySellDecision): BuySellDecision {
  // Deterministic stance, numbers, and narrative anchors stay authoritative; AI text is additive.
  return {
    ...ai,
    cardName: rule.cardName,
    action: rule.action,
    stance: rule.stance,
    priceVsComp: rule.priceVsComp,
    budgetFit: rule.budgetFit,
    expectedValueNote: rule.expectedValueNote,
    linkedSignals: rule.linkedSignals,
    reasoning: mergeStrings(rule.reasoning, ai.reasoning),
    buyConditions: mergeStrings(rule.buyConditions, ai.buyConditions),
    passConditions: mergeStrings(rule.passConditions, ai.passConditions),
    sellConditions: mergeStrings(rule.sellConditions, ai.sellConditions),
    risks: mergeStrings(rule.risks, ai.risks),
    missingInfo: mergeStrings(rule.missingInfo, ai.missingInfo),
    nextActions: mergeStrings(rule.nextActions, ai.nextActions),
    assumptions: mergeStrings(rule.assumptions, ai.assumptions),
  };
}

type SubAgentOutcome<T> = {
  data: T;
  model: string;
  fallback: boolean;
  warning?: string;
};

async function runSubAgent<T>(args: {
  provider: AiProvider;
  config: AiConfig;
  schemaName: string;
  schema: z.ZodType<T>;
  system: string;
  user: unknown;
  fallback: T;
  agentName: string;
}): Promise<SubAgentOutcome<T>> {
  try {
    const ai = await args.provider.completeJson({
      role: "primary",
      schemaName: args.schemaName,
      schema: args.schema,
      system: args.system,
      user: args.user,
    });
    return { data: ai.data, model: ai.model, fallback: false };
  } catch (error) {
    return {
      data: args.fallback,
      model: `${args.config.provider} unavailable`,
      fallback: true,
      warning: `${args.agentName} used local fallback. ${getErrorMessage(error)}`,
    };
  }
}

function mergeAuthenticity(rule: AuthenticityAssessment, ai: AuthenticityAssessment): AuthenticityAssessment {
  return {
    ...ai,
    authenticityRisk: higherRiskScore(rule.authenticityRisk, ai.authenticityRisk),
    counterfeitSignals: mergeStrings(rule.counterfeitSignals, ai.counterfeitSignals),
    sellerCredibilitySignals: mergeStrings(rule.sellerCredibilitySignals, ai.sellerCredibilitySignals),
    authenticityQuestions: mergeStrings(rule.authenticityQuestions, ai.authenticityQuestions),
  };
}

function mergeRiskReports(ruleReport: ListingRiskReport, aiReport: ListingRiskReport): ListingRiskReport {
  return {
    ...aiReport,
    score: higherRiskScore(ruleReport.score, aiReport.score),
    confidence: lowerConfidence(ruleReport.confidence, aiReport.confidence),
    missingInfo: mergeStrings(ruleReport.missingInfo, aiReport.missingInfo),
    keyRisks: mergeStrings(ruleReport.keyRisks, aiReport.keyRisks),
    sellerQuestions: mergeStrings(ruleReport.sellerQuestions, aiReport.sellerQuestions),
  };
}

function mergeStrings(left: string[], right: string[]) {
  return Array.from(new Set([...left, ...right])).filter(Boolean);
}

function higherRiskScore(left: ListingRiskReport["score"], right: ListingRiskReport["score"]) {
  const order = ["Low", "Medium", "Medium-High", "High"] as const;
  return order[Math.max(order.indexOf(left), order.indexOf(right))];
}

function lowerConfidence(left: ListingRiskReport["confidence"], right: ListingRiskReport["confidence"]) {
  const order = ["Low", "Medium-low", "Medium", "High"] as const;
  return order[Math.min(order.indexOf(left), order.indexOf(right))];
}

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}
