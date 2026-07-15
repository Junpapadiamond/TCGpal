import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAgentCapabilities } from "@/lib/agent-capabilities";
import { buildAgentSearchUrl } from "@/lib/agent-search-link";
import { resolveCardIdentity } from "@/lib/ai/card-identity";
import { discoverCards } from "@/lib/ai/card-discovery";
import { runListingComparison } from "@/lib/ai/listing-compare";
import { estimateSalesTaxRateFromZip } from "@/lib/comparison/us-sales-tax";
import { getMcpRequestContext } from "@/lib/mcp/request-context";
import {
  cardDiscoveryRequestSchema,
  comparisonRequestSchema,
  conditionClaimSchema,
  tcgGameSchema,
  type CardIdentityCandidate,
  type ComparisonReport,
  type NormalizedListing,
} from "@/lib/schemas";

export const TCGLENS_ORIGIN = "https://tcgpal.vercel.app";

export const tcglensBrowseInputSchema = z.object({
  query: z.string().trim().min(2).max(200),
  game: tcgGameSchema,
  language: z.enum(["English", "Japanese"]),
  maxResults: z.number().int().min(1).max(24).default(24),
});

export const tcglensDiscoveryInputSchema = cardDiscoveryRequestSchema;

export const tcglensCompareInputSchema = z.object({
  confirmedCardId: z.string().trim().min(1).max(160),
  game: tcgGameSchema,
  desiredCondition: conditionClaimSchema.exclude(["Unknown"]).default("Near Mint"),
  postalCode: z.string().trim().max(10).default(""),
});

export const tcglensDeepLinkInputSchema = z.object({
  game: tcgGameSchema,
  query: z.string().trim().min(2).max(200),
  confirmedCardId: z.string().trim().min(1).max(160).optional(),
  autoSubmit: z.boolean().default(true),
});

type ToolResult<T extends Record<string, unknown>> = {
  content: [{ type: "text"; text: string }];
  structuredContent: T;
};

type ToolDependencies = {
  identify?: typeof resolveCardIdentity;
  discover?: typeof discoverCards;
  compare?: typeof runListingComparison;
  buildDeepLink?: typeof buildAgentSearchUrl;
  now?: () => Date;
};

export const TCGLENS_TOOL_DESCRIPTIONS = {
  tcglens_get_capabilities: "Check TCGlens support before building a card request. Reports live, reference-only, manual-fallback, and unsupported features. TCGlens currently compares raw singles in USD; it does not grade images, verify seller-claimed Near Mint condition, or guarantee sold history.",
  tcglens_browse_cards: "Browse bounded exact card/print identity candidates without searching live listings. Use for requests like 'show me some Nami cards.' Market references are context, not live inventory. If prints are ambiguous, present the identities for confirmation; TCGlens does not grade images.",
  tcglens_discover_cards: "Discover raw single card identities under a hard USD checkout budget, then optionally compare live listings for at most five exact cards. Uses shared deterministic eligibility, checkout-cost, evidence, seller-trust, and ranking rules. Near Mint is only a seller claim; market references are not inventory; no image grading or sold-history guarantee.",
  tcglens_compare_card: "Compare live raw-single listings for one exact confirmed canonical card ID. Exact print confirmation is required. Uses shared deterministic TCGlens ranking and abstention. USD only; seller-claimed Near Mint is not verified; no grade prediction or sold-history guarantee.",
  tcglens_build_deep_link: "Build a TCGlens visual continuation URL from non-sensitive search and exact-card identity state. Never include API keys, private notes, seller identifiers, or other secrets.",
} as const;

export function createTcglensToolHandlers(dependencies: ToolDependencies = {}) {
  const identify = dependencies.identify ?? resolveCardIdentity;
  const discover = dependencies.discover ?? discoverCards;
  const compare = dependencies.compare ?? runListingComparison;
  const buildDeepLink = dependencies.buildDeepLink ?? buildAgentSearchUrl;
  const now = dependencies.now ?? (() => new Date());

  return {
    async tcglens_get_capabilities(rawInput: unknown): Promise<ToolResult<Record<string, unknown>>> {
      z.object({}).strict().parse(rawInput);
      const capabilities = getAgentCapabilities();
      return toolResult(
        `TCGlens supports Pokémon and One Piece raw singles in USD. eBay is the live listing source; market references are reference-only. Image grading, slabs, and automated sold history are unsupported.`,
        { ...capabilities, tcglensUrl: `${TCGLENS_ORIGIN}/` },
      );
    },

    async tcglens_browse_cards(rawInput: unknown) {
      const input = tcglensBrowseInputSchema.parse(rawInput);
      const identity = await identify({
        query: input.query,
        cardHint: { game: input.game, name: input.query, setCode: "", cardNumber: "", language: input.language, variant: "", gradingClaim: "" },
      }, { now });
      const cards = identity.candidates.slice(0, input.maxResults).map(summarizeCard);
      const tcglensUrl = buildDeepLink(TCGLENS_ORIGIN, { query: input.query, game: input.game, autoSubmit: true });
      return toolResult(
        cards.length > 0
          ? `Found ${identity.candidates.length} possible ${input.query} card identities; returning ${cards.length}. Confirm an exact print before comparing listings.`
          : `No matching ${input.query} card identities were returned. No unrelated cards were substituted.`,
        {
          identityContractVersion: identity.identityContractVersion,
          outcome: identity.status,
          totalCandidateCount: identity.candidates.length,
          returnedCount: cards.length,
          cards,
          warnings: identity.warnings,
          generatedAt: identity.generatedAt,
          tcglensUrl,
        },
      );
    },

    async tcglens_discover_cards(rawInput: unknown) {
      const input = tcglensDiscoveryInputSchema.parse(rawInput);
      const response = await discover(input, { now });
      const results = response.shortlist.map((candidate) => ({
        card: summarizeCard(candidate.card),
        marketReference: marketReference(candidate.card, candidate.card.marketMid ?? candidate.marketPrice),
        outcome: candidate.outcome,
        listing: candidate.recommendedListing ? summarizeListing(candidate.recommendedListing) : null,
        recommendation: candidate.recommendation ? {
          role: candidate.recommendation.role,
          label: candidate.recommendation.label,
          reason: candidate.recommendation.reason,
          confidence: candidate.recommendation.confidence,
        } : null,
        warnings: candidate.warnings,
        tcglensUrl: buildDeepLink(TCGLENS_ORIGIN, {
          query: cardQuery(candidate.card), game: input.game, confirmedCardId: candidate.card.id, autoSubmit: true,
        }),
      }));
      return toolResult(
        `TCGlens discovery returned ${results.length} exact-card result${results.length === 1 ? "" : "s"} with status ${response.status}. Checkout budgets were enforced only against complete comparable costs.`,
        {
          discoveryContractVersion: response.discoveryContractVersion,
          status: response.status,
          evaluatedIdentities: response.evaluatedIdentities,
          marketEligibleIdentities: response.marketEligibleIdentities,
          results,
          warnings: response.warnings,
          limitations: response.limitations,
          generatedAt: response.generatedAt,
          tcglensUrl: buildDeepLink(TCGLENS_ORIGIN, { query: input.query, game: input.game, autoSubmit: true }),
        },
      );
    },

    async tcglens_compare_card(rawInput: unknown) {
      const input = tcglensCompareInputSchema.parse(rawInput);
      const request = buildExactComparisonRequest(input);
      const context = getMcpRequestContext();
      const report = await compare(request, {
        now,
        opsContext: context ? { requestId: context.requestId, route: "mcp" } : { route: "mcp" },
      });
      if (!report.confirmedCard || report.status === "needs_confirmation") {
        throw new Error("TCGlens could not reload an exact card identity; no listing comparison was presented as exact.");
      }
      if (report.confirmedCard.id !== input.confirmedCardId) {
        throw new Error("TCGlens reloaded a different canonical card ID; no listing comparison was presented as exact.");
      }
      return summarizeComparisonToolResult(report, input.game, buildDeepLink);
    },

    async tcglens_build_deep_link(rawInput: unknown) {
      const input = tcglensDeepLinkInputSchema.parse(rawInput);
      const tcglensUrl = buildDeepLink(TCGLENS_ORIGIN, input);
      return toolResult("Built a non-sensitive TCGlens visual continuation link.", {
        handoffContractVersion: 1,
        tcglensUrl,
      });
    },
  };
}

export function registerTcglensTools(server: McpServer, dependencies: ToolDependencies = {}) {
  const handlers = createTcglensToolHandlers(dependencies);
  server.registerTool("tcglens_get_capabilities", {
    title: "Get TCGlens capabilities", description: TCGLENS_TOOL_DESCRIPTIONS.tcglens_get_capabilities, inputSchema: {},
  }, handlers.tcglens_get_capabilities);
  server.registerTool("tcglens_browse_cards", {
    title: "Browse card identities", description: TCGLENS_TOOL_DESCRIPTIONS.tcglens_browse_cards, inputSchema: tcglensBrowseInputSchema.shape,
  }, handlers.tcglens_browse_cards);
  server.registerTool("tcglens_discover_cards", {
    title: "Discover cards under constraints", description: TCGLENS_TOOL_DESCRIPTIONS.tcglens_discover_cards, inputSchema: tcglensDiscoveryInputSchema.shape,
  }, handlers.tcglens_discover_cards);
  server.registerTool("tcglens_compare_card", {
    title: "Compare one exact card", description: TCGLENS_TOOL_DESCRIPTIONS.tcglens_compare_card, inputSchema: tcglensCompareInputSchema.shape,
  }, handlers.tcglens_compare_card);
  server.registerTool("tcglens_build_deep_link", {
    title: "Build TCGlens continuation link", description: TCGLENS_TOOL_DESCRIPTIONS.tcglens_build_deep_link, inputSchema: tcglensDeepLinkInputSchema.shape,
  }, handlers.tcglens_build_deep_link);
}

function buildExactComparisonRequest(input: z.infer<typeof tcglensCompareInputSchema>) {
  return comparisonRequestSchema.parse({
    query: input.confirmedCardId,
    sourceListing: { marketplace: "eBay", url: "", title: "", description: "", price: null, shipping: null, claimedCondition: "Unknown", active: true, seller: {}, evidence: {} },
    buyer: { country: "US", postalCode: input.postalCode, taxRate: estimateSalesTaxRateFromZip(input.postalCode), desiredCondition: input.desiredCondition },
    cardHint: { game: input.game, name: "", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
    manualCandidates: [], webDiscoveryMode: "off", confirmedCardId: input.confirmedCardId,
  });
}

function summarizeComparisonToolResult(report: ComparisonReport, game: z.infer<typeof tcgGameSchema>, buildDeepLink: typeof buildAgentSearchUrl) {
  const card = report.confirmedCard!;
  const chosen = report.outcome === "best_buy"
    ? report.rankedChoices.find((choice) => choice.role === "best_value") ?? report.rankedChoices[0] ?? null
    : report.outcome === "inspect_first" && report.inspectListingId
      ? { listingId: report.inspectListingId }
      : null;
  const listing = chosen ? report.candidates.find((candidate) => candidate.id === chosen.listingId) ?? null : null;
  const usedReference = report.references.find((reference) => reference.status === "used" && reference.rawMid !== null);
  const warnings = dedupe([
    ...report.warnings,
    ...(listing ? [
      "Card identity and purchase review are separate: an exact-print match does not verify seller claims, condition, or photos.",
      "Near Mint is the seller's claim; TCGlens has not verified condition or predicted a grade.",
      "Photo content has not been independently verified.",
    ] : []),
  ]);
  return toolResult(
    listing
      ? `TCGlens returned ${report.outcome} for ${card.name} ${card.cardNumber}. The listing condition remains the seller's claim.`
      : `TCGlens returned ${report.outcome ?? "next_moves"} for ${card.name} ${card.cardNumber}; no live listing was recommended.`,
    {
      comparisonContractVersion: 4,
      outcome: report.outcome ?? "next_moves",
      identityConfirmation: {
        confirmed: true,
        method: "canonical_id_reload",
        canonicalCardId: card.id,
        confidence: "high",
        reasonCode: "canonical_id_reloaded",
      },
      card: summarizeConfirmedCard(card),
      marketReference: usedReference ? {
        low: usedReference.rawLow, mid: usedReference.rawMid, high: usedReference.rawHigh,
        source: usedReference.label, asOf: usedReference.observedAt, url: usedReference.url,
        inventory: false,
      } : marketReference(card, card.marketMid ?? null),
      listing: listing ? summarizeListing(listing) : null,
      independentLenses: report.rankedChoices.map((choice) => ({ role: choice.role, listingId: choice.listingId, label: choice.label, reason: choice.reason, confidence: choice.confidence })),
      warnings,
      platformsChecked: report.platforms.map((platform) => ({ id: platform.id, marketplace: platform.marketplace, sourceMode: platform.sourceMode, status: platform.status, count: platform.count })),
      generatedAt: report.generatedAt,
      tcglensUrl: buildDeepLink(TCGLENS_ORIGIN, { query: cardQuery(card), game, confirmedCardId: card.id, autoSubmit: true }),
    },
  );
}

function summarizeCard(card: CardIdentityCandidate) {
  return {
    id: card.id, name: card.name, setName: card.setName, setCode: card.setCode, cardNumber: card.cardNumber,
    language: publicLanguage(card.language), rarity: card.rarity ?? null, variant: card.variant ?? null, confidence: card.confidence,
    marketReference: marketReference(card, card.marketMid ?? null), imageUrl: card.imageUrl,
  };
}

function summarizeConfirmedCard(card: CardIdentityCandidate) {
  return {
    ...summarizeCard(card),
    // Query confidence can be low after a lookup by ID because no free-text
    // query was scored. A successful stable-ID reload is nevertheless a
    // canonical confirmation and must not be presented as low-confidence.
    confidence: "high" as const,
    confirmationReasonCodes: ["canonical_id_reloaded"],
  };
}

function marketReference(card: CardIdentityCandidate, mid: number | null) {
  return {
    low: card.marketLow ?? null, mid, high: card.marketHigh ?? null, source: card.marketSource ?? null,
    asOf: card.marketAsOf ?? null, url: card.marketUrl ?? null, inventory: false,
  };
}

function summarizeListing(listing: NormalizedListing) {
  const printMatch = listing.printMatch ?? "unknown";
  const printConfidence = listing.printMatchConfidence ?? "low";
  const printReasonCodes = listing.printMatchReasons ?? [];
  const priceGuard = listing.printPriceGuard ?? "inspect";
  return {
    title: listing.title,
    marketplace: listing.marketplace,
    url: listing.url,
    checkoutCost: listing.costComplete ? listing.estimatedLandedCost ?? listing.preTaxTotal : null,
    preTaxTotal: listing.costComplete ? listing.preTaxTotal : null,
    estimatedTax: listing.estimatedTax,
    claimedCondition: listing.claimedCondition,
    risk: listing.riskLabel,
    sellerTrustScore: listing.sellerTrustScore,
    evidenceCompletenessScore: listing.evidenceCompletenessScore,
    evidenceMissing: listing.evidence.missing,
    identity: {
      printMatch,
      confidence: printConfidence,
      reasonCodes: printReasonCodes,
      priceGuard,
      proven: printMatch === "exact" || printMatch === "compatible",
    },
    purchaseReview: {
      eligible: listing.eligible,
      sellerRisk: listing.riskLabel,
      sellerTrustScore: listing.sellerTrustScore,
      sellerCautions: sellerReviewCautions(listing),
      evidenceCompletenessScore: listing.evidenceCompletenessScore,
      photoCount: listing.evidence.photoCount,
      evidenceCautions: listing.evidence.missing,
      exclusionReasons: listing.exclusionReasons,
    },
    eligible: listing.eligible,
    exclusionReasons: listing.exclusionReasons,
    observedAt: listing.observedAt,
    imageUrl: listing.imageUrl,
  };
}

function sellerReviewCautions(listing: NormalizedListing) {
  return dedupe([
    ...listing.trustNotes,
    ...(listing.seller.feedbackCount === null
      ? ["Seller feedback count was not available."]
      : listing.seller.feedbackCount < 100
        ? [`Seller has limited feedback history (${listing.seller.feedbackCount} ratings).`]
        : []),
    ...(listing.seller.returnsAccepted === false ? ["Seller does not accept returns."] : []),
  ]);
}

function cardQuery(card: CardIdentityCandidate) {
  return `${card.name} ${card.setName} ${card.cardNumber} ${card.language}${card.variant ? ` ${card.variant}` : ""}`.trim();
}

function toolResult<T extends Record<string, unknown>>(text: string, structuredContent: T): ToolResult<T> {
  return { content: [{ type: "text", text }], structuredContent };
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}

function publicLanguage(value: string) {
  const language = value.trim().toLocaleLowerCase();
  if (["en", "eng", "english"].includes(language)) return "English";
  if (["jp", "jpn", "ja", "japanese"].includes(language)) return "Japanese";
  return value;
}
