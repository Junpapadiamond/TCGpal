import { z } from "zod";
import { getAiConfig, getModelForStep, type AiConfig } from "@/lib/ai/config";
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
// COMPARISON_AGENT is enabled AND an AI provider is configured, the same platform
// adapters are exposed to the generic runAgent harness as tools, so the model can
// act as the allocator that decides how to search each marketplace. Either way the
// budget hard-stop and deterministic ranking are unchanged, and any agent failure
// degrades to the deterministic result — so this only ever adds, never weakens.
export function isComparisonAgentEnabled() {
  return process.env.COMPARISON_AGENT === "1" || process.env.COMPARISON_AGENT === "true";
}

const AGENT_REQUEST_TIMEOUT_MS = 12000;

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
  const config = input.config ?? getAiConfig();

  const canUseAgent =
    configured.length > 0
    && (input.model !== undefined || (isComparisonAgentEnabled() && config.hasApiKey));

  if (!canUseAgent) {
    return runPlatformFanout({ card: input.card, buyer: input.buyer, fetcher: input.fetcher, agents });
  }

  try {
    const model = input.model ?? createOpenAiAgentModel(config);
    return await runAgentFanout({ ...input, agents, configured, model });
  } catch {
    // The allocator is strictly additive: any failure (provider down, bad output,
    // timeout) silently degrades to the deterministic cross-platform fan-out.
    return runPlatformFanout({ card: input.card, buyer: input.buyer, fetcher: input.fetcher, agents });
  }
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
        const seeds = await agent.search({ card: ctx.card, buyer: ctx.buyer, fetcher: ctx.fetcher, plan: { query } });
        collector.seeds.set(agent.id, seeds);
        return { ok: true, data: { marketplace: agent.marketplace, count: seeds.length } };
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
    `Search every available marketplace tool: ${input.configured.map((a) => a.marketplace).join(", ")}.`,
    "Refine each query so it targets the exact card and version. When you have searched the marketplaces, finalize.",
  ].join(" ");

  const run = await runAgent({ model: input.model, tools, goal, maxSteps: 4 });

  const traces: ComparisonTrace[] = [
    {
      step: "agent_allocation",
      actor: `Market allocator · ${input.model.name}`,
      summary:
        run.stoppedReason === "final"
          ? "The model allocated the cross-platform search across the marketplace tools."
          : `The allocator stopped early (${run.stoppedReason}); deterministic search covered the rest.`,
      status: run.stoppedReason === "final" ? "complete" : "fallback",
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
        collector.seeds.set(agent.id, await agent.search({ card: input.card, buyer: input.buyer, fetcher: input.fetcher }));
      } catch (error) {
        collector.error.set(agent.id, error instanceof Error ? error.message : "Unknown marketplace error.");
      }
    }

    const agentSeeds = collector.seeds.get(agent.id);
    const agentError = collector.error.get(agent.id);

    if (agentError && agentSeeds === undefined) {
      warnings.push(`Live ${agent.marketplace} listings could not be loaded: ${agentError}`);
      traces.push({
        step: "marketplace_search",
        actor: agent.label,
        summary: `Live ${agent.marketplace} search failed: ${agentError}`,
        status: "fallback",
      });
      results.push({ id: agent.id, marketplace: agent.marketplace, label: agent.label, status: "fallback", configured: true, count: 0, detail: agentError });
      continue;
    }

    const list = agentSeeds ?? [];
    seeds.push(...list);
    traces.push({
      step: "marketplace_search",
      actor: agent.label,
      summary: `Loaded ${list.length} live active-listing candidate${list.length === 1 ? "" : "s"}.`,
      status: "complete",
    });
    results.push({ id: agent.id, marketplace: agent.marketplace, label: agent.label, status: "complete", configured: true, count: list.length, detail: `${list.length} live candidate${list.length === 1 ? "" : "s"}.` });
  }

  for (const agent of input.agents) {
    if (agent.isConfigured()) continue;
    results.push({ id: agent.id, marketplace: agent.marketplace, label: agent.label, status: "skipped", configured: false, count: 0, detail: `Not configured (needs ${agent.requiredEnv.join(", ")}).` });
  }

  return { seeds, traces, warnings, results, configuredCount: input.configured.length };
}

// An AgentModel backed by the OpenAI Responses API with function-calling. The
// harness stays provider-agnostic; this is the OpenAI implementation of its
// `decide` contract. Tests inject a deterministic model instead.
export function createOpenAiAgentModel(config: AiConfig = getAiConfig()): AgentModel {
  const model = getModelForStep("primary", config);
  return {
    name: model,
    decide: async ({ goal, messages, tools }) => {
      const response = await fetchWithTimeout(`${config.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          reasoning: { effort: config.reasoningEffort },
          store: !config.disableResponseStorage,
          tool_choice: "auto",
          tools: tools.map((tool) => ({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: z.toJSONSchema(tool.parameters),
          })),
          input: toResponsesInput(goal, messages),
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`OpenAI ${response.status}: ${message.slice(0, 300)}`);
      }

      return toAgentDecision((await response.json()) as unknown);
    },
  };
}

const AGENT_SYSTEM_PROMPT = [
  "You are TCGpal's cross-platform market allocator.",
  "You decide how to search each marketplace tool for the exact confirmed card.",
  "Only use the provided tools. Never invent listings, prices, or sold comps.",
  "After searching the available marketplaces, stop and finalize with a one-line summary.",
].join("\n");

function toResponsesInput(goal: string, messages: AgentMessage[]) {
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

  // `goal` is already the first user message the harness seeds; nothing extra needed.
  void goal;
  return input;
}

function toAgentDecision(payload: unknown): AgentDecision {
  if (typeof payload !== "object" || payload === null || !("output" in payload) || !Array.isArray((payload as { output: unknown }).output)) {
    throw new Error("OpenAI response did not include an output array.");
  }

  const output = (payload as { output: unknown[] }).output;
  const toolCalls: { id: string; name: string; args: unknown }[] = [];
  const textChunks: string[] = [];
  let reasoning: string | undefined;

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
      continue;
    }

    if (type === "reasoning" && "summary" in item) {
      const summary = (item as { summary?: unknown }).summary;
      if (Array.isArray(summary)) {
        const text = summary.map((s) => (s && typeof s === "object" && "text" in s ? String((s as { text: unknown }).text) : "")).join(" ").trim();
        if (text) reasoning = text;
      }
    }
  }

  if (toolCalls.length > 0) {
    return { kind: "tool_calls", toolCalls, reasoning };
  }

  return { kind: "final", output: textChunks.join("\n").trim() || "Search complete.", reasoning };
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
