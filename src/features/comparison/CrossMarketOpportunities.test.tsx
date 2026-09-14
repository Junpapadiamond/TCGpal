// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CrossMarketOpportunities } from "./CrossMarketOpportunities";
import { LanguageProvider } from "./i18n";
import { listingFixture as makeVerdictListing } from "@/lib/ai/verdict-note-fixtures";

afterEach(cleanup);
describe("cross-market cost checks", () => {
  it("shows a visible conditional verdict with shipping, fees, attribution and time", () => {
    const complete = makeVerdictListing({ id: "ebay", price: 100, shipping: 10, preTaxTotal: 110, eligible: true, eligibilityIssues: [] });
    const candidate = makeVerdictListing({ id: "mercari", marketplace: "Mercari", price: 90, shipping: 5, buyerFee: null, eligible: false, costComplete: false, eligibilityIssues: [{ code: "buyer_fee_unknown", category: "cost", disposition: "exclude", message: "Unknown buyer fee" }] });
    render(<LanguageProvider><CrossMarketOpportunities candidates={[complete, candidate]} platforms={[{ id: "mercari", marketplace: "Mercari", label: "Mercari", sourceMode: "third_party_provider", status: "complete", configured: true, count: 1, detail: "1 result" }]} /></LanguageProvider>);
    expect(screen.getByText(/fees stay below \$15.00/)).toBeTruthy();
    expect(screen.getByText(/Apify/)).toBeTruthy();
    expect(screen.getByText(/Buyer fees: unknown/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Check checkout on Mercari/ })).toBeTruthy();
    expect(screen.queryByText(/Recommended buy/)).toBeNull();
  });

  it("attributes direct Mercari page data without claiming it came from Apify", () => {
    const candidate = makeVerdictListing({ marketplace: "Mercari", buyerFee: null, costComplete: false, eligible: false,
      eligibilityIssues: [{ code: "buyer_fee_unknown", category: "cost", disposition: "exclude", message: "Unknown buyer fee" }] });
    render(<LanguageProvider><CrossMarketOpportunities candidates={[candidate]} platforms={[{ id: "mercari", marketplace: "Mercari", label: "Mercari", sourceMode: "browser_dom", status: "complete", configured: true, count: 1, detail: "1 result" }]} /></LanguageProvider>);
    expect(screen.getByText(/Listing page data/)).toBeTruthy();
    expect(screen.queryByText(/Apify/)).toBeNull();
  });
});
