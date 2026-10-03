import { describe, expect, it } from "vitest";
import { listingFixture } from "@/lib/ai/verdict-note-fixtures";
import type { EligibilityIssue, NormalizedListing } from "@/lib/schemas";
import { buildOfferVerdict, selectMarketOffer } from "./offer-verdict";

const issue = (code: string, category: EligibilityIssue["category"], disposition: EligibilityIssue["disposition"] = "exclude"): EligibilityIssue => ({
  code, category, disposition, message: code,
});
const missingCosts = [issue("shipping_unknown", "cost"), issue("buyer_fee_unknown", "cost")];
const incomplete = (overrides: Partial<NormalizedListing> = {}) => listingFixture({
  id: "whatnot", marketplace: "Whatnot", price: 90, shipping: null, buyerFee: null,
  preTaxTotal: 90, costComplete: false, eligible: false, printMatch: "compatible",
  eligibilityIssues: missingCosts, ...overrides,
});
const benchmark = () => listingFixture({ id: "complete", price: 100, shipping: 10, buyerFee: 0 });

describe("deterministic offer verdict", () => {
  it("uses consider only for eligible, complete, confirmed offers", () => {
    expect(buildOfferVerdict(benchmark(), []).kind).toBe("consider");
    expect(buildOfferVerdict(incomplete(), []).kind).toBe("conditional");
    expect(buildOfferVerdict(incomplete({ marketplace: "Mercari" }), []).kind).not.toBe("consider");
  });

  it("accepts compatible print evidence and computes a conditional pre-tax break-even", () => {
    const verdict = buildOfferVerdict(incomplete(), [benchmark()]);
    expect(verdict).toMatchObject({ kind: "conditional", identityConfirmed: true, conditionConfirmed: true,
      missingCharges: ["shipping", "buyer_fee"], knownSubtotal: 90,
      comparison: { knownSubtotal: 90, comparisonListingId: "complete", missingCostBudget: 20 } });
  });

  it("keeps a useful conditional verdict when no complete benchmark exists", () => {
    expect(buildOfferVerdict(incomplete(), []).comparison).toMatchObject({ comparisonListingId: null, missingCostBudget: null });
    expect(buildOfferVerdict(incomplete(), []).missingCharges).toEqual(["shipping", "buyer_fee"]);
  });

  it("does not treat tax estimates or unknown fees as the conditional benchmark", () => {
    const complete = benchmark();
    const verdict = buildOfferVerdict(incomplete({ shipping: 5, buyerFee: null, eligibilityIssues: [missingCosts[1]] }), [
      { ...complete, estimatedTax: 20, estimatedLandedCost: 130 },
      incomplete({ id: "lower-incomplete", price: 1 }),
    ]);
    expect(verdict).toMatchObject({ knownSubtotal: 95, missingCharges: ["buyer_fee"], comparison: { missingCostBudget: 15 } });
  });

  it.each(["condition_below_requested", "title_condition_below_requested"])("passes an actual condition conflict (%s)", (code) => {
    expect(buildOfferVerdict(incomplete({ claimedCondition: "Lightly Played", conditionCompatibilityScore: 0,
      eligibilityIssues: [...missingCosts, issue(code, "condition")] }), []).kind).toBe("pass");
  });

  it("inspects unknown requested condition instead of inferring NM", () => {
    const verdict = buildOfferVerdict(incomplete({ claimedCondition: "Unknown", conditionCompatibilityScore: 0,
      eligibilityIssues: [...missingCosts, issue("condition_unstated", "condition")] }), [benchmark()]);
    expect(verdict).toMatchObject({ kind: "inspect", conditionConfirmed: false, comparison: null,
      primaryIssue: { code: "condition_unstated" }, missingCharges: ["shipping", "buyer_fee"] });
  });

  it.each(["price_far_below_market", "identity_price_guard", "price_far_above_exact_market"])("inspects suspicious price (%s) without a bargain verdict", (code) => {
    const verdict = buildOfferVerdict(incomplete({ eligibilityIssues: [...missingCosts, issue(code, "price", code.includes("above") ? "review" : "exclude")] }), [benchmark()]);
    expect(verdict).toMatchObject({ kind: "inspect", priceNeedsReview: true, comparison: null, primaryIssue: { code } });
  });

  it("keeps unresolved identity inspectable without a complete-cost benchmark", () => {
    const verdict = buildOfferVerdict(incomplete({ printMatch: "unknown", eligibilityIssues: [...missingCosts, issue("identity_unverified", "identity")] }), []);
    expect(verdict).toMatchObject({ kind: "inspect", identityConfirmed: false, comparison: null,
      primaryIssue: { code: "identity_unverified" }, knownSubtotal: 90 });
  });

  it.each([
    ["excluded_product_type", "product"], ["identity_sibling_mismatch", "identity"],
    ["language_conflict", "language"], ["listing_inactive", "availability"],
  ] as const)("passes a hard disqualifier (%s)", (code, category) => {
    expect(buildOfferVerdict(incomplete({ eligibilityIssues: [...missingCosts, issue(code, category)] }), []).kind).toBe("pass");
  });

  it("does not promote a stale eligible flag or silently missing cost issues", () => {
    expect(buildOfferVerdict(incomplete({ eligible: true, eligibilityIssues: [] }), []).kind).toBe("conditional");
    expect(buildOfferVerdict({ ...benchmark(), eligible: false, eligibilityIssues: [] }, []).kind).toBe("inspect");
    expect(buildOfferVerdict({ ...benchmark(), printMatch: "unknown", eligibilityIssues: [] }, []).kind).toBe("inspect");
    expect(buildOfferVerdict({ ...benchmark(), raw: false, eligibilityIssues: [] }, []).kind).toBe("pass");
  });

  it("does not mistake a known incompatible condition with absent issues for a conditional fit", () => {
    expect(buildOfferVerdict(incomplete({ claimedCondition: "Lightly Played", conditionCompatibilityScore: 0,
      eligibilityIssues: missingCosts }), []).kind).toBe("pass");
  });

  it("does not claim confirmed identity when the overall match is low confidence", () => {
    expect(buildOfferVerdict(incomplete({ matchConfidence: "low" }), [])).toMatchObject({
      kind: "inspect", identityConfirmed: false, primaryIssue: { code: "identity_low_confidence" },
    });
  });

  it("sums known money in integer cents and leaves missing fields unchanged", () => {
    const listing = incomplete({ price: 0.1, shipping: 0.2, buyerFee: 0.3 });
    expect(buildOfferVerdict(listing, []).knownSubtotal).toBe(0.6);
    expect(listing.costComplete).toBe(false);
  });
});

describe("per-market offer selection", () => {
  it("reuses Best Value ranking for complete eligible market offers", () => {
    const cheap = listingFixture({ id: "cheap", price: 90, shipping: 0, valueScore: 50 });
    const best = listingFixture({ id: "best", price: 100, shipping: 0, valueScore: 90 });
    expect(selectMarketOffer([cheap, best, incomplete()], "eBay")?.id).toBe("best");
  });

  it("prefers conditional known-condition offers over normal unknown-condition and suspicious prices", () => {
    const suspect = incomplete({ id: "suspect", marketplace: "Mercari", price: 45,
      eligibilityIssues: [...missingCosts, issue("price_far_below_market", "price")] });
    const unknownCondition = incomplete({ id: "unknown", marketplace: "Mercari", price: 135,
      claimedCondition: "Unknown", conditionCompatibilityScore: 0,
      eligibilityIssues: [...missingCosts, issue("condition_unstated", "condition")] });
    const nm = incomplete({ id: "nm", marketplace: "Mercari", price: 138.89 });
    expect(selectMarketOffer([suspect, unknownCondition, nm], "Mercari")?.id).toBe("nm");
    expect(selectMarketOffer([suspect, unknownCondition], "Mercari")?.id).toBe("unknown");
  });

  it("prefers proved identity before item price among inspectable offers", () => {
    const unproved = incomplete({ id: "unproved", price: 50, printMatch: "unknown",
      eligibilityIssues: [...missingCosts, issue("identity_unverified", "identity")] });
    const unknownCondition = incomplete({ id: "proved", price: 100, claimedCondition: "Unknown", conditionCompatibilityScore: 0,
      eligibilityIssues: [...missingCosts, issue("condition_unstated", "condition")] });
    expect(selectMarketOffer([unproved, unknownCondition], "Whatnot")?.id).toBe("proved");
  });

  it("uses known subtotal then stable ID ties without mutating candidates", () => {
    const a = incomplete({ id: "a", price: 90 });
    const b = incomplete({ id: "b", price: 85, shipping: 10 });
    const c = incomplete({ id: "c", price: 90 });
    const candidates = [b, c, a];
    expect(selectMarketOffer(candidates, "Whatnot")?.id).toBe("a");
    expect(candidates.map((row) => row.id)).toEqual(["b", "c", "a"]);
  });

  it("returns null for absent markets or hard-disqualified rows", () => {
    expect(selectMarketOffer([incomplete()], "Mercari")).toBeNull();
    expect(selectMarketOffer([incomplete({ active: false })], "Whatnot")).toBeNull();
  });
});
