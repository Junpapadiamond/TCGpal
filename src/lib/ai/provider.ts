import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import type { AiConfig, AiModelRole } from "@/lib/ai/config";
import { getModelForStep } from "@/lib/ai/config";

type CompleteJsonInput<T> = {
  role: AiModelRole;
  schemaName: string;
  schema: z.ZodType<T>;
  system: string;
  user: unknown;
};

export type AiProviderResult<T> = {
  data: T;
  model: string;
  provider: string;
};

export type AiProvider = {
  completeJson<T>(input: CompleteJsonInput<T>): Promise<AiProviderResult<T>>;
};

export type AiProbeResult = {
  ok: boolean;
  status?: number;
  warning?: string;
};

export function createAiProvider(config: AiConfig): AiProvider {
  if (config.provider !== "openai") {
    return new UnavailableProvider(config.provider);
  }

  if (!config.hasApiKey) {
    return new UnavailableProvider("openai");
  }

  return new OpenAiResponsesProvider(config);
}

export async function probeAnthropicModel(config: AiConfig): Promise<AiProbeResult> {
  const token = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  if (!token) {
    return {
      ok: false,
      warning: "Anthropic auth token is missing. AI actions will use local fallback.",
    };
  }

  try {
    const response = await fetch(`${config.anthropicBaseUrl}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": token,
        Authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.anthropicModel,
        max_tokens: 16,
        messages: [
          {
            role: "user",
            content: "Return the word ok.",
          },
        ],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      return {
        ok: false,
        status: response.status,
        warning: `Anthropic ${response.status}: ${message.slice(0, 240)}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      warning: error instanceof Error ? error.message : "Unknown Anthropic health check error.",
    };
  }
}

class UnavailableProvider implements AiProvider {
  constructor(private readonly providerName: string) {}

  async completeJson<T>(): Promise<AiProviderResult<T>> {
    throw new Error(`${this.providerName} provider is not configured for this local demo.`);
  }
}

class OpenAiResponsesProvider implements AiProvider {
  constructor(private readonly config: AiConfig) {}

  async completeJson<T>({ role, schemaName, schema, system, user }: CompleteJsonInput<T>): Promise<AiProviderResult<T>> {
    const model = getModelForStep(role, this.config);
    const response = await fetch(`${this.config.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: {
          effort: this.config.reasoningEffort,
        },
        store: !this.config.disableResponseStorage,
        text: {
          format: zodTextFormat(schema, schemaName),
        },
        input: [
          {
            role: "system",
            content: system,
          },
          {
            role: "user",
            content: [
              "Return only valid JSON. Do not wrap it in markdown.",
              `JSON schema name: ${schemaName}`,
              JSON.stringify(user, null, 2),
            ].join("\n\n"),
          },
        ],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`OpenAI ${response.status}: ${message.slice(0, 500)}`);
    }

    const payload = (await response.json()) as unknown;
    const text = extractResponseText(payload);
    const parsedJson = parseJsonObject(text);
    const parsed = schema.safeParse(parsedJson);

    if (!parsed.success) {
      throw new Error(`AI output failed ${schemaName} validation: ${parsed.error.message}`);
    }

    return {
      data: parsed.data,
      model,
      provider: "openai",
    };
  }
}

export async function probeOpenAiModel(model: string): Promise<AiProbeResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      warning: "OpenAI API key is missing. AI actions will use local fallback.",
    };
  }

  try {
    const config = {
      baseUrl: normalizeProbeBaseUrl(process.env.OPENAI_BASE_URL),
      reasoningEffort: normalizeProbeReasoningEffort(process.env.OPENAI_REASONING_EFFORT),
      disableResponseStorage: process.env.OPENAI_DISABLE_RESPONSE_STORAGE === "true" || process.env.OPENAI_DISABLE_RESPONSE_STORAGE === "1",
    };
    const response = await fetch(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: "Return the word ok.",
        reasoning: {
          effort: config.reasoningEffort,
        },
        store: !config.disableResponseStorage,
        max_output_tokens: 16,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      return {
        ok: false,
        status: response.status,
        warning: `OpenAI ${response.status}: ${message.slice(0, 240)}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      warning: error instanceof Error ? error.message : "Unknown OpenAI health check error.",
    };
  }
}

function extractResponseText(payload: unknown) {
  if (typeof payload === "object" && payload && "output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (typeof payload !== "object" || !payload || !("output" in payload) || !Array.isArray(payload.output)) {
    throw new Error("OpenAI response did not include output text.");
  }

  const chunks: string[] = [];

  for (const item of payload.output) {
    if (typeof item !== "object" || !item || !("content" in item) || !Array.isArray(item.content)) continue;

    for (const content of item.content) {
      if (typeof content !== "object" || !content) continue;
      if ("text" in content && typeof content.text === "string") chunks.push(content.text);
      if ("output_text" in content && typeof content.output_text === "string") chunks.push(content.output_text);
    }
  }

  const text = chunks.join("\n").trim();
  if (!text) throw new Error("OpenAI response text was empty.");
  return text;
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(withoutFence);
}

function normalizeProbeBaseUrl(value: string | undefined) {
  return (value?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
}

function normalizeProbeReasoningEffort(value: string | undefined) {
  if (value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh") return value;
  return "high";
}
