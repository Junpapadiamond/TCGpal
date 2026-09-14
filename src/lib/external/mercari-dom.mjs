/**
 * Bounded production Mercari page reader. Self-contained, read-only DOM reader
 * for the supported browser tool's evaluate(). No network, cookies, hidden app
 * state, seller profiles, or external calls. Selectors observed 2026-09-14.
 */
export function readMercariDocument(doc, { sourceUrl, observedAt, limit = 6 }) {
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:" || !["mercari.com", "www.mercari.com"].includes(url.hostname)
    || url.username || url.password || url.port || !Number.isFinite(Date.parse(observedAt))) {
    throw new Error("A public Mercari URL and observation timestamp are required.");
  }
  const canonical = (value) => {
    try {
      const candidate = new URL(value, "https://www.mercari.com");
      if (candidate.protocol !== "https:" || !["mercari.com", "www.mercari.com"].includes(candidate.hostname)
        || candidate.username || candidate.password || candidate.port || !/^\/us\/item\/m\d+\/?$/.test(candidate.pathname)) return null;
      return `https://www.mercari.com${candidate.pathname.replace(/\/$/, "")}/`;
    } catch { return null; }
  };
  const clean = (value, max = 1500) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : null;
  const text = (selector) => clean(doc.querySelector(selector)?.textContent) || null;
  const body = (doc.body?.innerText ?? doc.body?.textContent ?? "").slice(0, 100000);
  const record = { label: "mercari-page", sourceUrl, observedAt, acquisitionMethod: "browser-dom",
    status: "observed", evidenceState: "page-observed", verifiedForRanking: false, fields: {}, conflicts: [], discoveries: [] };
  if (/your account has been (?:banned|suspended)|verify you are human|verification required|access denied|just a moment/i.test(body)) {
    return { ...record, status: "blocked", evidenceState: "link-only", failure: "access-restriction" };
  }
  const fact = (value, evidence, confidence = "high") => ({ value: value ?? null, evidence: evidence || null,
    sourceUrl, observedAt, acquisitionMethod: "browser-dom", confidence: value == null ? "low" : confidence });
  if (/^\/search\/?$/.test(url.pathname)) {
    const seen = new Set();
    for (const anchor of doc.querySelectorAll('a[data-testid="ProductThumbWrapper"]')) {
      const target = canonical(anchor.getAttribute("href"));
      const title = clean(anchor.querySelector('[data-testid="ItemName"]')?.textContent, 500);
      if (!target || !title || seen.has(target)) continue;
      seen.add(target);
      record.discoveries.push({ url: target, title: fact(title, 'a[ProductThumbWrapper] [ItemName]'), evidenceState: "link-only" });
      if (record.discoveries.length >= Math.max(1, Math.min(10, Math.floor(limit) || 6))) break;
    }
    if (!record.discoveries.length) record.status = "unavailable";
    return record;
  }
  const listingUrl = canonical(sourceUrl);
  const title = text('h1[data-testid="ItemName"]');
  if (!listingUrl || !title) return { ...record, status: "unavailable", failure: "listing-not-observed" };

  // Read only public Product JSON-LD, never __NEXT_DATA__, cookies or account state.
  const products = [];
  for (const script of [...doc.querySelectorAll('script[type="application/ld+json"]')].slice(0, 20)) {
    if ((script.textContent?.length ?? 0) > 200000) continue;
    try {
      const data = JSON.parse(script.textContent);
      const entries = Array.isArray(data) ? data : [data, ...(Array.isArray(data?.["@graph"]) ? data["@graph"] : [])];
      products.push(...entries.filter((p) => p?.["@type"] === "Product" && p.offers && !Array.isArray(p.offers)
        && canonical(p.offers.url) === listingUrl && clean(p.name) === title));
    } catch { /* A malformed structured block is not inventory evidence. */ }
  }
  const product = products.length === 1 ? products[0] : null;
  const offer = product?.offers;
  const numeric = (value) => {
    if ((typeof value !== "number" && typeof value !== "string") || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  };
  const dollars = (value) => {
    const match = (value ?? "").match(/^\+?\$((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?:\s|$)/);
    return match ? numeric(match[1].replaceAll(",", "")) : null;
  };
  const reconcile = (field, visible, structured) => {
    if (visible !== null && structured !== null && Math.round(visible * 100) !== Math.round(structured * 100)) {
      record.conflicts.push(field); return null;
    }
    return visible ?? structured;
  };
  const itemText = text('[data-testid="ItemPrice"]');
  const shippingText = text('[data-testid="DiscountedFee"]') ?? text('[data-testid="ShippingText-DeliveryFeeForBuyer"]');
  const shipping = offer?.shippingDetails?.shippingRate;
  const currency = offer?.priceCurrency === "USD" ? "USD" : null;
  const itemPrice = reconcile("itemPrice", dollars(itemText), currency ? numeric(offer?.price) : null);
  const shippingCost = reconcile("shippingCost", /^free(?: shipping)?$/i.test(shippingText ?? "") ? 0 : dollars(shippingText),
    shipping?.currency === "USD" ? numeric(shipping.value) : null);
  const feeText = text('[data-testid="ItemDetailPriceSummaryHeadline"]');
  const fee = /^\+?\$[\d,.]+\s+Buyer Protection fee$/i.test(feeText ?? "") ? dollars(feeText) : null;
  const availability = String(offer?.availability ?? "").split("/").pop();
  const buyButton = [...doc.querySelectorAll("button")].some((e) => /^buy now$/i.test(e.textContent?.trim() ?? "") && !e.disabled);
  const soldButton = [...doc.querySelectorAll("button")].some((e) => /^item sold$/i.test(e.textContent?.trim() ?? "") && e.disabled);
  if (soldButton && availability === "InStock") record.conflicts.push("availability");
  const state = soldButton || ["SoldOut", "OutOfStock", "Discontinued"].includes(availability) ? "sold"
    : availability === "InStock" && buyButton ? "active" : "unknown";
  const imageUrls = (Array.isArray(product?.image) ? product.image : []).filter((value) => {
    try { const image = new URL(value); return image.protocol === "https:" && !image.username && !image.password
      && image.hostname === "u-mercari-images.mercdn.net" && !image.port; } catch { return false; }
  }).slice(0, 12);
  record.fields = {
    title: fact(title, 'h1[ItemName]'),
    itemPrice: fact(itemPrice, `ItemPrice: ${itemText ?? "missing"}; matching Product.offers.price: ${offer?.price ?? "missing"}`),
    currency: fact(currency, "Matching Product.offers.priceCurrency"),
    shippingCost: fact(shippingCost, `ShippingText/DiscountedFee: ${shippingText ?? "missing"}; Product.shippingRate: ${shipping?.value ?? "missing"}`),
    buyerFee: fact(fee, feeText),
    conditionClaim: fact(text('[data-testid="ItemDetailsCondition"]'), "ItemDetailsCondition; merchandise condition, no card-grade mapping"),
    description: fact(text('[data-testid="ItemDetailsDescription"]'), "ItemDetailsDescription", "medium"),
    availability: fact(state, `Matching Product availability: ${availability || "missing"}; enabled Buy now: ${buyButton}; disabled Item sold: ${soldButton}`, state === "unknown" ? "low" : "medium"),
    imageUrls: fact(imageUrls, "Matching Product.image"),
  };
  // A listing-page fee or shipping promotion is not a destination-specific checkout quote.
  record.assumptions = ["US listing-page observation; tax unknown", "Shipping/fee promotions may differ at checkout", "Exact print and card condition require separate review"];
  return record;
}

// The browser tool evaluates string expressions directly (not as callbacks).
export function mercariDomExpression(args) {
  return `(${readMercariDocument.toString()})(document, ${JSON.stringify(args)})`;
}
