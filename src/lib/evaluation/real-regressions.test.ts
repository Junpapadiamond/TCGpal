import { describe, expect, it } from "vitest";
import { evaluateAccuracy } from "./card-accuracy";
import real from "./real-card-dataset.json";
import followups from "./real-card-followups.json";
import { isGradedListing } from "@/lib/comparison/graded-listing";
import { assessPrintFidelity } from "@/lib/comparison/print-fidelity";
import { cardIdentityCandidateSchema } from "@/lib/schemas";

describe("real provider failures from October 19", () => {
  it("rejects the Demo Deck replacement winner found during production verification", () => {
    expect(evaluateAccuracy(followups, "tuning").failures).toEqual([]);
  });
  it("rejects reviewed release conflicts and the graded default winner", () => {
    const result = evaluateAccuracy(real, "tuning");
    expect(result.failures.map(r => ({ id: r.id, actual: r.actual }))).toEqual([]);
    expect(result.humanReviewed.total).toBe(0);
  });

  it("recognizes PCG slabs without excluding grading aspirations or ungraded cards", () => {
    expect(isGradedListing("Charizard 4/102 Base Set PCG 7.5 Graded Near Mint +")).toBe(true);
    for (const title of ["Charizard ungraded Near Mint", "Charizard PSA 10 candidate", "Mew PSA 10 contender", "Nami not graded", "Mew ready to be graded"]) {
      expect(isGradedListing(title), title).toBe(false);
    }
  });

  it("keeps Celebrations searches valid and does not treat a selling year as release evidence", () => {
    const base = cardIdentityCandidateSchema.parse(real.cases.find(r => r.card.id === "base1-4")!.card);
    const celebration = { ...base, id: "cel25c-4", setName: "Celebrations: Classic Collection", setCode: "CEL25C" };
    for (const [card, matchText] of [[celebration, "Charizard 4/102 Celebrations Classic Collection"], [base, "Charizard 4/102 Base Set 1999 NM 2026 sale"]] as const) {
      expect(assessPrintFidelity({ card, matchText, listingPrice: 1000, exactMarketAnchor: null }).match).toBe("compatible");
    }
    expect(assessPrintFidelity({ card: base, matchText: "Charizard 4/102 Celebrations Set: Base Set", listingPrice: 1000, exactMarketAnchor: null }).match).toBe("mismatch");
  });
});
