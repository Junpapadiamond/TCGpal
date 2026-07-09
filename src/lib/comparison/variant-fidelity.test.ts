import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runListingComparison } from "@/lib/ai/listing-compare";
import { deriveVariantIntent } from "@/lib/comparison/ranking";
import { clearComparisonCache } from "@/lib/comparison/report-cache";
import { clearCrosswalkCache } from "@/lib/comparison/crosswalk";
import { findOnePieceCatalogVariants } from "@/lib/external/one-piece-catalog";
import { variantKey } from "@/lib/external/one-piece-tcg";
import { resetEbayTokenCacheForTests } from "@/lib/external/ebay";
import type { ComparisonRequest } from "@/lib/schemas";

// Fix-once regression sweep for the variant-fidelity bug class: a confirmed
// One Piece print must only ever be compared against listings of that print.
// The matrix drives full comparisons (identity → eBay fan-out → gates →
// ranking) hermetically: injected fetchers, real bundled catalog, no network.

const MIXED_TITLES = [
  { itemId: "v1|sp|0", title: "Nami OP01-016 SP Special Art", price: "310.00" },
  { itemId: "v1|alt|0", title: "Nami OP01-016 Alternate Art Parallel", price: "95.00" },
  { itemId: "v1|base|0", title: "Nami OP01-016 Romance Dawn", price: "4.00" },
];

function ebayFetcher(titles: Array<{ itemId: string; title: string; price: string }>) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/identity/v1/oauth2/token")) {
      return { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 7200 }) } as Response;
    }
    if (url.includes("/commerce/catalog/")) {
      return { ok: true, status: 200, json: async () => ({ productSummaries: [] }) } as Response;
    }
    if (url.includes("/buy/browse/v1/item_summary/search")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          itemSummaries: titles.map((entry) => ({
            itemId: entry.itemId,
            title: entry.title,
            condition: "Ungraded",
            price: { value: entry.price, currency: "USD" },
            shippingOptions: [{ shippingCost: { value: "4.00", currency: "USD" } }],
          })),
        }),
      } as Response;
    }
    if (url.includes("/buy/browse/v1/item/")) {
      const itemId = decodeURIComponent(url.split("/item/")[1]?.split("?")[0] ?? "");
      const entry = titles.find((candidate) => candidate.itemId === itemId) ?? titles[0];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          itemId: entry.itemId,
          title: entry.title,
          condition: "Ungraded",
          conditionDescriptors: [{ name: "Card Condition", values: [{ content: "Near Mint" }] }],
          price: { value: entry.price, currency: "USD" },
          shippingOptions: [{ shippingCost: { value: "4.00", currency: "USD" } }],
        }),
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

const emptySourceListing = {
  marketplace: "eBay" as const,
  url: "",
  title: "",
  description: "",
  price: null,
  shipping: null,
  claimedCondition: "Unknown" as const,
  active: true,
  seller: {
    feedbackPercentage: null,
    feedbackCount: null,
    returnsAccepted: null,
    topRated: false,
    buyerProtection: false,
    subRatings: null,
  },
  evidence: {
    photoCount: 0,
    frontBackExplicit: false,
    closeupsExplicit: false,
    surfaceExplicit: false,
    identityExplicit: false,
    substantiveConditionNotes: false,
    missing: [],
  },
};

function onePieceRequest(confirmedCardId: string): ComparisonRequest {
  return {
    sourceListing: emptySourceListing,
    buyer: { country: "US", postalCode: "10001", taxRate: 0.08, desiredCondition: "Unknown" },
    cardHint: { game: "onePiece", name: "Nami", setCode: "", cardNumber: "OP01-016", language: "English", variant: "", gradingClaim: "" },
    manualCandidates: [],
    webDiscoveryMode: "off",
    confirmedCardId,
  } as ComparisonRequest;
}

const prints = findOnePieceCatalogVariants("OP01-016");
const spPrint = prints.find((print) => deriveVariantIntent(print) === "sp");
const altPrint = prints.find((print) => deriveVariantIntent(print) === "alt");
const basePrint = prints.find((print) => deriveVariantIntent(print) === "base");

beforeEach(() => {
  process.env.EBAY_CLIENT_ID = "id";
  process.env.EBAY_CLIENT_SECRET = "secret";
  resetEbayTokenCacheForTests();
  // Pure card searches are cached in-module for 15 minutes; each matrix cell
  // must run its own fan-out, not replay the previous cell's report.
  clearComparisonCache();
  clearCrosswalkCache();
});

afterEach(() => {
  delete process.env.EBAY_CLIENT_ID;
  delete process.env.EBAY_CLIENT_SECRET;
  resetEbayTokenCacheForTests();
});

describe("variant fidelity sweep (One Piece multi-print numbers)", () => {
  it("covers all three print classes for the matrix card", () => {
    expect(spPrint).toBeDefined();
    expect(altPrint).toBeDefined();
    expect(basePrint).toBeDefined();
  });

  const scenarios = [
    { label: "SP", print: () => spPrint!, winner: "v1|sp|0" },
    { label: "alt-art", print: () => altPrint!, winner: "v1|alt|0" },
    // Base is priced at a realistic commons price; the mixed pool's SP/alt rows
    // must drop out on the variant gate, not merely lose on price.
    { label: "base", print: () => basePrint!, winner: "v1|base|0" },
  ];

  for (const scenario of scenarios) {
    it(`recommends only the ${scenario.label} listing when the ${scenario.label} print is confirmed against a mixed pool`, async () => {
      const response = await runListingComparison(
        onePieceRequest(variantKey(scenario.print())),
        { fetcher: ebayFetcher(MIXED_TITLES) },
      );

      expect(response.demoMode).toBe(false);
      const winner = response.rankedChoices.find((choice) => choice.role === "best_value");
      expect(winner).toBeDefined();
      const winnerListing = response.candidates.find((candidate) => candidate.id === `ebay-${scenario.winner}`);
      expect(winner?.listingId).toBe(winnerListing?.id);

      // Every other print class in the pool is excluded with a variant reason.
      const wrongPrints = response.candidates.filter(
        (candidate) => candidate.id !== `ebay-${scenario.winner}`,
      );
      expect(wrongPrints.length).toBeGreaterThan(0);
      for (const listing of wrongPrints) {
        expect(listing.eligible, listing.title).toBe(false);
        expect(listing.exclusionReasons.join(" "), listing.title).toContain("you're comparing");
      }
    });
  }

  it("abstains with a sibling-print suggestion when only wrong prints are live", async () => {
    const wrongOnly = MIXED_TITLES.filter((entry) => entry.itemId !== "v1|sp|0");
    const response = await runListingComparison(
      onePieceRequest(variantKey(spPrint!)),
      { fetcher: ebayFetcher(wrongOnly) },
    );

    expect(response.rankedChoices).toHaveLength(0);
    expect(response.abstention?.variantExcludedCount).toBeGreaterThan(0);
    expect(response.abstention?.suggestedCardId).toBe(variantKey(basePrint!));
  });

  it("leaves Pokémon comparisons ungated by variant wording (numbers identify one print)", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.pokemontcg.io")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: "swsh7-215",
              name: "Umbreon VMAX",
              number: "215",
              rarity: "Rare Rainbow",
              set: { id: "swsh7", name: "Evolving Skies", printedTotal: 203 },
              images: { small: "https://images.pokemontcg.io/swsh7/215.png", large: "https://images.pokemontcg.io/swsh7/215_hires.png" },
            },
          }),
        } as Response;
      }
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 7200 }) } as Response;
      }
      if (url.includes("/commerce/catalog/")) {
        return { ok: true, status: 200, json: async () => ({ productSummaries: [] }) } as Response;
      }
      if (url.includes("/buy/browse/v1/item_summary/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemSummaries: [{
              itemId: "v1|poke|0",
              title: "Umbreon VMAX 215/203 Alternate Art Evolving Skies",
              condition: "Ungraded",
              price: { value: "420.00", currency: "USD" },
              shippingOptions: [{ shippingCost: { value: "5.00", currency: "USD" } }],
            }],
          }),
        } as Response;
      }
      if (url.includes("/buy/browse/v1/item/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemId: "v1|poke|0",
            title: "Umbreon VMAX 215/203 Alternate Art Evolving Skies",
            condition: "Ungraded",
            conditionDescriptors: [{ name: "Card Condition", values: [{ content: "Near Mint" }] }],
            price: { value: "420.00", currency: "USD" },
            shippingOptions: [{ shippingCost: { value: "5.00", currency: "USD" } }],
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    const response = await runListingComparison({
      sourceListing: emptySourceListing,
      buyer: { country: "US", postalCode: "10001", taxRate: 0.08, desiredCondition: "Unknown" },
      cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
      manualCandidates: [],
      webDiscoveryMode: "off",
      confirmedCardId: "swsh7-215",
    } as ComparisonRequest, { fetcher });

    expect(response.demoMode).toBe(false);
    expect(response.rankedChoices.length).toBeGreaterThan(0);
    const listing = response.candidates.find((candidate) => candidate.id === "ebay-v1|poke|0");
    expect(listing?.eligible).toBe(true);
  });
});
