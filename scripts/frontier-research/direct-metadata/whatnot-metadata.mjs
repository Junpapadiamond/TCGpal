import { JSDOM } from "jsdom";

export const WHATNOT_ORIGIN = "https://www.whatnot.com";
export const WHATNOT_MAX_HTML_BYTES = 1024 * 1024;

export function canonicalWhatnotListing(value) {
  try {
    const url = new URL(value, WHATNOT_ORIGIN);
    if (url.protocol !== "https:" || url.hostname !== "www.whatnot.com" || url.username || url.password || url.port
      || !/^\/listing\/[A-Za-z0-9_-]{1,200}\/?$/.test(url.pathname)) return null;
    return `${WHATNOT_ORIGIN}${url.pathname.replace(/\/$/, "")}`;
  } catch { return null; }
}

/** Public HTML/JSON-LD only. JSDOM never executes scripts or loads resources.
 * No __NEXT_DATA__, browser/session state, seller identifiers or product imports.
 * All outputs remain page observations: no identity or checkout verification.
 */
export function parseWhatnotMetadata(html, { sourceUrl, observedAt }) {
  const url = new URL(sourceUrl);
  if (url.origin !== WHATNOT_ORIGIN || url.username || url.password || url.port
    || (!canonicalWhatnotListing(sourceUrl) && url.pathname !== "/search") || !Number.isFinite(Date.parse(observedAt))) {
    throw new Error("A public Whatnot search/listing URL and timestamp are required.");
  }
  if (typeof html !== "string" || Buffer.byteLength(html) > WHATNOT_MAX_HTML_BYTES) throw new Error("HTML exceeds research limit.");
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const clean = (value, max = 1000) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) || null : null;
  const record = { label: "frontier-research", sourceUrl, observedAt, acquisitionMethod: "public-html-jsonld",
    status: "observed", evidenceState: "page-observed", verifiedForRanking: false, fields: {}, conflicts: [], discoveries: [] };
  const fact = (value, evidence, confidence = "medium") => ({ value, evidence, sourceUrl, observedAt,
    acquisitionMethod: "public-html-jsonld", confidence: value == null || value === "unknown" ? "low" : confidence });
  try {
    // Challenge checks examine public text, never embedded application state.
    const visible = doc.body.cloneNode(true);
    for (const node of visible.querySelectorAll("script, style, template, [hidden]")) node.remove();
    if (/verify you are human|verification required|access denied|just a moment|your account (?:has been|is) (?:banned|restricted|suspended)|log in to continue|sign in to continue/i.test(visible.textContent ?? "")) {
      return { ...record, status: "blocked", evidenceState: "link-only", failure: "access-restriction" };
    }
    if (url.pathname === "/search") {
      const seen = new Set();
      for (const anchor of doc.querySelectorAll("a[href]")) {
        const target = canonicalWhatnotListing(anchor.getAttribute("href"));
        if (!target || seen.has(target)) continue;
        const title = clean(anchor.textContent, 500) ?? clean(anchor.querySelector("img")?.getAttribute("alt"), 500);
        seen.add(target);
        record.discoveries.push({ url: target, title: fact(title, "Public a[href] text/image alt"), evidenceState: "link-only" });
        if (record.discoveries.length === 5) break;
      }
      return record.discoveries.length ? record : { ...record, status: "unavailable", failure: "no-public-listing-links" };
    }
    const listingUrl = canonicalWhatnotListing(sourceUrl);
    const title = clean(doc.querySelector("h1")?.textContent);
    const products = [];
    let visited = 0;
    const visit = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 12 || ++visited > 200) return;
      if (Array.isArray(value)) { for (const child of value) visit(child, depth + 1); return; }
      if (value["@type"] === "Product") products.push(value);
      if (value["@graph"]) visit(value["@graph"], depth + 1);
    };
    for (const script of [...doc.querySelectorAll('script[type="application/ld+json"]')].slice(0, 20)) {
      if ((script.textContent?.length ?? 0) > 200000) continue;
      try { visit(JSON.parse(script.textContent)); } catch { /* Invalid structured evidence remains unavailable. */ }
    }
    const matching = products.filter((p) => clean(p.name) && (!title || clean(p.name) === title)
      && p.offers && !Array.isArray(p.offers) && p.offers["@type"] === "Offer"
      && canonicalWhatnotListing(p.offers.url) === listingUrl
      && (!p.url || canonicalWhatnotListing(p.url) === listingUrl));
    if (matching.length > 1) record.conflicts.push("multiple-product-offers");
    const product = matching.length === 1 ? matching[0] : null;
    const offer = product?.offers;
    const money = (() => {
      if (offer?.priceCurrency !== "USD" || !["number", "string"].includes(typeof offer?.price)) return null;
      const raw = String(offer.price);
      if (!/^\d{1,14}(?:\.\d{1,2})?$/.test(raw)) return null;
      const [whole, fraction = ""] = raw.split(".");
      const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
      if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      return { amount: `${BigInt(whole)}.${fraction.padEnd(2, "0")}`, minorUnits: Number(cents), currency: "USD" };
    })();
    const availability = typeof offer?.availability === "string" ? offer.availability.replace(/^https?:\/\/schema.org\//, "") : null;
    const stockClaim = availability === "InStock" ? "in-stock-claim" : ["SoldOut", "OutOfStock", "Discontinued"].includes(availability) ? "sold" : "unknown";
    record.fields = {
      title: fact(title ?? clean(product?.name), title ? "Public h1" : "Matching Product.name"),
      itemPrice: fact(money, money ? "Matching Product.offers.price + priceCurrency; exact decimal USD" : "No unique matching USD Offer with exact cent precision"),
      shippingQuote: fact(null, "No destination-specific checkout quote was observed"),
      buyerFee: fact(null, "No complete mandatory buyer-fee quote was observed"),
      availability: fact(stockClaim, "Matching Product.offers.availability; claim only, checkout not verified"),
      conditionClaim: fact(clean(product?.itemCondition, 200) ?? clean(offer?.itemCondition, 200), "Matching Product/Offer.itemCondition; no card-grade mapping"),
    };
    record.assumptions = ["Exact print, language and card condition are unchecked", "Shipping, mandatory fees and tax remain unknown", "No listing is eligible for production ranking"];
    if (!product) { record.status = "unavailable"; record.failure = "matching-public-product-metadata-unavailable"; }
    return record;
  } finally { dom.window.close(); }
}
