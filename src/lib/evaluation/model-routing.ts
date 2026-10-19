import { z } from "zod";
import type { AiProvider } from "@/lib/ai/provider";
import { triageFailures, type AccuracyResult } from "./card-accuracy";

const modelSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/)
  .refine(model => /^(?:claude-(?:opus|sonnet)-|gpt-[56](?:[.-]|$))/.test(model)
    && !/(?:haiku|mini|nano|luna)/i.test(model), "Configure a strong Opus, Sonnet or GPT model, never Haiku/mini/nano/luna.");
export const evaluationHistorySchema = z.array(z.object({ model: modelSchema,
  status: z.enum(["provisional", "unavailable", "rejected", "skipped"]),
})).max(100);
export type EvaluationHistory = z.infer<typeof evaluationHistorySchema>;

// Routing measures availability/schema validity, not truthfulness. Labels and
// deterministic scores never become model-controlled. No model probing calls.
export function selectEvaluationModel(models: string[], history: EvaluationHistory) {
  const allowed = z.array(modelSchema).min(1).max(3).parse(models);
  const recent = evaluationHistorySchema.parse(history).slice(-20);
  const score = (model: string) => {
    const last = recent.filter(r => r.model === model && r.status !== "skipped").slice(-5);
    return last.length ? last.filter(r => r.status === "provisional").length / last.length : 0.5;
  };
  return [...allowed].sort((a, b) => score(b) - score(a) || allowed.indexOf(a) - allowed.indexOf(b))[0];
}

export async function reviewWithModels(result: AccuracyResult, models: string[], history: EvaluationHistory,
  createProvider: (model: string) => AiProvider) {
  const selectedModel = selectEvaluationModel(models, history);
  const triage = await triageFailures(result, createProvider(selectedModel));
  const updated = [...history, { model: selectedModel, status: triage.status }].slice(-100);
  return { selectedModel, triage, history: evaluationHistorySchema.parse(updated) };
}
