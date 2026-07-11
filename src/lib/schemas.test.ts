import { describe, expect, it } from "vitest";
import { comparisonReportSchema, comparisonRequestSchema } from "@/lib/schemas";
import { normalizeListing } from "@/lib/comparison/ranking";

const card = {
  id: "swsh7-215",
  name: "Umbreon VMAX",
  setName: "Evolving Skies",
  setCode: "SWSH7",
  cardNumber: "215/203",
  language: "English",
  imageUrl: "https://images.pokemontcg.io/swsh7/215_hires.png",
  confidence: "high" as const,
  matchReasons: [],
  printIdentity: {
    canonicalPrintId: "swsh7-215",
    familyId: "215/203",
    game: "pokemon" as const,
    setName: "Evolving Skies",
    setCode: "SWSH7",
    collectorNumber: "215/203",
    rarity: "Secret Rare",
    variantLabel: "Alternate Art",
    imageUrl: "https://images.pokemontcg.io/swsh7/215_hires.png",
    catalogVerified: true,
  },
};

const request = comparisonRequestSchema.parse({
  sourceListing: { marketplace: "eBay", url: "", title: "", price: null },
  buyer: { country: "US", postalCode: "10001", taxRate: 0.08, desiredCondition: "Near Mint" },
  cardHint: { game: "pokemon", name: "Umbreon VMAX", setCode: "SWSH7", cardNumber: "215/203", language: "English", variant: "", gradingClaim: "" },
});

const listing = normalizeListing({
  listing: {
    id: "listing",
    marketplace: "eBay",
    url: "https://www.ebay.com/itm/123456789012",
    title: "Umbreon VMAX 215/203",
    cardId: card.id,
    matchConfidence: "high",
    matchReasons: [],
    active: true,
    raw: true,
    currency: "USD",
    price: 400,
    shipping: 5,
    claimedCondition: "Near Mint",
    imageUrl: null,
    seller: { feedbackPercentage: null, feedbackCount: null, returnsAccepted: null, topRated: false, buyerProtection: true, subRatings: null },
    evidence: { photoCount: 1, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: false, substantiveConditionNotes: false, missing: [] },
    observedAt: "2026-07-11T00:00:00.000Z",
    demo: false,
    userSupplied: false,
  },
  buyer: request.buyer,
  confirmedCard: card,
});

function report(overrides: Record<string, unknown>) {
  return {
    status: "complete",
    request,
    identityCandidates: [card],
    confirmedCard: card,
    candidates: [listing],
    rankedChoices: [],
    references: [],
    narrative: { summary: "Summary", cautions: [] },
    warnings: [],
    trace: [],
    platforms: [],
    webDiscoveries: [],
    demoMode: false,
    generatedAt: "2026-07-11T00:00:00.000Z",
    identityContractVersion: 2,
    ...overrides,
  };
}

describe("exact-print report contract", () => {
  it("rejects an eligible v2 listing whose print identity is unresolved", () => {
    const unresolved = { ...listing, eligible: true, printMatch: "unknown" as const };
    expect(comparisonReportSchema.safeParse(report({ candidates: [unresolved], outcome: "best_buy" })).success).toBe(false);
  });

  it("requires Inspect First to identify the listing the buyer should inspect", () => {
    expect(comparisonReportSchema.safeParse(report({ outcome: "inspect_first", inspectListingId: null })).success).toBe(false);
  });

  it("rejects ranked choices that point to unresolved or nonexistent listings", () => {
    const unresolved = { ...listing, eligible: false, printMatch: "unknown" as const };
    const choice = { role: "best_value", listingId: unresolved.id, label: "Buy", reason: "No", confidence: "high" };
    expect(comparisonReportSchema.safeParse(report({ candidates: [unresolved], rankedChoices: [choice], outcome: "best_buy" })).success).toBe(false);
    expect(comparisonReportSchema.safeParse(report({ rankedChoices: [{ ...choice, listingId: "missing" }], outcome: "best_buy" })).success).toBe(false);
  });

  it("rejects a v2 report that omits classification or outcome fields", () => {
    const incomplete = { ...listing } as Record<string, unknown>;
    delete incomplete.printMatch;
    delete incomplete.printMatchConfidence;
    delete incomplete.printMatchReasons;
    delete incomplete.printPriceGuard;
    expect(comparisonReportSchema.safeParse(report({ candidates: [incomplete], outcome: undefined })).success).toBe(false);
  });

  it("requires canonical print identity on every v2 identity candidate and confirmed card", () => {
    const withoutPrintIdentity = { ...card } as Record<string, unknown>;
    delete withoutPrintIdentity.printIdentity;

    expect(comparisonReportSchema.safeParse(report({
      identityCandidates: [withoutPrintIdentity],
      outcome: "next_moves",
    })).success).toBe(false);
    expect(comparisonReportSchema.safeParse(report({
      confirmedCard: withoutPrintIdentity,
      outcome: "next_moves",
    })).success).toBe(false);
  });

  it("continues to parse legacy reports without canonical print identity", () => {
    const withoutPrintIdentity = { ...card } as Record<string, unknown>;
    delete withoutPrintIdentity.printIdentity;

    expect(comparisonReportSchema.safeParse(report({
      identityContractVersion: undefined,
      identityCandidates: [withoutPrintIdentity],
      confirmedCard: withoutPrintIdentity,
    })).success).toBe(true);
  });

  it("makes v2 result outcomes mutually exclusive", () => {
    const choice = { role: "best_value", listingId: listing.id, label: "Buy", reason: "Verified", confidence: "high" };
    const inspect = { ...listing, id: "inspect", eligible: false, printMatch: "unknown" as const };

    expect(comparisonReportSchema.safeParse(report({ outcome: "next_moves", rankedChoices: [choice] })).success).toBe(false);
    expect(comparisonReportSchema.safeParse(report({ candidates: [listing, inspect], outcome: "next_moves", inspectListingId: inspect.id })).success).toBe(false);
    expect(comparisonReportSchema.safeParse(report({ candidates: [listing, inspect], outcome: "best_buy", rankedChoices: [choice], inspectListingId: inspect.id })).success).toBe(false);
    expect(comparisonReportSchema.safeParse(report({ candidates: [listing, inspect], outcome: "inspect_first", rankedChoices: [choice], inspectListingId: inspect.id })).success).toBe(false);
  });
});
