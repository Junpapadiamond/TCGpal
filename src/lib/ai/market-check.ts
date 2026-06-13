import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getAiConfig } from "@/lib/ai/config";
import { curatedRecommendations } from "@/lib/curated-recommendations";
import { buildEbaySoldSearchUrl, type EbaySoldMarketplace } from "@/lib/external/ebay-sold-link";
import { searchPokemonCards, type PokemonTcgCard } from "@/lib/external/pokemon-tcg";
import { PriceChartingUnavailableError, searchPriceChartingProducts } from "@/lib/external/price-charting";
import { runFomoCheck } from "@/lib/fomo-check";
import {
  evidenceGapCheckSchema,
  identifiedCardSchema,
  marketBudgetRulesSchema,
  marketCheckDecisionSummarySchema,
  marketCheckRequestSchema,
  marketCheckResponseSchema,
  referencePricesSchema,
  soldCompsSchema,
  type EvidenceGapCheck,
  type IdentifiedCard,
  type MarketBudgetRules,
  type MarketCheckRequest,
  type MarketCheckResponse,
  type MarketCheckSource,
  type MarketCheckToolTrace,
  type ReferencePrices,
  type SoldComps,
} from "@/lib/schemas";

type MarketCheckToolName =
  | "identify_exact_card_version"
  | "get_reference_prices"
  | "get_sold_comps"
  | "check_evidence_gaps"
  | "run_deterministic_budget_rules";

type ToolState = {
  identifiedCard?: IdentifiedCard;
  referencePrices?: ReferencePrices;
  soldComps?: SoldComps;
  evidence?: EvidenceGapCheck;
  budget?: MarketBudgetRules;
  trace: MarketCheckToolTrace[];
  sources: MarketCheckSource[];
  warnings: string[];
};

type ResponsePayload = {
  output?: unknown[];
  output_text?: string;
};

type AnthropicMessagePayload = {
  content?: unknown[];
  stop_reason?: string;
};

const MARKET_CHECK_MODEL_TIMEOUT_MS = 20000;

const toolParameters = {
  type: "object",
  properties: {},
  additionalProperties: false,
  required: [],
};

const finalMarketDecisionSchema = marketCheckDecisionSummarySchema;

export async function runMarketCheck(rawRequest: MarketCheckRequest): Promise<MarketCheckResponse> {
  const input = marketCheckRequestSchema.parse(rawRequest);
  const config = getAiConfig();
  const state = createToolState();
  const model = config.provider === "anthropic" ? config.anthropicModel : config.primaryModel;

  if (!config.hasApiKey) {
    const fallback = await runDeterministicMarketCheck(input, state, model);
    fallback.warnings.unshift(`${config.provider === "anthropic" ? "Anthropic auth token" : "OpenAI API key"} is missing. TCGpal used local deterministic tools only.`);
    return marketCheckResponseSchema.parse(fallback);
  }

  try {
    if (config.provider === "anthropic") {
      await runAnthropicToolCallingHarness(input, state, model);
    } else {
      await runOpenAiToolCallingHarness(input, state, model);
    }
    await ensureRequiredToolOutputs(input, state, model);
    const aiDecision = config.provider === "anthropic"
      ? await requestAnthropicFinalDecision(input, state, model)
      : await requestOpenAiFinalDecision(input, state, model);

    return marketCheckResponseSchema.parse({
      input,
      identifiedCard: state.identifiedCard,
      referencePrices: state.referencePrices,
      soldComps: state.soldComps,
      evidence: state.evidence,
      budget: state.budget,
      result: clampDecisionToGuardrails(aiDecision, state),
      sources: dedupeSources(state.sources),
      trace: state.trace,
      warnings: state.warnings,
      fallbackUsed: false,
      model,
    });
  } catch (error) {
    const fallbackState = createToolState();
    const fallback = await runDeterministicMarketCheck(input, fallbackState, model);
    fallback.warnings.unshift(`Market Check Agent used local fallback. ${getErrorMessage(error)}`);
    return marketCheckResponseSchema.parse(fallback);
  }
}

async function runOpenAiToolCallingHarness(input: MarketCheckRequest, state: ToolState, model: string) {
  const config = getAiConfig();
  let conversationInput: unknown = [
    {
      role: "user",
      content: [
        "Run a TCGpal market check for this Ready to Buy click.",
        "Call all five provided tools before producing any final answer.",
        JSON.stringify({
          card: {
            name: input.cardName,
            version: input.cardVersion,
            tcg: input.tcg,
            askingPrice: input.askingPrice,
          },
          profile: input.profile,
          feelingText: input.feelingText,
          evidenceText: input.evidenceText,
        }, null, 2),
      ].join("\n\n"),
    },
  ];

  for (let turn = 0; turn < 6; turn += 1) {
    const response = await fetchWithTimeout(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: buildMarketCheckInstructions(),
        input: conversationInput,
        tools: buildMarketCheckTools(),
        tool_choice: "required",
        parallel_tool_calls: false,
        reasoning: {
          effort: config.reasoningEffort,
        },
        store: !config.disableResponseStorage,
        max_output_tokens: 1200,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`OpenAI ${response.status}: ${message.slice(0, 500)}`);
    }

    const payload = (await response.json()) as ResponsePayload;
    const calls = extractToolCalls(payload);
    if (!calls.length) return;

    const outputs = [];
    for (const call of calls) {
      const output = await runMarketTool(call.name, input, state, model);
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(output),
      });
    }

    if (hasAllRequiredToolOutputs(state)) return;

    conversationInput = [
      ...extractOutputItems(payload),
      ...outputs,
    ];
  }

  throw new Error("Market Check Agent did not finish required tool calls.");
}

async function requestOpenAiFinalDecision(input: MarketCheckRequest, state: ToolState, model: string) {
  const config = getAiConfig();
  const response = await fetchWithTimeout(`${config.baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: [
        buildMarketCheckInstructions(),
        "Return the final decision JSON only. Do not claim sold comps are available when the sold_comps tool says unavailable.",
      ].join("\n\n"),
      input: [
        {
          role: "user",
          content: JSON.stringify({
            request: input,
            toolResults: {
              identifiedCard: state.identifiedCard,
              referencePrices: state.referencePrices,
              soldComps: state.soldComps,
              evidence: state.evidence,
              budget: state.budget,
            },
          }, null, 2),
        },
      ],
      text: {
        format: zodTextFormat(finalMarketDecisionSchema, "market_check_decision_summary"),
      },
      reasoning: {
        effort: config.reasoningEffort,
      },
      store: !config.disableResponseStorage,
      max_output_tokens: 900,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI final decision ${response.status}: ${message.slice(0, 500)}`);
  }

  const payload = (await response.json()) as ResponsePayload;
  const text = extractResponseText(payload);
  return finalMarketDecisionSchema.parse(parseJsonObject(text));
}

async function runAnthropicToolCallingHarness(input: MarketCheckRequest, state: ToolState, model: string) {
  const config = getAiConfig();
  const token = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  if (!token) throw new Error("Anthropic auth token is missing.");

  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            "Run a TCGpal market check for this Ready to Buy click.",
            "Call all five provided tools before producing any final answer.",
            JSON.stringify({
              card: {
                name: input.cardName,
                version: input.cardVersion,
                tcg: input.tcg,
                askingPrice: input.askingPrice,
              },
              profile: input.profile,
              feelingText: input.feelingText,
              evidenceText: input.evidenceText,
            }, null, 2),
          ].join("\n\n"),
        },
      ],
    },
  ];

  for (let turn = 0; turn < 6; turn += 1) {
    const response = await fetchWithTimeout(`${config.anthropicBaseUrl}/messages`, {
      method: "POST",
      headers: buildAnthropicHeaders(token),
      body: JSON.stringify({
        model,
        system: buildMarketCheckInstructions(),
        messages,
        tools: buildAnthropicMarketCheckTools(),
        tool_choice: { type: "any" },
        max_tokens: 1200,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Anthropic ${response.status}: ${message.slice(0, 500)}`);
    }

    const payload = (await response.json()) as AnthropicMessagePayload;
    const content = extractAnthropicContent(payload);
    const calls = content.filter(isAnthropicToolUse);
    if (!calls.length) return;

    messages.push({
      role: "assistant",
      content,
    });

    const toolResults = [];
    for (const call of calls) {
      const output = await runMarketTool(call.name, input, state, model);
      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify(output),
      });
    }

    messages.push({
      role: "user",
      content: toolResults,
    });

    if (hasAllRequiredToolOutputs(state)) return;
  }

  throw new Error("Anthropic Market Check Agent did not finish required tool calls.");
}

async function requestAnthropicFinalDecision(input: MarketCheckRequest, state: ToolState, model: string) {
  const config = getAiConfig();
  const token = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  if (!token) throw new Error("Anthropic auth token is missing.");

  const response = await fetchWithTimeout(`${config.anthropicBaseUrl}/messages`, {
    method: "POST",
    headers: buildAnthropicHeaders(token),
    body: JSON.stringify({
      model,
      system: [
        buildMarketCheckInstructions(),
        "Return JSON only matching this shape:",
        JSON.stringify({
          decision: "Buy | Ask seller | Wait | Pause",
          confidence: "low | medium | high",
          summary: "string",
          nextActions: ["string"],
          assumptions: ["string"],
          missingInformation: ["string"],
        }, null, 2),
      ].join("\n\n"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                request: input,
                toolResults: {
                  identifiedCard: state.identifiedCard,
                  referencePrices: state.referencePrices,
                  soldComps: state.soldComps,
                  evidence: state.evidence,
                  budget: state.budget,
                },
              }, null, 2),
            },
          ],
        },
      ],
      max_tokens: 900,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Anthropic final decision ${response.status}: ${message.slice(0, 500)}`);
  }

  const payload = (await response.json()) as AnthropicMessagePayload;
  const text = extractAnthropicText(payload);
  return finalMarketDecisionSchema.parse(parseJsonObject(text));
}

async function runDeterministicMarketCheck(input: MarketCheckRequest, state: ToolState, model: string): Promise<MarketCheckResponse> {
  await runMarketTool("identify_exact_card_version", input, state, model);
  await runMarketTool("get_reference_prices", input, state, model);
  await runMarketTool("get_sold_comps", input, state, model);
  await runMarketTool("check_evidence_gaps", input, state, model);
  await runMarketTool("run_deterministic_budget_rules", input, state, model);

  return marketCheckResponseSchema.parse({
    input,
    identifiedCard: state.identifiedCard,
    referencePrices: state.referencePrices,
    soldComps: state.soldComps,
    evidence: state.evidence,
    budget: state.budget,
    result: buildDeterministicDecision(state),
    sources: dedupeSources(state.sources),
    trace: state.trace,
    warnings: state.warnings,
    fallbackUsed: true,
    model,
  });
}

async function runMarketTool(name: MarketCheckToolName, input: MarketCheckRequest, state: ToolState, model: string) {
  if (name === "identify_exact_card_version") {
    state.identifiedCard = await identifyExactCardVersion(input);
    pushTrace(state, {
      step: "identify_card",
      tool: name,
      model,
      summary: `${state.identifiedCard.cardName} ${state.identifiedCard.version}`.trim(),
      sources: state.sources,
    });
    return state.identifiedCard;
  }

  if (name === "get_reference_prices") {
    state.referencePrices = await getReferencePrices(input, state.identifiedCard, state);
    pushTrace(state, {
      step: "reference_prices",
      tool: name,
      model,
      summary: state.referencePrices.available ? "Reference prices found from configured adapters or curated baseline." : "No reference price adapter returned data.",
      sources: state.sources,
    });
    return state.referencePrices;
  }

  if (name === "get_sold_comps") {
    state.soldComps = getSoldComps(input, state);
    pushTrace(state, {
      step: "sold_comps",
      tool: name,
      model,
      summary: "Sold comps provider is not configured in this phase.",
      sources: state.sources,
    });
    return state.soldComps;
  }

  if (name === "check_evidence_gaps") {
    state.evidence = checkEvidenceGaps(input, state.identifiedCard);
    pushTrace(state, {
      step: "evidence_gaps",
      tool: name,
      model,
      summary: `${state.evidence.gaps.length} evidence gaps found.`,
      sources: state.sources,
    });
    return state.evidence;
  }

  state.budget = runDeterministicBudgetRules(input);
  pushTrace(state, {
    step: "budget_rules",
    tool: name,
    model: "deterministic TypeScript",
    summary: state.budget.hardStop ? "Budget hard stop triggered." : "Asking price is inside the active budget guardrail.",
    sources: state.sources,
  });
  return state.budget;
}

async function identifyExactCardVersion(input: MarketCheckRequest): Promise<IdentifiedCard> {
  const curatedMatch = findCuratedMatch(input);
  const candidates: IdentifiedCard["candidates"] = curatedMatch
    ? [{
        name: curatedMatch.cardName,
        version: curatedMatch.version,
        source: "TCGpal curated demo data",
        imageUrl: curatedMatch.imageUrl ?? null,
        url: curatedMatch.imageSource ?? null,
      }]
    : [];
  const missing: string[] = [];

  if (input.tcg === "Pokemon" && process.env.POKEMON_TCG_API_KEY) {
    try {
      const pokemon = await searchPokemonCards({
        query: buildPokemonSearchQuery(input),
        pageSize: 5,
      });

      for (const card of pokemon.cards) {
        candidates.push({
          name: card.name,
          version: formatPokemonVersion(card),
          source: "Pokemon TCG API",
          imageUrl: card.images?.large ?? card.images?.small ?? null,
          url: card.tcgplayer?.url ?? null,
        });
      }
    } catch (error) {
      missing.push(`Pokemon TCG lookup unavailable: ${getErrorMessage(error)}`);
    }
  } else if (input.tcg === "Pokemon") {
    missing.push("Pokemon TCG lookup skipped because POKEMON_TCG_API_KEY is not configured.");
  }

  if (!input.cardVersion.trim()) {
    missing.push("Card version is not confirmed.");
  }

  const first = candidates[0];
  return identifiedCardSchema.parse({
    cardName: first?.name ?? input.cardName,
    version: first?.version ?? input.cardVersion,
    tcg: input.tcg,
    confidence: first && input.cardVersion.trim() ? "high" : first ? "medium" : "low",
    candidates: candidates.slice(0, 6),
    missing,
  });
}

async function getReferencePrices(input: MarketCheckRequest, identified: IdentifiedCard | undefined, state: ToolState): Promise<ReferencePrices> {
  const curatedMatch = findCuratedMatch(input);
  const notes: string[] = [];

  try {
    const query = [identified?.cardName ?? input.cardName, identified?.version ?? input.cardVersion].filter(Boolean).join(" ");
    const priceCharting = await searchPriceChartingProducts({ query });
    const best = priceCharting.products[0];

    state.sources.push({
      label: "PriceCharting",
      url: null,
      status: best ? "used" : "missing",
      note: best ? `Matched ${best.productName}.` : "No matching PriceCharting product was returned.",
    });

    if (best) {
      return referencePricesSchema.parse({
        available: true,
        source: "PriceCharting",
        rawLow: best.loosePrice,
        rawMid: best.completeInBoxPrice ?? best.loosePrice,
        rawHigh: best.newPrice,
        psa9: null,
        psa10: best.gradedPrice,
        notes: [
          "PriceCharting is configured, but TCGpal still treats these as reference prices rather than purchase advice.",
          ...notes,
        ],
      });
    }
  } catch (error) {
    const unavailable = error instanceof PriceChartingUnavailableError;
    state.sources.push({
      label: "PriceCharting",
      url: null,
      status: unavailable ? "unavailable" : "missing",
      note: getErrorMessage(error),
    });
  }

  if (curatedMatch) {
    state.sources.push({
      label: "TCGpal curated baseline",
      url: null,
      status: "used",
      note: "Used local curated demo prices because live reference pricing was unavailable.",
    });

    return referencePricesSchema.parse({
      available: true,
      source: "TCGpal curated baseline",
      rawLow: Math.round(curatedMatch.suggestedRawPrice * 0.9),
      rawMid: curatedMatch.suggestedRawPrice,
      rawHigh: Math.round(curatedMatch.suggestedRawPrice * 1.1),
      psa9: curatedMatch.suggestedPsa9Price,
      psa10: curatedMatch.suggestedPsa10Price,
      notes: ["Local demo baseline. Refresh with a configured pricing adapter before treating this as current market evidence."],
    });
  }

  return referencePricesSchema.parse({
    available: false,
    source: "none",
    rawLow: null,
    rawMid: null,
    rawHigh: null,
    psa9: null,
    psa10: null,
    notes: ["No configured reference pricing source returned a result."],
  });
}

function getSoldComps(input: MarketCheckRequest, state: ToolState): SoldComps {
  const soldSearch = buildEbaySoldSearchUrl({
    cardName: state.identifiedCard?.cardName ?? input.cardName,
    version: state.identifiedCard?.version ?? input.cardVersion,
    grade: extractGradingKeyword(input.cardVersion),
    marketplace: getEbayMarketplace(input.profile.preferredMarket),
  });

  state.sources.push({
    label: "Sold comps",
    url: soldSearch.url,
    status: "unavailable",
    note: "Automated sold comps are not connected. Generated a verified eBay sold-search link for manual review.",
  });

  return soldCompsSchema.parse({
    available: false,
    source: "not_configured",
    manualCheckUrl: soldSearch.url,
    lookupQuery: soldSearch.query,
    comps: [],
    notes: [
      "Automated sold comps are unavailable in this build. Use the manual eBay sold-search link to verify recent completed sales before buying.",
      `Manual lookup query: ${soldSearch.query}`,
    ],
  });
}

function checkEvidenceGaps(input: MarketCheckRequest, identified: IdentifiedCard | undefined): EvidenceGapCheck {
  const text = `${input.evidenceText} ${input.feelingText}`.toLowerCase();
  const gaps: string[] = [];
  const strengths: string[] = [];

  addEvidenceSignal(text, /front|正面/, "Front photo mentioned.", "Front photo is missing.", strengths, gaps);
  addEvidenceSignal(text, /back|背面/, "Back photo mentioned.", "Back photo is missing.", strengths, gaps);
  addEvidenceSignal(text, /corner|edge|角|边/, "Corner or edge detail mentioned.", "Corner or edge closeups are missing.", strengths, gaps);
  addEvidenceSignal(text, /surface|video|foil|holo|表面|影片|视频/, "Surface/video detail mentioned.", "Surface or video evidence is missing.", strengths, gaps);
  addEvidenceSignal(text, /sold|comp|成交|价格|pricecharting|tcgplayer|ebay/, "Price evidence mentioned.", "Recent sold comps or reference prices are missing.", strengths, gaps);
  addEvidenceSignal(text, /return|refund|seller|卖家|退/, "Seller or return context mentioned.", "Seller policy or return terms are missing.", strengths, gaps);

  if (identified?.confidence !== "high") {
    gaps.push("Exact card/version confidence is not high.");
  }

  const score = Math.max(0, Math.min(100, strengths.length * 16 - Math.max(0, gaps.length - 2) * 6));
  return evidenceGapCheckSchema.parse({
    score,
    gaps,
    strengths: strengths.length ? strengths : ["No concrete evidence signals were entered yet."],
  });
}

function runDeterministicBudgetRules(input: MarketCheckRequest): MarketBudgetRules {
  const fomo = runFomoCheck({
    cardName: input.cardName,
    cardVersion: input.cardVersion,
    askingPrice: input.askingPrice,
    todayBudget: input.profile.todayBudget,
    monthlyBudget: input.profile.monthlyBudget,
    budgetRange: input.profile.budgetRange,
    versionConfirmed: Boolean(input.cardVersion.trim()),
    feelingText: input.feelingText,
    evidenceText: input.evidenceText,
  });
  const activeBudget = input.profile.todayBudget || input.profile.monthlyBudget;

  return marketBudgetRulesSchema.parse({
    hardStop: fomo.hardStop,
    budgetStrain: fomo.budgetStrain.score,
    activeBudget,
    remainingToday: input.profile.todayBudget,
    notes: [
      ...fomo.budgetStrain.reasons,
      fomo.guardrail,
    ],
  });
}

function buildDeterministicDecision(state: ToolState) {
  const missing = [
    ...(state.identifiedCard?.missing ?? []),
    ...(state.evidence?.gaps ?? []),
    ...(state.soldComps?.available ? [] : ["Recent sold comps are unavailable."]),
    ...(state.referencePrices?.available ? [] : ["Reference prices are unavailable."]),
  ];

  if (state.budget?.hardStop) {
    return marketCheckDecisionSummarySchema.parse({
      decision: "Pause",
      confidence: "high",
      summary: "Pause. The asking price breaks the active budget guardrail, so the purchase should not move forward right now.",
      nextActions: ["Wait at least 24 hours.", "Lower the entry price below the active guardrail.", "Recheck evidence only after the budget stop clears."],
      assumptions: state.budget.notes,
      missingInformation: missing,
    });
  }

  if ((state.evidence?.score ?? 0) < 55 || (state.identifiedCard?.confidence ?? "low") !== "high") {
    return marketCheckDecisionSummarySchema.parse({
      decision: "Ask seller",
      confidence: "medium",
      summary: "Ask seller before buying. The card can stay under review, but the evidence is not strong enough for a clean buy decision.",
      nextActions: ["Ask for front/back photos and condition closeups.", "Confirm exact set, number, language, and version.", "Verify recent sold comps outside TCGpal before paying."],
      assumptions: [...(state.referencePrices?.notes ?? []), ...(state.soldComps?.notes ?? [])],
      missingInformation: missing,
    });
  }

  if (!state.soldComps?.available) {
    return marketCheckDecisionSummarySchema.parse({
      decision: "Wait",
      confidence: "medium",
      summary: "Wait for better market evidence. The budget and version look reviewable, but recent sold comps are not wired into this build.",
      nextActions: ["Check recent completed sales manually.", "Compare the ask against the raw reference range.", "Only proceed if price and condition evidence still agree."],
      assumptions: [...(state.referencePrices?.notes ?? []), ...(state.soldComps?.notes ?? [])],
      missingInformation: missing,
    });
  }

  return marketCheckDecisionSummarySchema.parse({
    decision: "Buy",
    confidence: "medium",
    summary: "Buy can be considered within guardrails, conditional on one calm reread of the price, photos, and original thesis.",
    nextActions: ["Keep purchase inside the stated budget.", "Save the thesis in the journal.", "Do not upgrade the decision if new evidence is weaker than expected."],
    assumptions: state.referencePrices?.notes ?? [],
    missingInformation: missing,
  });
}

function clampDecisionToGuardrails(decision: z.infer<typeof marketCheckDecisionSummarySchema>, state: ToolState) {
  if (!state.budget?.hardStop) {
    if (!state.soldComps?.available && decision.decision === "Buy") {
      return {
        ...decision,
        decision: "Wait" as const,
        confidence: lowerConfidence(decision.confidence, "medium"),
        missingInformation: dedupeStrings([...decision.missingInformation, "Recent sold comps are unavailable."]),
      };
    }

    return decision;
  }

  return {
    ...decision,
    decision: "Pause" as const,
    confidence: "high" as const,
    summary: decision.summary.includes("budget")
      ? decision.summary
      : `Pause because the active budget guardrail is broken. ${decision.summary}`,
    missingInformation: dedupeStrings([...decision.missingInformation, "Budget hard stop must clear before buying."]),
  };
}

async function ensureRequiredToolOutputs(input: MarketCheckRequest, state: ToolState, model: string) {
  const tools: MarketCheckToolName[] = [
    "identify_exact_card_version",
    "get_reference_prices",
    "get_sold_comps",
    "check_evidence_gaps",
    "run_deterministic_budget_rules",
  ];

  for (const tool of tools) {
    if (tool === "identify_exact_card_version" && state.identifiedCard) continue;
    if (tool === "get_reference_prices" && state.referencePrices) continue;
    if (tool === "get_sold_comps" && state.soldComps) continue;
    if (tool === "check_evidence_gaps" && state.evidence) continue;
    if (tool === "run_deterministic_budget_rules" && state.budget) continue;
    state.warnings.push(`Model did not call ${tool}; TCGpal ran it deterministically.`);
    await runMarketTool(tool, input, state, model);
  }
}

function hasAllRequiredToolOutputs(state: ToolState) {
  return Boolean(state.identifiedCard && state.referencePrices && state.soldComps && state.evidence && state.budget);
}

function buildMarketCheckTools() {
  return [
    {
      type: "function",
      name: "identify_exact_card_version",
      description: "Identify the exact TCG card/version from the user's selected card, version, TCG, and optional Pokemon TCG adapter.",
      parameters: toolParameters,
      strict: true,
    },
    {
      type: "function",
      name: "get_reference_prices",
      description: "Get reference prices from configured adapters, falling back to curated local baseline only when live pricing is unavailable.",
      parameters: toolParameters,
      strict: true,
    },
    {
      type: "function",
      name: "get_sold_comps",
      description: "Return automated sold comps only if a legal/provider-backed source is configured. When unavailable, keep sold comps unavailable and return a manual eBay sold-search link; do not claim TCGpal fetched or analyzed eBay results.",
      parameters: toolParameters,
      strict: true,
    },
    {
      type: "function",
      name: "check_evidence_gaps",
      description: "Check listing evidence gaps such as photos, condition closeups, seller policy, version clarity, and comps.",
      parameters: toolParameters,
      strict: true,
    },
    {
      type: "function",
      name: "run_deterministic_budget_rules",
      description: "Run deterministic budget and decision-heat rules. These hard-stop guardrails must override model preference.",
      parameters: toolParameters,
      strict: true,
    },
  ];
}

function getEbayMarketplace(market: MarketCheckRequest["profile"]["preferredMarket"]): EbaySoldMarketplace {
  return market === "Cardmarket" ? "DE" : "US";
}

function extractGradingKeyword(version: string) {
  const match = version.match(/\b(PSA|BGS|CGC|SGC)\s*(10|9(?:\.5)?|9|8(?:\.5)?|8)\b/i);
  if (!match) return undefined;
  return `${match[1].toUpperCase()} ${match[2]}`;
}

function buildAnthropicMarketCheckTools() {
  return buildMarketCheckTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

function buildMarketCheckInstructions() {
  return [
    "You are TCGpal Market Check Agent for a cautious TCG collector app.",
    "You must use the provided tool results only. Do not invent sold comps, marketplace history, live prices, or PSA certainty.",
    "Allowed decisions are Buy, Ask seller, Wait, Pause.",
    "Pause must be used when deterministic budget rules report hardStop true.",
    "Ask seller should be used when evidence gaps or version ambiguity block a clean decision.",
    "Wait should be used when pricing or sold comps are missing but no budget hard stop exists.",
    "Buy is only allowed when version, evidence, budget, and market references are all adequate; use conditional language.",
  ].join("\n");
}

function extractToolCalls(payload: ResponsePayload) {
  return extractOutputItems(payload).filter((item): item is { type: "function_call"; call_id: string; name: MarketCheckToolName; arguments: string } => {
    if (!isRecord(item)) return false;
    if (item.type !== "function_call") return false;
    if (typeof item.call_id !== "string" || typeof item.name !== "string") return false;
    return isMarketToolName(item.name);
  });
}

function extractOutputItems(payload: ResponsePayload) {
  return Array.isArray(payload.output) ? payload.output : [];
}

function extractResponseText(payload: ResponsePayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const chunks: string[] = [];

  for (const item of extractOutputItems(payload)) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content)) continue;
      if (typeof content.text === "string") chunks.push(content.text);
      if (typeof content.output_text === "string") chunks.push(content.output_text);
    }
  }

  const text = chunks.join("\n").trim();
  if (!text) throw new Error("OpenAI market check response text was empty.");
  return text;
}

function extractAnthropicContent(payload: AnthropicMessagePayload) {
  return Array.isArray(payload.content) ? payload.content : [];
}

function extractAnthropicText(payload: AnthropicMessagePayload) {
  const text = extractAnthropicContent(payload)
    .map((item) => isRecord(item) && item.type === "text" && typeof item.text === "string" ? item.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) throw new Error("Anthropic market check response text was empty.");
  return text;
}

function isAnthropicToolUse(value: unknown): value is { type: "tool_use"; id: string; name: MarketCheckToolName; input?: unknown } {
  return isRecord(value) &&
    value.type === "tool_use" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isMarketToolName(value.name);
}

function parseJsonObject(text: string) {
  return JSON.parse(text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, ""));
}

function createToolState(): ToolState {
  return {
    trace: [],
    sources: [],
    warnings: [],
  };
}

function pushTrace(state: ToolState, trace: MarketCheckToolTrace) {
  state.trace.push({
    ...trace,
    sources: dedupeSources(trace.sources).slice(0, 4),
  });
}

function findCuratedMatch(input: MarketCheckRequest) {
  const normalizedName = normalizeText(input.cardName);
  const normalizedVersion = normalizeText(input.cardVersion);

  return curatedRecommendations.find((card) => {
    const nameMatches = normalizeText(card.cardName) === normalizedName;
    const versionMatches = !normalizedVersion || normalizeText(card.version).includes(normalizedVersion) || normalizedVersion.includes(normalizeText(card.version));
    return card.tcg === input.tcg && nameMatches && versionMatches;
  }) ?? curatedRecommendations.find((card) => card.tcg === input.tcg && normalizeText(card.cardName).includes(normalizedName));
}

function buildPokemonSearchQuery(input: MarketCheckRequest) {
  const number = input.cardVersion.match(/\b\d{1,3}\/\d{1,3}\b/)?.[0];
  if (number) return `${input.cardName} ${number}`;
  return input.cardName;
}

function formatPokemonVersion(card: PokemonTcgCard) {
  return [
    card.set?.name,
    card.number,
    card.rarity,
  ].filter(Boolean).join(" ");
}

function addEvidenceSignal(text: string, pattern: RegExp, strength: string, gap: string, strengths: string[], gaps: string[]) {
  if (pattern.test(text)) {
    strengths.push(strength);
  } else {
    gaps.push(gap);
  }
}

function lowerConfidence(left: "low" | "medium" | "high", right: "low" | "medium" | "high") {
  const order = ["low", "medium", "high"] as const;
  return order[Math.min(order.indexOf(left), order.indexOf(right))];
}

function dedupeSources(sources: MarketCheckSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.label}-${source.status}-${source.note}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMarketToolName(value: string): value is MarketCheckToolName {
  return value === "identify_exact_card_version" ||
    value === "get_reference_prices" ||
    value === "get_sold_comps" ||
    value === "check_evidence_gaps" ||
    value === "run_deterministic_budget_rules";
}

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MARKET_CHECK_MODEL_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildAnthropicHeaders(token: string) {
  return {
    "x-api-key": token,
    Authorization: `Bearer ${token}`,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  };
}
