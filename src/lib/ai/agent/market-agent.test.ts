import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createChatCompletionsAgentModel,
  createOpenAiAgentModel,
  getAllocatorConfig,
  runMarketSearch,
  type AllocatorConfig,
} from "@/lib/ai/agent/market-agent";
import type { AgentDecision, AgentModel, AgentTool } from "@/lib/ai/agent/harness";
import type { PlatformAgent, PlatformSeed } from "@/lib/comparison/platforms";
import type { AiConfig } from "@/lib/ai/config";
import type { BuyerContext, CardIdentityCandidate, Marketplace } from "@/lib/schemas";

const card: CardIdentityCandidate = {
  id: "swsh7-215",
  name: "Umbreon VMAX",
  setName: "Evolving Skies",
  setCode: "SWSH7",
  cardNumber: "215/203",
  language: "English",
  imageUrl: null,
  confidence: "high",
  matchReasons: [],
};
const buyer: BuyerContext = { country: "US", postalCode: "10001", taxRate: 0.08, desiredCondition: "Unknown" };
const fetcher = (async () => {
  throw new Error("agents are mocked; no network");
}) as unknown as typeof fetch;

function seed(id: string, marketplace: Marketplace): PlatformSeed {
  return {
    id,
    marketplace,
    url: null,
    title: `${card.name} ${card.cardNumber}`,
    cardId: card.id,
    matchConfidence: "high",
    matchReasons: [],
    userSupplied: false,
    active: true,
    raw: true,
    currency: "USD",
    price: 1200,
    shipping: 0,
    claimedCondition: "Near Mint",
    imageUrl: null,
    seller: { feedbackPercentage: 99, feedbackCount: 100, returnsAccepted: true, topRated: false, buyerProtection: true },
    evidence: { photoCount: 3, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: true, substantiveConditionNotes: false, missing: [] },
    observedAt: new Date().toISOString(),
    demo: false,
  };
}

function ebayMock(search: PlatformAgent["search"]): PlatformAgent {
  return { id: "ebay", marketplace: "eBay", label: "eBay Browse adapter", sourceMode: "official_api", requiredEnv: ["EBAY_CLIENT_ID"], isConfigured: () => true, search };
}

function scriptedModel(decisions: AgentDecision[]): AgentModel {
  let turn = 0;
  return { name: "scripted", decide: async () => decisions[Math.min(turn++, decisions.length - 1)] };
}

const config: AiConfig = {
  provider: "openai",
  primaryModel: "gpt-test",
  cheapModel: "gpt-test",
  baseUrl: "https://api.test/v1",
  anthropicBaseUrl: "https://a/v1",
  anthropicModel: "claude",
  reasoningEffort: "low",
  disableResponseStorage: true,
  hasApiKey: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runMarketSearch", () => {
  it("uses the deterministic fan-out when no model is provided and the agent is off", async () => {
    const agents = [ebayMock(async () => [seed("ebay-1", "eBay")])];
    const result = await runMarketSearch({ card, buyer, fetcher, agents });
    expect(result.seeds.map((s) => s.id)).toEqual(["ebay-1"]);
    // No allocator step when the model never runs.
    expect(result.traces.some((t) => t.step === "agent_allocation")).toBe(false);
  });

  it("drives the platform tools through the harness when a model is injected", async () => {
    let calledWithQuery: string | undefined;
    const agents = [ebayMock(async ({ plan }) => {
      calledWithQuery = plan?.query;
      return [seed("ebay-1", "eBay")];
    })];
    const model = scriptedModel([
      { kind: "tool_calls", toolCalls: [{ id: "c1", name: "search_ebay", args: { query: "Umbreon VMAX 215/203" } }] },
      { kind: "final", output: "Searched eBay." },
    ]);

    const result = await runMarketSearch({ card, buyer, fetcher, agents, model, config });

    expect(calledWithQuery).toBe("Umbreon VMAX 215/203");
    expect(result.seeds.map((s) => s.id)).toEqual(["ebay-1"]);
    const allocator = result.traces.find((t) => t.step === "agent_allocation");
    expect(allocator?.status).toBe("complete");
    expect(result.results.find((r) => r.id === "ebay")?.status).toBe("complete");
  });

  it("covers any platform the model ignored with a deterministic search (safety net)", async () => {
    const agents = [ebayMock(async () => [seed("ebay-1", "eBay")])];
    // The model finalizes immediately without calling any tool.
    const model = scriptedModel([{ kind: "final", output: "Nothing to do." }]);

    const result = await runMarketSearch({ card, buyer, fetcher, agents, model, config });

    expect(result.seeds.map((s) => s.id)).toEqual(["ebay-1"]);
  });

  it("falls back to the deterministic fan-out if the model throws", async () => {
    const agents = [ebayMock(async () => [seed("ebay-1", "eBay")])];
    const model: AgentModel = { name: "broken", decide: async () => { throw new Error("provider down"); } };

    const result = await runMarketSearch({ card, buyer, fetcher, agents, model, config });

    // Safety net inside the agent path already covers the configured platform, so a
    // failing model still yields the deterministic result rather than nothing.
    expect(result.seeds.map((s) => s.id)).toEqual(["ebay-1"]);
  });
});

describe("createOpenAiAgentModel", () => {
  const tools: AgentTool[] = [
    { name: "search_ebay", description: "Search eBay", parameters: z.object({ query: z.string().optional() }), execute: () => ({ ok: true }) },
  ];

  it("parses a function_call into a tool_calls decision", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ output: [{ type: "function_call", call_id: "c1", name: "search_ebay", arguments: "{\"query\":\"x\"}" }] }),
      text: async () => "",
    })) as unknown as typeof fetch);

    const model = createOpenAiAgentModel(config);
    const decision = await model.decide({ goal: "find card", messages: [{ role: "user", content: "find card" }], tools });

    expect(decision.kind).toBe("tool_calls");
    if (decision.kind === "tool_calls") {
      expect(decision.toolCalls[0]?.name).toBe("search_ebay");
      expect(decision.toolCalls[0]?.args).toEqual({ query: "x" });
    }
  });

  it("parses a text message into a final decision", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: "all done" }] }] }),
      text: async () => "",
    })) as unknown as typeof fetch);

    const model = createOpenAiAgentModel(config);
    const decision = await model.decide({ goal: "g", messages: [{ role: "user", content: "g" }], tools });

    expect(decision.kind).toBe("final");
    if (decision.kind === "final") expect(decision.output).toBe("all done");
  });

  it("throws on a non-ok response so the caller can fall back", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "server error",
    })) as unknown as typeof fetch);

    const model = createOpenAiAgentModel(config);
    await expect(model.decide({ goal: "g", messages: [{ role: "user", content: "g" }], tools })).rejects.toThrow(/500/);
  });
});

describe("createChatCompletionsAgentModel (Chinese / OpenAI-compatible)", () => {
  const allocator: AllocatorConfig = {
    dialect: "chat",
    model: "glm-4-flash",
    baseUrl: "https://open.bigmodel.test/v4",
    apiKey: "sk-glm",
    reasoningEffort: "low",
    disableResponseStorage: true,
  };
  const tools: AgentTool[] = [
    { name: "search_ebay", description: "Search eBay", parameters: z.object({ query: z.string().optional() }), execute: () => ({ ok: true }) },
  ];

  it("parses a Chat Completions tool_call into a tool_calls decision", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: "assistant", tool_calls: [{ id: "c1", type: "function", function: { name: "search_ebay", arguments: "{\"query\":\"y\"}" } }] } }],
      }),
      text: async () => "",
    })) as unknown as typeof fetch);

    const model = createChatCompletionsAgentModel(allocator);
    const decision = await model.decide({ goal: "find card", messages: [{ role: "user", content: "find card" }], tools });

    expect(decision.kind).toBe("tool_calls");
    if (decision.kind === "tool_calls") {
      expect(decision.toolCalls[0]?.name).toBe("search_ebay");
      expect(decision.toolCalls[0]?.args).toEqual({ query: "y" });
    }
  });

  it("parses a Chat Completions text message into a final decision", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { role: "assistant", content: "searched eBay" } }] }),
      text: async () => "",
    })) as unknown as typeof fetch);

    const model = createChatCompletionsAgentModel(allocator);
    const decision = await model.decide({ goal: "g", messages: [{ role: "user", content: "g" }], tools });

    expect(decision.kind).toBe("final");
    if (decision.kind === "final") expect(decision.output).toBe("searched eBay");
  });

  it("throws on a non-ok response so the caller can fall back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}), text: async () => "bad gateway" })) as unknown as typeof fetch);
    const model = createChatCompletionsAgentModel(allocator);
    await expect(model.decide({ goal: "g", messages: [{ role: "user", content: "g" }], tools })).rejects.toThrow(/502/);
  });
});

describe("getAllocatorConfig", () => {
  it("defaults the allocator to the cheap model and the main base URL", () => {
    const cfg = getAllocatorConfig(config);
    expect(cfg.dialect).toBe("chat");
    expect(cfg.model).toBe(config.cheapModel);
    expect(cfg.baseUrl).toBe(config.baseUrl);
  });

  it("points the allocator at an independent endpoint/model when configured", () => {
    vi.stubEnv("COMPARISON_AGENT_BASE_URL", "https://open.bigmodel.test/v4/");
    vi.stubEnv("COMPARISON_AGENT_MODEL", "glm-4-flash");
    vi.stubEnv("COMPARISON_AGENT_API_KEY", "sk-glm");
    const cfg = getAllocatorConfig(config);
    expect(cfg.model).toBe("glm-4-flash");
    expect(cfg.baseUrl).toBe("https://open.bigmodel.test/v4"); // trailing slash trimmed
    expect(cfg.apiKey).toBe("sk-glm");
  });
});
