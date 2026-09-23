// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CrossMarketPrices } from "./CrossMarketPrices";
import { LanguageProvider } from "./i18n";
import { listingFixture } from "@/lib/ai/verdict-note-fixtures";
import type { CardIdentityCandidate, ComparisonPlatformResult } from "@/lib/schemas";

afterEach(cleanup);
const platforms: ComparisonPlatformResult[] = ["eBay", "Whatnot", "Mercari"].map((marketplace) => ({
  id: marketplace.toLowerCase(), marketplace: marketplace as ComparisonPlatformResult["marketplace"],
  label: marketplace, sourceMode: "official_api", configured: true, status: "complete", count: 1, detail: "1 result",
}));
const renderPrices = (candidates: ReturnType<typeof listingFixture>[], sources = platforms, card?: CardIdentityCandidate) => render(
  <LanguageProvider><CrossMarketPrices candidates={candidates} platforms={sources} card={card} /></LanguageProvider>,
);

describe("three-marketplace asking prices", () => {
  it("keeps supplementary prices collapsed until the buyer opens them", () => {
    renderPrices([listingFixture({ title: "Supplementary listing", price: 95 })]);
    const disclosure = screen.getByText("View marketplace asking prices").closest("details")!;
    expect(disclosure.open).toBe(false);
    expect(screen.getByRole("link", { name: /View listing/ }).closest("details")).toBe(disclosure);
    fireEvent.click(screen.getByText("View marketplace asking prices"));
    expect(disclosure.open).toBe(true);
    expect(screen.getByRole("link", { name: /View listing/ })).toBeTruthy();
    fireEvent.click(screen.getByText("View marketplace asking prices"));
    expect(disclosure.open).toBe(false);
  });

  it("shows each platform's real asking price even when condition, print evidence or checkout costs need review", () => {
    renderPrices([
      listingFixture({ id: "ebay", title: "eBay card", marketplace: "eBay", price: 95 }),
      listingFixture({ id: "whatnot", title: "Whatnot card", marketplace: "Whatnot", price: 80, shipping: null, buyerFee: null, costComplete: false, eligible: false,
        eligibilityIssues: [{ code: "shipping_unknown", category: "cost", disposition: "exclude", message: "Shipping unknown" }] }),
      listingFixture({ id: "mercari", title: "Mercari card", marketplace: "Mercari", price: 85, claimedCondition: "Unknown", eligible: false,
        eligibilityIssues: [{ code: "identity_unverified", category: "identity", disposition: "exclude", message: "Check the artwork" }, { code: "condition_unstated", category: "condition", disposition: "exclude", message: "Condition unknown" }] }),
    ]);
    fireEvent.click(screen.getByText("View marketplace asking prices"));
    for (const price of ["$95.00", "$80.00", "$85.00"]) expect(screen.getByText(price)).toBeTruthy();
    expect(screen.getByText(/Version needs checking/)).toBeTruthy();
    expect(screen.getByText(/Condition not stated/)).toBeTruthy();
    expect(screen.getByText(/Shipping: unknown/)).toBeTruthy();
    expect(screen.queryByText(/Recommended buy/)).toBeNull();
    expect(screen.getAllByRole("link", { name: /View listing/ })).toHaveLength(3);
  });

  it("does not promote a known wrong print, sold item, slab or excluded product into platform prices", () => {
    renderPrices([
      listingFixture({ id: "sold", active: false, price: 1 }),
      listingFixture({ id: "slab", raw: false, price: 2 }),
      listingFixture({ id: "sibling", price: 3, eligibilityIssues: [{ code: "identity_sibling_mismatch", category: "identity", disposition: "exclude", message: "Wrong print" }] }),
      listingFixture({ id: "replica", price: 4, eligibilityIssues: [{ code: "excluded_product_type", category: "product", disposition: "exclude", message: "Replica" }] }),
    ]);
    fireEvent.click(screen.getByText("View marketplace asking prices"));
    for (const price of ["$1.00", "$2.00", "$3.00", "$4.00"]) expect(screen.queryByText(price)).toBeNull();
    expect(screen.getAllByText(/No matching active listings/)).toHaveLength(3);
  });

  it("shows a failed source as unavailable without turning a stale row into a price", () => {
    renderPrices([listingFixture({ marketplace: "Whatnot", price: 44 })], platforms.map((p) => p.id === "whatnot" ? { ...p, status: "fallback", count: 0 } : p));
    fireEvent.click(screen.getByText("View marketplace asking prices"));
    const source = screen.getByRole("region", { name: "Whatnot prices" });
    expect(within(source).getByText("Unavailable this search")).toBeTruthy();
    expect(within(source).queryByText("$44.00")).toBeNull();
  });

  it("keeps an explicit different collector number out of the selected card's prices", () => {
    renderPrices([
      listingFixture({ id: "wrong", title: "Giratina V 185/196", marketplace: "Mercari", price: 44 }),
      listingFixture({ id: "matching", title: "Giratina V 186/196", marketplace: "Mercari", price: 90 }),
    ], platforms, { id: "swsh11-186", name: "Giratina V", setName: "Lost Origin", setCode: "SWSH11", cardNumber: "186/196", language: "English", imageUrl: null, confidence: "high", matchReasons: [] });
    fireEvent.click(screen.getByText("View marketplace asking prices"));
    expect(screen.queryByText("$44.00")).toBeNull();
    expect(screen.getByText("$90.00")).toBeTruthy();
  });

  it("limits each source to three rows and retains both complete and incomplete price candidates", () => {
    renderPrices([70, 40, 60, 50].map((price) => listingFixture({ id: `whatnot-${price}`, marketplace: "Whatnot", price })));
    fireEvent.click(screen.getByText("View marketplace asking prices"));
    const source = screen.getByRole("region", { name: "Whatnot prices" });
    expect(within(source).getAllByRole("link", { name: /View listing/ })).toHaveLength(3);
    expect(within(source).queryByText("$70.00")).toBeNull();
  });
});
