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
  if (config.provider === "anthropic") {
    return config.hasApiKey ? new AnthropicMessagesProvider(config) : new UnavailableProvider("anthropic");
  }

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
    const response = await fetch(`${config.anthropicBaseUrl}/v1/messages`, {
      method: "POST",
      headers: anthropicHeaders(),
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

// A model round-trip must never hang the comparison: every provider call gets
// a hard timeout, and the orchestration layer falls back to the deterministic
// summary when it fires. Configurable because proxy latencies vary widely.
function aiTimeoutMs() {
  const parsed = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20000;
}

class OpenAiResponsesProvider implements AiProvider {
  constructor(private readonly config: AiConfig) {}

  async completeJson<T>({ role, schemaName, schema, system, user }: CompleteJsonInput<T>): Promise<AiProviderResult<T>> {
    const model = getModelForStep(role, this.config);
    const response = await fetch(`${this.config.baseUrl}/responses`, {
      method: "POST",
      signal: AbortSignal.timeout(aiTimeoutMs()),
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

class AnthropicMessagesProvider implements AiProvider {
  constructor(private readonly config: AiConfig) {}

  async completeJson<T>({ schemaName, schema, system, user }: CompleteJsonInput<T>): Promise<AiProviderResult<T>> {
    const model = this.config.anthropicModel;
    const response = await fetch(`${this.config.anthropicBaseUrl}/v1/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(aiTimeoutMs()),
      headers: anthropicHeaders(),
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages: [
          {
            role: "user",
            content: [
              "Respond with a single JSON object only — no markdown fences, no prose before or after.",
              `It must conform exactly to this JSON Schema (named "${schemaName}"). Return the object itself, not the schema, and do not nest it under any key:`,
              JSON.stringify(z.toJSONSchema(schema)),
              "Input data to summarize:",
              JSON.stringify(user, null, 2),
            ].join("\n\n"),
          },
        ],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Anthropic ${response.status}: ${message.slice(0, 500)}`);
    }

    const text = extractAnthropicText((await response.json()) as unknown);
    const parsed = schema.safeParse(parseJsonObject(text));

    if (!parsed.success) {
      throw new Error(`AI output failed ${schemaName} validation: ${parsed.error.message}`);
    }

    return {
      data: parsed.data,
      model,
      provider: "anthropic",
    };
  }
}

function anthropicHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  };
  // ANTHROPIC_AUTH_TOKEN → Authorization: Bearer (proxy / OAuth style).
  // ANTHROPIC_API_KEY → x-api-key (official key style). Sending both can make a
  // proxy forward the x-api-key upstream and 401 ("invalid x-api-key").
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  } else if (process.env.ANTHROPIC_API_KEY) {
    headers["x-api-key"] = process.env.ANTHROPIC_API_KEY;
  }
  return headers;
}

function extractAnthropicText(payload: unknown) {
  if (typeof payload !== "object" || !payload || !("content" in payload) || !Array.isArray(payload.content)) {
    throw new Error("Anthropic response did not include content.");
  }

  const chunks: string[] = [];
  for (const block of payload.content) {
    if (
      typeof block === "object" && block
      && "type" in block && block.type === "text"
      && "text" in block && typeof block.text === "string"
    ) {
      chunks.push(block.text);
    }
  }

  const text = chunks.join("\n").trim();
  if (!text) throw new Error("Anthropic response text was empty.");
  return text;
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
