import { describe, expect, it, vi } from "vitest";
import { createTcglensToolHandlers } from "@/lib/mcp/tools";
import type { CardIdentityCandidate, ComparisonReport, NormalizedListing } from "@/lib/schemas";

const namiCards = Array.from({ length: 30 }, (_, index) => card(`op01-016-${index}`, "Nami", index + 1));

describe("TCGlens MCP tool mappings", () => {
  it("returns capabilities as human and structured content", async () => {
    const handlers = createTcglensToolHandlers();
    const result = await handlers.tcglens_get_capabilities({});

    expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("raw singles") });
    expect(result.structuredContent).toMatchObject({ capabilitiesContractVersion: 1, tcglensUrl: "https://tcgpal.vercel.app/" });
  });

  it("bounds browse results while preserving the total candidate count and ambiguity", async () => {
    const identify = vi.fn(async () => ({
      identityContractVersion: 1 as const,
      status: "needs_confirmation" as const,
      candidates: namiCards,
      confirmedCard: null,
      warnings: [],
      generatedAt: "2026-07-13T00:00:00.000Z",
    }));
    const handlers = createTcglensToolHandlers({ identify });
    const result = await handlers.tcglens_browse_cards({ query: "Nami", game: "onePiece", language: "English", maxResults: 24 });

    expect(identify).toHaveBeenCalledWith(expect.objectContaining({
      query: "Nami",
      cardHint: expect.objectContaining({ game: "onePiece", language: "English" }),
    }), expect.any(Object));
    expect(result.structuredContent).toMatchObject({
      outcome: "needs_confirmation",
      totalCandidateCount: 30,
      returnedCount: 24,
      tcglensUrl: expect.stringContaining("agent=1"),
    });
    expect(result.structuredContent.cards).toHaveLength(24);
    expect(result.structuredContent.cards[0]?.language).toBe("English");
  });

  it("does not fabricate browse cards when identity has no match", async () => {
    const handlers = createTcglensToolHandlers({
      identify: async () => ({ identityContractVersion: 1, status: "not_found", candidates: [], confirmedCard: null, warnings: [], generatedAt: "2026-07-13T00:00:00.000Z" }),
    });
    const result = await handlers.tcglens_browse_cards({ query: "Nobody", game: "onePiece", language: "English", maxResults: 5 });
    expect(result.structuredContent.cards).toEqual([]);
    expect(result.structuredContent.totalCandidateCount).toBe(0);
  });

  it("maps checkout discovery into the shared discoverCards function and preserves partial outcomes", async () => {
    const discover = vi.fn(async (request) => ({
      discoveryContractVersion: 1 as const,
      status: "partial" as const,
      request,
      evaluatedIdentities: 2,
      marketEligibleIdentities: 1,
      shortlist: [{ card: card("pikachu-1", "Pikachu", 199), marketPrice: 355, outcome: "comparison_unavailable" as const, recommendedListing: null, recommendation: null, listingCost: null, warnings: ["eBay unavailable"] }],
      warnings: [],
      limitations: ["Raw singles only."],
      generatedAt: "2026-07-13T00:00:00.000Z",
    }));
    const handlers = createTcglensToolHandlers({ discover });
    const result = await handlers.tcglens_discover_cards({
      query: "Pikachu", game: "pokemon", language: "English",
      budget: { min: 200, max: 500, currency: "USD", basis: "checkout" },
      desiredCondition: "Near Mint", postalCode: "10001", maxResults: 3, includeLiveListings: true,
    });

    expect(discover).toHaveBeenCalledWith(expect.objectContaining({
      budget: { min: 200, max: 500, currency: "USD", basis: "checkout" },
      maxResults: 3,
    }), expect.any(Object));
    expect(result.structuredContent).toMatchObject({ status: "partial", results: [{ outcome: "comparison_unavailable" }] });
    expect(result.structuredContent.results[0]?.marketReference.mid).toBe(350);
  });

  it("rejects invalid discovery budgets before calling the domain", async () => {
    const discover = vi.fn();
    const handlers = createTcglensToolHandlers({ discover });
    await expect(handlers.tcglens_discover_cards({
      query: "Pikachu", game: "pokemon", language: "English",
      budget: { min: 500, max: 200, currency: "USD", basis: "checkout" },
      desiredCondition: "Near Mint", postalCode: "10001", maxResults: 3, includeLiveListings: true,
    })).rejects.toThrow("Budget maximum");
    expect(discover).not.toHaveBeenCalled();
  });

  it("reloads an exact confirmed card through the shared comparison function", async () => {
    const exactReport = report();
    exactReport.confirmedCard = { ...exactReport.confirmedCard!, confidence: "low", matchReasons: ["Catalog reload did not preserve query confidence."] };
    const compare = vi.fn(async () => exactReport);
    const handlers = createTcglensToolHandlers({ compare });
    const result = await handlers.tcglens_compare_card({ confirmedCardId: "sv3pt5-199", game: "pokemon", desiredCondition: "Near Mint", postalCode: "10001" });

    expect(compare).toHaveBeenCalledWith(expect.objectContaining({
      confirmedCardId: "sv3pt5-199",
      buyer: expect.objectContaining({ postalCode: "10001", desiredCondition: "Near Mint" }),
    }), expect.any(Object));
    expect(result.structuredContent).toMatchObject({
      comparisonContractVersion: 5,
      outcome: "best_buy",
      identityConfirmation: {
        confirmed: true,
        method: "canonical_id_reload",
        canonicalCardId: "sv3pt5-199",
        confidence: "high",
        reasonCode: "canonical_id_reloaded",
      },
      card: { id: "sv3pt5-199", cardNumber: "199/165", confidence: "high" },
      listing: {
        title: "Charizard ex 199/165 Near Mint raw",
        checkoutCost: 439.69,
        claimedCondition: "Near Mint",
        identity: {
          printMatch: "exact",
          confidence: "high",
          reasonCodes: ["pokemon_full_number_and_name_match"],
          priceGuard: "none",
          proven: true,
        },
        purchaseReview: {
          eligible: true,
          sellerRisk: "some_risk",
          sellerTrustScore: 90,
          evidenceCompletenessScore: 60,
          evidenceCautions: ["closeups"],
        },
      },
      tcglensUrl: expect.stringContaining("card=sv3pt5-199"),
    });
    expect(JSON.stringify(result)).not.toContain("EBAY_CLIENT_SECRET");
  });

  it("refuses to present an ambiguous comparison as exact", async () => {
    const ambiguous = report();
    ambiguous.status = "needs_confirmation";
    ambiguous.confirmedCard = null;
    ambiguous.rankedChoices = [];
    ambiguous.candidates = [];
    ambiguous.outcome = "next_moves";
    const handlers = createTcglensToolHandlers({ compare: async () => ambiguous });

    await expect(handlers.tcglens_compare_card({ confirmedCardId: "sv3pt5-199", game: "pokemon", desiredCondition: "Near Mint", postalCode: "10001" }))
      .rejects.toThrow("exact card identity");
  });

  it("refuses a canonical reload that returns a different card ID", async () => {
    const substituted = report();
    substituted.confirmedCard = { ...substituted.confirmedCard!, id: "sv3pt5-201" };
    const handlers = createTcglensToolHandlers({ compare: async () => substituted });

    await expect(handlers.tcglens_compare_card({
      confirmedCardId: "sv3pt5-199",
      game: "pokemon",
      desiredCondition: "Near Mint",
      postalCode: "10001",
    })).rejects.toThrow("canonical card ID");
  });

  it("uses the shared deep-link builder", async () => {
    const buildDeepLink = vi.fn(() => "https://tcgpal.vercel.app/?agent=1&card=sv3pt5-199");
    const handlers = createTcglensToolHandlers({ buildDeepLink });
    const result = await handlers.tcglens_build_deep_link({ game: "pokemon", query: "Charizard ex 199/165", confirmedCardId: "sv3pt5-199", autoSubmit: true });
    expect(buildDeepLink).toHaveBeenCalledWith("https://tcgpal.vercel.app", expect.objectContaining({ confirmedCardId: "sv3pt5-199" }));
    expect(result.structuredContent.tcglensUrl).toContain("sv3pt5-199");
  });
});

function card(id: string, name: string, number: number): CardIdentityCandidate {
  return {
    id, name, setName: name === "Nami" ? "Romance Dawn" : "151", setCode: name === "Nami" ? "OP01" : "sv3pt5",
    cardNumber: name === "Nami" ? `016/${number}` : "199/165", language: name === "Nami" ? "EN" : "English", imageUrl: `https://images.example.com/${id}.jpg`,
    rarity: "Rare", variant: "Alternate Art", confidence: "high", matchReasons: ["Name matches."], marketMid: 350, marketSource: "tcgcsv", marketAsOf: "2026-07-13T00:00:00.000Z",
  };
}

function report(): ComparisonReport {
  const confirmedCard = card("sv3pt5-199", "Charizard ex", 199);
  const listing = listingFor(confirmedCard);
  return {
    status: "complete", request: {} as ComparisonReport["request"], identityCandidates: [confirmedCard], confirmedCard,
    candidates: [listing], rankedChoices: [{ role: "best_value", listingId: listing.id, label: "Best value", reason: "Best eligible listing.", confidence: "high" }],
    references: [{ label: "TCGplayer market", status: "used", observedAt: "2026-07-13T00:00:00.000Z", url: null, note: "Current reference.", rawLow: 380, rawMid: 400.85, rawHigh: 430 }],
    narrative: { summary: "One eligible listing.", cautions: [] }, warnings: [], trace: [],
    platforms: [{ id: "ebay", marketplace: "eBay", label: "eBay Browse adapter", sourceMode: "official_api", status: "complete", configured: true, count: 1, detail: "1 live candidate." }],
    webDiscoveries: [], outcome: "best_buy", inspectListingId: null, demoMode: false, generatedAt: "2026-07-13T00:00:00.000Z",
  };
}

function listingFor(cardValue: CardIdentityCandidate): NormalizedListing {
  return {
    id: "listing-1", marketplace: "eBay", url: "https://www.ebay.com/itm/123", title: "Charizard ex 199/165 Near Mint raw", cardId: cardValue.id,
    matchConfidence: "high", matchReasons: ["Exact identity."], printMatch: "exact", printMatchConfidence: "high",
    printMatchReasons: ["pokemon_full_number_and_name_match"], printPriceGuard: "none", matchAspectText: "", active: true, raw: true, currency: "USD", price: 405,
    shipping: 0, costComplete: true, estimatedTax: 34.69, preTaxTotal: 405, estimatedLandedCost: 439.69, claimedCondition: "Near Mint", listingLanguage: "English",
    imageUrl: cardValue.imageUrl, imageUrls: cardValue.imageUrl ? [cardValue.imageUrl] : [], seller: { feedbackPercentage: 99.9, feedbackCount: 2000, returnsAccepted: true, topRated: true, buyerProtection: true, subRatings: null },
    evidence: { photoCount: 4, frontBackExplicit: true, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: true, substantiveConditionNotes: false, missing: ["closeups"] },
    sellerTrustScore: 90, evidenceCompletenessScore: 60, conditionCompatibilityScore: 100, marketComparable: true, priceScore: 80, safetyScore: 78,
    valueScore: 82, riskLabel: "some_risk", trustNotes: [], eligible: true, eligibilityIssues: [], exclusionReasons: [], observedAt: "2026-07-13T00:00:00.000Z", demo: false, userSupplied: false, webDiscovered: false,
  };
}
