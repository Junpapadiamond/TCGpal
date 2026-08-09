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
  shipping = 5,
}: {
  id: string;
  price: number;
  photoCount: number;
  feedbackPercentage?: number | null;
  feedbackCount?: number | null;
  returnsAccepted?: boolean | null;
  userSupplied?: boolean;
  taxRate?: number | null;
  shipping?: number;
}): NormalizedListing {
  return normalizeListing({
    listing: {
      ...demoListingSeeds[0],
      id,
      title: `${id} seller-stated Near Mint listing`,
      price,
      shipping,
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

    expect(copy.why).toContain("卖家标注近全新（NM）");
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

    it("names the cheaper copy's seller numbers instead of calling them signals", () => {
      const winner = makeListing({ id: "winner", price: 120, photoCount: 8 });
      const cheaper = makeListing({
        id: "cheaper",
        price: 100,
        photoCount: 8,
        feedbackPercentage: 82,
        feedbackCount: 40,
      });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [cheaper],
        marketPrice: 200,
        lang: "en",
      });

      expect(cheaper.riskLabel).toBe("higher_risk");
      expect(copy.whyNotCheapest).toContain("82%");
      expect(copy.whyNotCheapest).toContain("40");
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
      // The note is the next step, not a restatement: "What to know" already
      // carries the caveat, and repeating it is what made this read generic.
      expect(copy.action.note).toContain("8 photos");
      expect(copy.action.label.toLowerCase()).not.toContain("must");
    });

    it("writes a different buy note depending on how much there is to inspect", () => {
      const many = makeListing({ id: "many", price: 100, photoCount: 8 });
      const few = makeListing({ id: "few", price: 100, photoCount: 4 });

      const manyCopy = buildVerdictCopy({ listing: many, choice: choice("best_value", many.id), alternatives: [], marketPrice: 200, lang: "en" });
      const fewCopy = buildVerdictCopy({ listing: few, choice: choice("best_value", few.id), alternatives: [], marketPrice: 200, lang: "en" });

      expect(manyCopy.action.note).not.toBe(fewCopy.action.note);
      expect(fewCopy.action.note).toContain("4 photos");
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
      // We have no supply or restock data, so the note must not imply that
      // cheaper copies will appear later.
      expect(copy.action.note).not.toMatch(/turn up|come down|cool|drop|regularly|supply/i);
    });

    it("points an over-market wait at the cheaper copies already in the comparison", () => {
      const winner = makeListing({ id: "winner", price: 250, photoCount: 8 });
      const cheaper = makeListing({ id: "cheaper", price: 190, photoCount: 5 });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [cheaper],
        marketPrice: 200,
        lang: "en",
      });

      expect(copy.action.kind).toBe("wait");
      expect(copy.action.note).toMatch(/cheaper copies in this comparison/i);
    });

    it("does not warn that supply is expensive when only shipping and tax lift checkout total", () => {
      const winner = makeListing({
        id: "winner",
        price: 202,
        shipping: 28,
        taxRate: 0.08,
        photoCount: 8,
      });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [],
        marketPrice: 200,
        lang: "en",
      });

      expect(winner.estimatedLandedCost).toBe(248.4);
      expect(copy.action.kind).toBe("buy");
      expect(copy.action.note).not.toContain("over the $200.00 market reference");
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
      // "carries risk signals" told the buyer nothing. The numbers that set the
      // label are already on the listing, so name them.
      expect(copy.action.note).toContain("82%");
      expect(copy.action.note).toContain("40");
    });

    it("names the same seller numbers in Chinese", () => {
      const winner = makeListing({
        id: "winner",
        price: 100,
        photoCount: 8,
        feedbackPercentage: 82,
        feedbackCount: 40,
      });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [],
        marketPrice: 200,
        lang: "zh",
      });

      expect(copy.action.kind).toBe("pass");
      expect(copy.action.note).toContain("82%");
      expect(copy.action.note).toContain("40");
    });

    it("falls back to the general wording when the seller numbers are missing", () => {
      const winner = makeListing({
        id: "winner",
        price: 100,
        photoCount: 8,
        feedbackPercentage: null,
        feedbackCount: 3,
      });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [],
        marketPrice: 200,
        lang: "en",
      });

      // Whatever the label, the note must never invent a percentage.
      expect(copy.action.note).not.toMatch(/\d+% positive/);
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
      expect(copy.action.note).toContain("8 photos");
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

  // We hold no restock, supply, or price-history data, so no action note in
  // either language may imply that a cheaper or better copy will show up later.
  it("never promises future supply in any action note", () => {
    const cases: NormalizedListing[] = [
      makeListing({ id: "buy", price: 100, photoCount: 8 }),
      makeListing({ id: "over-market", price: 250, photoCount: 8 }),
      makeListing({ id: "thin", price: 100, photoCount: 0, feedbackPercentage: null, feedbackCount: null }),
      makeListing({ id: "risky", price: 100, photoCount: 8, feedbackPercentage: 82, feedbackCount: 40 }),
    ];

    for (const listing of cases) {
      for (const lang of ["en", "zh"] as const) {
        const copy = buildVerdictCopy({
          listing,
          choice: choice("best_value", listing.id),
          alternatives: [],
          marketPrice: 200,
          lang,
        });
        expect(copy.action.note, `${listing.id}/${lang}`).not.toMatch(
          /turn up|come down|cool off|restock|more will|supply is|等更稳|等降价|会降|再等等更/i,
        );
      }
    }
  });

  // The anchor is missing for a large share of the catalogue (both Base Set
  // cards and every One Piece card measured on 2026-08-10), and where it does
  // exist, same-day asks for one card spread over 30+ points — wider than the
  // wait threshold. Position within the comparison needs no anchor and cannot
  // be miscalibrated, so it is the price read that always works.
  describe("pricePosition", () => {
    it("ranks the pick among the comparable copies", () => {
      const winner = makeListing({ id: "winner", price: 120, photoCount: 8 });
      const alternatives = [90, 100, 150].map((price, index) => makeListing({ id: `alt-${index}`, price, photoCount: 4 }));

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives,
        marketPrice: 200,
        lang: "en",
      });

      expect(copy.pricePosition).toBe("3rd cheapest of 4 comparable copies");
    });

    it("says so plainly when the pick is the cheapest", () => {
      const winner = makeListing({ id: "winner", price: 80, photoCount: 8 });
      const alternatives = [90, 100].map((price, index) => makeListing({ id: `alt-${index}`, price, photoCount: 4 }));

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives,
        marketPrice: 200,
        lang: "en",
      });

      expect(copy.pricePosition).toBe("Cheapest of 3 comparable copies");
    });

    it("works with no market reference at all", () => {
      const winner = makeListing({ id: "winner", price: 120, photoCount: 8 });
      const alternatives = [90, 100].map((price, index) => makeListing({ id: `alt-${index}`, price, photoCount: 4 }));

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives,
        marketPrice: null,
        lang: "en",
      });

      expect(copy.pricePosition).toBe("3rd cheapest of 3 comparable copies");
    });

    it("is null when there is nothing to compare against", () => {
      const winner = makeListing({ id: "winner", price: 120, photoCount: 8 });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [],
        marketPrice: 200,
        lang: "en",
      });

      expect(copy.pricePosition).toBeNull();
    });

    it("renders the position in Chinese", () => {
      const winner = makeListing({ id: "winner", price: 120, photoCount: 8 });
      const alternatives = [90, 100].map((price, index) => makeListing({ id: `alt-${index}`, price, photoCount: 4 }));

      const cheapest = buildVerdictCopy({
        listing: makeListing({ id: "cheap", price: 10, photoCount: 8 }),
        choice: choice("best_value", "cheap"),
        alternatives,
        marketPrice: 200,
        lang: "zh",
      });
      const third = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives,
        marketPrice: 200,
        lang: "zh",
      });

      expect(cheapest.pricePosition).toBe("3 条可比商品里最便宜");
      expect(third.pricePosition).toBe("3 条可比商品里第 3 便宜");
    });

    it("ranks on comparable cost, not item price alone", () => {
      const winner = makeListing({ id: "winner", price: 100, shipping: 40, photoCount: 8 });
      const rival = makeListing({ id: "rival", price: 110, shipping: 5, photoCount: 8 });

      const copy = buildVerdictCopy({
        listing: winner,
        choice: choice("best_value", winner.id),
        alternatives: [rival],
        marketPrice: 200,
        lang: "en",
      });

      expect(winner.preTaxTotal).toBeGreaterThan(rival.preTaxTotal);
      expect(copy.pricePosition).toBe("2nd cheapest of 2 comparable copies");
    });
  });
});
