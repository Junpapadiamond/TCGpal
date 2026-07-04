import { NextResponse } from "next/server";
import { getAiConfig } from "@/lib/ai/config";
import { getAllocatorConfig, isComparisonAgentEnabled } from "@/lib/ai/agent/market-agent";
import { probeAnthropicModel, probeOpenAiCompatibleModel, probeOpenAiModel } from "@/lib/ai/provider";

export async function GET() {
  const config = getAiConfig();

  if (config.provider === "anthropic") {
    if (!config.hasApiKey) {
      return NextResponse.json({
        ok: false,
        provider: config.provider,
        warning: "Anthropic auth token is missing. AI actions will use local fallback.",
      });
    }

    const probe = await probeAnthropicModel(config);
    return NextResponse.json({
      ok: probe.ok,
      warning: probe.ok ? undefined : "Anthropic is configured but the model check failed. AI actions may use local fallback.",
      provider: config.provider,
      models: [
        { role: "primary", model: config.anthropicModel, ok: probe.ok, status: probe.status, warning: probe.warning },
      ],
    });
  }

  if (config.provider !== "openai") {
    return NextResponse.json({
      ok: false,
      provider: config.provider,
      warning: "AI provider is not configured for OpenAI in this local demo.",
    });
  }

  if (!config.hasApiKey) {
    return NextResponse.json({
      ok: false,
      provider: config.provider,
      warning: "OpenAI API key is missing. AI actions will use local fallback.",
    });
  }

  const primary = await probeOpenAiModel(config.primaryModel);
  const cheap = config.cheapModel === config.primaryModel ? primary : await probeOpenAiModel(config.cheapModel);
  const allocator = getAllocatorConfig(config);
  const allocatorPrimary = isComparisonAgentEnabled()
    ? await probeOpenAiCompatibleModel({
      model: allocator.model,
      apiKey: allocator.apiKey,
      baseUrl: allocator.baseUrl,
      wireApi: allocator.dialect,
      reasoningEffort: allocator.reasoningEffort,
      disableResponseStorage: allocator.disableResponseStorage,
    })
    : null;
  const allocatorFallback = isComparisonAgentEnabled() && allocator.fallbackModels[0]
    ? await probeOpenAiCompatibleModel({
      model: allocator.fallbackModels[0],
      apiKey: allocator.apiKey,
      baseUrl: allocator.baseUrl,
      wireApi: allocator.dialect,
      reasoningEffort: allocator.reasoningEffort,
      disableResponseStorage: allocator.disableResponseStorage,
    })
    : null;
  const ok = primary.ok && cheap.ok && (!allocatorPrimary || allocatorPrimary.ok);

  return NextResponse.json({
    ok,
    warning: ok ? undefined : "OpenAI is configured but one or more model checks failed. AI actions may use local fallback.",
    provider: config.provider,
    models: [
      { role: "primary", model: config.primaryModel, ok: primary.ok, status: primary.status, warning: primary.warning },
      { role: "cheap", model: config.cheapModel, ok: cheap.ok, status: cheap.status, warning: cheap.warning },
    ],
    allocator: {
      enabled: isComparisonAgentEnabled(),
      dialect: allocator.dialect,
      model: allocator.model,
      fallbackModels: allocator.fallbackModels,
      ok: allocatorPrimary?.ok ?? false,
      status: allocatorPrimary?.status,
      warning: allocatorPrimary?.warning,
      fallbackCheck: allocatorFallback
        ? {
          model: allocator.fallbackModels[0],
          ok: allocatorFallback.ok,
          status: allocatorFallback.status,
          warning: allocatorFallback.warning,
        }
        : null,
    },
  });
}
