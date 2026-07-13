import { resolveCardIdentity } from "@/lib/ai/card-identity";
import { runListingComparison } from "@/lib/ai/listing-compare";
import { rankListings } from "@/lib/comparison/ranking";
import { estimateSalesTaxRateFromZip } from "@/lib/comparison/us-sales-tax";
import {
  cardDiscoveryRequestSchema,
  cardDiscoveryResponseSchema,
  comparisonRequestSchema,
  type CardDiscoveryCandidate,
  type CardDiscoveryRequestInput,
  type CardDiscoveryResponse,
  type CardIdentitySearchResponse,
  type ComparisonReport,
  type ComparisonRequest,
  type NormalizedListing,
} from "@/lib/schemas";

type DiscoveryDependencies = {
  identify?: (input: Parameters<typeof resolveCardIdentity>[0]) => Promise<CardIdentitySearchResponse>;
  compare?: (request: ComparisonRequest) => Promise<ComparisonReport>;
  now?: () => Date;
};

const LIMITATIONS = [
  "Raw single cards priced in USD only; graded slabs are outside this discovery contract.",
  "The identity shortlist uses current catalog market references, not verified sold transactions.",
  "Cards without a usable market reference are omitted rather than guessed into the budget.",
  "A live recommendation must still pass exact-print, condition, complete-cost, seller, and evidence gates.",
];

export async function discoverCards(
  rawInput: CardDiscoveryRequestInput,
  dependencies: DiscoveryDependencies = {},
): Promise<CardDiscoveryResponse> {
  const request = cardDiscoveryRequestSchema.parse(rawInput);
  const identify = dependencies.identify ?? ((input) => resolveCardIdentity(input));
  const compare = dependencies.compare ?? ((input) => runListingComparison(input));
  const now = dependencies.now ?? (() => new Date());
  const identity = await identify({
    query: request.query,
    cardHint: {
      game: request.game,
      name: request.query,
      setCode: "",
      cardNumber: "",
      language: request.language,
      variant: "",
      gradingClaim: "",
    },
  });

  const warnings = [...identity.warnings];
  const language = normalizeLanguage(request.language);
  const pricedInBudget = identity.candidates
    .filter((card) => normalizeLanguage(card.language) === language)
    .filter((card) => typeof card.marketMid === "number"
      && Number.isFinite(card.marketMid)
      && card.marketMid >= request.budget.min
      && card.marketMid <= request.budget.max)
    .sort((a, b) => {
      const midpoint = (request.budget.min + request.budget.max) / 2;
      return Math.abs((a.marketMid ?? midpoint) - midpoint) - Math.abs((b.marketMid ?? midpoint) - midpoint)
        || (a.marketMid ?? 0) - (b.marketMid ?? 0);
    });
  const selected = pricedInBudget.slice(0, request.maxResults);

  if (selected.length === 0) {
    if (identity.status === "unavailable") {
      warnings.push("The card catalog was unavailable, so no budget shortlist could be created.");
    } else {
      warnings.push("No catalog identity with a usable market reference fell inside the requested budget.");
    }
    return cardDiscoveryResponseSchema.parse({
      discoveryContractVersion: 1,
      status: identity.status === "unavailable" ? "unavailable" : "no_matches",
      request,
      evaluatedIdentities: identity.candidates.length,
      marketEligibleIdentities: pricedInBudget.length,
      shortlist: [],
      warnings,
      limitations: LIMITATIONS,
      generatedAt: now().toISOString(),
    });
  }

  let shortlist: CardDiscoveryCandidate[];
  if (!request.includeLiveListings) {
    shortlist = selected.map((card) => ({
      card,
      marketPrice: card.marketMid as number,
      outcome: "market_reference_only",
      recommendedListing: null,
      recommendation: null,
      listingCost: null,
      warnings: [],
    }));
  } else {
    shortlist = await Promise.all(selected.map(async (card): Promise<CardDiscoveryCandidate> => {
      try {
        const report = await compare(buildComparisonRequest(request, card));
        return summarizeComparison(report, card.marketMid as number, request.budget);
      } catch (error) {
        return {
          card,
          marketPrice: card.marketMid as number,
          outcome: "comparison_unavailable",
          recommendedListing: null,
          recommendation: null,
          listingCost: null,
          warnings: [error instanceof Error ? error.message : "Live listing comparison was unavailable."],
        };
      }
    }));
  }

  const hasBuy = shortlist.some((candidate) => candidate.outcome === "best_buy");
  return cardDiscoveryResponseSchema.parse({
    discoveryContractVersion: 1,
    status: hasBuy ? "complete" : "partial",
    request,
    evaluatedIdentities: identity.candidates.length,
    marketEligibleIdentities: pricedInBudget.length,
    shortlist,
    warnings,
    limitations: LIMITATIONS,
    generatedAt: now().toISOString(),
  });
}

function buildComparisonRequest(
  request: ReturnType<typeof cardDiscoveryRequestSchema.parse>,
  card: CardIdentitySearchResponse["candidates"][number],
) {
  return comparisonRequestSchema.parse({
    query: `${card.name} ${card.setCode} ${card.cardNumber}`.trim(),
    sourceListing: {
      marketplace: "eBay",
      url: "",
      title: "",
      description: "",
      price: null,
      shipping: null,
      claimedCondition: "Unknown",
      active: true,
      seller: {},
      evidence: {},
    },
    buyer: {
      country: "US",
      postalCode: request.postalCode,
      taxRate: estimateSalesTaxRateFromZip(request.postalCode),
      desiredCondition: request.desiredCondition,
    },
    cardHint: {
      game: request.game,
      name: card.name,
      setCode: card.setCode,
      cardNumber: card.cardNumber,
      language: card.language,
      variant: card.variant ?? "",
      gradingClaim: "",
    },
    manualCandidates: [],
    webDiscoveryMode: "off",
    confirmedCardId: card.id,
  });
}

function summarizeComparison(
  report: ComparisonReport,
  marketPrice: number,
  budget: { min: number; max: number },
): CardDiscoveryCandidate {
  const card = report.confirmedCard ?? report.identityCandidates[0];
  if (!card) throw new Error("The comparison did not return the confirmed card identity.");

  const inBudget = report.candidates.filter((listing) => {
    const cost = comparableCost(listing);
    return listing.eligible && cost !== null && cost >= budget.min && cost <= budget.max;
  });
  const choices = rankListings(inBudget, { marketPrice });
  const recommendation = choices.find((choice) => choice.role === "best_value") ?? choices[0] ?? null;
  const recommendedListing = recommendation
    ? inBudget.find((listing) => listing.id === recommendation.listingId) ?? null
    : null;
  if (recommendation && recommendedListing) {
    return {
      card,
      marketPrice,
      outcome: "best_buy",
      recommendedListing,
      recommendation,
      listingCost: comparableCost(recommendedListing),
      warnings: report.warnings,
    };
  }

  const inspectListing = report.inspectListingId
    ? report.candidates.find((listing) => listing.id === report.inspectListingId && isInsideBudget(listing, budget)) ?? null
    : null;
  return {
    card,
    marketPrice,
    outcome: inspectListing ? "inspect_first" : "no_listing_in_budget",
    recommendedListing: inspectListing,
    recommendation: null,
    listingCost: inspectListing ? comparableCost(inspectListing) : null,
    warnings: report.warnings,
  };
}

function isInsideBudget(listing: NormalizedListing, budget: { min: number; max: number }) {
  const cost = comparableCost(listing);
  return cost !== null && cost >= budget.min && cost <= budget.max;
}

function comparableCost(listing: NormalizedListing) {
  if (!listing.costComplete) return null;
  return listing.estimatedLandedCost ?? listing.preTaxTotal;
}

function normalizeLanguage(value: string) {
  const language = value.trim().toLocaleLowerCase();
  if (["en", "eng", "english"].includes(language)) return "english";
  if (["jp", "jpn", "ja", "japanese"].includes(language)) return "japanese";
  return language;
}
