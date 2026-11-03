// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { listingFixture } from "@/lib/ai/verdict-note-fixtures";
import { LanguageProvider, setLanguage } from "./i18n";
import { ListingSignals } from "./ListingSignals";

afterEach(() => { cleanup(); setLanguage("en"); });
const show = (listing = listingFixture(), marketPrice: number | null = 1000) => render(
  <LanguageProvider><ListingSignals listing={listing} marketPrice={marketPrice} /></LanguageProvider>,
);

describe("compact listing signals", () => {
  it("orders condition, seller record and item-price comparison without a card-match tile", () => {
    show(listingFixture({ price: 800, shipping: 300, preTaxTotal: 1100 }));
    expect(screen.getAllByRole("term").map(node => node.textContent)).toEqual(["Condition", "Seller record", "Price vs market"]);
    expect(screen.getByText("Seller claim")).toBeTruthy();
    expect(screen.getByText("−20%")).toBeTruthy();
    expect(screen.getByText("Item vs $1,000.00")).toBeTruthy();
    expect(screen.queryByText("Card match")).toBeNull();
  });
  it("keeps missing seller data neutral and never converts a provider preview into photo evidence", () => {
    show(listingFixture({ marketplace: "Whatnot", imageKind: "listing_preview", evidenceCompletenessScore: 90,
      seller: { feedbackPercentage: null, feedbackCount: null, returnsAccepted: null, topRated: null, buyerProtection: null, subRatings: null },
      shipping: null, buyerFee: null, costComplete: false }));
    expect(screen.getByText("Unverified")).toBeTruthy();
    expect(screen.queryByRole("meter", { name: "Seller record score" })).toBeNull();
    expect(screen.queryByRole("meter", { name: "Condition evidence completeness" })).toBeNull();
    expect(screen.getByText("Photos unverified")).toBeTruthy();
    expect(screen.getByText("Not comparable")).toBeTruthy();
    expect(screen.queryByText(/−\d+%/)).toBeNull();
  });
  it("keeps a played-card delta neutral and explicitly uses the NM reference", () => {
    show(listingFixture({ price: 800, claimedCondition: "Lightly Played", marketComparable: false }));
    const price = screen.getByRole("group", { name: "Price vs market" });
    expect(within(price).getByText("NM reference")).toBeTruthy();
    expect(price.getAttribute("data-tone")).toBe("neutral");
    expect(within(price).getByText("−20%")).toBeTruthy();
  });
  it("keeps missing market reference and zero seller ratings explicit", () => {
    const listing = listingFixture();
    show({ ...listing, seller: { ...listing.seller, feedbackCount: 0, feedbackPercentage: 0 } }, null);
    expect(screen.getByText("No reference")).toBeTruthy();
    expect(screen.getByText("No ratings yet")).toBeTruthy();
    expect(screen.queryByRole("meter", { name: "Seller record score" })).toBeNull();
  });
  it("renders the same three signals in Chinese", () => {
    setLanguage("zh"); show();
    expect(screen.getAllByRole("term").map(node => node.textContent)).toEqual(["品相", "卖家记录", "价格对比"]);
    expect(screen.getByText("卖家标注")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "品相资料完整度" })).toBeTruthy();
  });
});
