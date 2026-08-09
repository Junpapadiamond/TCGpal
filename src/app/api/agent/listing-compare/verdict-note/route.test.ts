import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { generateVerdictNote } from "@/lib/ai/verdict-note";
import { comparisonReport } from "@/lib/ai/verdict-note-fixtures";
import { clearLocalCache } from "@/lib/ops/cache";
import { clearLocalRateLimitStore } from "@/lib/ops/rate-limit";
import { comparisonReportSchema } from "@/lib/schemas";

vi.mock("@/lib/ai/verdict-note", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/verdict-note")>();
  return {
    ...actual,
    generateVerdictNote: vi.fn(async () => ({
      note: "At $834.24 with 10 item-specific photos, this copy is the best-documented one here.",
      citedFactIds: [3, 5],
      usedAi: true,
      rejectedReason: null,
      facts: [],
    })),
  };
});

function noteRequest(body: unknown) {
  return new Request("https://tcgpal.test/api/agent/listing-compare/verdict-note", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.77",
      "x-request-id": "verdict-note-route-test",
    },
    body: JSON.stringify(body),
  });
}

describe("/api/agent/listing-compare/verdict-note route", () => {
  const report = comparisonReport();

  beforeEach(() => {
    clearLocalRateLimitStore();
    clearLocalCache();
    vi.mocked(generateVerdictNote).mockClear();
    vi.unstubAllEnvs();
    vi.stubEnv("RATE_LIMIT_EXPLAIN_MAX", "10");
    vi.stubEnv("RATE_LIMIT_EXPLAIN_WINDOW_MS", "60000");
    vi.stubEnv("RATE_LIMIT_SALT", "verdict-note-route-test-salt");
  });

  it("accepts the report shape the client sends", () => {
    expect(() => comparisonReportSchema.parse(report)).not.toThrow();
  });

  it("returns no note and never asks the model while the flag is off", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "0");

    const response = await POST(noteRequest({ report, role: "best_value", lang: "en" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ note: null, citedFactIds: [], usedAi: false, rejectedReason: null });
    expect(generateVerdictNote).not.toHaveBeenCalled();
  });

  it("hands the model the deterministic verdict rather than letting it decide", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "1");

    const response = await POST(noteRequest({ report, role: "best_value", lang: "en" }));
    const json = await response.json();

    expect(json.note).toContain("$834.24");
    expect(json.usedAi).toBe(true);
    expect(generateVerdictNote).toHaveBeenCalledTimes(1);
    const [input] = vi.mocked(generateVerdictNote).mock.calls[0];
    expect(input.decision.kind).toBe("buy");
    expect(input.decision.label).toBe("Reasonable to buy");
    // The route must hand over the live deterministic sentence, whatever
    // verdict-copy currently produces, so the model never invents the fallback.
    expect(input.decision.fallbackNote).toContain("before you commit");
  });

  it("reuses one model call for a repeated view of the same report and lens", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "1");

    await POST(noteRequest({ report, role: "best_value", lang: "en" }));
    const second = await POST(noteRequest({ report, role: "best_value", lang: "en" }));

    expect((await second.json()).note).toContain("$834.24");
    expect(generateVerdictNote).toHaveBeenCalledTimes(1);
  });

  it("writes a separate note per language", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "1");

    await POST(noteRequest({ report, role: "best_value", lang: "en" }));
    await POST(noteRequest({ report, role: "best_value", lang: "zh" }));

    expect(generateVerdictNote).toHaveBeenCalledTimes(2);
  });

  it("falls back silently when the lens has no ranked pick", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "1");

    const response = await POST(noteRequest({ report, role: "safest_listing", lang: "en" }));

    expect(response.status).toBe(200);
    expect((await response.json()).note).toBeNull();
    expect(generateVerdictNote).not.toHaveBeenCalled();
  });

  it("rejects a malformed request", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "1");

    const response = await POST(noteRequest({ role: "best_value" }));

    expect(response.status).toBe(400);
    expect(generateVerdictNote).not.toHaveBeenCalled();
  });
});
