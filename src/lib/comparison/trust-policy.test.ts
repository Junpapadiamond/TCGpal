import { describe, expect, it } from "vitest";
import { demoIdentities, demoListingSeeds } from "./fixtures";
import { normalizeListing, rankListings } from "./ranking";
import { buildOfferVerdict } from "./offer-verdict";
import { usableMarketPrice } from "./market-reference";
import { buildListingAction } from "@/features/comparison/verdict-copy";

const now = new Date("2026-11-03T12:00:00Z");
const buyer = { country: "US" as const, postalCode: "", taxRate: null, desiredCondition: "Unknown" as const };
const card = { ...demoIdentities[0], marketMid: 950, marketAsOf: "2026-11-02T12:00:00Z", marketSource: "tcgcsv" as const };
const seed = { ...demoListingSeeds[0], demo: false, price: 799.99, claimedCondition: "Near Mint" as const,
  seller: { ...demoListingSeeds[0].seller, feedbackPercentage: 100, feedbackCount: 18, returnsAccepted: false },
  evidence: { ...demoListingSeeds[0].evidence, photoCount: 8, frontBackExplicit: false, substantiveConditionNotes: true } };

describe("listing trust policy regressions", () => {
  it("does not turn a Base Set card number into proof of an unresolved edition", () => {
    const base = { ...card, id: "base1-4", name: "Charizard", setName: "Base", setCode: "BASE1", cardNumber: "4/102" };
    for (const title of ["Charizard 4/102 Base Set Near Mint", "Charizard 4/102 First Edition", "Charizard 4/102 Shadowless", "Charizard 4/102 Unlimited"]) {
      const row = normalizeListing({ listing: { ...seed, title, price: 100 }, buyer, confirmedCard: base, now });
      expect(row.printMatch).toBe("compatible"); // name/number compatibility alone is not edition proof
      expect(rankListings([row])).toEqual([]);
      expect(buildOfferVerdict(row, [row]).identityConfirmed).toBe(false);
    }
  });
  it.each(["Giratina V 186/196 Rug", "Giratina V 186/196 Area Carpet", "Giratina V 186/196 Mousepad", "Giratina V 186/196 Tapestry"])("excludes merchandise regardless of condition and price: %s", title => {
    for (const desiredCondition of ["Unknown", "Near Mint"] as const) {
      const row = normalizeListing({ listing: { ...seed, title, price: 50 }, buyer: { ...buyer, desiredCondition } });
      expect(row.eligible).toBe(false);
      expect(buildOfferVerdict(row, [row]).kind).toBe("pass");
      expect(rankListings([row])).toEqual([]);
    }
  });
  it("uses a non-card product type even when the title omits it", () => {
    const row = normalizeListing({ listing: { ...seed, title: "Giratina V 186/196", matchAspectText: "Brand: Unbranded. Type: Area Rug. Color: Red" }, buyer });
    expect(row.eligible).toBe(false);
  });
  it("keeps genuine raw singles with normal packing descriptions", () => {
    const row = normalizeListing({ listing: { ...demoListingSeeds[0], title: "Giratina V 186/196 raw card with protective sleeve and toploader" }, buyer });
    expect(row.eligible).toBe(true);
  });
  it("does not call an expensive thin-record offer a buy or select it for any lens", () => {
    const row = normalizeListing({ listing: seed, buyer });
    expect(row.eligible).toBe(true); // observed offer, retained for inspection
    expect(rankListings([row])).toEqual([]);
    expect(buildOfferVerdict(row, [row]).kind).toBe("inspect");
    expect(buildListingAction(row, 950, "en").kind).toBe("wait");
    expect(buildListingAction(row, 950, "zh").kind).toBe("wait");
  });
  it("does not treat a no-returns policy alone as a bad seller", () => {
    const row = normalizeListing({ listing: { ...seed, seller: { ...seed.seller, feedbackCount: 1000 } }, buyer });
    expect(rankListings([row])).toHaveLength(4);
  });
  it("keeps review-only prices outside the eligible field's score range", () => {
    const review = normalizeListing({ listing: seed, buyer });
    const peers = [900, 1100].map(price => normalizeListing({ listing: { ...seed, id: `peer-${price}`, price, seller: { ...seed.seller, feedbackCount: 1000 } }, buyer }));
    expect(() => rankListings([review, ...peers])).not.toThrow();
    expect(rankListings([review, ...peers]).every(choice => choice.listingId !== review.id)).toBe(true);
  });
  it("withholds a high-value recommendation when seller photos are missing, even for an established seller", () => {
    const row = normalizeListing({ listing: { ...seed, seller: { ...seed.seller, feedbackCount: 1000 }, evidence: { ...seed.evidence, photoCount: 0 } }, buyer });
    expect(rankListings([row])).toEqual([]);
  });
  it.each(["2026-10-15T00:00:00Z", null, "invalid", "2026-11-05T00:00:00Z"])("never scores against a stale, unknown or future anchor: %s", marketAsOf => {
    const staleCard = { ...card, marketAsOf };
    expect(usableMarketPrice(staleCard, now)).toBeNull();
    const row = normalizeListing({ listing: { ...seed, price: 50 }, buyer: { ...buyer, desiredCondition: "Near Mint" }, confirmedCard: staleCard, marketPrice: 950, now });
    expect(row.marketComparable).toBe(false);
    expect(row.eligibilityIssues.some(i => i.code === "price_below_market_floor")).toBe(false);
  });
  it("keeps a dated fresh anchor usable", () => expect(usableMarketPrice(card, now)).toBe(950));
});
