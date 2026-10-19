import { describe, expect, it } from "vitest";
import cohort from "./real-card-cohort.json";
import dataset from "./real-card-dataset.json";
import prices from "./real-price-opportunities.json";

describe("real benchmark provenance and splits", () => {
  it("covers six real families per game and retains partial-source observations", () => {
    expect(cohort.cards.filter(c => c.game === "pokemon")).toHaveLength(6);
    expect(cohort.cards.filter(c => c.game === "onePiece")).toHaveLength(6);
    expect(new Set(dataset.cases.map(c => c.card.id)).size).toBe(12);
    expect(dataset.cases.every(c => c.evidence.method === "provider_report" && c.evidence.sourceUrl)).toBe(true);
    expect(dataset.cases.some(c => c.labelStatus === "pending")).toBe(true);
    expect(dataset.cases.some(c => c.labelStatus === "synthetic")).toBe(false);
  });
  it("keeps historical price observations in the same family split as current identity observations", () => {
    for (const row of prices.observations) {
      expect(row.split, row.id).toBe(cohort.cards.find(c => c.confirmedCardId === row.cardId)!.split);
    }
    for (const row of dataset.cases) expect(row.split, row.id).toBe(cohort.cards.find(c => c.confirmedCardId === row.card.id)!.split);
  });
});
