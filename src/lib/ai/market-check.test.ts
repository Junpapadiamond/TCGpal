import { describe, expect, it } from "vitest";
import { runMarketCheck } from "@/lib/ai/market-check";
import { defaultProfile } from "@/lib/sample-data";
import { marketCheckResponseSchema, type MarketCheckRequest } from "@/lib/schemas";

const baseRequest: MarketCheckRequest = {
  cardName: "Umbreon VMAX",
  cardVersion: "Evolving Skies Alternate Art 215/203",
  tcg: "Pokemon",
  askingPrice: 500,
  feelingText: "I like this card, but I want to check the photos, comps, and my budget before buying.",
  evidenceText: "Seller has front and back photos, corner closeups, surface video, recent sold comps, and return policy.",
  profile: {
    ...defaultProfile,
    favoriteTcgs: ["Pokemon"],
    ip: "Pokemon",
    todayBudget: 600,
    monthlyBudget: 1000,
    budgetRange: "$1000+",
  },
};

describe("market check harness", () => {
  it("returns a schema-valid deterministic fallback when OpenAI is not configured", async () => {
    const response = await runMarketCheck(baseRequest);

    expect(marketCheckResponseSchema.safeParse(response).success).toBe(true);
    expect(response.fallbackUsed).toBe(true);
    expect(response.trace.map((step) => step.tool)).toEqual([
      "identify_exact_card_version",
      "get_reference_prices",
      "get_sold_comps",
      "check_evidence_gaps",
      "run_deterministic_budget_rules",
    ]);
  });

  it("forces Pause when deterministic budget rules hit a hard stop", async () => {
    const response = await runMarketCheck({
      ...baseRequest,
      askingPrice: 700,
      profile: {
        ...baseRequest.profile,
        todayBudget: 600,
      },
    });

    expect(response.budget.hardStop).toBe(true);
    expect(response.result.decision).toBe("Pause");
    expect(response.result.confidence).toBe("high");
  });

  it("does not invent sold comps when no provider is configured", async () => {
    const response = await runMarketCheck(baseRequest);

    expect(response.soldComps.available).toBe(false);
    expect(response.soldComps.manualCheckUrl).toContain("https://www.ebay.com/sch/i.html");
    expect(response.soldComps.lookupQuery).toContain("Umbreon VMAX");
    expect(response.sources.some((source) => source.label === "Sold comps" && source.status === "unavailable")).toBe(true);
    expect(["Wait", "Ask seller", "Pause"]).toContain(response.result.decision);
  });
});
