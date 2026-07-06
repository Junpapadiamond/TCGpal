import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runAgent, type AgentDecision, type AgentModel, type AgentTool } from "@/lib/ai/agent/harness";

const searchTool: AgentTool = {
  name: "search_listings",
  description: "Search a marketplace for a card.",
  parameters: z.object({ query: z.string() }),
  execute: (args) => {
    const { query } = args as { query: string };
    return { ok: true, data: { count: 2, query } };
  },
};

// A scripted model: returns the next decision in the list on each turn.
function scriptedModel(decisions: AgentDecision[]): AgentModel {
  let turn = 0;
  return {
    name: "scripted",
    decide: vi.fn(async () => decisions[Math.min(turn++, decisions.length - 1)]),
  };
}

describe("agent harness", () => {
  it("runs a tool then finalizes, recording the whole process", async () => {
    const model = scriptedModel([
      { kind: "tool_calls", reasoning: "Need listings first.", toolCalls: [{ id: "c1", name: "search_listings", args: { query: "Umbreon VMAX" } }] },
      { kind: "final", output: "Found 2 listings.", reasoning: "Enough to answer." },
    ]);

    const run = await runAgent({ model, tools: [searchTool], goal: "Find Umbreon VMAX" });

    expect(run.stoppedReason).toBe("final");
    expect(run.output).toBe("Found 2 listings.");
    const toolStep = run.steps.find((step) => step.type === "tool_call");
    expect(toolStep).toMatchObject({ tool: "search_listings", result: { ok: true, data: { count: 2 } } });
    expect(run.steps.some((step) => step.type === "reasoning")).toBe(true);
    expect(run.steps.at(-1)).toMatchObject({ type: "final" });
  });

  it("runs same-turn tool calls in parallel", async () => {
    let running = 0;
    let maxRunning = 0;
    const makeSlowTool = (name: string): AgentTool => ({
      name,
      description: name,
      parameters: z.object({}),
      execute: async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 20));
        running -= 1;
        return { ok: true, data: { name } };
      },
    });
    const model = scriptedModel([
      {
        kind: "tool_calls",
        toolCalls: [
          { id: "a", name: "search_a", args: {} },
          { id: "b", name: "search_b", args: {} },
        ],
      },
      { kind: "final", output: "done" },
    ]);

    const run = await runAgent({ model, tools: [makeSlowTool("search_a"), makeSlowTool("search_b")], goal: "search both" });

    expect(run.stoppedReason).toBe("final");
    expect(maxRunning).toBe(2);
  });

  it("enforces the budget hard-stop when the model never finalizes", async () => {
    const model = scriptedModel([
      { kind: "tool_calls", toolCalls: [{ id: "c", name: "search_listings", args: { query: "x" } }] },
    ]);

    const run = await runAgent({ model, tools: [searchTool], goal: "loop forever", maxSteps: 3 });

    expect(run.stoppedReason).toBe("budget");
    expect(run.output).toBeNull();
    expect(run.steps.filter((step) => step.type === "tool_call")).toHaveLength(3);
    expect(run.steps.at(-1)).toMatchObject({ type: "stopped", reason: "budget" });
  });

  it("returns a validation error (without throwing) for bad tool arguments", async () => {
    const model = scriptedModel([
      { kind: "tool_calls", toolCalls: [{ id: "c", name: "search_listings", args: { query: 123 } }] },
      { kind: "final", output: "done" },
    ]);

    const run = await runAgent({ model, tools: [searchTool], goal: "bad args" });

    const toolStep = run.steps.find((step) => step.type === "tool_call");
    expect(toolStep?.type === "tool_call" && toolStep.result.ok).toBe(false);
    expect(run.stoppedReason).toBe("final");
  });

  it("flags an unknown tool instead of crashing the loop", async () => {
    const model = scriptedModel([
      { kind: "tool_calls", toolCalls: [{ id: "c", name: "nope", args: {} }] },
      { kind: "final", output: "recovered" },
    ]);

    const run = await runAgent({ model, tools: [searchTool], goal: "unknown tool" });

    const toolStep = run.steps.find((step) => step.type === "tool_call");
    expect(toolStep?.type === "tool_call" && toolStep.result.error).toBe("Unknown tool.");
    expect(run.output).toBe("recovered");
  });

  it("stops cleanly if the model itself errors", async () => {
    const model: AgentModel = {
      name: "broken",
      decide: async () => {
        throw new Error("provider unavailable");
      },
    };

    const run = await runAgent({ model, tools: [searchTool], goal: "model down" });

    expect(run.stoppedReason).toBe("error");
    expect(run.steps.at(-1)).toMatchObject({ type: "stopped", reason: "error", detail: "provider unavailable" });
  });
});
