// Hermetic half of the review corpus: every report shape must produce a usable
// fact sheet, and a poisoned note must be rejected against every one of them.
// The live half (real model calls, read by a human) is verdict-note-review.test.ts.
import { describe, expect, it } from "vitest";
import { buildVerdictCopy } from "@/features/comparison/verdict-copy";
import { buildVerdictFactSheet, checkVerdictNote, resolveVerdictNoteTarget } from "@/lib/ai/verdict-note";
import { verdictNoteReviewCases } from "@/lib/ai/verdict-note-fixtures";

describe("verdict note review corpus", () => {
  it("covers at least twenty report shapes across both languages and all four lenses", () => {
    expect(verdictNoteReviewCases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(verdictNoteReviewCases.map((entry) => entry.lang))).toEqual(new Set(["en", "zh"]));
    expect(new Set(verdictNoteReviewCases.map((entry) => entry.role)).size).toBe(4);
    expect(new Set(verdictNoteReviewCases.map((entry) => entry.id)).size).toBe(verdictNoteReviewCases.length);
  });

  for (const entry of verdictNoteReviewCases) {
    describe(entry.name, () => {
      const target = resolveVerdictNoteTarget(entry.report, entry.role);
      const decision = target
        ? buildVerdictCopy({
          listing: target.listing,
          choice: target.choice,
          alternatives: target.alternatives,
          marketPrice: target.marketPrice,
          lang: entry.lang,
        }).action
        : null;
      const facts = target && decision
        ? buildVerdictFactSheet({
          report: entry.report,
          role: entry.role,
          lang: entry.lang,
          decision: { kind: decision.kind, label: decision.label, fallbackNote: decision.note },
        })
        : [];

      it("produces a numbered fact sheet", () => {
        expect(target).not.toBeNull();
        expect(facts.length).toBeGreaterThan(4);
        expect(facts.map((fact) => fact.id)).toEqual(facts.map((_, index) => index + 1));
        for (const fact of facts) {
          expect(fact.text.trim()).not.toBe("");
        }
      });

      it("keeps urls and internal ids out of the facts", () => {
        const text = facts.map((fact) => fact.text).join(" ");
        expect(text).not.toMatch(/https?:\/\//);
        for (const candidate of entry.report.candidates) {
          expect(text).not.toContain(candidate.id);
        }
      });

      it("carries the deterministic verdict the model must explain", () => {
        expect(facts.at(-1)?.text).toContain(`already decided: ${decision?.kind}`);
      });

      it("rejects an invented price against this fact sheet", () => {
        const note = entry.lang === "zh"
          ? { note: "这条 $1,234.56 的商品是这里最稳的一条。", citedFactIds: [1] }
          : { note: "At $1,234.56 this copy is the strongest read here.", citedFactIds: [1] };

        const result = checkVerdictNote(note, facts, entry.lang);

        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/ungrounded number/i);
      });

      it("rejects a note that swaps the deterministic decision for advice", () => {
        const note = entry.lang === "zh"
          ? { note: "这条必买，零风险。", citedFactIds: [1] }
          : { note: "This is a must-buy and a risk-free pickup.", citedFactIds: [1] };

        expect(checkVerdictNote(note, facts, entry.lang).ok).toBe(false);
      });
    });
  }
});
