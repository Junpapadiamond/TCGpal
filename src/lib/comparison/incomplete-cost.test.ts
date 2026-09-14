import { describe, expect, it } from "vitest";
import { incompleteCostOpportunity } from "./incomplete-cost";
import { normalizedListingSchema } from "@/lib/schemas";
import { normalizeListing } from "./ranking";
import { demoListingSeeds, demoIdentities } from "@/lib/comparison/fixtures";

describe("cross-market conditional verdict", () => {
  const base = normalizeListing({ listing: demoListingSeeds[0], buyer: { country: "US", postalCode: "10001", taxRate: null, desiredCondition: "Unknown" }, confirmedCard: demoIdentities[0] });
  const complete = normalizedListingSchema.parse({ ...base, demo: false, eligible: true, price: 100, shipping: 10, preTaxTotal: 110, estimatedTax: null, estimatedLandedCost: null, costComplete: true, eligibilityIssues: [], exclusionReasons: [] });
  const incomplete = normalizedListingSchema.parse({ ...complete, id: "other", price: 90, shipping: null, buyerFee: 0, costComplete: false, eligible: false, eligibilityIssues: [{ code: "shipping_unknown", category: "cost", disposition: "exclude", message: "Unknown shipping" }] });
  it("calculates the break-even amount against the cheapest complete eligible alternative", () => {
    expect(incompleteCostOpportunity(incomplete, [complete])).toMatchObject({ missingCostBudget: 20, comparisonListingId: complete.id, knownSubtotal: 90 });
  });
  it("subtracts known shipping before budgeting unknown buyer fees", () => {
    expect(incompleteCostOpportunity({ ...incomplete, shipping: 5, buyerFee: null }, [complete])).toMatchObject({ missingCostBudget: 15, knownSubtotal: 95 });
  });
  it("does not recommend an ineligible print or invent a benchmark when every cost is incomplete", () => {
    expect(incompleteCostOpportunity({ ...incomplete, eligibilityIssues: [...incomplete.eligibilityIssues, { code: "wrong_print", category: "identity", disposition: "exclude", message: "Wrong print" }] }, [complete])).toBeNull();
    expect(incompleteCostOpportunity(incomplete, [])).toMatchObject({ missingCostBudget: null, comparisonListingId: null });
  });
});
