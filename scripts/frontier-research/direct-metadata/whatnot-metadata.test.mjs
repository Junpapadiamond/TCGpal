import { describe, expect, it } from "vitest";
import { parseWhatnotMetadata } from "./whatnot-metadata.mjs";

const sourceUrl = "https://www.whatnot.com/listing/card-123";
const observedAt = "2026-10-03T12:00:00.000Z";
const product = { "@type": "Product", name: "Giratina V 186/196", description: "Raw card",
  offers: { "@type": "Offer", url: sourceUrl, price: "123.10", priceCurrency: "USD",
    availability: "https://schema.org/InStock", seller: { name: "PRIVATE SELLER" } } };
function html(data = product, extra = "") {
  return `<h1>Giratina V 186/196</h1>${extra}<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}
const read = (body, url = sourceUrl) => parseWhatnotMetadata(body, { sourceUrl: url, observedAt });

describe("Whatnot public metadata research parser (synthetic fixtures)", () => {
  it("retains exact USD money and per-field provenance without manufacturing checkout charges", () => {
    const row = read(html());
    expect(row.fields.itemPrice.value).toEqual({ amount: "123.10", currency: "USD", minorUnits: 12310 });
    expect(row.fields.shippingQuote.value).toBeNull();
    expect(row.fields.buyerFee.value).toBeNull();
    expect(row.fields.availability.value).toBe("in-stock-claim");
    expect(row.evidenceState).toBe("page-observed");
    expect(row.verifiedForRanking).toBe(false);
    for (const field of Object.values(row.fields)) expect(field).toMatchObject({ sourceUrl, observedAt, acquisitionMethod: "public-html-jsonld" });
    expect(JSON.stringify(row)).not.toContain("PRIVATE SELLER");
  });
  it("does not read hidden app state or unrelated product offers", () => {
    const other = { ...product, offers: { ...product.offers, url: "https://www.whatnot.com/listing/other" } };
    const row = read(html(other, `<script id="__NEXT_DATA__">${JSON.stringify(product)}</script>`));
    expect(row.fields.itemPrice.value).toBeNull();
    expect(row.fields.availability.value).toBe("unknown");
  });
  it("quarantines duplicate/conflicting offers, wrong title, unsupported currency and non-cent precision", () => {
    for (const data of [[product, product], { ...product, name: "Other card" },
      { ...product, offers: { ...product.offers, priceCurrency: "CAD" } },
      { ...product, offers: { ...product.offers, price: "1.001" } },
      { ...product, offers: { ...product.offers, price: "1e2" } }]) {
      expect(read(html(data)).fields.itemPrice.value).toBeNull();
    }
  });
  it("stops on public challenge or account restriction even if stale metadata remains", () => {
    const row = read(html(product, "<h2>Verify you are human</h2>"));
    expect(row.status).toBe("blocked");
    expect(row.fields).toEqual({});
  });
  it("captures only five same-host canonical listing discoveries, without search-card price claims", () => {
    const body = `<a href="https://evil.invalid/listing/card-999">Wrong</a><a href="https://user@www.whatnot.com/listing/card-998">Wrong</a>`
      + Array.from({ length: 8 }, (_, i) => `<a href="/listing/card-${i}?tracking=x">Card ${i} $10</a>`).join("");
    const row = read(body, "https://www.whatnot.com/search?query=Giratina");
    expect(row.discoveries).toHaveLength(5);
    expect(row.discoveries[0]).toMatchObject({ url: "https://www.whatnot.com/listing/card-0", evidenceState: "link-only" });
    expect(row.discoveries[0].itemPrice).toBeUndefined();
  });
});
