import { describe, expect, it } from "vitest";
import { runFomoCheck } from "./fomo-check";
import { fomoCheckInputSchema, fomoCheckResultSchema, type FomoCheckInput } from "./schemas";

const baseInput: FomoCheckInput = {
  cardName: "Umbreon VMAX",
  cardVersion: "Evolving Skies Alternate Art 215/203",
  askingPrice: 500,
  todayBudget: 600,
  monthlyBudget: 1000,
  budgetRange: "$1000+",
  versionConfirmed: true,
  feelingText: "I like this card and want to check if it fits my plan.",
  evidenceText: "Seller has front and back photos, corner closeups, recent sold comps, and return policy.",
};

describe("FOMO check", () => {
  it("pauses an overheated idea when panic language and price exceed budget", () => {
    const result = runFomoCheck({
      ...baseInput,
      askingPrice: 700,
      todayBudget: 600,
      monthlyBudget: 1000,
      feelingText: "I need to buy right now before it is too late! Everyone says it is gonna go up and I will regret it!",
      evidenceText: "",
    });

    expect(result.decisionPosture).toBe("Overheated");
    expect(result.nextStep).toBe("Pause");
    expect(result.hardStop).toBe(true);
    expect(result.cooldownRecommended).toBe(true);
    expect(result.warmSummary).toContain("not stupid");
  });

  it("keeps a calm thesis within budget in a cool or warm posture", () => {
    const result = runFomoCheck({
      ...baseInput,
      askingPrice: 180,
    });

    expect(["Cool", "Warm"]).toContain(result.decisionPosture);
    expect(["Run math", "Proceed within guardrails"]).toContain(result.nextStep);
    expect(result.hardStop).toBe(false);
    expect(result.evidenceStrength.score).toBeGreaterThanOrEqual(45);
    expect(result.versionClarity.score).toBe(100);
  });

  it("asks for evidence when the feeling is within budget but proof is thin", () => {
    const result = runFomoCheck({
      ...baseInput,
      askingPrice: 300,
      feelingText: "I have been watching this card and the price fits my budget.",
      evidenceText: "",
    });

    expect(result.nextStep).toBe("Ask for evidence");
    expect(result.evidenceStrength.label).toBe("Low");
  });

  it("pauses when the user has not chosen a card version", () => {
    const result = runFomoCheck({
      ...baseInput,
      cardVersion: "",
      versionConfirmed: false,
      askingPrice: 300,
      feelingText: "The price seems okay but I am not sure which version this is.",
      evidenceText: "Seller has front and back photos.",
    });

    expect(result.decisionPosture).toBe("Overheated");
    expect(result.nextStep).toBe("Ask for evidence");
    expect(result.versionClarity.label).toBe("Low");
  });

  it("validates input and result schemas", () => {
    const input = fomoCheckInputSchema.parse(baseInput);
    const result = runFomoCheck(input);

    expect(fomoCheckResultSchema.safeParse(result).success).toBe(true);
  });
});
