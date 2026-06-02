import { z } from "zod";
import type { AiProvider } from "@/lib/ai/provider";
import { criticResultSchema, type AgentTraceStep, type CriticResult } from "@/lib/schemas";

export const bannedLanguage = [
  "guaranteed profit",
  "must buy",
  "risk-free",
  "certainly psa10",
  "definitely psa10",
  "guaranteed authentic",
  "100% authentic",
  "definitely genuine",
  "definitely real",
];

export function runLocalCritic(payload: unknown): CriticResult {
  const text = JSON.stringify(payload).toLowerCase();
  const flags = bannedLanguage.filter((phrase) => text.includes(phrase));

  return {
    passed: flags.length === 0,
    flags,
    rewrittenSummary:
      flags.length > 0
        ? "Output contains overconfident language. Rewrite it as conditional guidance with explicit assumptions and missing information."
        : undefined,
  };
}

export async function runCriticAgent(input: {
  payload: unknown;
  provider: AiProvider;
  cheapModel: string;
  trace: AgentTraceStep[];
  warnings: string[];
}) {
  const local = runLocalCritic(input.payload);

  try {
    const result = await input.provider.completeJson({
      role: "critic",
      schemaName: "critic_result",
      schema: criticResultSchema,
      system: [
        "You are the Critic / Safety Agent for CardPlan AI.",
        "Check for overconfidence, unsupported profit claims, PSA10 certainty, hidden assumptions, and financial-advice tone.",
        "Also flag unsupported authenticity guarantees (e.g. certainty that an item is genuine or fake) and any direct accusation of fraud; these should be reframed as verification steps.",
        "Return only JSON matching the schema.",
      ].join("\n"),
      user: {
        localCritic: local,
        outputToReview: input.payload,
      },
    });

    input.trace.push({
      step: "critic_review",
      agent: "Critic / Safety Agent",
      model: result.model,
      toolsUsed: ["banned_language_scan"],
      summary: result.data.passed ? "Critic passed the AI output." : `Critic flagged: ${result.data.flags.join(", ")}`,
    });

    return mergeCriticResults(local, result.data);
  } catch (error) {
    input.warnings.push(`Critic AI unavailable; used local safety scan. ${getErrorMessage(error)}`);
    input.trace.push({
      step: "critic_review",
      agent: "Critic / Safety Agent",
      model: `local + ${input.cheapModel} fallback`,
      toolsUsed: ["banned_language_scan"],
      summary: local.passed ? "Local critic passed the output." : `Local critic flagged: ${local.flags.join(", ")}`,
    });
    return local;
  }
}

function mergeCriticResults(local: CriticResult, ai: CriticResult): CriticResult {
  const flags = Array.from(new Set([...local.flags, ...ai.flags]));
  return {
    passed: local.passed && ai.passed && flags.length === 0,
    flags,
    rewrittenSummary: ai.rewrittenSummary || local.rewrittenSummary,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}
