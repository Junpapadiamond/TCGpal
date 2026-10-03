import { describe, expect, it } from "vitest";
import { listingFixture } from "@/lib/ai/verdict-note-fixtures";
import { buildOfferVerdictCopy } from "./offer-verdict-copy";

describe("per-offer verdict language", () => {
  it("scopes a cheapest-only lens to the observed marketplace sample", () => {
    const best = listingFixture({ id: "best", price: 100, shipping: 0, preTaxTotal: 100, valueScore: 90 });
    const cheapest = listingFixture({ id: "cheapest", price: 90, shipping: 0, preTaxTotal: 90, valueScore: 70 });
    expect(buildOfferVerdictCopy(cheapest, [best, cheapest], "en").why).toMatch(/^Among the comparable eBay offers/);
  });
  it.each(["en", "zh"] as const)("does not claim every complete alternative is the best offer in %s", (lang) => {
    const best = listingFixture({ id: "a", price: 100, shipping: 0, preTaxTotal: 100, valueScore: 90 });
    const other = listingFixture({ id: "b", price: 120, shipping: 0, preTaxTotal: 120, valueScore: 70 });
    const copy = buildOfferVerdictCopy(other, [best, other], lang);
    expect(copy.why).not.toMatch(/strongest|lowest comparable|most reviewable|更推荐|最全|最低/);
    expect(copy.why).toContain("$120.00");
    expect(buildOfferVerdictCopy(best, [best, other], lang).why).toContain("eBay");
  });

  it.each(["en", "zh"] as const)("treats equality as no possible saving rather than strictly cheaper in %s", (lang) => {
    const best = listingFixture({ id: "complete", price: 100, shipping: 0, preTaxTotal: 100 });
    const pending = listingFixture({ id: "pending", marketplace: "Whatnot", price: 100, shipping: null, buyerFee: null,
      costComplete: false, eligible: false, eligibilityIssues: [
        { code: "shipping_unknown", category: "cost", disposition: "exclude", message: "Unknown shipping" },
        { code: "buyer_fee_unknown", category: "cost", disposition: "exclude", message: "Unknown fee" },
      ] });
    const copy = buildOfferVerdictCopy(pending, [best, pending], lang);
    expect(copy.why).toMatch(lang === "en" ? /match/ : /已达到/);
    expect(copy.nextStep).not.toMatch(/already cheaper|更低/);
  });
});
