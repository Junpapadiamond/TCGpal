import { describe, expect, it } from "vitest";
import { mergeUserFacingStrings, sanitizeUserFacingText } from "@/lib/ai/report-cleanup";

describe("AI report cleanup", () => {
  it("removes accidental unsupported script tokens from user-facing text", () => {
    expect(sanitizeUserFacingText("High buyer risk for a grading هدف because evidence is weak.")).toBe(
      "High buyer risk for a grading because evidence is weak.",
    );
  });

  it("deduplicates near-equivalent seller questions while preserving distinct checks", () => {
    const merged = mergeUserFacingStrings(
      ["Can you share corner closeups and angled surface photos?", "Can you confirm the exact card number?"],
      ["Please provide closeups of all four corners, edges, and the surface at an angle.", "Can you share a clear back photo?"],
    );

    expect(merged).toEqual([
      "Can you share corner closeups and angled surface photos?",
      "Can you confirm the exact card number?",
      "Can you share a clear back photo?",
    ]);
  });
});
