import { describe, expect, it } from "vitest";
import { demoListingSeeds } from "@/lib/comparison/fixtures";
import { normalizeListing } from "@/lib/comparison/ranking";
import { buildStandardComparisonRequest, STANDARD_COMPARISON_FLOW_CARDS } from "@/lib/testing/standard-comparison-flow";
import type { ComparisonSnapshot } from "@/lib/comparison/report-snapshot";
import type { CardIdentityCandidate, ComparisonReport, NormalizedListing } from "@/lib/schemas";
import { buildReceiptModel, buildReceiptRecheckPath } from "./receipt-model";

const buyer = {
  country: "US" as const,
  postalCode: "",
  taxRate: null,
  desiredCondition: "Lightly Played" as const,
};

function listing(id: string, price: number, photoCount: number): NormalizedListing {
  return normalizeListing({
    listing: {
      ...demoListingSeeds[0],
      id,
      title: `${id} exact Umbreon listing`,
      price,
      shipping: 5,
      claimedCondition: "Lightly Played",
      demo: false,
      evidence: {
        ...demoListingSeeds[0].evidence,
        photoCount,
      },
    },
    buyer,
    marketPrice: 200,
  });
}

function snapshot(): ComparisonSnapshot {
  const request = buildStandardComparisonRequest(STANDARD_COMPARISON_FLOW_CARDS[0]);
  request.buyer = buyer;
  request.query = "Umbreon VMAX 215/203";
  const card: CardIdentityCandidate = {
    id: "swsh7-215",
    name: "Umbreon VMAX",
    setName: "Evolving Skies",
    setCode: "SWSH7",
    cardNumber: "215/203",
    language: "English",
    imageUrl: "https://images.pokemontcg.io/swsh7/215_hires.png",
    confidence: "high",
    matchReasons: ["Card name, set, and collector number match."],
    marketMid: 200,
    marketSource: "tcgcsv",
    marketAsOf: "2026-08-08T00:00:00.000Z",
  };
  const winner = listing("winner", 180, 8);
  const runnerUp = listing("runner-up", 165, 3);
  const report: ComparisonReport = {
    status: "complete",
    request,
    identityCandidates: [card],
    confirmedCard: card,
    candidates: [runnerUp, winner],
    rankedChoices: [{
      role: "best_value",
      listingId: winner.id,
      label: "Best value",
      reason: "Best balance of complete cost, seller record, and evidence.",
      confidence: "high",
    }],
    references: [],
    narrative: { summary: "The documented listing wins.", cautions: ["Condition remains the seller's claim."] },
    warnings: [],
    trace: [],
    platforms: [{
      id: "ebay",
      marketplace: "eBay",
      label: "eBay Browse",
      sourceMode: "official_api",
      status: "complete",
      configured: true,
      count: 2,
      detail: "Two eligible listings.",
    }],
    webDiscoveries: [],
    outcome: "best_buy",
    demoMode: false,
    generatedAt: "2026-08-09T08:30:00.000Z",
  };
  return {
    id: "0123456789abcdef0123456789abcdef",
    report,
    savedAt: "2026-08-09T08:31:00.000Z",
    expiresAt: "2026-09-08T08:31:00.000Z",
  };
}

describe("receipt model", () => {
  it("turns a completed report into one pick and one distinct second look", () => {
    const model = buildReceiptModel(snapshot());

    expect(model.primary?.listing.id).toBe("winner");
    expect(model.alternative?.id).toBe("runner-up");
    expect(model.listingsToReview.map((entry) => entry.id)).toEqual(["winner", "runner-up"]);
    expect(model.eligibleCount).toBe(2);
  });

  it("builds a live re-check that preserves exact identity, game, and requested condition", () => {
    const url = new URL(buildReceiptRecheckPath(snapshot()), "https://lenstcg.com");

    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("agent")).toBe("1");
    expect(url.searchParams.get("card")).toBe("swsh7-215");
    expect(url.searchParams.get("game")).toBe("pokemon");
    expect(url.searchParams.get("condition")).toBe("Lightly Played");
  });
});
