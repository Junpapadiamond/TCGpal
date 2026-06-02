import type {
  AuthenticityAssessment,
  BuySellDecision,
  BuySellInput,
  ListingRiskReport,
  RawVsSlabResult,
} from "./schemas";

// Deterministic buy/sell evaluator. This is both the offline fallback and the
// numeric source of truth: stance, price-vs-comp, budget fit, and expected-value
// notes are computed in TypeScript. The AI Decision Agent may only enrich the
// narrative on top of this baseline (see hermes.ts mergeBuySell).
//
// Phase 0: sold comps and prices are user-provided. No scraping or live pricing.

export type DecisionSignals = {
  listingReport?: ListingRiskReport;
  authenticity?: AuthenticityAssessment;
  rawResult?: RawVsSlabResult;
};

const usd = (value: number) => `$${Math.round(value)}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;

const resaleGoals = new Set(["Collection + resale", "Grading play", "Small seller inventory"]);

export function evaluateBuySell(input: BuySellInput, signals: DecisionSignals = {}): BuySellDecision {
  const isSell = input.action === "Evaluate sell";
  const { listingReport, authenticity, rawResult } = signals;

  const priceGap = input.soldComp > 0 ? (input.askingPrice - input.soldComp) / input.soldComp : null;
  const concentration = input.monthlyBudget > 0 ? input.askingPrice / input.monthlyBudget : null;
  const considersValue = resaleGoals.has(input.goal);

  const reasoning: string[] = [];
  const risks: string[] = [];
  const missingInfo: string[] = [];

  // ---- deterministic narratives -------------------------------------------
  const priceVsComp =
    priceGap === null
      ? "No recent sold comp was provided, so the price cannot be checked against the market yet."
      : priceGap <= -0.03
        ? `The asking price ${usd(input.askingPrice)} is about ${pct(Math.abs(priceGap))} below the provided sold comp ${usd(input.soldComp)}.`
        : priceGap >= 0.05
          ? `The asking price ${usd(input.askingPrice)} is about ${pct(priceGap)} above the provided sold comp ${usd(input.soldComp)}.`
          : `The asking price ${usd(input.askingPrice)} is roughly in line with the provided sold comp ${usd(input.soldComp)}.`;

  const budgetFit =
    concentration === null
      ? "No monthly budget was provided, so position sizing cannot be assessed."
      : `This position would use about ${pct(concentration)} of the ${usd(input.monthlyBudget)} monthly budget.`;

  const expectedValueNote =
    rawResult && considersValue
      ? `Raw-vs-slab expected profit is ${usd(rawResult.expectedProfit)} with worst case ${usd(rawResult.worstCaseOutcome)}; treat grading upside as conditional on verified condition.`
      : rawResult
        ? "Raw-vs-slab math was calculated but matters less for a personal-collection goal."
        : "No raw-vs-slab math was provided, so any grading upside is unverified.";

  // ---- scoring ------------------------------------------------------------
  let score = 0;

  if (priceGap !== null) {
    if (priceGap <= -0.1) {
      score += 2;
      reasoning.push("Entry is meaningfully below the sold comp, which improves the margin of safety.");
    } else if (priceGap <= -0.03) {
      score += 1;
    } else if (priceGap >= 0.15) {
      score -= 2;
      reasoning.push("Entry is well above the sold comp, so the price is working against you.");
    } else if (priceGap >= 0.05) {
      score -= 1;
      reasoning.push("Entry is somewhat above the sold comp; confirm the comp is recent before paying up.");
    }
  } else {
    missingInfo.push("Recent sold-comparable price");
  }

  if (concentration !== null) {
    if (concentration > 0.5) {
      score -= 2;
      risks.push("This single position would consume over half the monthly budget, which is over-concentration.");
    } else if (concentration > 0.35) {
      score -= 1;
      risks.push("This position is a large share of the monthly budget; keep some reserve.");
    }
  }

  if (listingReport) {
    if (listingReport.score === "High") {
      score -= 2;
      risks.push("The linked listing screens as high risk for condition or version evidence.");
    } else if (listingReport.score === "Medium-High") {
      score -= 1;
    }
    missingInfo.push(...listingReport.missingInfo);
  }

  let authenticityBlocked = false;
  if (authenticity) {
    if (authenticity.authenticityRisk === "High") {
      score -= 3;
      authenticityBlocked = true;
      risks.push("Authenticity risk is high; do not commit funds until genuineness and sourcing are verified.");
    } else if (authenticity.authenticityRisk === "Medium-High") {
      score -= 2;
      risks.push("Authenticity risk is elevated; verify sourcing before buying.");
    } else if (authenticity.authenticityRisk === "Medium") {
      score -= 1;
    }
  }

  if (rawResult && considersValue) {
    if (rawResult.expectedProfit < -0.2 * Math.max(1, input.askingPrice)) {
      score -= 2;
      reasoning.push("Expected grading value is clearly negative at these inputs.");
    } else if (rawResult.expectedProfit < 0) {
      score -= 1;
    } else if (rawResult.expectedProfit > 0) {
      score += 1;
      reasoning.push("Expected grading value is positive at the provided inputs and probabilities.");
    }
  }

  switch (input.collectionNeed) {
    case "Core want / deck need":
      score += 1;
      reasoning.push("This is a core want, so collection value supports the decision even if resale is flat.");
      break;
    case "Duplicate / already have":
      score -= 1;
      reasoning.push("This would be a duplicate, which weakens the case unless the price is a clear discount.");
      break;
    case "Speculative only":
      score -= 1;
      risks.push("A purely speculative buy depends on price and liquidity holding up.");
      break;
    default:
      break;
  }

  if (input.restockRisk === "High (reprint/promo likely)") {
    score -= 1;
    risks.push("Reprint or promo re-release looks likely, which can pressure prices downward.");
  }

  // ---- stance derivation --------------------------------------------------
  const stance = isSell
    ? deriveSellStance(input, priceGap)
    : deriveBuyStance(score, { authenticityBlocked, listingReport, authenticity, lowRisk: input.riskLevel === "Low" });

  // ---- conditions ---------------------------------------------------------
  const buyConditions = isSell
    ? []
    : dedupe([
        "Version, language, set, and card number are confirmed before paying.",
        priceGap !== null && priceGap > 0
          ? "The seller meets a price at or below the recent sold comp."
          : "The price stays at or below the recent sold comp.",
        considersValue ? "Raw-vs-slab math is not strongly negative under realistic grading odds." : null,
        "A stop condition and review date are written in the Decision Journal first.",
      ]);

  const passConditions = isSell
    ? []
    : dedupe([
        authenticity && authenticity.authenticityRisk !== "Low"
          ? "Authenticity or sourcing cannot be verified to your comfort."
          : null,
        listingReport && (listingReport.score === "High" || listingReport.score === "Medium-High")
          ? "The listing's condition or version evidence stays unresolved after seller follow-up."
          : null,
        concentration !== null && concentration > 0.5 ? "The buy would over-concentrate the monthly budget." : null,
        priceGap !== null && priceGap >= 0.15 ? "The price stays well above recent sold comps." : null,
      ]);

  const sellConditions = isSell
    ? dedupe([
        priceGap !== null && priceGap <= 0
          ? "Current sold comps already meet or beat your target, so the exit is realistic now."
          : "Wait until sold comps meet your target, or accept a lower number to exit sooner.",
        input.restockRisk === "High (reprint/promo likely)"
          ? "Consider selling sooner given reprint risk to the price."
          : null,
        "Net the marketplace fee and shipping before judging the realized return.",
      ])
    : dedupe([
        "Set a target net return and a stop condition before buying.",
        "Re-check the thesis if reprint or promo news appears.",
      ]);

  // ---- shared lists -------------------------------------------------------
  if (input.soldComp === 0) missingInfo.push("Recent sold-comparable price");
  if (listingReport) risks.push(...listingReport.keyRisks);
  if (authenticity) risks.push(...authenticity.counterfeitSignals);

  const nextActions = dedupe([
    listingReport ? "Resolve the open seller questions from the Listing Risk Checker." : "Run the listing through the Listing Risk Checker.",
    considersValue ? "Recheck Raw vs Slab with conservative PSA10 odds." : null,
    "Write the thesis, stop condition, and review date in the Decision Journal before acting.",
  ]);

  const assumptions = dedupe([
    "Sold comps and prices are user-provided; there is no live pricing or scraping in this phase.",
    considersValue ? "Grading outcomes use the probabilities you entered, not guaranteed grades." : null,
    "This is cautious planning guidance, not a profit forecast or financial advice.",
  ]);

  const headline = buildHeadline(stance, input.cardName);

  if (reasoning.length === 0) reasoning.push(priceVsComp);
  if (risks.length === 0) risks.push("No major risk signals from the provided inputs, but condition and comps still need verification.");

  return {
    cardName: input.cardName,
    action: input.action,
    stance,
    headline,
    priceVsComp,
    budgetFit,
    expectedValueNote,
    reasoning: dedupe(reasoning),
    buyConditions,
    passConditions,
    sellConditions,
    risks: dedupe(risks),
    missingInfo: dedupe(missingInfo),
    nextActions,
    assumptions,
    linkedSignals: {
      listingRiskScore: listingReport?.score,
      authenticityRisk: authenticity?.authenticityRisk,
      rawVsSlabExpectedProfit: rawResult ? rawResult.expectedProfit : null,
    },
  };
}

function deriveBuyStance(
  score: number,
  ctx: {
    authenticityBlocked: boolean;
    listingReport?: ListingRiskReport;
    authenticity?: AuthenticityAssessment;
    lowRisk: boolean;
  },
): BuySellDecision["stance"] {
  if (ctx.authenticityBlocked) return "Lean pass";

  let stance: BuySellDecision["stance"];
  if (score >= 2) stance = "Lean buy";
  else if (score >= -1) stance = "Buy only if conditions met";
  else if (score >= -3) stance = "Hold / wait";
  else stance = "Lean pass";

  const elevated =
    ctx.listingReport?.score === "High" ||
    ctx.authenticity?.authenticityRisk === "High" ||
    ctx.authenticity?.authenticityRisk === "Medium-High";

  // Never lean fully buy when a hard evidence/authenticity signal is elevated,
  // and stay one notch more cautious for low-risk users.
  if (stance === "Lean buy" && (elevated || ctx.lowRisk)) stance = "Buy only if conditions met";

  return stance;
}

function deriveSellStance(input: BuySellInput, priceGap: number | null): BuySellDecision["stance"] {
  let sellScore = 0;
  if (priceGap !== null && priceGap <= 0) sellScore += 2; // comps already meet/beat target
  if (input.holdingPeriod === "Short-term") sellScore += 1;
  if (input.holdingPeriod === "Long-term collection") sellScore -= 1;
  if (input.restockRisk === "High (reprint/promo likely)") sellScore += 1;
  if (input.collectionNeed === "Core want / deck need") sellScore -= 2;

  if (sellScore >= 2) return "Lean sell";
  if (sellScore >= 0) return "Partial sell";
  return "Hold / wait";
}

function buildHeadline(stance: BuySellDecision["stance"], cardName: string) {
  switch (stance) {
    case "Lean buy":
      return `${cardName}: conditions look favorable, but confirm the buy conditions first.`;
    case "Buy only if conditions met":
      return `${cardName}: only proceed if the listed conditions are satisfied.`;
    case "Hold / wait":
      return `${cardName}: leaning toward waiting until the open questions are resolved.`;
    case "Lean pass":
      return `${cardName}: signals point toward passing for now.`;
    case "Lean sell":
      return `${cardName}: conditions support exiting if the target is realistic.`;
    case "Partial sell":
      return `${cardName}: a partial exit could balance liquidity and upside.`;
    default:
      return cardName;
  }
}

function dedupe(items: (string | null | undefined)[]): string[] {
  return Array.from(new Set(items.filter((item): item is string => Boolean(item))));
}
