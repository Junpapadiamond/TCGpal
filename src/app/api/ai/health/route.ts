import { NextResponse } from "next/server";
import { getAiConfig } from "@/lib/ai/config";

export async function GET() {
  const config = getAiConfig();

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

  return NextResponse.json({
    ok: true,
    provider: config.provider,
    models: [
      { role: "primary", model: config.primaryModel, ok: true },
      { role: "cheap", model: config.cheapModel, ok: true },
    ],
  });
}
