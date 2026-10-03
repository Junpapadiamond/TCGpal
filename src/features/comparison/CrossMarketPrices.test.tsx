// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CrossMarketPrices } from "./CrossMarketPrices";
import { LanguageProvider, setLanguage } from "./i18n";
import { listingFixture } from "@/lib/ai/verdict-note-fixtures";
import type { CardIdentityCandidate, ComparisonPlatformResult } from "@/lib/schemas";

afterEach(() => { cleanup(); setLanguage("en"); });
const platforms: ComparisonPlatformResult[] = ["eBay", "Whatnot", "Mercari"].map((marketplace) => ({
  id: marketplace.toLowerCase(), marketplace: marketplace as ComparisonPlatformResult["marketplace"],
  label: marketplace, sourceMode: "official_api", configured: true, status: "complete", count: 1, detail: "1 result",
}));
const renderPrices = (candidates: ReturnType<typeof listingFixture>[], sources = platforms, card?: CardIdentityCandidate) => render(
  <LanguageProvider><CrossMarketPrices candidates={candidates} platforms={sources} card={card} /></LanguageProvider>,
);
const storeSource: ComparisonPlatformResult = {
  id: "stomping-grounds", marketplace: "Stomping Grounds", label: "Stomping Grounds",
  sourceMode: "official_api", configured: true, status: "complete", count: 1, detail: "1 result",
};
const openOffers = () => document.querySelectorAll("summary").forEach((summary) => fireEvent.click(summary));

describe("three-marketplace asking prices", () => {
  it("shows a visible verdict and source preview on each market before opening other offers", () => {
    renderPrices([
      listingFixture({ id: "ebay-visible", marketplace: "eBay", title: "eBay lead", price: 100, shipping: 5, preTaxTotal: 105 }),
      listingFixture({ id: "whatnot-visible", marketplace: "Whatnot", title: "Whatnot lead", price: 90,
        imageUrl: "https://images.whatnot.com/preview.jpg", imageUrls: [], imageKind: "listing_preview",
        shipping: null, buyerFee: null, costComplete: false, eligible: false,
        eligibilityIssues: [{ code: "shipping_unknown", category: "cost", disposition: "exclude", message: "Unknown shipping" },
          { code: "buyer_fee_unknown", category: "cost", disposition: "exclude", message: "Unknown buyer fees" }] }),
      listingFixture({ id: "mercari-visible", marketplace: "Mercari", title: "Mercari lead", price: 95,
        imageUrl: "https://u-mercari-images.mercdn.net/photos/preview.jpg", imageUrls: [], imageKind: "listing_preview",
        shipping: null, buyerFee: null, costComplete: false, eligible: false,
        eligibilityIssues: [{ code: "shipping_unknown", category: "cost", disposition: "exclude", message: "Unknown shipping" },
          { code: "buyer_fee_unknown", category: "cost", disposition: "exclude", message: "Unknown buyer fees" }] }),
    ]);
    for (const marketplace of ["eBay", "Whatnot", "Mercari"]) {
      const region = screen.getByRole("region", { name: `${marketplace} prices` });
      expect(within(region).getByText("Verdict")).toBeTruthy();
      expect(within(region).getByText("Card-match confidence: high")).toBeTruthy();
      expect(within(region).getByRole("link", { name: /View listing/ }).closest("details")).toBeNull();
    }
    expect(screen.getByRole("button", { name: "Inspect listing preview: Whatnot lead" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Inspect listing preview: Mercari lead" })).toBeTruthy();
    expect(screen.getByText(/shipping \+ buyer fees stay below \$15.00/i)).toBeTruthy();
    expect(screen.getByText(/shipping \+ buyer fees stay below \$10.00/i)).toBeTruthy();
    expect(screen.queryByText(/Reasonable to buy/)).not.toBeNull();
  });

  it("leads with a condition-compatible offer rather than a flagged low item price", () => {
    renderPrices([
      listingFixture({ id: "mercari-anomaly", marketplace: "Mercari", title: "Unusual cheap card", price: 45,
        claimedCondition: "Unknown", eligible: false, eligibilityIssues: [{ code: "price_below_market_floor", category: "price", disposition: "exclude", message: "Inspect price" }] }),
      listingFixture({ id: "mercari-review", marketplace: "Mercari", title: "NM card worth checking", price: 138.89,
        shipping: null, buyerFee: null, costComplete: false, eligible: false,
        eligibilityIssues: [{ code: "shipping_unknown", category: "cost", disposition: "exclude", message: "Unknown shipping" }] }),
    ]);
    const source = screen.getByRole("region", { name: "Mercari prices" });
    expect(within(source).getByText("NM card worth checking").closest("details")).toBeNull();
    expect(within(source).getByText("Unusual cheap card").closest("details")).not.toBeNull();
    expect(within(source).getByText("Other 1 offer")).toBeTruthy();
  });

  it("does not show a complete-total label when a stale payload flag contradicts unknown charges", () => {
    renderPrices([listingFixture({ marketplace: "Whatnot", shipping: null, buyerFee: null, costComplete: true })]);
    const source = screen.getByRole("region", { name: "Whatnot prices" });
    expect(within(source).queryByText("pre-tax total")).toBeNull();
    expect(within(source).getByText("item price · total unconfirmed")).toBeTruthy();
  });
  it.each([
    ["en", "Whatnot"], ["zh", "Whatnot"], ["en", "Mercari"], ["zh", "Mercari"],
  ] as const)("attributes Soldgraph offers in %s on %s without inventing fees", (lang, marketplace) => {
    setLanguage(lang);
    renderPrices([listingFixture({ marketplace, shipping: null, buyerFee: null, costComplete: false, eligible: false,
      eligibilityIssues: [{ code: "shipping_unknown", category: "cost", disposition: "exclude", message: "Unknown shipping" }] })],
    platforms.map((source) => source.marketplace === marketplace ? { ...source, sourceMode: "third_party_provider", label: `${marketplace} via Soldgraph`, detail: "Private provider diagnostic" } : source));
    openOffers();
    const source = screen.getByRole("region", { name: lang === "zh" ? `${marketplace} 标价` : `${marketplace} prices` });
    expect(within(source).getByText(lang === "zh" ? /Soldgraph 数据源/ : /Source: Soldgraph/)).toBeTruthy();
    expect(within(source).getByText(lang === "zh" ? "Soldgraph 报告这些商品在售，请到平台确认是否仍有货。" : "Soldgraph reports these listings as active. Confirm availability on the marketplace.")).toBeTruthy();
    expect(within(source).queryByText(/Apify/)).toBeNull();
    expect(within(source).getByText(lang === "zh" ? /运费: 未知 · 买家手续费: 未知/ : /Shipping: unknown · Buyer fees: unknown/)).toBeTruthy();
    expect(screen.queryByText("Private provider diagnostic")).toBeNull();
  });

  it.each(["en", "zh"] as const)("preserves existing Apify attribution in %s", (lang) => {
    setLanguage(lang);
    renderPrices([listingFixture({ marketplace: "Whatnot" })], platforms.map((source) => source.marketplace === "Whatnot"
      ? { ...source, sourceMode: "third_party_provider", label: "Whatnot via Apify" } : source));
    openOffers();
    expect(screen.getByText(lang === "zh" ? /Apify 数据源/ : /Source: Apify/)).toBeTruthy();
    expect(screen.queryByText(/Soldgraph/)).toBeNull();
  });

  it.each(["en", "zh"] as const)("shows an additional configured store with unknown costs and its stock warning in %s", (lang) => {
    setLanguage(lang);
    renderPrices([listingFixture({ marketplace: "Stomping Grounds", title: "Store card", price: 85,
      shipping: null, buyerFee: null, costComplete: false, eligible: false,
      eligibilityIssues: [{ code: "shipping_unknown", category: "cost", disposition: "exclude", message: "Unknown shipping" }] })],
    [...platforms, storeSource, { ...storeSource, id: "cardmarket", marketplace: "Cardmarket", label: "Cardmarket", configured: false, status: "skipped", count: 0 }]);
    openOffers();
    const source = screen.getByRole("region", { name: lang === "zh" ? "Stomping Grounds 标价" : "Stomping Grounds prices" });
    expect(within(source).getByText("$85.00")).toBeTruthy();
    expect(within(source).getByText(lang === "zh" ? /商店显示有货，但提醒维护期间库存可能不准确/ : /Store reports stock, but warns inventory may be inaccurate during maintenance/)).toBeTruthy();
    expect(within(source).getByText(lang === "zh" ? /运费: 未知 · 买家手续费: 未知/ : /Shipping: unknown · Buyer fees: unknown/)).toBeTruthy();
    expect(source.querySelector("time")?.dateTime).toBe("2026-08-10T15:00:00.000Z");
    expect(screen.queryByRole("region", { name: /Cardmarket/ })).toBeNull();
  });

  it("uses the existing print, stock and raw-card filters for an additional store", () => {
    renderPrices([
      listingFixture({ id: "sold-store", marketplace: "Stomping Grounds", active: false, price: 1 }),
      listingFixture({ id: "slab-store", marketplace: "Stomping Grounds", raw: false, price: 2 }),
      listingFixture({ id: "sibling-store", marketplace: "Stomping Grounds", price: 3, printMatch: "mismatch" }),
      listingFixture({ id: "valid-store", marketplace: "Stomping Grounds", title: "Correct store card", price: 85 }),
    ], [...platforms, storeSource]);
    openOffers();
    const source = screen.getByRole("region", { name: "Stomping Grounds prices" });
    for (const price of ["$1.00", "$2.00", "$3.00"]) expect(within(source).queryByText(price)).toBeNull();
    expect(within(source).getAllByRole("link", { name: /View listing/ })).toHaveLength(1);
    expect(within(source).getByText("$85.00")).toBeTruthy();
  });

  it("shows an additional configured store's failure without stale prices", () => {
    renderPrices([listingFixture({ marketplace: "Stomping Grounds", price: 85 })],
      [...platforms, { ...storeSource, status: "fallback", count: 0 }]);
    openOffers();
    const source = screen.getByRole("region", { name: "Stomping Grounds prices" });
    expect(within(source).getByText("Temporarily unavailable")).toBeTruthy();
    expect(within(source).queryByText("$85.00")).toBeNull();
  });

  it.each(["empty", "filtered"] as const)("does not claim store stock when its asking-price rows are %s", (kind) => {
    renderPrices(kind === "filtered" ? [listingFixture({ marketplace: "Stomping Grounds", printMatch: "mismatch" })] : [],
      [...platforms, { ...storeSource, count: kind === "filtered" ? 1 : 0 }]);
    openOffers();
    const source = screen.getByRole("region", { name: "Stomping Grounds prices" });
    expect(within(source).getByText("No matching active listings")).toBeTruthy();
    expect(within(source).queryByText(/Store reports stock/)).toBeNull();
  });

  it("shows unavailable sources once with a manual search, without exposing internal allowance messages", () => {
    renderPrices([], platforms.map((p) => p.id === "whatnot" ? { ...p, status: "fallback", count: 0, detail: "Cross-market pilot budget reached; this source is paused." } : p),
      { id: "swsh11-186", name: "Giratina V", setName: "Lost Origin", setCode: "SWSH11", cardNumber: "186/196", language: "English", imageUrl: null, confidence: "high", matchReasons: [] });
    const source = screen.getByRole("region", { name: "Whatnot prices" });
    expect(within(source).getByText("Temporarily unavailable")).toBeTruthy();
    expect(within(source).getByRole("link", { name: "Search Whatnot manually" }).getAttribute("href")).toContain("186%2F196");
    expect(screen.queryByText(/pilot|allowance|quota/i)).toBeNull();
    expect(screen.getAllByRole("region", { name: "Across marketplaces" })).toHaveLength(1);
  });

  it("keeps other offers collapsed while the primary verdict stays visible", () => {
    renderPrices([listingFixture({ id: "primary", title: "Primary listing", price: 95 }), listingFixture({ id: "other", title: "Other listing", price: 100 })]);
    const disclosure = screen.getByText("Other 1 offer").closest("details") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.getByText("Primary listing").closest("details")).toBeNull();
    expect(screen.getByText("Other listing").closest("details")).toBe(disclosure);
    fireEvent.click(screen.getByText("Other 1 offer"));
    expect(disclosure.open).toBe(true);
    expect(screen.getAllByRole("link", { name: /View listing/ })).toHaveLength(2);
    fireEvent.click(screen.getByText("Other 1 offer"));
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
    openOffers();
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
    openOffers();
    for (const price of ["$1.00", "$2.00", "$3.00", "$4.00"]) expect(screen.queryByText(price)).toBeNull();
    expect(screen.getAllByText(/No matching active listings/)).toHaveLength(3);
  });

  it("shows a failed source as unavailable without turning a stale row into a price", () => {
    renderPrices([listingFixture({ marketplace: "Whatnot", price: 44 })], platforms.map((p) => p.id === "whatnot" ? { ...p, status: "fallback", count: 0 } : p));
    openOffers();
    const source = screen.getByRole("region", { name: "Whatnot prices" });
    expect(within(source).getByText("Temporarily unavailable")).toBeTruthy();
    expect(within(source).queryByText("$44.00")).toBeNull();
  });

  it("keeps an explicit different collector number out of the selected card's prices", () => {
    renderPrices([
      listingFixture({ id: "wrong", title: "Giratina V 185/196", marketplace: "Mercari", price: 44 }),
      listingFixture({ id: "matching", title: "Giratina V 186/196", marketplace: "Mercari", price: 90 }),
    ], platforms, { id: "swsh11-186", name: "Giratina V", setName: "Lost Origin", setCode: "SWSH11", cardNumber: "186/196", language: "English", imageUrl: null, confidence: "high", matchReasons: [] });
    openOffers();
    expect(screen.queryByText("$44.00")).toBeNull();
    expect(screen.getByText("$90.00")).toBeTruthy();
  });

  it("limits each source to three rows and retains both complete and incomplete price candidates", () => {
    renderPrices([70, 40, 60, 50].map((price) => listingFixture({ id: `whatnot-${price}`, marketplace: "Whatnot", price })));
    openOffers();
    const source = screen.getByRole("region", { name: "Whatnot prices" });
    expect(within(source).getAllByRole("link", { name: /View listing/ })).toHaveLength(3);
    expect(within(source).queryByText("$70.00")).toBeNull();
  });
});
