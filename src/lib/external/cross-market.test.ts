import { describe, expect, it } from "vitest";
import { parseWhatnotListings } from "./whatnot";
import { parseMercariListings } from "./mercari";
import { normalizeListing } from "@/lib/comparison/ranking";
import { httpsImageUrls, sellerCardCondition } from "./apify";
import type { CardIdentityCandidate } from "@/lib/schemas";

const card: CardIdentityCandidate = { id: "base1-58", name: "Pikachu", cardNumber: "58/102", setName: "Base", setCode: "base1", language: "English", confidence: "high", imageUrl: null, matchReasons: [] };
const now = new Date("2026-09-14T16:00:00Z");
// Synthetic contract examples, never runtime fallback inventory.
const whatnot = { type: "listing", id: "test-one", title: "Pikachu 58/102 Base Set Near Mint English", subtitle: "Near Mint ∙ English ∙ Base", publicStatus: "PUBLISHED", transactionType: "BUY_NOW", quantity: 1, price: { amountSafe: 9, currency: "USD" }, scrapedAt: now.toISOString(), images: [{ url: "https://images.whatnot.com/test-front.jpg", label: "FRONT" }, { url: "https://images.whatnot.com/test-back.jpg", label: "BACK" }] };
const mercari = { type: "listing", listing_id: "m123456", url: "https://www.mercari.com/us/item/m123456/", title: "Pikachu 58/102 Base Set Near Mint English", price: 8, currency: "USD", listing_status: "active", shipping_payer: "buyer", shipping_fee: 4.99, condition_id: "like_new", scrape_context: { scraped_time: now.getTime() } };

describe("cross-market provider facts", () => {
  it("uses the explicitly verified Whatnot price unit and preserves photo labels and observation time", () => {
    const [usd] = parseWhatnotListings([whatnot], card, now, "dollars");
    const [cents] = parseWhatnotListings([{ ...whatnot, price: { amountSafe: 900, currency: "USD" } }], card, now, "cents");
    expect(usd.price).toBe(9);
    expect(cents.price).toBe(9);
    expect(usd.shipping).toBeNull();
    expect(usd.claimedCondition).toBe("Near Mint");
    expect(usd.evidence.frontBackExplicit).toBe(true);
    expect(usd.observedAt).toBe(now.toISOString());
  });
  it("does not fabricate availability, currency or a fixed buy price", () => {
    for (const changes of [{ publicStatus: "SOLD" }, { publicStatus: undefined }, { quantity: 0 }, { transactionType: "ASYNC_AUCTION" }, { price: { amountSafe: 1, currency: "JPY" } }, { price: { amountSafe: 0, currency: "USD" } }]) {
      expect(parseWhatnotListings([{ ...whatnot, ...changes }], card, now, "dollars")).toEqual([]);
    }
  });
  it("retains Mercari shipping while admitting that checkout fees are unknown", () => {
    const [seed] = parseMercariListings([mercari], card, now);
    expect(seed.shipping).toBe(4.99);
    expect(seed.claimedCondition).toBe("Near Mint");
    expect(seed.buyerFee).toBeNull();
    const listing = normalizeListing({ listing: seed, buyer: { country: "US", postalCode: "10001", taxRate: null, desiredCondition: "Near Mint" }, confirmedCard: card });
    expect(listing.costComplete).toBe(false);
    expect(listing.eligible).toBe(false);
    expect(listing.eligibilityIssues.map((i) => i.code)).toContain("buyer_fee_unknown");
  });
  it("does not translate general merchandise condition into card Near Mint", () => {
    const [seed] = parseMercariListings([{ ...mercari, title: "Pikachu 58/102 Base Set English" }], card, now);
    expect(seed.claimedCondition).toBe("Unknown");
  });
  it("rejects malformed datasets, stale capture times and off-platform URLs", () => {
    expect(() => parseMercariListings({ error: "blocked" }, card, now)).toThrow();
    expect(() => parseWhatnotListings([{ ...whatnot, scrapedAt: "2026-08-01T00:00:00Z" }], card, now, "dollars")).toThrow();
    expect(() => parseMercariListings([{ ...mercari, url: "https://example.com/us/item/m123456/" }], card, now)).toThrow();
  });
  it("keeps missing seller history unverified and does not turn star averages into positive-feedback percentages", () => {
    const [seed] = parseWhatnotListings([{ ...whatnot, user: { sellerRating: { overall: 4.9, numReviews: 0 } } }], card, now, "dollars");
    expect(seed.seller.feedbackPercentage).toBeNull();
    expect(seed.seller.feedbackCount).toBeNull();
  });
  it("requires the exact Mercari item id, including when one id is a prefix of another", () => {
    expect(() => parseMercariListings([{ ...mercari, listing_id: "m123", url: "https://www.mercari.com/us/item/m123456/" }], card, now)).toThrow(/conflicts/);
  });
  it("rejects prices that round to zero instead of manufacturing a free listing", () => {
    expect(parseWhatnotListings([{ ...whatnot, price: { amountSafe: 0.001, currency: "USD" } }], card, now, "dollars")).toEqual([]);
    expect(parseMercariListings([{ ...mercari, price: 0.001 }], card, now)).toEqual([]);
  });
  it("keeps condition ranges conservative and rejects negated NM claims", () => {
    expect(sellerCardCondition("Pikachu NM-LP")).toBe("Lightly Played");
    expect(sellerCardCondition("Pikachu not Near Mint")).toBe("Unknown");
    expect(sellerCardCondition("Pikachu NM")).toBe("Near Mint");
  });
  it("allows only standard HTTPS image endpoints on the approved hosts", () => {
    expect(httpsImageUrls(["https://images.whatnot.com:8443/test.jpg", "https://images.whatnot.com/test.jpg"])).toEqual(["https://images.whatnot.com/test.jpg"]);
  });
});
