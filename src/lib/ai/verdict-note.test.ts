import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildVerdictFactSheet,
  checkVerdictNote,
  generateVerdictNote,
  isVerdictNoteEnabled,
  resolveVerdictNoteTarget,
  type VerdictFact,
} from "@/lib/ai/verdict-note";
import type { AiProvider } from "@/lib/ai/provider";
import { comparisonReport, listingFixture } from "@/lib/ai/verdict-note-fixtures";

const decision = { kind: "buy" as const, label: "Reasonable to buy", fallbackNote: "The numbers support this buy." };

function factText(facts: VerdictFact[]) {
  return facts.map((fact) => fact.text).join(" ");
}

function stubProvider(data: unknown): AiProvider {
  return {
    async completeJson() {
      return { data, model: "test-model", provider: "test" } as never;
    },
  };
}

describe("verdict note fact sheet", () => {
  it("numbers the pick's decision facts from one, without duplicates", () => {
    const facts = buildVerdictFactSheet({ report: comparisonReport(), role: "best_value", lang: "en", decision });

    expect(facts.length).toBeGreaterThan(4);
    expect(facts.map((fact) => fact.id)).toEqual(facts.map((_, index) => index + 1));
  });

  it("states the complete cost, photo count, return policy, and cheapest rival", () => {
    const facts = buildVerdictFactSheet({ report: comparisonReport(), role: "best_value", lang: "en", decision });
    const text = factText(facts);

    expect(text).toContain("$834.24");
    expect(text).toContain("10 item-specific photos");
    expect(text).toContain("does not accept returns");
    expect(text).toContain("$776.03");
  });

  it("labels the market reference as an item-price, Near Mint comparison", () => {
    const facts = buildVerdictFactSheet({ report: comparisonReport(), role: "best_value", lang: "en", decision });
    const text = factText(facts);

    expect(text).toMatch(/item price/i);
    expect(text).toMatch(/Near Mint market reference/i);
  });

  it("says outright when there is no usable market reference instead of implying one", () => {
    const report = comparisonReport({ marketMid: null });
    const text = factText(buildVerdictFactSheet({ report, role: "best_value", lang: "en", decision }));

    expect(text).toMatch(/no usable market reference/i);
    expect(text).not.toMatch(/\d+% (under|over)/);
  });

  it("does not compare a non-Near-Mint request to the condition-blind reference", () => {
    const report = comparisonReport({ desiredCondition: "Lightly Played", claimedCondition: "Lightly Played" });
    const text = factText(buildVerdictFactSheet({ report, role: "best_value", lang: "en", decision }));

    expect(text).toMatch(/not a like-for-like/i);
    expect(text).not.toMatch(/\d+% (under|over) the .*Near Mint reference/);
  });

  it("reports an unstated condition as unstated", () => {
    const report = comparisonReport({ claimedCondition: "Unknown" });
    const text = factText(buildVerdictFactSheet({ report, role: "best_value", lang: "en", decision }));

    expect(text).toMatch(/did not state a condition/i);
  });

  it("marks buyer-entered listings so the note cannot present them as source-verified", () => {
    const report = comparisonReport({ userSupplied: true });
    const text = factText(buildVerdictFactSheet({ report, role: "best_value", lang: "en", decision }));

    expect(text).toMatch(/buyer-entered/i);
  });

  it("still produces a fact sheet when the pick has no rivals", () => {
    const report = comparisonReport({ rivals: [] });
    const facts = buildVerdictFactSheet({ report, role: "best_value", lang: "en", decision });

    expect(facts.length).toBeGreaterThan(3);
    expect(factText(facts)).toMatch(/only comparable listing/i);
  });

  it("carries the already-decided verdict so the model cannot re-decide it", () => {
    const facts = buildVerdictFactSheet({
      report: comparisonReport(),
      role: "best_value",
      lang: "en",
      decision: { kind: "wait", label: "Consider waiting", fallbackNote: "Wait." },
    });

    expect(factText(facts)).toMatch(/already decided: wait/i);
  });

  it("never leaks listing ids or urls into the facts", () => {
    const facts = buildVerdictFactSheet({ report: comparisonReport(), role: "best_value", lang: "en", decision });
    const text = factText(facts);

    expect(text).not.toContain("http");
    expect(text).not.toContain("pick-listing");
  });

  it("resolves nothing when the requested lens has no ranked choice", () => {
    expect(resolveVerdictNoteTarget(comparisonReport(), "safest_listing")).toBeNull();
  });
});

describe("verdict note checker", () => {
  const facts = buildVerdictFactSheet({ report: comparisonReport(), role: "best_value", lang: "en", decision });

  it("accepts a note whose every number appears in the fact sheet", () => {
    const result = checkVerdictNote(
      { note: "At $834.24 with 10 item-specific photos, this is the best-documented copy here. The seller does not accept returns, so check the photos before committing.", citedFactIds: [1, 2] },
      facts,
      "en",
    );

    expect(result.ok).toBe(true);
  });

  it("rejects an invented dollar amount", () => {
    const result = checkVerdictNote(
      { note: "At $812.00 this copy is the strongest read in the comparison.", citedFactIds: [1] },
      facts,
      "en",
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/ungrounded number/i);
  });

  it("rejects an invented percentage", () => {
    const result = checkVerdictNote(
      { note: "This copy sits 22% under the market reference.", citedFactIds: [1] },
      facts,
      "en",
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/ungrounded number/i);
  });

  it("rejects an invented count", () => {
    const result = checkVerdictNote(
      { note: "The seller posted 14 item-specific photos of the card.", citedFactIds: [2] },
      facts,
      "en",
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/ungrounded number/i);
  });

  it("rejects assistant-forbidden claims", () => {
    for (const note of [
      "The sold comps show this is the right price at $834.24.",
      "This seller looks like a scam at $834.24.",
      "It will grade well at $834.24.",
    ]) {
      expect(checkVerdictNote({ note, citedFactIds: [1] }, facts, "en").ok).toBe(false);
    }
  });

  it("rejects promise and investment language", () => {
    for (const note of [
      "At $834.24 this is a must-buy.",
      "A risk-free pickup at $834.24.",
      "At $834.24 this is a good investment.",
      "The card is authentic and priced at $834.24.",
    ]) {
      const result = checkVerdictNote({ note, citedFactIds: [1] }, facts, "en");
      expect(result.ok, note).toBe(false);
      expect(result.reason).toMatch(/unsupported claim/i);
    }
  });

  it("rejects a note that runs past three sentences or the length cap", () => {
    const tooManySentences = checkVerdictNote(
      { note: "One thing. Two things. Three things. Four things.", citedFactIds: [1] },
      facts,
      "en",
    );
    const tooLong = checkVerdictNote({ note: `${"a".repeat(320)}.`, citedFactIds: [1] }, facts, "en");

    expect(tooManySentences.ok).toBe(false);
    expect(tooManySentences.reason).toMatch(/sentence/i);
    expect(tooLong.ok).toBe(false);
    expect(tooLong.reason).toMatch(/too long/i);
  });

  it("rejects missing or out-of-range fact citations", () => {
    expect(checkVerdictNote({ note: "A grounded sentence.", citedFactIds: [] }, facts, "en").ok).toBe(false);
    expect(checkVerdictNote({ note: "A grounded sentence.", citedFactIds: [99] }, facts, "en").reason).toMatch(/cited fact/i);
  });

  it("rejects urls", () => {
    expect(checkVerdictNote({ note: "See https://example.com for the listing.", citedFactIds: [1] }, facts, "en").ok).toBe(false);
  });

  it("rejects internal identifiers the caller marks as unmentionable", () => {
    const result = checkVerdictNote(
      { note: "Listing pick-listing leads here.", citedFactIds: [1] },
      facts,
      "en",
      { bannedTokens: ["pick-listing"] },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/internal identifier/i);
  });

  it("rejects a note written in the wrong language", () => {
    expect(checkVerdictNote({ note: "这条 $834.24 的商品最稳。", citedFactIds: [1] }, facts, "en").ok).toBe(false);
    expect(checkVerdictNote({ note: "This copy costs $834.24.", citedFactIds: [1] }, facts, "zh").ok).toBe(false);
  });

  it("accepts a grounded Chinese note", () => {
    const result = checkVerdictNote(
      { note: "这条 $834.24，有 10 张实物照片，卖家不接受退货。", citedFactIds: [1, 2] },
      facts,
      "zh",
    );

    expect(result.ok).toBe(true);
  });
});

describe("generating the verdict note", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off unless the flag is explicitly enabled", () => {
    vi.stubEnv("AI_VERDICT_NOTE", "");
    expect(isVerdictNoteEnabled()).toBe(false);
    vi.stubEnv("AI_VERDICT_NOTE", "0");
    expect(isVerdictNoteEnabled()).toBe(false);
    vi.stubEnv("AI_VERDICT_NOTE", "1");
    expect(isVerdictNoteEnabled()).toBe(true);
  });

  it("never calls the provider while the flag is off", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "0");
    const completeJson = vi.fn();

    const result = await generateVerdictNote(
      { report: comparisonReport(), role: "best_value", lang: "en", decision },
      { provider: { completeJson } as unknown as AiProvider },
    );

    expect(completeJson).not.toHaveBeenCalled();
    expect(result.note).toBeNull();
    expect(result.usedAi).toBe(false);
  });

  it("does not inherit the comparison critical path's timeout", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "1");
    const completeJson = vi.fn(async () => ({ data: { note: "At $834.24 this copy documents itself best.", citedFactIds: [1] }, model: "m", provider: "p" }));

    await generateVerdictNote(
      { report: comparisonReport(), role: "best_value", lang: "en", decision },
      { provider: { completeJson } as unknown as AiProvider },
    );

    // The note renders after the result is already on screen, so it can wait
    // far longer than buildNarrative can. Measured: 100% of live calls land
    // under 25s, only ~50% under the shared 12s default.
    const [input] = completeJson.mock.calls[0] as unknown as [{ timeoutMs?: number; reasoningEffort?: string }];
    expect(input.timeoutMs).toBeGreaterThanOrEqual(30_000);
    expect(input.reasoningEffort).toBe("low");
  });

  it("returns a grounded model note when the flag is on", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "1");

    const result = await generateVerdictNote(
      { report: comparisonReport(), role: "best_value", lang: "en", decision },
      {
        provider: stubProvider({
          note: "At $834.24 with 10 item-specific photos, this copy documents itself better than the cheaper rivals here.",
          citedFactIds: [1, 2],
        }),
      },
    );

    expect(result.usedAi).toBe(true);
    expect(result.note).toContain("$834.24");
    expect(result.rejectedReason).toBeNull();
  });

  it("silently falls back when the model invents a number", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "1");

    const result = await generateVerdictNote(
      { report: comparisonReport(), role: "best_value", lang: "en", decision },
      { provider: stubProvider({ note: "At $712.10 this is the strongest copy here.", citedFactIds: [1] }) },
    );

    expect(result.note).toBeNull();
    expect(result.usedAi).toBe(false);
    expect(result.rejectedReason).toMatch(/ungrounded number/i);
  });

  it("silently falls back when the provider fails", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "1");

    const result = await generateVerdictNote(
      { report: comparisonReport(), role: "best_value", lang: "en", decision },
      {
        provider: {
          async completeJson() {
            throw new Error("provider exploded");
          },
        },
      },
    );

    expect(result.note).toBeNull();
    expect(result.usedAi).toBe(false);
    expect(result.rejectedReason).toMatch(/provider/i);
  });

  it("falls back when the model returns a shape the schema rejects", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "1");

    const result = await generateVerdictNote(
      { report: comparisonReport(), role: "best_value", lang: "en", decision },
      { provider: stubProvider({ note: "", citedFactIds: [] }) },
    );

    expect(result.note).toBeNull();
    expect(result.usedAi).toBe(false);
  });

  it("abstains when the report has no ranked pick for the lens", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "1");
    const report = comparisonReport({ rankedChoices: [] });

    const result = await generateVerdictNote(
      { report, role: "best_value", lang: "en", decision },
      { provider: stubProvider({ note: "Anything at all here.", citedFactIds: [1] }) },
    );

    expect(result.note).toBeNull();
  });

  it("keeps demo reports on the canned sentence", async () => {
    vi.stubEnv("AI_VERDICT_NOTE", "1");
    const report = comparisonReport({ demoMode: true });

    const result = await generateVerdictNote(
      { report, role: "best_value", lang: "en", decision },
      { provider: stubProvider({ note: "At $834.24 this is the strongest copy here.", citedFactIds: [1] }) },
    );

    expect(result.note).toBeNull();
  });
});

describe("verdict note fixtures", () => {
  it("builds a listing whose totals stay internally consistent", () => {
    const listing = listingFixture({ price: 100, shipping: 5, estimatedTax: null });

    expect(listing.preTaxTotal).toBe(105);
    expect(listing.estimatedLandedCost).toBeNull();
  });
});
