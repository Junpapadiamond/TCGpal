import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { readMercariDocument } from "./mercari-dom.mjs";

const url = "https://www.mercari.com/us/item/m12345678901/";
const time = "2026-09-14T21:00:00.000Z";
const product = {
  "@type": "Product", name: "Pikachu 58/102 Base Set Unlimited", description: "Card only",
  image: ["https://u-mercari-images.mercdn.net/photos/m12345678901_1.jpg"],
  offers: { "@type": "Offer", url, price: "3.1", priceCurrency: "USD",
    availability: "https://schema.org/InStock", seller: { name: "DO NOT EXPORT", email: "private@example.invalid" },
    shippingDetails: { shippingRate: { value: 0.49, currency: "USD" } } },
};
function fixture({ data = product, price = "$3.10", fee = "+$0.12 Buyer Protection fee", extra = "", buttons = '<button>Buy now</button>' } = {}) {
  return new JSDOM(`<body><div data-testid="ItemDetailSimilarItemFeed"><h2>Other card</h2><p data-testid="ProductThumbItemPrice">$999</p></div>
    <main><h1 data-testid="ItemName">Pikachu 58/102 Base Set Unlimited</h1>
    <p data-testid="ItemPrice">${price}</p><p data-testid="ItemDetailPriceSummaryHeadline">${fee}</p>
    <span data-testid="ShippingText-DeliveryFeeForBuyer"><span data-testid="DiscountedFee">$0.49</span> <s data-testid="UndiscountedFee">$1.32</s></span>
    <span data-testid="ItemDetailsCondition">Good</span><p data-testid="ItemDetailsDescription">Card only</p>
    ${buttons}${extra}<script type="application/ld+json">${JSON.stringify(data)}</script></main></body>`, { url }).window.document;
}
describe("Mercari direct DOM evidence (synthetic fixtures, no network)", () => {
  it("reads observed dollars and the discounted shipping, with field-level provenance and no seller identity", () => {
    const result = readMercariDocument(fixture(), { sourceUrl: url, observedAt: time });
    expect(result.status).toBe("observed");
    expect(result.fields.itemPrice.value).toBe(3.1);
    expect(result.fields.shippingCost.value).toBe(0.49);
    expect(result.fields.buyerFee.value).toBe(0.12);
    expect(result.fields.currency.value).toBe("USD");
    expect(result.fields.availability.value).toBe("active");
    expect(result.fields.conditionClaim.value).toBe("Good");
    expect(result.evidenceState).toBe("page-observed");
    expect(result.verifiedForRanking).toBe(false);
    for (const field of Object.values(result.fields)) {
      expect(field).toMatchObject({ sourceUrl: url, observedAt: time, acquisitionMethod: "browser-dom" });
    }
    expect(JSON.stringify(result)).not.toMatch(/DO NOT EXPORT|private@example/);
  });
  it("keeps the fee unknown when absent and never guesses it from policy percentages", () => {
    const result = readMercariDocument(fixture({ fee: "" }), { sourceUrl: url, observedAt: time });
    expect(result.fields.buyerFee.value).toBeNull();
  });
  it("rejects conflicting visible and structured prices instead of silently choosing", () => {
    const result = readMercariDocument(fixture({ price: "$4.00" }), { sourceUrl: url, observedAt: time });
    expect(result.fields.itemPrice.value).toBeNull();
    expect(result.conflicts).toContain("itemPrice");
  });
  it("does not mistake generic merchandise condition for NM", () => {
    expect(readMercariDocument(fixture(), { sourceUrl: url, observedAt: time }).fields.conditionClaim.value).toBe("Good");
  });
  it("reads sold status and never treats a historical offer price as active inventory", () => {
    const data = { ...product, offers: { ...product.offers, availability: "https://schema.org/SoldOut" } };
    const result = readMercariDocument(fixture({ data, buttons: "<p>SOLD</p>" }), { sourceUrl: url, observedAt: time });
    expect(result.fields.availability.value).toBe("sold");
  });
  it("trusts the visible sold control over stale InStock JSON-LD and records the conflict", () => {
    const result = readMercariDocument(fixture({ buttons: '<button disabled>Item sold</button>' }), { sourceUrl: url, observedAt: time });
    expect(result.fields.availability.value).toBe("sold");
    expect(result.conflicts).toContain("availability");
  });
  it("quarantines stale product markup when an access restriction replaces the page", () => {
    const result = readMercariDocument(fixture({ extra: "<h2>Your account has been banned</h2>" }), { sourceUrl: url, observedAt: time });
    expect(result.status).toBe("blocked");
    expect(result.fields).toEqual({});
  });
  it("refuses mismatched product URLs and unrelated recommendation metadata", () => {
    const data = { ...product, offers: { ...product.offers, url: "https://www.mercari.com/us/item/m99999999999/" } };
    const result = readMercariDocument(fixture({ data }), { sourceUrl: url, observedAt: time });
    expect(result.fields.currency.value).toBeNull();
    expect(result.fields.availability.value).toBe("unknown");
  });
  it("bounds search discovery, removes tracking parameters and does not infer availability from search cards", () => {
    const searchUrl = "https://www.mercari.com/search/?keyword=Pikachu";
    const doc = new JSDOM(`<h1>Pikachu</h1>${[1,2,3].map(n => `<a data-testid="ProductThumbWrapper" href="/us/item/m${n}/?ref=search_results"><p data-testid="ItemName">Card ${n}</p><p data-testid="ProductThumbItemPrice">$9<s>$12</s></p></a>`).join("")}`, { url: searchUrl }).window.document;
    const result = readMercariDocument(doc, { sourceUrl: searchUrl, observedAt: time, limit: 2 });
    expect(result.discoveries).toHaveLength(2);
    expect(result.discoveries[0].url).toBe("https://www.mercari.com/us/item/m1/");
    expect(result.discoveries[0].evidenceState).toBe("link-only");
    expect(result.discoveries[0].availability).toBeUndefined();
  });
});
