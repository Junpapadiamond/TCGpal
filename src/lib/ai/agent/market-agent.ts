import { z } from "zod";
import { getAiConfig, type AiConfig, type AiReasoningEffort } from "@/lib/ai/config";
import {
  runAgent,
  type AgentDecision,
  type AgentMessage,
  type AgentModel,
  type AgentTool,
} from "@/lib/ai/agent/harness";
import {
  getPlatformAgents,
  runPlatformFanout,
  searchPlatformWithTimeout,
  skippedPlatformResult,
  summarizePlatformOutcome,
  type PlatformAgent,
  type PlatformFanout,
  type PlatformSeed,
} from "@/lib/comparison/platforms";
import type {
  BuyerContext,
  CardIdentityCandidate,
  ComparisonPlatformResult,
  ComparisonTrace,
} from "@/lib/schemas";

// The model-driven multi-agent path. By default the cross-platform comparison
// runs the DETERMINISTIC fan-out (every configured marketplace searched in
// parallel) — that is the guaranteed floor and never depends on a model. When
// COMPARISON_AGENT is enabled AND an allocator key is configured, the same
// platform adapters are exposed to the generic runAgent harness as tools, so the
// model can act as the allocator that decides how to search each marketplace.
// Either way the budget hard-stop and deterministic ranking are unchanged, and
// any agent failure degrades to the deterministic result — this only ever adds.
//
// The allocator is a model-routed tool job backstopped by deterministic code, so
// it is configured INDEPENDENTLY of the narrative provider:
// point COMPARISON_AGENT_* at any OpenAI-compatible endpoint — including a
// Chinese provider (GLM/Kimi/DeepSeek), which speak Chat Completions, the default
// dialect here. The user-facing evidence narrative stays on its own provider.
export function isComparisonAgentEnabled() {
  return process.env.COMPARISON_AGENT === "1" || process.env.COMPARISON_AGENT === "true";
}

const AGENT_REQUEST_TIMEOUT_MS = 9000;
// Hard wall-clock cap on the whole allocator loop. The route has a 30s budget and
// buildNarrative can take up to 12s after this, so the model loop must not run
// unbounded — on deadline we abandon it and return the deterministic fan-out.
const ALLOCATOR_DEADLINE_MS = 15000;

// Independent config for the allocator model. It defaults to the primary model,
// with cheaper configured fallbacks available when the primary endpoint/model
// fails. A different provider is still just COMPARISON_AGENT_BASE_URL / _MODEL /
// _API_KEY.
export type AllocatorDialect = "chat" | "responses";

export type AllocatorConfig = {
  // "chat" = OpenAI Chat Completions (works with OpenAI, GLM, Kimi, DeepSeek, …);
  // "responses" = OpenAI Responses API (OpenAI only).
  dialect: AllocatorDialect;
  model: string;
  fallbackModels: string[];
  baseUrl: string;
  apiKey: string | undefined;
  reasoningEffort: AiReasoningEffort;
  disableResponseStorage: boolean;
};

export function getAllocatorConfig(base: AiConfig = getAiConfig()): AllocatorConfig {
  const explicitBase = process.env.COMPARISON_AGENT_BASE_URL?.trim();
  const primaryModel = process.env.COMPARISON_AGENT_MODEL?.trim() || base.primaryModel;
  const fallbackModels = parseFallbackModels(process.env.COMPARISON_AGENT_FALLBACK_MODELS || process.env.COMPARISON_AGENT_FALLBACK_MODEL)
    .concat(base.cheapModel && base.cheapModel !== primaryModel ? [base.cheapModel] : [])
    .filter((model, index, models) => model !== primaryModel && models.indexOf(model) === index);
  return {
    dialect: process.env.COMPARISON_AGENT_API === "responses" ? "responses" : "chat",
    model: primaryModel,
    fallbackModels,
    baseUrl: explicitBase ? explicitBase.replace(/\/+$/, "") : base.baseUrl,
    apiKey: process.env.COMPARISON_AGENT_API_KEY || process.env.OPENAI_API_KEY,
    reasoningEffort: base.reasoningEffort,
    disableResponseStorage: base.disableResponseStorage,
  };
}

function parseFallbackModels(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

export type RunMarketSearchInput = {
  card: CardIdentityCandidate;
  buyer: BuyerContext;
  fetcher: typeof fetch;
  agents?: PlatformAgent[];
  // Injectable so tests can supply a deterministic model without a network call.
  model?: AgentModel;
  config?: AiConfig;
};

// Single entry point used by the comparison. Chooses the model allocator when it
// is enabled and usable, otherwise the deterministic fan-out — and always falls
// back to the deterministic fan-out if the allocator throws.
export async function runMarketSearch(input: RunMarketSearchInput): Promise<PlatformFanout> {
  const agents = input.agents ?? getPlatformAgents();
  const configured = agents.filter((agent) => agent.isConfigured());
  const allocator = getAllocatorConfig(input.config ?? getAiConfig());

  const canUseAgent =
    configured.length > 0
    && (input.model !== undefined || (isComparisonAgentEnabled() && Boolean(allocator.apiKey)));

  if (!canUseAgent) {
    return runPlatformFanout({ card: input.card, buyer: input.buyer, fetcher: input.fetcher, agents });
  }

  try {
    const model = input.model ?? createAgentModel(allocator);
    return await withDeadline(
      runAgentFanout({ ...input, agents, configured, model }),
      ALLOCATOR_DEADLINE_MS,
    );
  } catch {
    // The allocator is strictly additive: any failure (provider down, bad output,
    // timeout, or the wall-clock deadline) silently degrades to the deterministic
    // cross-platform fan-out, which is bounded and always available.
    return runPlatformFanout({ card: input.card, buyer: input.buyer, fetcher: input.fetcher, agents });
  }
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Allocator exceeded the ${Math.round(ms / 1000)}s deadline.`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer!));
}

// Per-agent capture of what the model's tool calls produced.
type ToolCollector = {
  seeds: Map<string, PlatformSeed[]>;
  error: Map<string, string>;
};

// Wrap each configured platform agent as a harness tool. The model calls these to
// search a marketplace; the deterministic adapter does the actual fetch, the seeds
// are captured, and a small serializable summary is returned for the trace.
export function buildPlatformTools(
  ctx: { card: CardIdentityCandidate; buyer: BuyerContext; fetcher: typeof fetch },
  agents: PlatformAgent[],
  collector: ToolCollector,
): AgentTool[] {
  return agents.map((agent) => ({
    name: `search_${agent.id}`,
    description: `Search ${agent.marketplace} for active raw-single listings of the confirmed card. Optionally pass a refined query to improve relevance.`,
    parameters: z.object({
      query: z
        .string()
        .optional()
        .describe("Optional refined search query. Omit to use the deterministic default."),
    }),
    execute: async (args) => {
      const { query } = args as { query?: string };
      try {
        const seeds = await searchPlatformWithTimeout(agent, { card: ctx.card, buyer: ctx.buyer, fetcher: ctx.fetcher, plan: { query } });
        collector.seeds.set(agent.id, seeds);
        return {
          ok: true,
          data: {
            marketplace: agent.marketplace,
            count: seeds.length,
            sample: sampleSeedsForAllocator(seeds),
          },
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown marketplace error.";
        collector.error.set(agent.id, detail);
        return { ok: false, error: detail };
      }
    },
  }));
}

async function runAgentFanout(input: {
  card: CardIdentityCandidate;
  buyer: BuyerContext;
  fetcher: typeof fetch;
  agents: PlatformAgent[];
  configured: PlatformAgent[];
  model: AgentModel;
}): Promise<PlatformFanout> {
  const collector: ToolCollector = { seeds: new Map(), error: new Map() };
  const tools = buildPlatformTools(input, input.configured, collector);

  const goal = [
    `Find active raw-single listings for ${input.card.name} (${input.card.setName} ${input.card.cardNumber}).`,
    `Identity hints: set ${input.card.setCode || "unknown"}, language ${input.card.language || "unknown"}, rarity ${input.card.rarity ?? "unknown"}.`,
    input.card.tcgplayerProductId ? `TCGplayer product hint: #${input.card.tcgplayerProductId}.` : "",
    input.buyer.desiredCondition !== "Unknown" ? `Buyer prefers ${input.buyer.desiredCondition} condition.` : "",
    `Search every available marketplace tool: ${input.configured.map((a) => a.marketplace).join(", ")}.`,
    "Use the exact collector number and set/code in the query; if a tool sample looks thin, wrong-language, or off-version, re-query once with a tighter query within the budget.",
    "Refine each query so it targets the exact card and version. Prefer calling every marketplace tool in one turn.",
  ].filter(Boolean).join(" ");

  const run = await runAgent({ model: input.model, tools, goal, maxSteps: 1 });
  const modelCalledTools = run.steps.some((step) => step.type === "tool_call");
  const allocationComplete = run.stoppedReason === "final" || modelCalledTools;

  const traces: ComparisonTrace[] = [
    {
      step: "agent_allocation",
      actor: `Market allocator · ${input.model.activeName?.() ?? input.model.name}`,
      summary:
        allocationComplete
          ? "The model allocated the cross-platform search across the marketplace tools; deterministic coverage filled any skipped source."
          : `The allocator stopped early (${run.stoppedReason}); deterministic search covered the rest.`,
      status: allocationComplete ? "complete" : "fallback",
    },
  ];

  const seeds: PlatformSeed[] = [];
  const warnings: string[] = [];
  const results: ComparisonPlatformResult[] = [];

  for (const agent of input.configured) {
    // Safety net: if the model never (successfully) searched a configured platform,
    // run it deterministically so coverage always equals the plain fan-out.
    if (!collector.seeds.has(agent.id) && !collector.error.has(agent.id)) {
      try {
        collector.seeds.set(agent.id, await searchPlatformWithTimeout(agent, { card: input.card, buyer: input.buyer, fetcher: input.fetcher }));
      } catch (error) {
        collector.error.set(agent.id, error instanceof Error ? error.message : "Unknown marketplace error.");
      }
    }

    // Same shared builder as the deterministic fan-out so trace/result/warning
    // shapes can never drift between the two cross-platform paths.
    const agentSeeds = collector.seeds.get(agent.id);
    const summary = summarizePlatformOutcome(
      agentSeeds !== undefined ? { agent, seeds: agentSeeds } : { agent, error: collector.error.get(agent.id) ?? "Unknown marketplace error." },
    );
    seeds.push(...summary.seeds);
    traces.push(summary.trace);
    results.push(summary.result);
    if (summary.warning) warnings.push(summary.warning);
  }

  for (const agent of input.agents) {
    if (!agent.isConfigured()) results.push(skippedPlatformResult(agent));
  }

  return { seeds, traces, warnings, results, configuredCount: input.configured.length };
}

function sampleSeedsForAllocator(seeds: PlatformSeed[]) {
  return seeds.slice(0, 3).map((seed) => ({
    title: seed.title,
    marketplace: seed.marketplace,
    price: seed.price,
    shipping: seed.shipping,
    condition: seed.claimedCondition,
    matchConfidence: seed.matchConfidence,
    reasons: seed.matchReasons.slice(0, 2),
  }));
}

const AGENT_SYSTEM_PROMPT = [
  "You are TCGlens' cross-platform market allocator.",
  "You decide how to search each marketplace tool for the exact confirmed card.",
  "Only use the provided tools. Never invent listings, prices, or sold comps.",
  "Call every relevant marketplace tool in one turn when possible; deterministic TypeScript handles ranking and final prose.",
].join("\n");

// Build the harness's AgentModel from the allocator config, in whichever dialect
// the configured endpoint speaks.
export function createAgentModel(cfg: AllocatorConfig = getAllocatorConfig()): AgentModel {
  const modelNames = [cfg.model, ...cfg.fallbackModels];
  const models = modelNames.map((model) => cfg.dialect === "responses"
    ? createResponsesAgentModel({ ...cfg, model, fallbackModels: [] })
    : createChatCompletionsAgentModel({ ...cfg, model, fallbackModels: [] }));
  let activeIndex = 0;
  let activeName = models[0]?.name ?? cfg.model;

  return {
    name: cfg.model,
    activeName: () => activeName,
    decide: async (input) => {
      const errors: string[] = [];
      for (let index = activeIndex; index < models.length; index += 1) {
        const model = models[index];
        if (!model) continue;
        try {
          const decision = await model.decide(input);
          activeIndex = index;
          activeName = model.name;
          return decision;
        } catch (error) {
          errors.push(`${model.name}: ${error instanceof Error ? error.message : String(error)}`);
          activeIndex = Math.min(index + 1, models.length - 1);
        }
      }
      throw new Error(`All allocator models failed: ${errors.join(" | ")}`);
    },
  };
}

// OpenAI Chat Completions function-calling — the broadly-compatible dialect
// (OpenAI, GLM, Kimi, DeepSeek, and most "OpenAI-compatible" endpoints).
export function createChatCompletionsAgentModel(cfg: AllocatorConfig): AgentModel {
  return {
    name: cfg.model,
    decide: async ({ messages, tools }) => {
      const response = await fetchWithTimeout(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.model,
          tool_choice: "auto",
          tools: tools.map((tool) => ({
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: z.toJSONSchema(tool.parameters) },
          })),
          messages: toChatMessages(messages),
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`Agent model ${response.status}: ${message.slice(0, 300)}`);
      }

      return toChatDecision((await response.json()) as unknown);
    },
  };
}

// OpenAI Responses function-calling — OpenAI-only dialect, kept for callers that
// prefer it (COMPARISON_AGENT_API=responses).
export function createResponsesAgentModel(cfg: AllocatorConfig): AgentModel {
  return {
    name: cfg.model,
    decide: async ({ messages, tools }) => {
      const response = await fetchWithTimeout(`${cfg.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.model,
          reasoning: { effort: cfg.reasoningEffort },
          store: !cfg.disableResponseStorage,
          tool_choice: "auto",
          tools: tools.map((tool) => ({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: z.toJSONSchema(tool.parameters),
          })),
          input: toResponsesInput(messages),
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`Agent model ${response.status}: ${message.slice(0, 300)}`);
      }

      return toAgentDecision((await response.json()) as unknown);
    },
  };
}

// Back-compat wrapper: an AgentModel from an AiConfig over the Responses dialect,
// using the cheap model. Kept for existing callers/tests.
export function createOpenAiAgentModel(config: AiConfig = getAiConfig()): AgentModel {
  return createResponsesAgentModel({
    dialect: "responses",
    model: config.cheapModel,
    fallbackModels: [],
    baseUrl: config.baseUrl,
    apiKey: process.env.OPENAI_API_KEY,
    reasoningEffort: config.reasoningEffort,
    disableResponseStorage: config.disableResponseStorage,
  });
}

// ---- Chat Completions wire mapping ----

function toChatMessages(messages: AgentMessage[]) {
  const out: Array<Record<string, unknown>> = [{ role: "system", content: AGENT_SYSTEM_PROMPT }];

  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "tool") {
      out.push({ role: "tool", tool_call_id: message.toolCallId, content: JSON.stringify(message.result) });
      continue;
    }
    // assistant
    if (message.toolCalls?.length) {
      out.push({
        role: "assistant",
        // null (not "") alongside tool_calls — some OpenAI-compatible endpoints
        // (incl. some Chinese providers) reject an empty-string content here.
        content: message.output || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
        })),
      });
    } else if (message.output) {
      out.push({ role: "assistant", content: message.output });
    }
  }

  return out;
}

function toChatDecision(payload: unknown): AgentDecision {
  if (typeof payload !== "object" || payload === null || !("choices" in payload)) {
    throw new Error("Chat Completions response had no choices.");
  }
  const choices = (payload as { choices: unknown }).choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message = first && typeof first === "object" && "message" in first ? (first as { message: unknown }).message : undefined;
  if (!message || typeof message !== "object") {
    throw new Error("Chat Completions response had no message.");
  }

  const rawToolCalls = "tool_calls" in message ? (message as { tool_calls: unknown }).tool_calls : undefined;
  const toolCalls: { id: string; name: string; args: unknown }[] = [];
  if (Array.isArray(rawToolCalls)) {
    rawToolCalls.forEach((call, index) => {
      if (!call || typeof call !== "object") return;
      const fn = "function" in call ? (call as { function?: { name?: unknown; arguments?: unknown } }).function : undefined;
      const id = "id" in call && typeof (call as { id?: unknown }).id === "string" ? (call as { id: string }).id : `call_${index}`;
      toolCalls.push({ id, name: String(fn?.name ?? ""), args: parseArgs(typeof fn?.arguments === "string" ? fn.arguments : undefined) });
    });
  }

  if (toolCalls.length > 0) {
    return { kind: "tool_calls", toolCalls };
  }

  const content = "content" in message ? (message as { content?: unknown }).content : undefined;
  return { kind: "final", output: typeof content === "string" && content.trim() ? content.trim() : "Search complete." };
}

// ---- Responses wire mapping ----

function toResponsesInput(messages: AgentMessage[]) {
  const input: Array<Record<string, unknown>> = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
  ];

  for (const message of messages) {
    if (message.role === "user") {
      input.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "tool") {
      input.push({ type: "function_call_output", call_id: message.toolCallId, output: JSON.stringify(message.result) });
      continue;
    }
    // assistant
    if (message.toolCalls?.length) {
      for (const call of message.toolCalls) {
        input.push({ type: "function_call", call_id: call.id, name: call.name, arguments: JSON.stringify(call.args ?? {}) });
      }
    }
    if (message.output) {
      input.push({ role: "assistant", content: message.output });
    }
  }

  return input;
}

function toAgentDecision(payload: unknown): AgentDecision {
  if (typeof payload !== "object" || payload === null || !("output" in payload) || !Array.isArray((payload as { output: unknown }).output)) {
    throw new Error("Responses output array missing.");
  }

  const output = (payload as { output: unknown[] }).output;
  const toolCalls: { id: string; name: string; args: unknown }[] = [];
  const textChunks: string[] = [];

  for (const item of output) {
    if (typeof item !== "object" || item === null || !("type" in item)) continue;
    const type = (item as { type: unknown }).type;

    if (type === "function_call") {
      const call = item as { call_id?: string; id?: string; name?: string; arguments?: string };
      toolCalls.push({
        id: call.call_id ?? call.id ?? `call_${toolCalls.length}`,
        name: String(call.name ?? ""),
        args: parseArgs(call.arguments),
      });
      continue;
    }

    if (type === "message" && "content" in item && Array.isArray((item as { content: unknown }).content)) {
      for (const part of (item as { content: { type?: string; text?: string }[] }).content) {
        if (part && typeof part.text === "string") textChunks.push(part.text);
      }
    }
  }

  if (toolCalls.length > 0) {
    return { kind: "tool_calls", toolCalls };
  }

  return { kind: "final", output: textChunks.join("\n").trim() || "Search complete." };
}

function parseArgs(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = AGENT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
