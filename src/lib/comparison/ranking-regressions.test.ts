import { describe, expect, it } from "vitest";
import { demoListingSeeds } from "./fixtures";
import { finalizeListingScores, normalizeListing, rankListings } from "./ranking";
import type { ListingSeed, NormalizedListing } from "@/lib/schemas";

const buyer = { country: "US" as const, postalCode: "", taxRate: null, desiredCondition: "Near Mint" as const };
const evidence = { photoCount: 8, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false,
  identityExplicit: true, substantiveConditionNotes: false, missing: [] };
const seller = { feedbackPercentage: 99.8, feedbackCount: 1000, returnsAccepted: true,
  topRated: false, buyerProtection: true, subRatings: null };

function offer(id: string, overrides: Partial<ListingSeed> = {}, marketPrice: number | null = null) {
  return normalizeListing({
    listing: { ...demoListingSeeds[0], id, demo: false, price: 100, shipping: 0, buyerFee: 0,
      claimedCondition: "Near Mint", imageKind: "seller_photos", seller, evidence, ...overrides },
    buyer,
    marketPrice,
  });
}

function winner(rows: NormalizedListing[], role = "best_value") {
  return rankListings(rows).find(choice => choice.role === role)?.listingId;
}

describe("buyer-facing ranking regressions", () => {
  it("does not reward hiding an identical checkout cost in shipping or buyer fees", () => {
    const rows = finalizeListingScores([
      offer("item", { price: 100 }, 100),
      offer("shipping", { price: 80, shipping: 20 }, 100),
      offer("fee", { price: 80, buyerFee: 20 }, 100),
    ]);
    expect(new Set(rows.map(row => row.valueScore)).size).toBe(1);
    // The reference remains an item-price read, separate from buying value.
    expect(rows[1].priceScore).toBeGreaterThan(rows[0].priceScore);
  });

  it("prefers the lower complete cost when all non-price facts are identical", () => {
    const rows = [offer("low-item-expensive-checkout", { price: 90, shipping: 20 }, 100),
      offer("lower-checkout", { price: 100 }, 100)];
    expect(winner(rows)).toBe("lower-checkout");
    expect(winner(rows, "lowest_landed_cost")).toBe("lower-checkout");
  });

  it("can pay a one-percent premium for a materially stronger seller record", () => {
    const rows = [offer("thin-record", { seller: { ...seller, feedbackCount: 10 } }),
      offer("established-record", { price: 101 })];
    expect(winner(rows)).toBe("established-record");
    expect(winner(rows, "lowest_landed_cost")).toBe("thin-record");
  });

  it("does not change a two-offer decision when a strictly dominated expensive offer appears", () => {
    const rows = [offer("thin-record", { seller: { ...seller, feedbackCount: 10 } }),
      offer("established-record", { price: 101 })];
    expect(winner([...rows, offer("dominated", { price: 400 })])).toBe(winner(rows));
  });

  it("keeps every lens independent of provider ordering", () => {
    const rows = [offer("a", { price: 99 }), offer("b", { evidence: { ...evidence, photoCount: 21 } }),
      offer("c", { price: 101, seller: { ...seller, topRated: true } })];
    expect(rankListings([...rows].reverse())).toEqual(rankListings(rows));
  });

  it("uses more photos before seller history when documented evidence otherwise ties", () => {
    const rows = [offer("ten-photos", { evidence: { ...evidence, photoCount: 10 } }),
      offer("twenty-one-photos", { evidence: { ...evidence, photoCount: 21 }, seller: { ...seller, feedbackCount: 100 } })];
    expect(winner(rows, "best_condition_evidence")).toBe("twenty-one-photos");
  });

  it("does not mistake photo quantity for explicitly documented front, back and detail coverage", () => {
    const rows = [offer("many-unclassified", { evidence: { ...evidence, photoCount: 21 } }),
      offer("documented-coverage", { evidence: { ...evidence, photoCount: 6, frontBackExplicit: true,
        closeupsExplicit: true, surfaceExplicit: true, substantiveConditionNotes: true } })];
    expect(winner(rows, "best_condition_evidence")).toBe("documented-coverage");
  });

  it("keeps incomplete cost, mismatches and high-value evidence review outside every buy lens", () => {
    const rows = [offer("comparable", { price: 110 }),
      offer("unknown-shipping", { price: 10, shipping: null }),
      offer("unknown-fee", { price: 10, buyerFee: null }),
      offer("played", { price: 10, claimedCondition: "Lightly Played" }),
      offer("wrong-match", { price: 10, matchConfidence: "low" }),
      offer("graded", { price: 10, title: "Umbreon VMAX 215/203 PSA 10 Graded" }),
      offer("rug", { price: 10, title: "Umbreon VMAX 215/203 Rug" }),
      offer("high-value-thin-record", { price: 800, seller: { ...seller, feedbackCount: 18 },
        evidence: { ...evidence, photoCount: 24 } })];
    expect(rankListings(rows)).toHaveLength(4);
    expect(new Set(rankListings(rows).map(choice => choice.listingId))).toEqual(new Set(["comparable"]));
  });
});
