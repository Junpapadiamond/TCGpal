import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAiProvider } from "@/lib/ai/provider";
import type { AiConfig } from "@/lib/ai/config";

const config: AiConfig = {
  provider: "openai",
  primaryModel: "test-model",
  cheapModel: "test-model",
  baseUrl: "https://example.test/v1",
  anthropicBaseUrl: "https://anthropic.test/v1",
  anthropicModel: "test-anthropic",
  reasoningEffort: "low",
  disableResponseStorage: true,
  hasApiKey: true,
};

describe("AI provider request timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts a hanging model call instead of waiting forever", async () => {
    vi.useFakeTimers();
    // A model endpoint that never responds, but honors the abort signal — exactly
    // the stall (e.g. a rate-limited provider) that used to hang the whole request
    // and surface as a bare "Load failed" with no listings.
    const fetchStub = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    );
    vi.stubGlobal("fetch", fetchStub);

    const provider = createAiProvider(config);
    const pending = provider.completeJson({
      role: "primary",
      schemaName: "t",
      schema: z.object({ summary: z.string() }),
      system: "s",
      user: {},
    });
    const settled = pending.then(() => "resolved").catch(() => "rejected");

    await vi.advanceTimersByTimeAsync(13000);
    expect(await settled).toBe("rejected");
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
