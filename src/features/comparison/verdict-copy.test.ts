import { describe, expect, it } from "vitest";
import { demoListingSeeds } from "@/lib/comparison/fixtures";
import { normalizeListing } from "@/lib/comparison/ranking";
import type { NormalizedListing, RankedChoice } from "@/lib/schemas";
import { buildVerdictCopy } from "./verdict-copy";

const buyer = {
  country: "US" as const,
  postalCode: "",
  taxRate: null,
  desiredCondition: "Near Mint" as const,
};

function makeListing({
  id,
  price,
  photoCount,
  feedbackPercentage = 99.3,
  feedbackCount = 500,
  returnsAccepted = null,
  userSupplied = false,
  taxRate = null,
}: {
  id: string;
  price: number;
  photoCount: number;
  feedbackPercentage?: number | null;
  feedbackCount?: number | null;
  returnsAccepted?: boolean | null;
  userSupplied?: boolean;
  taxRate?: number | null;
}): NormalizedListing {
  return normalizeListing({
    listing: {
      ...demoListingSeeds[0],
      id,
      title: `${id} seller-stated Near Mint listing`,
      price,
      shipping: 5,
      claimedCondition: "Near Mint",
      demo: false,
      userSupplied,
      seller: {
        feedbackPercentage,
        feedbackCount,
        returnsAccepted,
        topRated: false,
        buyerProtection: true,
        subRatings: null,
      },
      evidence: {
        photoCount,
        frontBackExplicit: photoCount >= 6,
        closeupsExplicit: photoCount >= 6,
        surfaceExplicit: false,
        identityExplicit: true,
        substantiveConditionNotes: photoCount >= 6,
        missing: [],
      },
    },
    buyer: { ...buyer, taxRate },
    marketPrice: 200,
  });
}

function choice(role: RankedChoice["role"], listingId: string): RankedChoice {
  return {
    role,
    listingId,
    label: role,
    reason: "Deterministic ranking reason.",
    confidence: "high",
  };
}

describe("buildVerdictCopy", () => {
  it("states why, the evidence catch, and the next-best price tradeoff in English", () => {
    const winner = makeListing({ id: "winner", price: 100, photoCount: 2 });
    const documentedAlternative = makeListing({ id: "documented", price: 127, photoCount: 7 });

    const copy = buildVerdictCopy({
      listing: winner,
      choice: choice("best_value", winner.id),
      alternatives: [documentedAlternative],
      marketPrice: 200,
      lang: "en",
    });

    expect(copy.why).toContain("seller-stated Near Mint");
    expect(copy.catch).toContain("2 item-specific photos");
    expect(copy.alternative).toContain("7 item-specific photos");
    expect(copy.alternative).toContain("$27.00 more");
  });

  it("renders the same facts as natural Chinese copy", () => {
    const winner = makeListing({ id: "winner", price: 100, photoCount: 2 });
    const documentedAlternative = makeListing({ id: "documented", price: 127, photoCount: 7 });

    const copy = buildVerdictCopy({
      listing: winner,
      choice: choice("best_value", winner.id),
      alternatives: [documentedAlternative],
      marketPrice: 200,
      lang: "zh",
    });

    expect(copy.why).toContain("卖家标注的近全新");
    expect(copy.catch).toContain("2 张实物照片");
    expect(copy.alternative).toContain("7 张实物照片");
    expect(copy.alternative).toContain("贵 $27.00");
  });

  it("keeps missing seller history neutral instead of calling it risky", () => {
    const winner = makeListing({
      id: "unverified",
      price: 100,
      photoCount: 8,
      feedbackPercentage: null,
      feedbackCount: null,
      returnsAccepted: null,
    });

    const copy = buildVerdictCopy({
      listing: winner,
      choice: choice("safest_listing", winner.id),
      alternatives: [],
      marketPrice: 200,
      lang: "en",
    });

    expect(copy.catch).toContain("Seller history was not provided");
    expect(copy.catch).toContain("unverified");
    expect(copy.catch.toLowerCase()).not.toContain("higher risk");
  });

  it("labels user-entered facts as the main caveat", () => {
    const winner = makeListing({
      id: "manual",
      price: 100,
      photoCount: 8,
      userSupplied: true,
    });

    const copy = buildVerdictCopy({
      listing: winner,
      choice: choice("lowest_landed_cost", winner.id),
      alternatives: [],
      marketPrice: 200,
      lang: "en",
    });

    expect(copy.catch).toContain("user-entered facts");
    expect(copy.alternative).toBeNull();
  });

  it("uses tax-safe total language for known and unknown tax", () => {
    const preTax = makeListing({ id: "pre-tax", price: 100, photoCount: 5 });
    const landed = makeListing({ id: "landed", price: 100, photoCount: 5, taxRate: 0.08 });

    const preTaxCopy = buildVerdictCopy({
      listing: preTax,
      choice: choice("lowest_landed_cost", preTax.id),
      alternatives: [],
      marketPrice: 200,
      lang: "en",
    });
    const landedCopy = buildVerdictCopy({
      listing: landed,
      choice: choice("lowest_landed_cost", landed.id),
      alternatives: [],
      marketPrice: 200,
      lang: "en",
    });

    expect(preTaxCopy.why).toContain("pre-tax total");
    expect(landedCopy.why).toContain("estimated landed total");
    expect(preTaxCopy.why).not.toContain("all-in");
  });

  it("never turns listing evidence into a grade or authenticity prediction", () => {
    const winner = makeListing({ id: "winner", price: 100, photoCount: 9 });
    const alternative = makeListing({ id: "alternative", price: 110, photoCount: 4 });

    for (const lang of ["en", "zh"] as const) {
      for (const role of [
        "best_value",
        "lowest_landed_cost",
        "safest_listing",
        "best_condition_evidence",
      ] as const) {
        const copy = buildVerdictCopy({
          listing: winner,
          choice: choice(role, winner.id),
          alternatives: [alternative],
          marketPrice: 200,
          lang,
        });
        const rendered = `${copy.why} ${copy.catch} ${copy.alternative ?? ""} ${copy.whyNotCheapest ?? ""} ${copy.action.label} ${copy.action.note}`;
        expect(rendered).not.toMatch(/will grade|best condition|authentic|guarantee|评级预测|保真|鉴定承诺/i);
        expect(rendered).not.toMatch(/must buy|guaranteed|sure thing|can't lose|必买|稳赚|保证/i);
      }
    }
  });

  describe("whyNotCheapest", () => {
    it("explains skipping a cheaper copy with the savings and the specific weakness", () => {
      const winner = makeListing({ id: "winner", price: 120, photoCount: 8 });
      const cheaper = makeListing({
        id: "cheaper",
        price: 100,
        photoCount: 1,
        feedbackPercentage: null,
        feedbackCount: null,
      });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [cheaper],
        marketPrice: 200,
        lang: "en",
      });

      expect(copy.whyNotCheapest).toContain("$20.00");
      expect(copy.whyNotCheapest).toMatch(/1 (vs|of)|photo/i);
      expect(copy.whyNotCheapest).not.toMatch(/scam|fake|counterfeit/i);
    });

    it("renders the cheaper-copy tradeoff in Chinese", () => {
      const winner = makeListing({ id: "winner", price: 120, photoCount: 8 });
      const cheaper = makeListing({ id: "cheaper", price: 100, photoCount: 1 });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [cheaper],
        marketPrice: 200,
        lang: "zh",
      });

      expect(copy.whyNotCheapest).toContain("$20.00");
      expect(copy.whyNotCheapest).toContain("实物照片");
    });

    it("is null when the pick is already the cheapest eligible copy", () => {
      const winner = makeListing({ id: "winner", price: 100, photoCount: 8 });
      const pricier = makeListing({ id: "pricier", price: 130, photoCount: 8 });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [pricier],
        marketPrice: 200,
        lang: "en",
      });

      expect(copy.whyNotCheapest).toBeNull();
    });
  });

  describe("action", () => {
    it("supports a cautious buy when the numbers check out near market", () => {
      const winner = makeListing({ id: "winner", price: 100, photoCount: 8 });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [],
        marketPrice: 200,
        lang: "en",
      });

      expect(copy.action.kind).toBe("buy");
      expect(copy.action.note).toContain("seller's claim");
      expect(copy.action.label.toLowerCase()).not.toContain("must");
    });

    it("suggests waiting when the pick sits well above the market reference", () => {
      const winner = makeListing({ id: "winner", price: 250, photoCount: 8 });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [],
        marketPrice: 200,
        lang: "en",
      });

      expect(copy.action.kind).toBe("wait");
      expect(copy.action.note).toContain("market reference");
    });

    it("suggests waiting for more evidence when there is almost nothing to review", () => {
      const winner = makeListing({
        id: "winner",
        price: 100,
        photoCount: 0,
        feedbackPercentage: null,
        feedbackCount: null,
      });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [],
        marketPrice: 200,
        lang: "en",
      });

      expect(copy.action.kind).toBe("wait");
      expect(copy.action.note.toLowerCase()).toContain("photo");
    });

    it("suggests passing when the seller track record carries risk signals", () => {
      const winner = makeListing({
        id: "winner",
        price: 100,
        photoCount: 8,
        feedbackPercentage: 82,
        feedbackCount: 40,
      });

      expect(winner.riskLabel).toBe("higher_risk");

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [],
        marketPrice: 200,
        lang: "en",
      });

      expect(copy.action.kind).toBe("pass");
      expect(copy.action.note).not.toMatch(/scam|fraud/i);
    });

    it("keeps the action cautious without a market reference", () => {
      const winner = makeListing({ id: "winner", price: 250, photoCount: 8 });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [],
        marketPrice: null,
        lang: "en",
      });

      expect(copy.action.kind).toBe("buy");
      expect(copy.action.note).toContain("seller's claim");
    });

    it("renders the action in Chinese", () => {
      const winner = makeListing({ id: "winner", price: 250, photoCount: 8 });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [],
        marketPrice: 200,
        lang: "zh",
      });

      expect(copy.action.kind).toBe("wait");
      expect(copy.action.note).toContain("市场参考价");
    });
  });
});
