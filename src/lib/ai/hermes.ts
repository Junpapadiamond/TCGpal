import { z } from "zod";
import { runCriticAgent } from "@/lib/ai/critic";
import { getAiConfig, getModelForStep, getPrimaryAgentForTask } from "@/lib/ai/config";
import { createAiProvider } from "@/lib/ai/provider";
import { mergeUserFacingStrings, sanitizeUserFacingText } from "@/lib/ai/report-cleanup";
import { analyzeListingRiskText, buildJournalDraft, runRawVsSlabCalculator } from "@/lib/ai/tools";
import { generatePlan } from "@/lib/plan-generator";
import {
  generatedPlanSetSchema,
  hermesRequestSchema,
  hermesResponseSchema,
  journalDraftSchema,
  listingRiskReportSchema,
  type AgentTraceStep,
  type HermesRequest,
  type HermesResponse,
  type HermesTaskType,
  type ListingRiskReport,
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
    const ruleReport = analyzeListingRiskText(request.listingInput);

    try {
      const ai = await provider.completeJson({
        role: "primary",
        schemaName: "listing_risk_report",
        schema: listingRiskReportSchema,
        system: buildListingRiskSystemPrompt(),
        user: {
          context,
          listingInput: request.listingInput,
          ruleReport,
        },
      });

      result = mergeRiskReports(ruleReport, ai.data);
      trace.push({
        step: "analyze_listing",
        agent: "Listing Risk Agent",
        model: ai.model,
        toolsUsed: ["analyzeListingRiskText"],
        summary: "Listing Risk Agent combined rule-based screening with AI explanation.",
      });
    } catch (error) {
      fallbackUsed = true;
      result = ruleReport;
      warnings.push(`Listing Risk Agent used local fallback. ${getErrorMessage(error)}`);
      trace.push({
        step: "analyze_listing",
        agent: "Listing Risk Agent",
        model: `${config.provider} unavailable`,
        toolsUsed: ["analyzeListingRiskText fallback"],
        summary: "Listing Risk Agent fell back to deterministic text-risk logic.",
      });
    }
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
      journalEntry: request.journalEntry,
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
  if (request.listingInput) return "LISTING_RISK_CHECK";
  if (request.planInput) return "PLAN_GENERATION";
  if (request.rawInput || request.rawResult) return "RAW_VS_SLAB_EXPLAIN";
  return "JOURNAL_DRAFT";
}

function buildPlanSystemPrompt() {
  return [
    "You are the Plan Agent for TCGpal, a cautious planning layer for TCG collectors and small sellers.",
    "Generate exactly three plans: Conservative, Balanced, Aggressive.",
    "Use conditional language. Do not promise profit. Do not say the user must buy anything.",
    "Every plan must include budget split, buy conditions, do-not-buy conditions, sell conditions, risks, and next actions.",
    "Respect the user's budget, goal, risk level, holding period, market, and grading preference.",
    "Return only JSON matching the generated_plan_set schema.",
  ].join("\n");
}

function buildListingRiskSystemPrompt() {
  return [
    "You are the Listing Risk Agent for TCGpal.",
    "Analyze pasted marketplace listing text for version, condition, pricing, and seller/listing risk.",
    "Use the ruleReport as a baseline. You may clarify and enrich it, but do not remove important missing evidence.",
    "Do not accuse the seller of fraud. Use risk-indicator language.",
    "Do not claim a card is certainly PSA10 or safe for grading without evidence.",
    "Return only JSON matching the listing_risk_report schema.",
  ].join("\n");
}

function mergeRiskReports(ruleReport: ListingRiskReport, aiReport: ListingRiskReport): ListingRiskReport {
  return {
    ...aiReport,
    score: higherRiskScore(ruleReport.score, aiReport.score),
    confidence: lowerConfidence(ruleReport.confidence, aiReport.confidence),
    suitability: sanitizeUserFacingText(aiReport.suitability),
    cautiousSummary: sanitizeUserFacingText(aiReport.cautiousSummary),
    missingInfo: mergeUserFacingStrings(ruleReport.missingInfo, aiReport.missingInfo),
    keyRisks: mergeUserFacingStrings(ruleReport.keyRisks, aiReport.keyRisks),
    sellerQuestions: mergeUserFacingStrings(ruleReport.sellerQuestions, aiReport.sellerQuestions),
  };
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
