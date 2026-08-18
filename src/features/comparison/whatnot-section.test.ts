import { describe, expect, it } from "vitest";
import {
  WHATNOT_VALUE_WEIGHTS,
  groupItemPriceOnlyListings,
  rankWhatnotReferenceListings,
  selectWhatnotReferenceListings,
} from "@/features/comparison/whatnot-section";
import type { NormalizedListing } from "@/lib/schemas";

function listing(overrides: Partial<NormalizedListing> = {}): NormalizedListing {
  return {
    marketplace: "Whatnot",
    active: true,
    raw: true,
    price: 100,
    conditionCompatibilityScore: 50,
    sellerTrustScore: 50,
    evidenceCompletenessScore: 50,
    eligibilityIssues: [
      { code: "shipping_unknown", category: "cost", disposition: "exclude", message: "" },
    ],
    ...overrides,
  } as NormalizedListing;
}

describe("Whatnot reference section selection", () => {
  it("keeps rows blocked only by unknown shipping", () => {
    expect(selectWhatnotReferenceListings([listing()])).toHaveLength(1);
  });

  it("drops graded slabs, which are not raw singles", () => {
    expect(selectWhatnotReferenceListings([listing({ raw: false })])).toHaveLength(0);
  });

  it("drops rows the comparison excluded for any other reason", () => {
    const keychain = listing({
      eligibilityIssues: [
        { code: "shipping_unknown", category: "cost", disposition: "exclude", message: "" },
        { code: "excluded_product_type", category: "product", disposition: "exclude", message: "" },
      ],
    });
    const sibling = listing({
      eligibilityIssues: [
        { code: "shipping_unknown", category: "cost", disposition: "exclude", message: "" },
        { code: "identity_sibling_mismatch", category: "identity", disposition: "exclude", message: "" },
      ],
    });
    expect(selectWhatnotReferenceListings([keychain, sibling])).toHaveLength(0);
  });

  it("ignores non-Whatnot and inactive rows", () => {
    expect(selectWhatnotReferenceListings([
      listing({ marketplace: "eBay" }),
      listing({ active: false }),
    ])).toHaveLength(0);
  });

  it("keeps a review-only issue from disqualifying a row", () => {
    const row = listing({
      eligibilityIssues: [
        { code: "shipping_unknown", category: "cost", disposition: "exclude", message: "" },
        { code: "language_unverified", category: "language", disposition: "review", message: "" },
      ],
    });
    expect(selectWhatnotReferenceListings([row])).toHaveLength(1);
  });

  it("orders by item price so the cheapest reads first", () => {
    const rows = selectWhatnotReferenceListings([listing({ price: 300 }), listing({ price: 90 })]);
    expect(rows.map((row) => row.price)).toEqual([90, 300]);
  });
});

describe("Whatnot in-section ranking", () => {
  it("reuses the product's value balance with the price term removed", () => {
    const total = WHATNOT_VALUE_WEIGHTS.condition + WHATNOT_VALUE_WEIGHTS.seller + WHATNOT_VALUE_WEIGHTS.evidence;
    expect(total).toBeCloseTo(1, 10);
    // Condition still outranks seller, which still outranks evidence.
    expect(WHATNOT_VALUE_WEIGHTS.condition).toBeGreaterThan(WHATNOT_VALUE_WEIGHTS.seller);
    expect(WHATNOT_VALUE_WEIGHTS.seller).toBeGreaterThan(WHATNOT_VALUE_WEIGHTS.evidence);
  });

  it("puts the strongest condition/seller/evidence row first", () => {
    const weak = listing({ id: "weak", conditionCompatibilityScore: 20, sellerTrustScore: 20, evidenceCompletenessScore: 20 });
    const strong = listing({ id: "strong", conditionCompatibilityScore: 95, sellerTrustScore: 90, evidenceCompletenessScore: 80 });
    expect(rankWhatnotReferenceListings([weak, strong])[0].id).toBe("strong");
  });

  it("never lets a cheaper item price buy a better rank", () => {
    const cheapJunk = listing({ id: "cheap", price: 5, conditionCompatibilityScore: 10, sellerTrustScore: 10, evidenceCompletenessScore: 10 });
    const dearGood = listing({ id: "dear", price: 900, conditionCompatibilityScore: 95, sellerTrustScore: 95, evidenceCompletenessScore: 95 });
    const ranked = rankWhatnotReferenceListings([cheapJunk, dearGood]);
    expect(ranked[0].id).toBe("dear");
    expect(ranked[0].whatnotScore).toBeGreaterThan(ranked[1].whatnotScore);
  });

  it("breaks a score tie on the cheaper item price", () => {
    const a = listing({ id: "a", price: 400 });
    const b = listing({ id: "b", price: 250 });
    expect(rankWhatnotReferenceListings([a, b])[0].id).toBe("b");
  });

  it("only ranks rows the section would show", () => {
    expect(rankWhatnotReferenceListings([listing({ raw: false })])).toHaveLength(0);
  });
});

describe("item-price-only marketplace grouping", () => {
  it("ranks each marketplace separately and never mixes them", () => {
    const groups = groupItemPriceOnlyListings([
      listing({ id: "w1", marketplace: "Whatnot", price: 400 }),
      listing({ id: "m1", marketplace: "Mercari", price: 100 }),
      listing({ id: "e1", marketplace: "eBay", price: 50 }),
    ]);
    expect(groups.map((group) => group.marketplace)).toEqual(["Whatnot", "Mercari"]);
    expect(groups.every((group) => group.listings.every((row) => row.marketplace === group.marketplace))).toBe(true);
  });

  it("omits a marketplace that returned nothing usable", () => {
    const groups = groupItemPriceOnlyListings([listing({ marketplace: "Whatnot" })]);
    expect(groups.map((group) => group.marketplace)).toEqual(["Whatnot"]);
  });
});
