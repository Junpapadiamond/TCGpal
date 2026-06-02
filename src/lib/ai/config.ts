import type { HermesTaskType } from "@/lib/schemas";

export type AiProviderName = "openai" | "glm" | "kimi" | "mimo";
export type AiModelRole = "classifier" | "primary" | "critic";

export type AiConfig = {
  provider: AiProviderName;
  primaryModel: string;
  cheapModel: string;
  hasApiKey: boolean;
};

export function getAiConfig(): AiConfig {
  const provider = parseProvider(process.env.AI_PROVIDER);

  return {
    provider,
    primaryModel: process.env.OPENAI_MODEL_PRIMARY || "gpt-5.4-mini",
    cheapModel: process.env.OPENAI_MODEL_CHEAP || "gpt-5.4-nano",
    hasApiKey: provider === "openai" && Boolean(process.env.OPENAI_API_KEY),
  };
}

export function getModelForStep(role: AiModelRole, config: AiConfig = getAiConfig()) {
  return role === "primary" ? config.primaryModel : config.cheapModel;
}

export function getPrimaryAgentForTask(taskType: HermesTaskType) {
  if (taskType === "PLAN_GENERATION") return "Plan Agent";
  if (taskType === "LISTING_RISK_CHECK") return "Listing Risk Agent";
  if (taskType === "RAW_VS_SLAB_EXPLAIN") return "Calculation Explainer Agent";
  if (taskType === "BUY_SELL_DECISION") return "Buy/Sell Decision Agent";
  return "Journal Reflection Agent";
}

function parseProvider(value: string | undefined): AiProviderName {
  if (value === "glm" || value === "kimi" || value === "mimo") return value;
  return "openai";
}
