export type AiProviderName = "openai" | "anthropic" | "glm" | "kimi" | "mimo";
export type AiModelRole = "classifier" | "primary" | "critic";
export type AiReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type AiWireApi = "responses" | "chat";

export type AiConfig = {
  provider: AiProviderName;
  primaryModel: string;
  cheapModel: string;
  baseUrl: string;
  wireApi: AiWireApi;
  anthropicBaseUrl: string;
  anthropicModel: string;
  reasoningEffort: AiReasoningEffort;
  disableResponseStorage: boolean;
  hasApiKey: boolean;
};

export function getAiConfig(): AiConfig {
  const provider = parseProvider(process.env.AI_PROVIDER);

  return {
    provider,
    primaryModel: process.env.OPENAI_MODEL || process.env.OPENAI_MODEL_PRIMARY || "gpt-5.5",
    cheapModel: process.env.OPENAI_MODEL_REVIEW || process.env.OPENAI_MODEL_CHEAP || process.env.OPENAI_MODEL || "gpt-5.4",
    baseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL),
    wireApi: parseWireApi(process.env.OPENAI_WIRE_API || process.env.OPENAI_API),
    anthropicBaseUrl: normalizeAnthropicBaseUrl(process.env.ANTHROPIC_BASE_URL),
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
    reasoningEffort: parseReasoningEffort(process.env.OPENAI_REASONING_EFFORT),
    disableResponseStorage: parseBoolean(process.env.OPENAI_DISABLE_RESPONSE_STORAGE),
    hasApiKey: provider === "openai"
      ? Boolean(process.env.OPENAI_API_KEY)
      : provider === "anthropic"
        ? Boolean(process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY)
        : false,
  };
}

export function getModelForStep(role: AiModelRole, config: AiConfig = getAiConfig()) {
  return role === "primary" ? config.primaryModel : config.cheapModel;
}

function parseProvider(value: string | undefined): AiProviderName {
  if (value === "anthropic") return value;
  if (value === "glm" || value === "kimi" || value === "mimo") return value;
  return "openai";
}

function normalizeBaseUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "https://api.openai.com/v1";
  return trimmed.replace(/\/+$/, "");
}

function normalizeAnthropicBaseUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "https://api.anthropic.com/v1";
  return trimmed.replace(/\/+$/, "").replace(/\/v1\/messages$/, "").replace(/\/messages$/, "");
}

function parseReasoningEffort(value: string | undefined): AiReasoningEffort {
  if (value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }

  return "xhigh";
}

function parseWireApi(value: string | undefined): AiWireApi {
  const normalized = value?.trim().toLowerCase().replace(/[_-]/g, "");
  if (normalized === "chat" || normalized === "chatcompletions" || normalized === "openaicompletions" || normalized === "completions") {
    return "chat";
  }
  return "responses";
}

function parseBoolean(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes";
}
