import type { GeneratedPlan, GeneratedPlanSet, PlanInput } from "./schemas";

export function generatePlan(input: PlanInput): GeneratedPlanSet {
  const theme = input.theme || "selected cards";
  const cashReserve = Math.round(input.budget * 0.15);
  const primaryPosition = Math.round(input.budget * 0.4);
  const supportPosition = Math.round(input.budget * 0.28);
  const opportunisticPosition = Math.max(0, input.budget - cashReserve - primaryPosition - supportPosition);

  return {
    input,
    generatedAt: new Date().toISOString(),
    plans: [
      {
        title: `Conservative ${input.ip} ${theme} plan`,
        posture: "Conservative",
        summary:
          "Prioritizes clear versions, lower position size, and liquidity. This path is best when collection enjoyment matters more than grading upside.",
        budgetSplit: [
          `$${Math.round(input.budget * 0.45)} for one clear-version anchor card or PSA9/PSA10 if the slab premium is reasonable.`,
          `$${Math.round(input.budget * 0.25)} for lower-cost promos, early cards, or cards with steady character demand.`,
          `$${cashReserve} cash reserve for cleaner listings or better sold-comp alignment.`,
        ],
        buyConditions: [
          "Version, language, set, and card number are visible or stated clearly.",
          "Price is at or below recent sold-comparable range provided by the user.",
          "Raw cards above $50 include front, back, corner, and surface-angle photos.",
        ],
        doNotBuyConditions: [
          "Seller relies on stock photos or only one front image.",
          "The listing price is close to PSA10 while raw condition is unverified.",
          "The purchase would put more than half the budget into one uncertain card.",
        ],
        sellConditions: [
          "Consider partial exit if net profit exceeds 25-30% and liquidity still looks healthy.",
          "Pause adding more if sold comps disappear for 60 days.",
        ],
        risks: [
          "Lower-risk cards can still be hard to sell quickly.",
          "Safer entries may have less upside than chase versions.",
        ],
        nextActions: [
          "Check one candidate in Listing Risk Checker before buying.",
          "Use Raw vs Slab for any raw card above $50.",
          "Create a Decision Journal entry before purchase.",
        ],
      },
      {
        title: `Balanced ${input.ip} ${theme} plan`,
        posture: "Balanced",
        summary:
          "Balances personal collection value with resale flexibility. It allows one stronger card while keeping room for lower-cost opportunities.",
        budgetSplit: [
          `$${primaryPosition} for one representative card with clear version and credible demand.`,
          `$${supportPosition} for two to three lower-cost cards, promos, or condition-upside raw copies.`,
          `$${opportunisticPosition} for opportunistic raw cards only after listing risk review.`,
          `$${cashReserve} cash buffer.`,
        ],
        buyConditions: [
          "The top card fits the stated holding period and does not consume the full budget.",
          "Raw-vs-slab math is not negative unless the card is mainly for personal collection.",
          "The user can explain the thesis in one journal entry before buying.",
        ],
        doNotBuyConditions: [
          "Version ambiguity is unresolved.",
          "The only upside case depends on PSA10 without photo evidence.",
          "The card conflicts with the selected risk level.",
        ],
        sellConditions: [
          "Review after the holding period or if the card reaches the user-defined target.",
          "Sell or stop adding if fees and shipping remove most of the margin.",
        ],
        risks: [
          "Balanced plans still depend on disciplined entry prices.",
          "Multiple low-cost cards can create inventory clutter for small sellers.",
        ],
        nextActions: [
          "Save this plan to the dashboard.",
          "Run the highest-price candidate through both risk and raw-vs-slab checks.",
          "Add a review date in Decision Journal.",
        ],
      },
      {
        title: `Aggressive ${input.ip} ${theme} plan`,
        posture: "Aggressive",
        summary:
          "Concentrates more budget into one chase card or grading opportunity. It is only suitable when the user accepts volatility and missing-data risk.",
        budgetSplit: [
          `$${Math.round(input.budget * 0.7)} maximum for one high-demand card if entry is below user-provided sold comps.`,
          `$${Math.round(input.budget * 0.2)} for one backup card or lower-cost version.`,
          `$${Math.round(input.budget * 0.1)} cash reserve for fees, shipping, or a cleaner listing.`,
        ],
        buyConditions: [
          "The listing passes risk review with no major condition or version gaps.",
          "Raw-vs-slab expected value is positive and not entirely dependent on optimistic PSA10 odds.",
          "The user is comfortable holding through poor liquidity.",
        ],
        doNotBuyConditions: [
          "No back photo or closeups for a grading-oriented raw card.",
          "Seller makes strong PSA10 claims without evidence.",
          "The card would create over-concentration relative to the monthly budget.",
        ],
        sellConditions: [
          "Set an exit rule before buying, including target net return and stop condition.",
          "Recheck the thesis if reprint or promo rerelease news appears.",
        ],
        risks: [
          "High concentration can make one bad condition call expensive.",
          "Chase cards may have thinner liquidity than active listings suggest.",
          "This path can encourage impulse buying if the journal step is skipped.",
        ],
        nextActions: [
          "Write the stop condition before contacting the seller.",
          "Ask for missing photos before making an offer.",
          "Avoid averaging up unless a new evidence point supports the thesis.",
        ],
      },
    ] satisfies GeneratedPlan[],
  };
}
