import { describe, expect, it, vi } from "vitest";
import { discoverCards } from "@/lib/ai/card-discovery";
import type { CardIdentityCandidate, ComparisonReport, NormalizedListing } from "@/lib/schemas";

const cards = [
  card("pikachu-250", 250),
  card("pikachu-450", 450),
  card("pikachu-700", 700),
  { ...card("pikachu-unknown", 0), marketMid: null },
];

describe("discoverCards", () => {
  it("shortlists market-priced identities in budget and compares them concurrently", async () => {
    const identify = vi.fn(async () => ({
      identityContractVersion: 1 as const,
      status: "needs_confirmation" as const,
      candidates: cards,
      confirmedCard: null,
      warnings: [],
      generatedAt: "2026-07-12T00:00:00.000Z",
    }));
    const compare = vi.fn(async (request) => reportFor(
      cards.find((candidate) => candidate.id === request.confirmedCardId)!,
      request.confirmedCardId === "pikachu-250" ? 275 : 425,
    ));

    const result = await discoverCards(
      {
        query: "Pikachu",
        game: "pokemon",
        budget: { min: 200, max: 500 },
        desiredCondition: "Near Mint",
        postalCode: "10001",
        maxResults: 3,
      },
      { identify, compare, now: () => new Date("2026-07-12T00:00:00.000Z") },
    );

    expect(result.status).toBe("complete");
    expect(result.evaluatedIdentities).toBe(4);
    expect(result.marketEligibleIdentities).toBe(2);
    expect(result.shortlist.map((entry) => entry.card.id)).toEqual(["pikachu-250", "pikachu-450"]);
    expect(result.shortlist.every((entry) => entry.outcome === "best_buy")).toBe(true);
    expect(compare).toHaveBeenCalledTimes(2);
    expect(compare.mock.calls[0]?.[0]).toMatchObject({
      buyer: { desiredCondition: "Near Mint", postalCode: "10001", taxRate: expect.any(Number) },
      confirmedCardId: expect.stringMatching(/^pikachu-/),
    });
  });

  it("does not compare cards when only market-reference discovery was requested", async () => {
    const compare = vi.fn();
    const result = await discoverCards(
      {
        query: "Pikachu",
        game: "pokemon",
        budget: { min: 200, max: 500 },
        includeLiveListings: false,
      },
      { identify: async () => identityResponse(cards), compare },
    );

    expect(result.status).toBe("partial");
    expect(result.shortlist).toHaveLength(2);
    expect(result.shortlist.every((entry) => entry.outcome === "market_reference_only")).toBe(true);
    expect(compare).not.toHaveBeenCalled();
  });

  it("returns no_matches without pretending cards with unknown prices fit the budget", async () => {
    const compare = vi.fn();
    const result = await discoverCards(
      { query: "Pikachu", game: "pokemon", budget: { min: 800, max: 900 } },
      { identify: async () => identityResponse(cards), compare },
    );

    expect(result.status).toBe("no_matches");
    expect(result.shortlist).toEqual([]);
    expect(result.warnings).toContain("No catalog identity with a usable market reference fell inside the requested budget.");
    expect(compare).not.toHaveBeenCalled();
  });

  it("treats catalog language codes as their public language names", async () => {
    const englishCodeCard = { ...card("nami-en", 250), name: "Nami", language: "EN" };
    const result = await discoverCards(
      { query: "Nami", game: "onePiece", language: "English", budget: { min: 200, max: 300 }, includeLiveListings: false },
      { identify: async () => identityResponse([englishCodeCard]) },
    );

    expect(result.shortlist).toHaveLength(1);
    expect(result.shortlist[0]?.card.id).toBe("nami-en");
  });
});

function card(id: string, marketMid: number): CardIdentityCandidate {
  return {
    id,
    name: "Pikachu",
    setName: `Set ${id}`,
    setCode: id,
    cardNumber: id.split("-")[1] ?? id,
    language: "English",
    imageUrl: `https://images.example.com/${id}.png`,
    confidence: "high",
    matchReasons: ["Name matches."],
    marketMid,
  };
}

function identityResponse(candidates: CardIdentityCandidate[]) {
  return {
    identityContractVersion: 1 as const,
    status: "needs_confirmation" as const,
    candidates,
    confirmedCard: null,
    warnings: [],
    generatedAt: "2026-07-12T00:00:00.000Z",
  };
}

function reportFor(card: CardIdentityCandidate, cost: number): ComparisonReport {
  const listing = listingFor(card, cost);
  return {
    status: "complete",
    request: {} as ComparisonReport["request"],
    identityCandidates: [card],
    confirmedCard: card,
    candidates: [listing],
    rankedChoices: [{ role: "best_value", listingId: listing.id, label: "Best value", reason: "Best eligible listing.", confidence: "high" }],
    references: [],
    narrative: { summary: "One eligible listing.", cautions: [] },
    warnings: [],
    trace: [],
    platforms: [],
    webDiscoveries: [],
    outcome: "best_buy",
    inspectListingId: null,
    demoMode: false,
    generatedAt: "2026-07-12T00:00:00.000Z",
  };
}

function listingFor(card: CardIdentityCandidate, cost: number): NormalizedListing {
  return {
    id: `listing-${card.id}`,
    marketplace: "eBay",
    url: `https://www.ebay.com/itm/${card.id}`,
    title: `${card.name} ${card.cardNumber} Near Mint raw`,
    cardId: card.id,
    matchConfidence: "high",
    matchReasons: ["Exact identity."],
    matchAspectText: "",
    active: true,
    raw: true,
    currency: "USD",
    price: cost,
    shipping: 0,
    costComplete: true,
    estimatedTax: null,
    preTaxTotal: cost,
    estimatedLandedCost: null,
    claimedCondition: "Near Mint",
    listingLanguage: "English",
    imageUrl: card.imageUrl,
    seller: { feedbackPercentage: 100, feedbackCount: 1000, returnsAccepted: true, topRated: true, buyerProtection: true, subRatings: null },
    evidence: { photoCount: 4, frontBackExplicit: true, closeupsExplicit: true, surfaceExplicit: false, identityExplicit: true, substantiveConditionNotes: true, missing: [] },
    sellerTrustScore: 90,
    evidenceCompletenessScore: 80,
    conditionCompatibilityScore: 100,
    marketComparable: true,
    priceScore: 80,
    safetyScore: 85,
    valueScore: 85,
    riskLabel: "low_risk",
    trustNotes: [],
    eligible: true,
    exclusionReasons: [],
    observedAt: "2026-07-12T00:00:00.000Z",
    demo: false,
    userSupplied: false,
    webDiscovered: false,
  };
}
