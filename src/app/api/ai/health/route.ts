import { NextResponse } from "next/server";
import { getAiConfig } from "@/lib/ai/config";

export async function GET() {
  const config = getAiConfig();

  if (config.provider !== "openai") {
    return NextResponse.json({
      ok: false,
      provider: config.provider,
      warning: "AI provider is not configured for OpenAI in this local demo.",
      models: [],
    });
  }

  if (!config.hasApiKey) {
    return NextResponse.json({
      ok: false,
      provider: config.provider,
      warning: "OpenAI API key is missing. AI actions will use local fallback.",
      models: [
        { role: "primary", model: config.primaryModel, ok: false },
        { role: "cheap", model: config.cheapModel, ok: false },
      ],
    });
  }

  const [primary, cheap] = await Promise.all([checkOpenAiModel(config.primaryModel), checkOpenAiModel(config.cheapModel)]);
  const ok = primary.ok && cheap.ok;

  return NextResponse.json({
    ok,
    provider: config.provider,
    warning: ok ? "" : "One or more configured OpenAI models are unavailable. AI actions will use local fallback.",
    models: [
      { role: "primary", ...primary },
      { role: "cheap", ...cheap },
    ],
  });
}

async function checkOpenAiModel(model: string) {
  const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  if (response.ok) {
    return { model, ok: true };
  }

  return {
    model,
    ok: false,
    status: response.status,
  };
}
