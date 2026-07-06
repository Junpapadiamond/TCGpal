import { z } from "zod";

// A provider-agnostic agent harness. The model DECIDES which tools to call and
// reconciles their output; the tools themselves are deterministic (eBay search,
// catalog lookup, eligibility, math). Every step is recorded so the whole
// process can be shown to the user — the trust surface. A budget hard-stop in
// code guarantees the loop terminates regardless of what the model does.
//
// Real model providers (OpenAI function-calling, Anthropic tool-use) implement
// the `AgentModel` interface; tests use a deterministic mock model.

export type AgentToolResult = {
  ok: boolean;
  // Serializable so the step can be surfaced in the UI trace.
  data?: unknown;
  error?: string;
};

export type AgentTool = {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  execute: (args: unknown) => Promise<AgentToolResult> | AgentToolResult;
};

export type AgentToolCall = {
  id: string;
  name: string;
  args: unknown;
};

export type AgentDecision =
  | { kind: "tool_calls"; toolCalls: AgentToolCall[]; reasoning?: string }
  | { kind: "final"; output: string; reasoning?: string };

export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; reasoning?: string; toolCalls?: AgentToolCall[]; output?: string }
  | { role: "tool"; toolCallId: string; name: string; result: AgentToolResult };

export type AgentModel = {
  name: string;
  activeName?: () => string;
  decide: (input: { goal: string; messages: AgentMessage[]; tools: AgentTool[] }) => Promise<AgentDecision>;
};

// One entry per thing the agent did — the visible "whole process".
export type AgentStep =
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; tool: string; args: unknown; result: AgentToolResult }
  | { type: "final"; output: string }
  | { type: "stopped"; reason: "budget" | "error"; detail: string };

export type AgentRun = {
  steps: AgentStep[];
  output: string | null;
  stoppedReason: "final" | "budget" | "error";
};

export type RunAgentInput = {
  model: AgentModel;
  tools: AgentTool[];
  goal: string;
  // Budget hard-stop: the loop never runs more than this many model turns.
  maxSteps?: number;
};

const DEFAULT_MAX_STEPS = 6;

export async function runAgent({ model, tools, goal, maxSteps = DEFAULT_MAX_STEPS }: RunAgentInput): Promise<AgentRun> {
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
  const messages: AgentMessage[] = [{ role: "user", content: goal }];
  const steps: AgentStep[] = [];

  for (let turn = 0; turn < Math.max(1, maxSteps); turn += 1) {
    let decision: AgentDecision;
    try {
      decision = await model.decide({ goal, messages, tools });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      steps.push({ type: "stopped", reason: "error", detail });
      return { steps, output: null, stoppedReason: "error" };
    }

    if (decision.reasoning) {
      steps.push({ type: "reasoning", text: decision.reasoning });
    }

    if (decision.kind === "final") {
      messages.push({ role: "assistant", output: decision.output });
      steps.push({ type: "final", output: decision.output });
      return { steps, output: decision.output, stoppedReason: "final" };
    }

    messages.push({ role: "assistant", reasoning: decision.reasoning, toolCalls: decision.toolCalls });

    const toolResults = await Promise.all(
      decision.toolCalls.map(async (call) => ({
        call,
        result: await runTool(toolByName.get(call.name), call.args),
      })),
    );
    for (const { call, result } of toolResults) {
      steps.push({ type: "tool_call", tool: call.name, args: call.args, result });
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, result });
    }
  }

  steps.push({ type: "stopped", reason: "budget", detail: `Reached the ${maxSteps}-step budget without a final answer.` });
  return { steps, output: null, stoppedReason: "budget" };
}

async function runTool(tool: AgentTool | undefined, args: unknown): Promise<AgentToolResult> {
  if (!tool) {
    return { ok: false, error: "Unknown tool." };
  }
  const parsed = tool.parameters.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: `Invalid arguments: ${parsed.error.message}` };
  }
  try {
    return await tool.execute(parsed.data);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
