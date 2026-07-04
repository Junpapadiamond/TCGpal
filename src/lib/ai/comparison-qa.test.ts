import { afterEach, describe, expect, it, vi } from "vitest";
import { answerComparisonQuestion } from "@/lib/ai/comparison-qa";
import type { ComparisonReport, NormalizedListing } from "@/lib/schemas";

function listing(overrides: Partial<NormalizedListing>): NormalizedListing {
  return {
    id: "listing",
    marketplace: "eBay",
    url: null,
    title: "Test listing",
    cardId: "OP01-024",
    matchConfidence: "high",
    matchReasons: [],
    active: true,
    raw: true,
    currency: "USD",
    price: 10,
    shipping: 0,
    costComplete: true,
    estimatedTax: null,
    preTaxTotal: 10,
    estimatedLandedCost: null,
    claimedCondition: "Unknown",
    listingLanguage: null,
    imageUrl: null,
    seller: { feedbackPercentage: null, feedbackCount: null, returnsAccepted: null, topRated: null, buyerProtection: null },
    evidence: { photoCount: 0, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: true, substantiveConditionNotes: false, missing: [] },
    sellerTrustScore: 50,
    evidenceCompletenessScore: 10,
    conditionCompatibilityScore: 25,
    marketComparable: false,
    priceScore: 50,
    safetyScore: 30,
    valueScore: 40,
    riskLabel: "unverified",
    trustNotes: [],
    eligible: true,
    exclusionReasons: [],
    observedAt: "2026-07-04T00:00:00.000Z",
    demo: false,
    userSupplied: false,
    webDiscovered: false,
    ...overrides,
  };
}

const report = {
  status: "complete",
  request: {} as ComparisonReport["request"],
  identityCandidates: [],
  confirmedCard: {
    id: "OP01-024",
    name: "Monkey.D.Luffy",
    setName: "Romance Dawn",
    setCode: "OP-01",
    cardNumber: "OP01-024",
    language: "EN",
    imageUrl: null,
    confidence: "high",
    matchReasons: [],
  },
  candidates: [
    listing({ id: "best", title: "Best listing", price: 8, preTaxTotal: 8, sellerTrustScore: 80, evidenceCompletenessScore: 40, safetyScore: 64, valueScore: 82 }),
    listing({ id: "twelve", title: "The $12 listing", price: 12, preTaxTotal: 12, sellerTrustScore: 35, evidenceCompletenessScore: 5, safetyScore: 20, valueScore: 42, trustNotes: ["No seller track record was available."] }),
  ],
  rankedChoices: [{ role: "best_value", listingId: "best", label: "Best Value", reason: "Best value.", confidence: "high" }],
  references: [],
  narrative: { summary: "Summary", cautions: ["Check photos."] },
  warnings: [],
  trace: [],
  platforms: [],
  webDiscoveries: [],
  demoMode: false,
  generatedAt: "2026-07-04T00:00:00.000Z",
} as ComparisonReport;

describe("comparison question answering", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("falls back to deterministic evidence when AI is unavailable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const answer = await answerComparisonQuestion(report, "why not the $12 one?");

    expect(answer.usedAi).toBe(false);
    expect(answer.answer).toContain("42/100");
    expect(answer.answer).toContain("82/100");
    expect(answer.cautions).toContain("No seller track record was available.");
  });

  it("can explain a cheap listing that was excluded by deterministic gates", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const excluded = {
      ...report,
      candidates: [
        ...report.candidates,
        listing({
          id: "replica",
          title: "$2 metal novelty listing",
          price: 2,
          preTaxTotal: 2,
          valueScore: 10,
          eligible: false,
          exclusionReasons: ["Title suggests a novelty or replica card."],
        }),
      ],
    } as ComparisonReport;

    const answer = await answerComparisonQuestion(excluded, "why not the $2 one?");

    expect(answer.usedAi).toBe(false);
    expect(answer.answer).toContain("excluded from winner selection");
    expect(answer.cautions).toContain("Title suggests a novelty or replica card.");
  });

  it("targets the cheapest listing when the question asks why it is risky", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const cheapestReport = {
      ...report,
      rankedChoices: [
        { role: "best_value", listingId: "best", label: "Best Value", reason: "Best value.", confidence: "high" },
        { role: "lowest_landed_cost", listingId: "twelve", label: "Cheapest", reason: "Lowest total.", confidence: "medium" },
      ],
    } as ComparisonReport;

    const answer = await answerComparisonQuestion(cheapestReport, "why is the cheapest one risky?");

    expect(answer.usedAi).toBe(false);
    expect(answer.answer).toContain("The $12 listing");
    expect(answer.answer).toContain("seller risk label");
    expect(answer.answer).toContain("seller trust 35/100");
  });

  it("uses an explicit listing id instead of guessing from price text", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const answer = await answerComparisonQuestion(report, "why not this one?", "twelve");

    expect(answer.usedAi).toBe(false);
    expect(answer.answer).toContain("The $12 listing");
    expect(answer.answer).toContain("42/100");
  });

  it("answers directly when the explicit target is the recommendation", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const answer = await answerComparisonQuestion(report, "why this one?", "best");

    expect(answer.usedAi).toBe(false);
    expect(answer.answer).toContain("leads the Best Value lens");
    expect(answer.answer).toContain("82/100");
  });

  it("explains the selected lens instead of always falling back to Best Value", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const cheapestReport = {
      ...report,
      rankedChoices: [
        { role: "best_value", listingId: "best", label: "Best Value", reason: "Best value.", confidence: "high" },
        { role: "lowest_landed_cost", listingId: "twelve", label: "Cheapest", reason: "Lowest total.", confidence: "medium" },
      ],
    } as ComparisonReport;

    const answer = await answerComparisonQuestion(
      cheapestReport,
      "why this one?",
      "twelve",
      { activeRole: "lowest_landed_cost" },
    );

    expect(answer.answer).toContain("leads the Cheapest lens");
    expect(answer.answer).not.toContain("leads the Best Value lens");
  });

  it("does not use Tavily for report-only ranking questions in auto mode", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const fetchStub = vi.fn(async () => {
      throw new Error("Tavily should not be called");
    });
    vi.stubGlobal("fetch", fetchStub);

    const answer = await answerComparisonQuestion(report, "why not this one?", "twelve", { webContext: "auto" });

    expect(answer.webContextChecked).toBe(false);
    expect(fetchStub).not.toHaveBeenCalled();
    expect(answer.answer).toContain("The $12 listing");
  });

  it("returns separate Tavily citations for outside-context questions", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      results: [
        {
          title: "Card Rush One Piece",
          url: "https://www.cardrush-op.jp/",
          content: "Japanese One Piece Card Game shop reference page.",
          score: 0.9,
        },
      ],
    }))));

    const answer = await answerComparisonQuestion(report, "where else can I verify this card?", undefined, { webContext: "auto" });

    expect(answer.usedAi).toBe(false);
    expect(answer.webContextChecked).toBe(true);
    expect(answer.webCitations).toHaveLength(1);
    expect(answer.webCitations[0]).toMatchObject({
      title: "Card Rush One Piece",
      url: "https://www.cardrush-op.jp/",
      source: "tavily_search",
    });
    expect(answer.answer).toContain("context only");
  });
});
