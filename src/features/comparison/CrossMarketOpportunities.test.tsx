// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CrossMarketOpportunities } from "./CrossMarketOpportunities";
import { LanguageProvider, setLanguage } from "./i18n";
import { listingFixture as makeVerdictListing } from "@/lib/ai/verdict-note-fixtures";
import type { ComparisonPlatformResult } from "@/lib/schemas";

afterEach(() => { cleanup(); setLanguage("en"); });
const storeSource: ComparisonPlatformResult = {
  id: "stomping-grounds", marketplace: "Stomping Grounds", label: "Stomping Grounds",
  sourceMode: "official_api", configured: true, status: "complete", count: 1, detail: "1 result",
};
describe("cross-market cost checks", () => {
  it.each(["en", "zh"] as const)("shows new configured sources and a maintenance stock warning in %s without roadmap sources", (lang) => {
    setLanguage(lang);
    render(<LanguageProvider><CrossMarketOpportunities candidates={[]} platforms={[
      storeSource,
      { ...storeSource, id: "mercari", marketplace: "Mercari", label: "Mercari", status: "skipped", configured: false, count: 0 },
      { ...storeSource, id: "cardmarket", marketplace: "Cardmarket", label: "Cardmarket", status: "skipped", configured: false, count: 0 },
    ]} /></LanguageProvider>);
    expect(screen.getByText("Stomping Grounds")).toBeTruthy();
    expect(screen.getByText(lang === "zh" ? /商店显示有货，但提醒维护期间库存可能不准确/ : /Store reports stock, but warns inventory may be inaccurate during maintenance/)).toBeTruthy();
    expect(screen.getByText("Mercari")).toBeTruthy();
    expect(screen.queryByText("Cardmarket")).toBeNull();
  });

  it("keeps a store's unknown charges conditional and does not label catalog images as seller photos", () => {
    const candidate = makeVerdictListing({ marketplace: "Stomping Grounds", shipping: null, buyerFee: null,
      costComplete: false, eligible: false, imageUrl: "https://example.com/catalog.jpg",
      evidence: { ...makeVerdictListing().evidence, photoCount: 0 },
      eligibilityIssues: [{ code: "shipping_unknown", category: "cost", disposition: "exclude", message: "Unknown shipping" }] });
    const { container } = render(<LanguageProvider><CrossMarketOpportunities candidates={[candidate]} platforms={[storeSource]} /></LanguageProvider>);
    expect(screen.getByText(/Shipping: unknown · Buyer fees: unknown/)).toBeTruthy();
    expect(screen.getByText(/Individual card photos unavailable/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /seller photos/i })).toBeNull();
    expect(screen.queryByText(/0 seller photos/)).toBeNull();
    expect(container.querySelector("time")?.dateTime).toBe(candidate.observedAt);
    expect(screen.queryByText(/Recommended buy/)).toBeNull();
  });

  it("does not claim store stock when the source returns no offers", () => {
    render(<LanguageProvider><CrossMarketOpportunities candidates={[]} platforms={[{ ...storeSource, count: 0 }]} /></LanguageProvider>);
    expect(screen.getByText("Stomping Grounds")).toBeTruthy();
    expect(screen.queryByText(/Store reports stock/)).toBeNull();
  });

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
