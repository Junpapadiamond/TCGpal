import { describe, expect, it } from "vitest";
import { demoListingSeeds } from "./fixtures";
import { normalizeListing, rankListings } from "./ranking";
import { findOnePieceCatalogVariant } from "../external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "../external/one-piece-tcg";
import type { CardIdentityCandidate, ConditionClaim } from "../schemas";
import { comparisonReportSchema, comparisonRequestSchema } from "../schemas";
import { canonicalPrintIdentity } from "./print-fidelity";
import { runListingComparison } from "../ai/listing-compare";
import { clearComparisonCache } from "./report-cache";
import { clearCrosswalkCache } from "./crosswalk";

// Actual adjudicated title/price: docs/one-piece-buy-accuracy-2026-08-14.md.
// $2 is the documented approximate base reference, modeled as an exact anchor
// for this test. It is not a new product mapping or a claim about today's price.
const card: CardIdentityCandidate = {
  ...mapOnePieceCardToIdentity(findOnePieceCatalogVariant("ST01-001")!, { confidence: "high", matchReasons: [] }),
  marketMid: 2, marketSource: "tcgcsv",
};
function candidate(price = 79.99, shipping = 5, anchor: number | null = 2, condition: ConditionClaim = "Near Mint", confirmedCard: CardIdentityCandidate | null = card) {
  return normalizeListing({
    listing: { ...demoListingSeeds[0], id: `luffy-${price}`, demo: false, cardId: card.id,
      title: "2022 One Piece Monkey.D.Luffy ST01-001 EN Leader", price, shipping,
      claimedCondition: condition, listingLanguage: "English" },
    buyer: { country: "US", postalCode: "10001", taxRate: null, desiredCondition: condition },
    confirmedCard, marketPrice: anchor, cardLanguage: "English",
  });
}
const review = { code: "price_far_above_exact_market", disposition: "review", category: "price" };

describe("exact-anchor market ceiling", () => {
  it("returns Inspect First for an anchored real Nami product name at an outlier price", async () => {
    clearComparisonCache();
    clearCrosswalkCache();
    // Product/group/name/reference observed in the Phase 3a live artifact.
    const productName = "Nami - OP01-016 (Ultra Deck: The Three Captains)";
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/68/groups")) return Response.json({ results: [{ groupId: 17675, name: "One Piece Promotion Cards" }] });
      if (url.endsWith("/17675/products")) return Response.json({ results: [{ productId: 527619, name: productName,
        url: "https://www.tcgplayer.com/product/527619", extendedData: [{ name: "Number", value: "OP01-016" }] }] });
      if (url.endsWith("/17675/prices")) return Response.json({ results: [{ productId: 527619, marketPrice: 5.46, subTypeName: "Normal" }] });
      if (url.includes("last-updated")) return new Response("2026-09-05T00:00:00.000Z");
      throw new Error(`Network disabled in test: ${url}`);
    };
    const result = await runListingComparison(comparisonRequestSchema.parse({
      query: "Nami OP01-016", confirmedCardId: "OP01-016_p3",
      cardHint: { game: "onePiece", name: "Nami", cardNumber: "OP01-016", language: "English" },
      sourceListing: { marketplace: "eBay", title: productName, price: 100, shipping: 0, claimedCondition: "Near Mint" },
      buyer: { country: "US", postalCode: "10001", taxRate: null, desiredCondition: "Near Mint" },
    }), { fetcher });
    expect(result.confirmedCard?.marketMid).toBe(5.46);
    expect(result.outcome).toBe("inspect_first");
    expect(result.inspectListingId).toBe(result.candidates[0].id);
    expect(result.rankedChoices).toEqual([]);
    expect(result.abstention?.reason).toContain("price review");
  });
  it("admits a price-review inspect lead while forbidding its promotion in the public report", () => {
    const listing = { ...candidate(), eligibilityIssues: [{ ...review, message: "Inspect the price." }] };
    const report = {
      identityContractVersion: 4, status: "complete", outcome: "inspect_first", inspectListingId: listing.id,
      request: comparisonRequestSchema.parse({ query: "Luffy ST01-001", sourceListing: { marketplace: "eBay" }, buyer: { country: "US", postalCode: "10001", taxRate: null, desiredCondition: "Near Mint" } }),
      confirmedCard: { ...card, printIdentity: canonicalPrintIdentity(card) }, identityCandidates: [], candidates: [listing], rankedChoices: [],
      references: [], narrative: { summary: "Inspect price", cautions: [] }, warnings: [], trace: [],
      platforms: [], webDiscoveries: [], demoMode: false, generatedAt: "2026-09-05T00:00:00.000Z",
    };
    expect(comparisonReportSchema.safeParse(report).success).toBe(true);
    expect(comparisonReportSchema.safeParse({ ...report, outcome: "best_buy", inspectListingId: null,
      rankedChoices: [{ role: "best_value", listingId: listing.id, label: "Buy", reason: "Price not reviewed", confidence: "high" }],
    }).success).toBe(false);
    expect(comparisonReportSchema.safeParse({ ...report, candidates: [{ ...listing, printMatch: "mismatch", eligible: false }] }).success).toBe(false);
  });
  it("keeps the historical high-priced Luffy inspectable without excluding or relabeling its identity", () => {
    const listing = candidate();
    expect(listing.printMatch).toBe("compatible");
    expect(listing.eligible).toBe(true);
    expect(listing.exclusionReasons).toEqual([]);
    expect(listing.eligibilityIssues).toContainEqual(expect.objectContaining(review));
    expect(rankListings([listing])).toEqual([]);
  });

  it("prevents every lens from promoting the outlier over an ordinary exact-print listing", () => {
    const ordinary = candidate(3);
    const outlier = { ...candidate(), sellerTrustScore: 100, evidenceCompletenessScore: 100, safetyScore: 100, valueScore: 100 };
    expect(rankListings([ordinary, outlier]).every((choice) => choice.listingId === ordinary.id)).toBe(true);
  });

  it("uses item price, a strict five-times boundary, and at least a $20 gap", () => {
    for (const listing of [candidate(3, 100), candidate(10), candidate(21)]) {
      expect(listing.eligibilityIssues).not.toContainEqual(expect.objectContaining(review));
    }
    expect(candidate(22).eligibilityIssues).toContainEqual(expect.objectContaining(review));
    expect(candidate(100, 0, 20, "Near Mint", { ...card, marketMid: 20 }).eligibilityIssues).not.toContainEqual(expect.objectContaining(review));
    expect(candidate(100.01, 0, 20, "Near Mint", { ...card, marketMid: 20 }).eligibilityIssues).toContainEqual(expect.objectContaining(review));
  });

  it("does not borrow an absent, unrelated or unconfirmed market anchor", () => {
    for (const listing of [candidate(79.99, 5, null), candidate(79.99, 5, 2, "Near Mint", null),
      candidate(79.99, 5, 2, "Near Mint", { ...card, marketMid: 3 }),
      candidate(79.99, 5, 2, "Near Mint", { ...card, marketSource: null })]) {
      expect(listing.eligibilityIssues).not.toContainEqual(expect.objectContaining(review));
    }
  });

  it.each(["Lightly Played", "Moderately Played", "Unknown"] as const)("keeps %s comparisons neutral against the NM reference", (condition) => {
    expect(candidate(79.99, 5, 2, condition).eligibilityIssues).not.toContainEqual(expect.objectContaining(review));
  });
});
