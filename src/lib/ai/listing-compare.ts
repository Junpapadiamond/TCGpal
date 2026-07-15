import { createAiProvider } from "@/lib/ai/provider";
import { getAiConfig } from "@/lib/ai/config";
import { demoIdentities, type DemoListingSeed } from "@/lib/comparison/fixtures";
import {
  deriveVariantIntent,
  finalizeListingScores,
  isOnePieceCardKey,
  isVariantMismatchReason,
  normalizeListing,
  rankListings,
  variantIntentLabel,
  type VariantIntent,
} from "@/lib/comparison/ranking";
import {
  EbayUnavailableError,
  getEbayListingByUrl,
  parseEbayUrl,
} from "@/lib/external/ebay";
import { getConfiguredPlatformAgents, runPlatformFanout } from "@/lib/comparison/platforms";
import { resolveCardCrosswalk, type CardCrosswalkEntry } from "@/lib/comparison/crosswalk";
import { canonicalPrintIdentity } from "@/lib/comparison/print-fidelity";
import {
  collectorNumberParts,
  collectorNumberPattern,
  collectorNumbersEquivalent,
} from "@/lib/comparison/collector-number";
import { isGradedListing } from "@/lib/comparison/graded-listing";
import {
  comparisonCacheKey,
  getCachedComparison,
  isCacheableRequest,
  setCachedComparison,
} from "@/lib/comparison/report-cache";
import { logOpsEvent, type OpsRoute } from "@/lib/ops/events";
import {
  isTcgcsvStale,
  searchTcgplayerListings,
  type TcgplayerSearchResult,
} from "@/lib/external/tcgcsv";
import {
  fetchUniversalListing,
  UniversalListingBlockedError,
  type UniversalListingResult,
} from "@/lib/external/universal-listing";
import {
  discoverWebMarketplaceLinks,
  isWebMarketplaceDiscoveryConfigured,
} from "@/lib/external/web-marketplace-discovery";
import { parsedCardQuerySchema, parseCardQuery, type ParsedCardQuery } from "@/lib/comparison/query-parser";
import { PriceChartingUnavailableError, searchPriceChartingProducts } from "@/lib/external/price-charting";
import { buildJapanReferenceLinks } from "@/lib/comparison/japan-references";
import { getPokemonCard, searchPokemonCards, type PokemonTcgCard } from "@/lib/external/pokemon-tcg";
import {
  getOnePieceCard,
  mapOnePieceCardToIdentity,
  onePieceSetMatches,
  searchOnePieceCards,
  variantKey,
  type OnePieceTcgCard,
} from "@/lib/external/one-piece-tcg";
import { findOnePieceCatalogVariant, findOnePieceCatalogVariants } from "@/lib/external/one-piece-catalog";
import {
  cardIdentityCandidateSchema,
  comparisonNarrativeSchema,
  comparisonReportSchema,
  comparisonRequestSchema,
  type CardHint,
  type CardIdentityCandidate,
  type ComparisonAbstention,
  type ComparisonReference,
  type ComparisonReport,
  type ComparisonRequest,
  type ComparisonTrace,
  type NormalizedListing,
  type SourceListing,
} from "@/lib/schemas";

// Broad queries (e.g. "pikachu") legitimately match many prints — collectors
// want to browse every version, not a truncated top-24. Cap only at a level
// that protects the response payload; the IdentityConfirmation UI groups and
// filters (by set/rarity) so the full list stays scannable.
const MAX_IDENTITY_CANDIDATES = 200;

export async function runListingComparison(
  rawRequest: ComparisonRequest,
  dependencies: {
    fetcher?: typeof fetch;
    now?: () => Date;
    opsContext?: {
      requestId?: string;
      route?: OpsRoute;
    };
  } = {},
): Promise<ComparisonReport> {
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  const opsContext = dependencies.opsContext;
  const generatedAt = now().toISOString();
  const warnings: string[] = [];
  const trace: ComparisonTrace[] = [];
  const demoMode = false;

  const request = await applyQueryParserWithAi(comparisonRequestSchema.parse(rawRequest), trace);

  const { source: sourceResult, universal } = await ingestSourceListing(request, fetcher, warnings, trace);
  const identities = (await identifyCards(request, sourceResult, fetcher, warnings, trace))
    .map((identity) => ({ ...identity, printIdentity: canonicalPrintIdentity(identity) }));
  let confirmedCard = resolveConfirmedCard(request, identities);

  if (!confirmedCard) {
    trace.push({
      step: "identity_confirmation",
      actor: "Deterministic validator",
      summary: "Paused before marketplace search because the exact card/version needs confirmation.",
      status: "complete",
    });
    return comparisonReportSchema.parse({
      status: "needs_confirmation",
      request: { ...request, sourceListing: sourceResult },
      identityCandidates: identities,
      confirmedCard: null,
      candidates: [],
      rankedChoices: [],
      references: [],
      narrative: {
        summary: "Confirm the exact card before TCGlens compares prices. Similar artwork and reprints can produce a precise-looking but wrong result.",
        cautions: ["No marketplace ranking has been created yet."],
      },
      warnings,
      trace,
      platforms: [],
      webDiscoveries: [],
      outcome: "next_moves",
      inspectListingId: null,
      identityContractVersion: 3,
      demoMode: getConfiguredPlatformAgents().length === 0,
      generatedAt,
    });
  }

  trace.push({
    step: "identity_confirmation",
    actor: "Deterministic validator",
    summary: `Confirmed ${confirmedCard.name}, ${confirmedCard.setName} ${confirmedCard.cardNumber}.`,
    status: "complete",
  });
  confirmedCard = { ...confirmedCard, printIdentity: canonicalPrintIdentity(confirmedCard) };

  // R7: pure card searches are served from a 15-minute cache keyed by
  // card + condition + delivery context.
  const cacheable = isCacheableRequest(request);
  const cacheKey = comparisonCacheKey(request, confirmedCard.id);
  if (cacheable) {
    const cached = await getCachedComparison(cacheKey, now());
    if (cached) {
      logOpsEvent({
        event: "cache_lookup",
        requestId: opsContext?.requestId,
        route: opsContext?.route,
        status: "hit",
      });
      return {
        ...cached,
        trace: [...cached.trace, {
          step: "cache",
          actor: "Comparison cache",
          summary: "Served from the 15-minute comparison cache for this card, condition, and delivery context.",
          status: "complete" as const,
        }],
      };
    }
    logOpsEvent({
      event: "cache_lookup",
      requestId: opsContext?.requestId,
      route: opsContext?.route,
      status: "miss",
    });
  }

  const wantsWebDiscovery = request.webDiscoveryMode === "expanded";
  const webDiscoveryPromise = wantsWebDiscovery && isWebMarketplaceDiscoveryConfigured()
    ? discoverWebMarketplaceLinks({ card: confirmedCard, fetcher, now }).catch((error) => ({
      results: [],
      warnings: [`Web marketplace discovery unavailable: ${errorMessage(error)}`],
    }))
    : Promise.resolve({ results: [], warnings: [] });

  // R1: resolve the crosswalk once (module-cached 6h) so every connector gets
  // its platform-native identifier; the TCGplayer agent reuses this entry.
  let crosswalk: CardCrosswalkEntry | null = null;
  try {
    crosswalk = await resolveCardCrosswalk(confirmedCard, fetcher, now, request.buyer);
  } catch {
    /* the eBay leg still works from the card fields */
  }
  const ebayCrosswalkSummary = crosswalk?.ebayProduct
    ? `eBay ePID ${crosswalk.ebayProduct.epid}`
    : "eBay keyword template";
  const tcgplayerCrosswalkSummary = crosswalk?.tcgplayerProductId
    ? `TCGplayer product #${crosswalk.tcgplayerProductId}`
    : "no TCGplayer product match";
  trace.push({
    step: "card_crosswalk",
    actor: "Catalog crosswalk",
    summary: `Mapped ${confirmedCard.id} → ${ebayCrosswalkSummary}; ${tcgplayerCrosswalkSummary}.`,
    status: crosswalk?.tcgplayerProductId || crosswalk?.ebayProduct ? "complete" : "fallback",
  });

  // R3: the daily-feed market anchor resolves in parallel with the fan-out.
  const anchorPromise: Promise<TcgplayerSearchResult | null> = crosswalk?.tcgplayerProduct
    ? searchTcgplayerListings(confirmedCard, crosswalk.tcgplayerProduct, fetcher).catch(() => null)
    : Promise.resolve(null);

  // PriceCharting only needs the confirmed card, so it overlaps with the
  // marketplace fan-out — the round trip stays off the critical path.
  const priceChartingPromise = getPriceChartingReference(confirmedCard, fetcher, trace, generatedAt);

  const seeds: DemoListingSeed[] = [];
  const manualSeed = sourceToSeed(sourceResult, confirmedCard, generatedAt, universal);
  if (manualSeed) {
    seeds.push(manualSeed);
    if (manualSeed.matchConfidence === "low") {
      warnings.push("The pasted listing appears to describe a different card or version than the one you confirmed, so it is excluded from the recommendation.");
    }
  }

  const ledgerSeeds = manualCandidatesToSeeds(request.manualCandidates, confirmedCard, generatedAt);
  if (ledgerSeeds.length > 0) {
    seeds.push(...ledgerSeeds);
    trace.push({
      step: "marketplace_search",
      actor: "Cross-platform ledger",
      summary: `Added ${ledgerSeeds.length} user-entered listing${ledgerSeeds.length === 1 ? "" : "s"} from other platforms (not fetched).`,
      status: "complete",
    });
  }

  // Cross-platform fan-out: every configured marketplace agent searches in
  // parallel and reconciles into the same ledger. Each agent self-gates on its own
  // API credentials, so this scales to whatever platforms the operator has wired —
  // a failing one is isolated and never sinks the others.
  const fanout = await runPlatformFanout({
    card: confirmedCard,
    buyer: request.buyer,
    fetcher,
    plan: {
      query: crosswalk?.ebayQueryTemplate,
      ebayProduct: crosswalk?.ebayProduct ?? null,
    },
    opsContext,
  });
  seeds.push(...fanout.seeds);
  warnings.push(...fanout.warnings);
  trace.push(...fanout.traces);
  const platformResults = fanout.results;
  const webDiscovery = await webDiscoveryPromise;
  if (wantsWebDiscovery && (webDiscovery.results.length > 0 || webDiscovery.warnings.length > 0)) {
    trace.push({
      step: "web_marketplace_discovery",
      actor: "Exa/Tavily web discovery",
      summary: webDiscovery.results.length > 0
        ? `Found ${webDiscovery.results.length} possible marketplace/reference links for manual review. No discovery snippet was parsed or ranked.`
        : `No web-discovered marketplace links were added (${webDiscovery.warnings.join("; ") || "no results"}).`,
      status: webDiscovery.results.length > 0 ? "complete" : "fallback",
    });
  }

  // R3: prefer the daily TCGplayer feed (explicit as-of timestamp) as the
  // market anchor; the inline catalog price stays as the fallback anchor.
  const tcgplayerData = await anchorPromise;
  confirmedCard = applyMarketAnchor(confirmedCard, crosswalk, tcgplayerData);
  if (confirmedCard.marketSource === "tcgcsv" && isTcgcsvStale(confirmedCard.marketAsOf ?? null, now())) {
    warnings.push(`TCGplayer prices are more than 48 hours old (as of ${formatAnchorDate(confirmedCard.marketAsOf)}). Treat the market reference with extra care.`);
  }

  if (fanout.seeds.length === 0 && seeds.length === 0) {
    // An empty live search is a real product outcome. Do not manufacture a
    // recommendation from fixtures; keep useful references and next actions.
    warnings.push(fanout.configuredCount === 0
      ? "No live marketplace API is configured. Connect eBay or paste a specific listing to inspect."
      : "No live marketplace source returned a listing. Refine the card details, retry, or paste a specific listing.");
    trace.push({
      step: "marketplace_search",
      actor: "Platform fan-out",
      summary: "No live source returned listings; preserved an honest empty result.",
      status: "fallback",
    });
  }

  // Demo fixtures are never scored against the market anchor: their prices are
  // fabricated, so any market-derived score would be a fake vs-market read.
  const marketAnchor = demoMode ? null : confirmedCard.marketMid ?? null;
  // Keep the ranked listings on the confirmed side of the variant line: the same
  // One Piece card number spans base, alternate arts, and SP / manga / treasure
  // special prints at very different prices, so the gate needs the exact class,
  // not just base-vs-alt. Demo fixtures aren't gated (they're labeled, not real
  // offers). Pokémon collector numbers identify a unique print, so only the One
  // Piece catalog needs the title-side variant gate.
  const onePieceVariant = isOnePieceCardKey(confirmedCard.cardNumber, confirmedCard.id);
  const variantIntent = demoMode || !onePieceVariant ? null : deriveVariantIntent(confirmedCard);
  const normalized = finalizeListingScores(dedupeSeeds(seeds).map((listing) => normalizeListing({
    listing,
    buyer: request.buyer,
    marketPrice: marketAnchor,
    variantIntent,
    cardLanguage: confirmedCard.language,
    confirmedCard: demoMode ? null : confirmedCard,
  })));
  const rankedChoices = rankListings(normalized, { marketPrice: marketAnchor });
  const inspectLead = normalized
    .filter((listing) => listing.printMatch === "unknown"
      && listing.printPriceGuard !== "exclude"
      && listing.active
      && listing.raw
      && listing.currency === "USD"
      && listing.shipping !== null
      && listing.matchConfidence !== "low"
      && listing.exclusionReasons.every((reason) => reason.includes("exact confirmed artwork")))
    .sort((a, b) => b.valueScore - a.valueScore || a.preTaxTotal - b.preTaxTotal)[0] ?? null;
  const outcome = rankedChoices.length > 0
    ? "best_buy" as const
    : inspectLead
      ? "inspect_first" as const
      : "next_moves" as const;
  trace.push({
    step: "validation_and_ranking",
    actor: "Deterministic TypeScript",
    summary: `Validated ${normalized.length} candidates and computed ${rankedChoices.length} independent decision lenses.`,
    status: "complete",
  });

  const marketReference = buildMarketReference(confirmedCard, generatedAt);
  const references: ComparisonReference[] = [
    ...(marketReference ? [marketReference] : []),
    await priceChartingPromise,
    buildSoldReference(confirmedCard, generatedAt),
    ...buildJapanReferenceLinks(confirmedCard, generatedAt),
  ];
  const narrative = buildNarrative(confirmedCard, normalized, rankedChoices, references, trace);
  const partial = normalized.filter((listing) => listing.eligible).length === 0
    || (!demoMode && references.every((reference) => reference.status !== "used"));
  const abstention = !demoMode && rankedChoices.length === 0 && normalized.length > 0
    ? buildAbstention(confirmedCard, normalized, variantIntent)
    : null;

  const report = comparisonReportSchema.parse({
    status: partial ? "partial" : "complete",
    request: { ...request, sourceListing: sourceResult },
    identityCandidates: identities,
    confirmedCard,
    candidates: normalized,
    rankedChoices,
    references,
    narrative,
    warnings,
    trace,
    platforms: platformResults,
    webDiscoveries: webDiscovery.results,
    abstention,
    outcome,
    inspectListingId: outcome === "inspect_first" ? inspectLead?.id ?? null : null,
    identityContractVersion: 3,
    demoMode,
    generatedAt,
  });

  if (cacheable) await setCachedComparison(cacheKey, report, now());
  return report;
}

export async function resolveCardIdentityCandidates(
  rawRequest: ComparisonRequest,
  dependencies: { fetcher?: typeof fetch; now?: () => Date } = {},
) {
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  const warnings: string[] = [];
  const trace: ComparisonTrace[] = [];
  const request = await applyQueryParserWithAi(comparisonRequestSchema.parse(rawRequest), trace);
  const identities = (await identifyCards(request, request.sourceListing, fetcher, warnings, trace))
    .map((identity) => ({ ...identity, printIdentity: canonicalPrintIdentity(identity) }));
  const explicitNumber = collectorNumberParts(request.cardHint.cardNumber);
  const sameNumber = explicitNumber.number
    ? identities.filter((identity) => {
      const candidate = collectorNumberParts(identity.cardNumber);
      return candidate.number === explicitNumber.number
        && (!explicitNumber.total || candidate.total === explicitNumber.total);
    })
    : [];
  const candidates = sameNumber.length > 0 ? sameNumber : identities;
  if (explicitNumber.number && sameNumber.length === 0 && identities.length > 0) {
    warnings.push("That collector number did not match the catalog results, so broader name matches are shown for confirmation.");
  }
  const confirmedCard = resolveConfirmedCard(request, candidates);
  return { request, candidates, confirmedCard, warnings, trace, generatedAt: now().toISOString() };
}

// Deterministic explanation for "found listings, recommended none": names the
// confirmed print, counts different-print supply, and — when a sibling print of
// the same One Piece number exists in the catalog — suggests the one-tap switch
// most likely to have live supply. Never invents listings; the excluded ledger
// stays the evidence.
function buildAbstention(
  confirmedCard: CardIdentityCandidate,
  listings: NormalizedListing[],
  variantIntent: VariantIntent | null,
): ComparisonAbstention {
  const variantExcluded = listings.filter(
    (listing) => !listing.eligible && listing.exclusionReasons.some(isVariantMismatchReason),
  );

  let suggestedCardId: string | null = null;
  let suggestedLabel: string | null = null;
  if (variantIntent && variantExcluded.length > 0 && isOnePieceCardKey(confirmedCard.cardNumber, confirmedCard.id)) {
    const siblings = findOnePieceCatalogVariants(confirmedCard.cardNumber)
      .filter((print) => variantKey(print) !== confirmedCard.id);
    const target = variantIntent !== "base"
      ? siblings.find((print) => deriveVariantIntent(print) === "base") ?? siblings[0]
      : siblings[0];
    if (target) {
      suggestedCardId = variantKey(target);
      suggestedLabel = target.variant ?? (deriveVariantIntent(target) === "base" ? "base print" : target.rarity ?? "other print");
    }
  }

  const count = listings.length;
  const plural = count === 1 ? "listing" : "listings";
  const reason = variantIntent && variantIntent !== "base"
    ? `Found ${count} live ${plural} for ${confirmedCard.cardNumber}, but none matched the ${variantIntentLabel(variantIntent)} print${
      variantExcluded.length > 0 ? ` — ${variantExcluded.length} looked like a different print of the same number` : ""
    }.`
    : `Found ${count} live ${plural}, but none met the comparison gates (exact match, condition fit, and complete cost).`;

  return {
    reason,
    foundCount: count,
    variantExcludedCount: variantExcluded.length,
    suggestedCardId,
    suggestedLabel,
  };
}

// Prefer the daily TCGplayer feed over the inline catalog approximation, but
// never drop an existing anchor for nothing.
function applyMarketAnchor(
  card: CardIdentityCandidate,
  crosswalk: CardCrosswalkEntry | null,
  tcgplayer: TcgplayerSearchResult | null,
): CardIdentityCandidate {
  const tcgplayerProductId = crosswalk?.tcgplayerProductId ?? null;
  if (tcgplayer?.anchor && tcgplayer.anchor.mid !== null) {
    return {
      ...card,
      marketLow: tcgplayer.anchor.low,
      marketMid: tcgplayer.anchor.mid,
      marketHigh: tcgplayer.anchor.high,
      marketUrl: tcgplayer.anchor.url,
      marketSource: "tcgcsv",
      marketAsOf: tcgplayer.asOf,
      tcgplayerProductId,
    };
  }
  if (typeof card.marketMid === "number") {
    return { ...card, marketSource: card.marketSource ?? "pokemontcg", tcgplayerProductId };
  }
  return { ...card, tcgplayerProductId };
}

function formatAnchorDate(value: string | null | undefined) {
  if (!value) return "unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
}

// The hero search box entry point: deterministically decompose one free-text
// query into cardHint fields, then merge — never overwriting a field the caller
// (the progressive-disclosure detail form) explicitly set. On the game/language
// fields, which have non-blank schema defaults ("pokemon"/"English"), a caller
// that hasn't touched those pickers is indistinguishable from one who explicitly
// chose the default — so a confident signal from the query text wins in that
// case. This only matters when both a query AND explicit conflicting cardHint
// fields are sent at once; the primary hero-search flow sends query alone with a
// blank cardHint, where this is unambiguous.
export function applyQueryParser(request: ComparisonRequest, trace: ComparisonTrace[]): ComparisonRequest {
  const query = request.query?.trim();
  if (!query) return request;

  const parsed = parseCardQuery(query);
  return applyParsedCardQuery(request, query, parsed, trace, "Smart query parser");
}

export async function applyQueryParserWithAi(request: ComparisonRequest, trace: ComparisonTrace[]): Promise<ComparisonRequest> {
  const query = request.query?.trim();
  if (!query) return request;

  const parsed = parseCardQuery(query);
  if (hasStructuredQuerySignal(parsed) || isSimpleCardNameQuery(parsed)) {
    return applyParsedCardQuery(request, query, parsed, trace, "Smart query parser");
  }

  const aiParsed = await parseCardQueryWithAi(query, trace);
  return applyParsedCardQuery(request, query, aiParsed ?? parsed, trace, aiParsed ? "AI query parser" : "Smart query parser");
}

function isSimpleCardNameQuery(parsed: ParsedCardQuery) {
  const words = parsed.name.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 2;
}

function applyParsedCardQuery(
  request: ComparisonRequest,
  query: string,
  parsed: ParsedCardQuery,
  trace: ComparisonTrace[],
  actor: string,
): ComparisonRequest {
  const cardHint: CardHint = {
    game: request.cardHint.game !== "pokemon" ? request.cardHint.game : (parsed.game ?? request.cardHint.game),
    name: request.cardHint.name || parsed.name,
    setCode: request.cardHint.setCode || parsed.setCode,
    cardNumber: request.cardHint.cardNumber || parsed.cardNumber,
    language: request.cardHint.language !== "English" ? request.cardHint.language : (parsed.language || request.cardHint.language),
    variant: request.cardHint.variant || parsed.variant,
    gradingClaim: request.cardHint.gradingClaim || parsed.gradingClaim,
  };

  const derived = [
    cardHint.name && `name "${cardHint.name}"`,
    cardHint.cardNumber && `collector number ${cardHint.cardNumber}`,
    cardHint.setCode && `set ${cardHint.setCode}`,
    parsed.game && `game ${parsed.game}`,
    parsed.language && `language ${parsed.language}`,
    cardHint.variant && `variant ${cardHint.variant}`,
    cardHint.gradingClaim && `grading claim ${cardHint.gradingClaim}`,
  ].filter(Boolean);

  trace.push({
    step: "query_parsing",
    actor,
    summary: derived.length
      ? `Parsed "${query}" into ${derived.join(", ")}.`
      : `Could not derive structured fields from "${query}"; treating it as a plain name search.`,
    status: "complete",
  });

  return { ...request, cardHint };
}

function hasStructuredQuerySignal(parsed: ParsedCardQuery) {
  return Boolean(
    parsed.game
    || parsed.cardNumber
    || parsed.language
    || parsed.variant
    || parsed.gradingClaim,
  );
}

async function parseCardQueryWithAi(query: string, trace: ComparisonTrace[]): Promise<ParsedCardQuery | null> {
  const config = getAiConfig();
  const provider = createAiProvider(config);

  try {
    const response = await provider.completeJson({
      role: "classifier",
      schemaName: "card_query_hint",
      schema: parsedCardQuerySchema,
      system: [
        "You convert a short trading-card search string into card identity hints.",
        "Return only fields the buyer stated or a very common nickname/alias you are confident about.",
        "Do not choose a final card identity, product id, listing, price, grade, or seller.",
        "If a field is not stated or confidently implied, leave it blank/null.",
        "Use game onePiece only for One Piece Card Game, pokemon only for Pokemon TCG.",
      ].join("\n"),
      user: { query },
    });
    trace.push({
      step: "query_parsing",
      actor: `AI query parser · ${response.model}`,
      summary: `Filled unstructured search hints for "${query}" with the cheap model; catalog confirmation still decides the exact card.`,
      status: "complete",
    });
    return response.data;
  } catch (error) {
    trace.push({
      step: "query_parsing",
      actor: "AI query parser",
      summary: `Could not enrich unstructured search text; using deterministic plain-name parsing: ${errorMessage(error)}`,
      status: "fallback",
    });
    return null;
  }
}

async function ingestSourceListing(
  request: ComparisonRequest,
  fetcher: typeof fetch,
  warnings: string[],
  trace: ComparisonTrace[],
): Promise<{ source: SourceListing; universal: UniversalListingResult | null }> {
  const url = request.sourceListing.url?.trim();
  if (!url) {
    trace.push({
      step: "source_ingestion",
      actor: "Manual listing adapter",
      summary: "Accepted user-supplied listing facts without fetching an external URL.",
      status: "complete",
    });
    return { source: request.sourceListing, universal: null };
  }

  const parsed = parseEbayUrl(url);
  if (parsed.supported) {
    try {
      const source = await getEbayListingByUrl(url, request.buyer, fetcher);
      trace.push({
        step: "source_ingestion",
        actor: "eBay Browse adapter",
        summary: "Fetched the source listing through the official eBay API.",
        status: "complete",
      });
      return { source, universal: null };
    } catch (error) {
      if (!(error instanceof EbayUnavailableError)) warnings.push(errorMessage(error));
      trace.push({
        step: "source_ingestion",
        actor: "eBay Browse adapter",
        summary: "Live source lookup was unavailable; retained only user-supplied facts.",
        status: "fallback",
      });
      return { source: request.sourceListing, universal: null };
    }
  }

  // R6: any other pasted marketplace URL is fetched once — user-initiated,
  // exactly that page, robots.txt honored — and extracted into the same
  // listing shape. User-typed facts stay source truth; extraction fills gaps.
  try {
    const universal = await fetchUniversalListing(url, fetcher);
    const merged = mergeSourceFacts(request.sourceListing, universal.listing);
    const usedTavilyFallback = universal.notes.some((note) => note.includes("Tavily Extract filled"));
    const extractionDetails = universal.notes.length > 0 ? ` ${universal.notes.join(" ")}` : "";
    trace.push({
      step: "source_ingestion",
      actor: "Paste-a-URL adapter",
      summary: usedTavilyFallback
        ? `The direct listing page was unavailable; Tavily Extract recovered stated facts from the exact pasted ${universal.marketplace} URL only.${extractionDetails}`
        : `Fetched the pasted ${universal.marketplace} listing you provided (single user-initiated fetch) and extracted its stated facts${universal.usedAi ? " with AI assistance" : " from structured page data"}.${extractionDetails}`,
      status: "complete",
    });
    return { source: merged, universal };
  } catch (error) {
    if (error instanceof UniversalListingBlockedError) {
      warnings.push(error.message);
    } else {
      warnings.push(`The pasted listing page could not be read (${errorMessage(error)}). Only your typed facts are used.`);
    }
    trace.push({
      step: "source_ingestion",
      actor: "Paste-a-URL adapter",
      summary: "The pasted URL was not fetched or could not be extracted; retained only user-supplied facts.",
      status: "fallback",
    });
    return { source: request.sourceListing, universal: null };
  }
}

// User-typed facts always win over page extraction; extraction fills blanks.
function mergeSourceFacts(typed: SourceListing, extracted: SourceListing): SourceListing {
  return {
    // The hostname of the pasted URL is authoritative for the platform label.
    marketplace: extracted.marketplace,
    url: typed.url,
    title: typed.title.trim() || extracted.title,
    description: typed.description.trim() || extracted.description,
    price: typed.price ?? extracted.price,
    shipping: typed.shipping ?? extracted.shipping,
    claimedCondition: typed.claimedCondition !== "Unknown" ? typed.claimedCondition : extracted.claimedCondition,
    active: true,
    seller: {
      feedbackPercentage: typed.seller.feedbackPercentage ?? extracted.seller.feedbackPercentage,
      feedbackCount: typed.seller.feedbackCount ?? extracted.seller.feedbackCount,
      returnsAccepted: typed.seller.returnsAccepted ?? extracted.seller.returnsAccepted,
      topRated: typed.seller.topRated ?? extracted.seller.topRated,
      buyerProtection: typed.seller.buyerProtection ?? extracted.seller.buyerProtection,
      subRatings: typed.seller.subRatings ?? extracted.seller.subRatings,
    },
    evidence: typed.evidence.photoCount > 0 || typed.evidence.frontBackExplicit
      ? typed.evidence
      : extracted.evidence,
  };
}

async function identifyCards(
  request: ComparisonRequest,
  source: SourceListing,
  fetcher: typeof fetch,
  warnings: string[],
  trace: ComparisonTrace[],
) {
  const searchName = request.cardHint.name || cleanCardName(source.title);

  if (request.cardHint.game === "onePiece") {
    return identifyOnePieceCards(request, searchName, fetcher, warnings, trace);
  }

  const localMatches = rankLocalIdentities(request, source);

  if (request.confirmedCardId) {
    try {
      const card = await getPokemonCard({
        id: request.confirmedCardId,
        fetcher,
        timeoutMs: 15000,
      });
      const match = evaluateIdentity(card, request, source);
      trace.push({
        step: "card_identification",
        actor: "Pokémon catalog adapter",
        summary: "Reloaded the user-confirmed catalog card by its stable card id.",
        status: "complete",
      });
      return [toIdentityCandidate(card, request, match)];
    } catch (error) {
      warnings.push(`Confirmed Pokémon card lookup unavailable: ${errorMessage(error)}`);
    }
  }

  // The Pokémon TCG catalog is queryable without a key (the key only raises rate
  // limits), so resolve real card identities whenever we have a usable query.
  if (searchName.length >= 2) {
    // pokemontcg.io's first (uncached) response can take 5-8s because it carries
    // pricing payloads. Retry once, but keep each attempt bounded so identity
    // selection cannot inherit the comparison route's much larger time budget: a
    // transient rate-limit/network blip should not look like "this card doesn't
    // exist". Responses are cached for an hour.
    let result = await searchPokemonWithRetry(
      {
        query: searchName,
        cardNumber: request.cardHint.cardNumber,
        setHint: request.cardHint.setCode,
        relaxed: searchName.trim().split(/\s+/).length > 1,
        // A known collector number resolves to one specific print, so a small
        // page is enough; a name-only search (e.g. "pikachu") should return
        // every print the catalog has, not a truncated top slice — pageSize
        // 250 is the Pokémon TCG API's own maximum.
        pageSize: request.cardHint.cardNumber ? 12 : 250,
        fetcher,
        timeoutMs: 8000,
      },
      warnings,
    );

    if ((!result || result.cards.length === 0) && !request.cardHint.cardNumber && !request.cardHint.setCode) {
      const corrected = await parseCardQueryWithAi(searchName, trace);
      const correctedName = corrected?.name.trim() ?? "";
      if (correctedName && normalizeWords(correctedName) !== normalizeWords(searchName)) {
        result = await searchPokemonWithRetry(
          { query: correctedName, relaxed: false, pageSize: 250, fetcher, timeoutMs: 8000 },
          warnings,
        );
        if (result?.cards.length) {
          trace.push({
            step: "card_identification",
            actor: "Pokémon catalog spelling recovery",
            summary: `No catalog cards matched "${searchName}"; retried with "${correctedName}" and found ${result.cards.length} possible identities.`,
            status: "complete",
          });
        }
      }
    }

    if (result) {
      const apiMatches = result.cards
        .map((card) => ({ card, match: evaluateIdentity(card, request, source) }))
        .sort((a, b) => b.match.score - a.match.score)
        .map(({ card, match }) => toIdentityCandidate(card, request, match));
      trace.push({
        step: "card_identification",
        actor: "Pokémon catalog adapter",
        summary: `Found ${apiMatches.length} possible identities and ranked exact number, set, and name matches first.`,
        status: "complete",
      });
      const narrowed = filterByRequestedVariant(dedupeIdentities(apiMatches), request.cardHint.variant, trace);
      return narrowed.slice(0, MAX_IDENTITY_CANDIDATES);
    }

    // The lookup itself failed (warning already recorded). Surface that as an
    // unavailable lookup, not a confident "no match", so the UI can say "try again".
    trace.push({
      step: "card_identification",
      actor: "Pokémon catalog adapter",
      summary: "Catalog lookup was unavailable after a retry; could not list versions.",
      status: "fallback",
    });
    if (!localMatches.length) return [];
  }

  const fallback = localMatches;
  trace.push({
    step: "card_identification",
    actor: "Local identity matcher",
    summary: fallback.length
      ? `Returned ${fallback.length} matching demo candidates without inventing a version match.`
      : "No matching catalog identity was available; unrelated demo cards were not substituted.",
    status: "fallback",
  });
  return fallback;
}

// One retry on a transient Pokémon catalog failure. Returns null (and records a
// user-facing warning) only when both attempts fail, so the caller can distinguish
// "lookup unavailable" from a genuine empty result.
// R5: the catalog's cold-start hiccup must not surface as "card catalog
// temporarily unavailable" on a buyer's very first search — retry transient
// failures once after a short backoff before giving up.
const CATALOG_RETRY_DELAYS_MS = [400];

async function searchPokemonWithRetry(
  options: Parameters<typeof searchPokemonCards>[0],
  warnings: string[],
): Promise<Awaited<ReturnType<typeof searchPokemonCards>> | null> {
  for (let attempt = 0; attempt <= CATALOG_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, CATALOG_RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      return await searchPokemonCards(options);
    } catch (error) {
      if (attempt === CATALOG_RETRY_DELAYS_MS.length) {
        warnings.push(`Pokémon catalog lookup unavailable: ${errorMessage(error)}`);
      }
    }
  }
  return null;
}

async function identifyOnePieceCards(
  request: ComparisonRequest,
  searchName: string,
  fetcher: typeof fetch,
  warnings: string[],
  trace: ComparisonTrace[],
): Promise<CardIdentityCandidate[]> {
  if (request.confirmedCardId) {
    // The buyer picked an exact print at the version step. Reload that specific art
    // from the bundled catalog (zero network) so the confirmed image, rarity, and
    // variant label are exactly what they chose — not the base art of the number.
    const exact = findOnePieceCatalogVariant(request.confirmedCardId);
    if (exact) {
      trace.push({
        step: "card_identification",
        actor: "One Piece catalog adapter",
        summary: "Reloaded the user-confirmed One Piece print from the bundled catalog.",
        status: "complete",
      });
      return [mapOnePieceCardToIdentity(exact, { confidence: "high", matchReasons: ["User confirmed this version."] })];
    }
    try {
      const card = await getOnePieceCard({ cardSetId: request.confirmedCardId, fetcher, timeoutMs: 15000 });
      if (card) {
        trace.push({
          step: "card_identification",
          actor: "One Piece catalog adapter",
          summary: "Reloaded the user-confirmed One Piece card by its card id.",
          status: "complete",
        });
        return [mapOnePieceCardToIdentity(card, { confidence: "high", matchReasons: ["User confirmed this version."] })];
      }
    } catch (error) {
      warnings.push(`Confirmed One Piece card lookup unavailable: ${errorMessage(error)}`);
    }
  }

  const directId = request.cardHint.cardNumber.trim();
  if (searchName.length >= 2 || directId) {
    try {
      const result = await searchOnePieceCards({
        query: searchName || directId,
        cardNumber: directId,
        setHint: request.cardHint.setCode,
        // A known card id resolves to one number's prints, so a small page is
        // enough; a name-only search (e.g. "luffy") should return every print
        // in the catalog — some characters have 80+ — not a truncated slice.
        pageSize: directId ? 12 : 200,
        fetcher,
        timeoutMs: 15000,
      });
      const order: Record<CardIdentityCandidate["confidence"], number> = { high: 0, medium: 1, low: 2 };
      const matches = result.cards
        .map((card) => mapOnePieceCardToIdentity(card, evaluateOnePieceMatch(card, request, searchName)))
        .sort((a, b) => order[a.confidence] - order[b.confidence]);
      trace.push({
        step: "card_identification",
        actor: "One Piece catalog adapter",
        summary: `Found ${matches.length} possible One Piece identities — base art plus every alternate art, treasure rare, and promo print — ranked with exact id and name matches first.`,
        status: "complete",
      });
      const narrowed = filterByRequestedVariant(dedupeIdentities(matches), request.cardHint.variant, trace);
      return narrowed.slice(0, MAX_IDENTITY_CANDIDATES);
    } catch (error) {
      warnings.push(`One Piece catalog lookup unavailable: ${errorMessage(error)}`);
    }
  }

  trace.push({
    step: "card_identification",
    actor: "One Piece catalog adapter",
    summary: "No matching One Piece catalog identity was available.",
    status: "fallback",
  });
  return [];
}

// Every candidate here already passed the name search, so the baseline is "medium"
// (name matches, version still unconfirmed). A matching card id or set raises it to
// "high" so the requested print sorts to the top of the set-grouped picker.
function evaluateOnePieceMatch(
  card: OnePieceTcgCard,
  request: ComparisonRequest,
  searchName: string,
): { confidence: CardIdentityCandidate["confidence"]; matchReasons: string[] } {
  const requestedId = request.cardHint.cardNumber.trim().toUpperCase();
  if (requestedId && requestedId === card.card_set_id.toUpperCase()) {
    // A matching card id normally auto-confirms — but if the buyer also typed a
    // name and it contradicts this card (e.g. "Luffy ST01-004" where ST01-004
    // is Sanji), silently trusting the id would confirm the wrong card. Demote
    // so the version picker appears and the buyer resolves the conflict.
    // Tokenize BEFORE squashing — normalizeText strips the spaces a split
    // would need, which would collapse this into whole-string containment and
    // wrongly demote "Luffy Gear OP01-003" style queries.
    const cardName = normalizeText(card.card_name);
    const nameAgrees = !searchName
      || searchName
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .some((token) => token.length >= 3 && cardName.includes(token));
    if (!nameAgrees) {
      return {
        confidence: "medium",
        matchReasons: ["The card id matches this print, but the name you typed differs — double-check the version."],
      };
    }
    return { confidence: "high", matchReasons: ["Requested card id matches this print."] };
  }
  if (onePieceSetMatches(card, request.cardHint.setCode)) {
    return { confidence: "high", matchReasons: ["Card name and set both match this print."] };
  }
  if (searchName && normalizeText(card.card_name) === normalizeText(searchName)) {
    return { confidence: "medium", matchReasons: ["Card name matches the catalog entry exactly."] };
  }
  return { confidence: "medium", matchReasons: ["Card name matches; confirm the exact version."] };
}

function resolveConfirmedCard(request: ComparisonRequest, identities: CardIdentityCandidate[]) {
  if (request.confirmedCardId) {
    const wanted = request.confirmedCardId.toUpperCase();
    return identities.find((candidate) => candidate.id.toUpperCase() === wanted) ?? null;
  }
  const top = identities[0];
  const hasExplicitIdentity = Boolean(
    request.cardHint.name
    && collectorNumberParts(request.cardHint.cardNumber).number,
  );
  const highConfidenceMatches = identities.filter((candidate) => candidate.confidence === "high");
  return top?.confidence === "high" && hasExplicitIdentity && highConfidenceMatches.length === 1 ? top : null;
}

function sourceToSeed(
  source: SourceListing,
  card: CardIdentityCandidate,
  observedAt: string,
  universal: UniversalListingResult | null = null,
): DemoListingSeed | null {
  if (source.price === null) return null;
  const titleText = `${source.title} ${source.description}`;
  const explicitNumber = collectorNumberPattern(card.cardNumber)?.test(titleText) ?? false;

  // R6 identity critic (deterministic): if the pasted page states a card name
  // or collector number that disagrees with the confirmed version, the listing
  // is flagged and drops out of recommendation eligibility instead of being
  // silently included.
  const mismatch = universal ? detectIdentityMismatch(universal, card) : null;

  return {
    id: "source-listing",
    marketplace: source.marketplace,
    url: source.url || null,
    title: source.title || `${card.name} ${card.cardNumber}`,
    cardId: card.id,
    matchConfidence: mismatch ? "low" : explicitNumber ? "high" : "medium",
    matchReasons: mismatch
      ? [mismatch]
      : explicitNumber
        ? ["Confirmed collector number appears in the listing."]
        : ["User confirmed the card identity."],
    active: source.active,
    raw: !isGradedListing(titleText),
    currency: "USD",
    price: source.price,
    shipping: source.shipping,
    claimedCondition: source.claimedCondition,
    imageUrl: null,
    seller: source.seller,
    evidence: source.evidence,
    observedAt,
    demo: false,
    userSupplied: true,
  };
}

function detectIdentityMismatch(universal: UniversalListingResult, card: CardIdentityCandidate) {
  const extractedParts = collectorNumberParts(universal.extractedCard.number);
  const confirmedParts = collectorNumberParts(card.cardNumber);
  const numberConflicts = extractedParts.number
    && confirmedParts.number
    && (extractedParts.total
      ? !collectorNumbersEquivalent(universal.extractedCard.number, card.cardNumber)
      : extractedParts.number !== confirmedParts.number);
  if (numberConflicts) {
    return `The pasted page states collector number ${universal.extractedCard.number}, which does not match the confirmed ${card.cardNumber}.`;
  }
  const extractedName = normalizeWords(universal.extractedCard.name);
  if (extractedName && tokenOverlap(extractedName, normalizeWords(card.name)) < 0.5) {
    return `The pasted page appears to describe "${universal.extractedCard.name}", not the confirmed ${card.name}.`;
  }
  return null;
}

// Cross-platform ledger: turn each hand-entered listing into a ranked seed.
// These are user-supplied facts only — no URL is ever fetched server-side, and
// they carry no seller/photo evidence beyond what the buyer typed.
function manualCandidatesToSeeds(
  candidates: ComparisonRequest["manualCandidates"],
  card: CardIdentityCandidate,
  observedAt: string,
): DemoListingSeed[] {
  return candidates.flatMap((candidate, index) => {
    if (candidate.price === null) return [];
    const titleText = candidate.title || `${card.name} ${card.cardNumber}`;
    const explicitNumber = collectorNumberPattern(card.cardNumber)?.test(titleText) ?? false;
    return [{
      id: `manual-${index}`,
      marketplace: candidate.marketplace,
      url: candidate.url || null,
      title: titleText,
      cardId: card.id,
      matchConfidence: explicitNumber ? "high" : "medium",
      matchReasons: [`Listing you entered from ${candidate.marketplace}.`],
      active: true,
      raw: !isGradedListing(titleText),
      currency: "USD",
      price: candidate.price,
      shipping: candidate.shipping,
      claimedCondition: candidate.claimedCondition,
      imageUrl: null,
      seller: {
        feedbackPercentage: null,
        feedbackCount: null,
        returnsAccepted: null,
        topRated: null,
        buyerProtection: null,
        subRatings: null,
      },
      evidence: {
        photoCount: 0,
        frontBackExplicit: false,
        closeupsExplicit: false,
        surfaceExplicit: false,
        identityExplicit: explicitNumber,
        substantiveConditionNotes: false,
        missing: [],
      },
      observedAt,
      demo: false,
      userSupplied: true,
    }];
  });
}

// The fair-price anchor reference is built from the FINAL anchored card (daily
// feed when the crosswalk resolved, inline catalog price otherwise), with its
// freshness always stated.
function buildMarketReference(card: CardIdentityCandidate, observedAt: string): ComparisonReference | null {
  if (typeof card.marketMid !== "number") return null;
  const freshness = card.marketSource === "tcgcsv"
    ? `TCGplayer prices as of ${formatAnchorDate(card.marketAsOf)} (daily feed).`
    : "Inline catalog price from the card catalog (approximate freshness).";
  const stale = card.marketSource === "tcgcsv" && isTcgcsvStale(card.marketAsOf ?? null)
    ? " Warning: this feed is more than 48 hours old."
    : "";
  return {
    label: "TCGplayer market price",
    status: "used",
    observedAt,
    url: card.marketUrl ?? null,
    note: `${freshness}${stale} A fair-price reference for this exact version — not a guaranteed sale.`,
    rawLow: card.marketLow ?? null,
    rawMid: card.marketMid,
    rawHigh: card.marketHigh ?? null,
  };
}

async function getPriceChartingReference(
  card: CardIdentityCandidate,
  fetcher: typeof fetch,
  trace: ComparisonTrace[],
  observedAt: string,
): Promise<ComparisonReference> {
  try {
    const result = await searchPriceChartingProducts({
      query: `${card.name} ${card.setName} ${card.cardNumber}`,
      fetcher,
    });
    const match = result.products[0];
    trace.push({
      step: "reference_pricing",
      actor: "PriceCharting adapter",
      summary: match ? "Loaded optional reference pricing." : "No reference-price match was found.",
      status: "complete",
    });
    return {
      label: "PriceCharting reference",
      status: match ? "used" : "missing",
      observedAt,
      url: null,
      note: match
        ? `Matched ${match.productName}. Reference pricing is not a guaranteed transaction price.`
        : "No matching PriceCharting product was returned.",
      rawLow: match?.loosePrice ?? null,
      rawMid: match?.completeInBoxPrice ?? match?.loosePrice ?? null,
      rawHigh: match?.newPrice ?? null,
    };
  } catch (error) {
    // PriceCharting is an optional reference-price enrichment, not a required source.
    // Its absence is already shown honestly in the references panel (status pill +
    // note), so keep the reason in the trace rather than the alarming result banner.
    const unavailable = error instanceof PriceChartingUnavailableError;
    trace.push({
      step: "reference_pricing",
      actor: "PriceCharting adapter",
      summary: `Reference pricing was unavailable and was not fabricated: ${errorMessage(error)}`,
      status: "fallback",
    });
    return {
      label: "PriceCharting reference",
      status: unavailable ? "unavailable" : "missing",
      observedAt,
      url: null,
      note: "Optional reference pricing is unavailable. Active listings remain visible, but no transaction price is claimed.",
      rawLow: null,
      rawMid: null,
      rawHigh: null,
    };
  }
}

function buildSoldReference(card: CardIdentityCandidate, observedAt: string): ComparisonReference {
  return {
    label: "Sold transactions",
    status: "unavailable",
    observedAt,
    url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`${card.name} ${card.cardNumber}`)}&LH_Sold=1&LH_Complete=1`,
    note: "Automated sold history is not connected. Open the manual eBay sold search before buying.",
    rawLow: null,
    rawMid: null,
    rawHigh: null,
  };
}

function buildNarrative(
  card: CardIdentityCandidate,
  listings: NormalizedListing[],
  rankedChoices: ReturnType<typeof rankListings>,
  references: ComparisonReference[],
  trace: ComparisonTrace[],
) {
  const local = localNarrative(card, listings, rankedChoices, references);
  trace.push({
    step: "evidence_synthesis",
    actor: "Deterministic evidence summary",
    summary: "Built the buyer summary from validated listing facts without adding a model round trip.",
    status: "complete",
  });
  return local;
}

function localNarrative(
  card: CardIdentityCandidate,
  listings: NormalizedListing[],
  choices: ReturnType<typeof rankListings>,
  references: ComparisonReference[],
) {
  const eligible = listings.filter((listing) => listing.eligible);
  return comparisonNarrativeSchema.parse({
    summary: eligible.length
      ? `TCGlens found ${eligible.length} eligible ${card.name} listings and separated price, seller safety, and condition evidence instead of collapsing them into one magic answer.`
      : `TCGlens could not find an eligible exact-match listing for ${card.name}.`,
    cautions: [
      choices.length < 3 ? "Fewer than three decision lenses had enough eligible evidence." : "One listing may lead several lenses; none is a grade prediction.",
      references.some((reference) => reference.label === "Sold transactions" && reference.status !== "used")
        ? "Recent sold transactions still require manual verification."
        : "Reference prices can lag the market.",
    ],
  });
}

type IdentityEvaluation = {
  score: number;
  confidence: CardIdentityCandidate["confidence"];
  reasons: string[];
  nameRelated: boolean;
  numberMatches: boolean;
};

function toIdentityCandidate(
  card: PokemonTcgCard,
  request: ComparisonRequest,
  match: IdentityEvaluation,
) {
  return cardIdentityCandidateSchema.parse({
    id: card.id,
    name: card.name,
    setName: card.set?.name ?? "Unknown set",
    setCode: card.set?.id?.toUpperCase() ?? "",
    cardNumber: formatCollectorNumber(card.number ?? "", card.set?.printedTotal),
    language: request.cardHint.language || "English",
    imageUrl: card.images?.large ?? card.images?.small ?? null,
    rarity: card.rarity ?? null,
    setSymbolUrl: card.set?.images?.symbol ?? null,
    confidence: match.confidence,
    matchReasons: match.reasons,
    ...extractTcgplayerPricing(card.tcgplayer),
  });
}

function evaluateIdentity(
  card: PokemonTcgCard,
  request: ComparisonRequest,
  source: SourceListing,
) {
  return evaluateIdentityFields({
    name: card.name,
    cardNumber: formatCollectorNumber(card.number ?? "", card.set?.printedTotal),
    setName: card.set?.name ?? "",
    setId: card.set?.id ?? "",
    setSeries: card.set?.series ?? "",
    ptcgoCode: card.set?.ptcgoCode ?? "",
    subtypes: card.subtypes ?? [],
  }, request, source);
}

function evaluateIdentityFields(
  candidate: {
    name: string;
    cardNumber: string;
    setName: string;
    setId: string;
    setSeries: string;
    ptcgoCode: string;
    subtypes: string[];
  },
  request: ComparisonRequest,
  source: SourceListing,
): IdentityEvaluation {
  const requestedName = request.cardHint.name || cleanCardName(source.title);
  const requestedNumber = request.cardHint.cardNumber || extractCollectorNumber(source.title);
  const requestedNameText = normalizeWords(requestedName);
  const candidateNameText = normalizeWords(candidate.name);
  const nameExact = Boolean(requestedNameText) && requestedNameText === candidateNameText;
  const nameRelated = Boolean(requestedNameText) && (
    nameExact
    || requestedNameText.includes(candidateNameText)
    || candidateNameText.includes(requestedNameText)
    || tokenOverlap(requestedNameText, candidateNameText) >= 0.75
  );

  const requestedParts = collectorNumberParts(requestedNumber);
  const candidateParts = collectorNumberParts(candidate.cardNumber);
  const numberMatches = Boolean(requestedParts.number)
    && requestedParts.number === candidateParts.number;
  const totalMatches = !requestedParts.total || requestedParts.total === candidateParts.total;
  const exactNumber = numberMatches && totalMatches;

  const setProvided = Boolean(request.cardHint.setCode.trim());
  const setMatches = setProvided && setHintMatches(candidate, request.cardHint.setCode);

  let score = nameExact ? 50 : nameRelated ? 30 : 0;
  if (requestedParts.number) score += numberMatches ? 90 : -90;
  if (requestedParts.total) score += totalMatches ? 60 : -60;
  if (setProvided) score += setMatches ? 45 : -30;

  const confidence: CardIdentityCandidate["confidence"] = (
    nameRelated
    && numberMatches
    && ((Boolean(requestedParts.total) && totalMatches) || setMatches)
  )
    ? "high"
    : nameRelated || numberMatches
      ? "medium"
      : "low";

  const reasons = [
    nameExact
      ? "Card name matches exactly."
      : nameRelated
        ? "Card name closely matches."
        : "Card name is uncertain.",
    requestedParts.number
      ? exactNumber
        ? "Collector number matches."
        : numberMatches
          ? "Collector-number prefix matches, but the printed set total differs."
          : "Collector number does not match."
      : "Collector number needs confirmation.",
  ];
  if (setProvided) {
    reasons.push(setMatches ? "Set matches." : "Set needs confirmation.");
  }

  return { score, confidence, reasons, nameRelated, numberMatches };
}

function rankLocalIdentities(request: ComparisonRequest, source: SourceListing) {
  return demoIdentities
    .map((identity) => {
      const match = evaluateIdentityFields({
        name: identity.name,
        cardNumber: identity.cardNumber,
        setName: identity.setName,
        setId: identity.setCode,
        setSeries: "",
        ptcgoCode: "",
        subtypes: [],
      }, request, source);
      return { identity, match };
    })
    .filter(({ match }) => match.nameRelated || match.numberMatches)
    .sort((a, b) => b.match.score - a.match.score)
    .map(({ identity, match }) => ({
      ...identity,
      confidence: match.confidence,
      matchReasons: match.reasons,
    }));
}

function formatCollectorNumber(number: string, printedTotal?: number) {
  const normalized = number.trim();
  if (!normalized || normalized.includes("/") || !printedTotal) return normalized;

  const prefix = normalized.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "";
  if (!prefix) return `${normalized}/${printedTotal}`;
  if (["GG", "RC", "SV", "TG"].includes(prefix)) {
    return `${normalized}/${prefix}${printedTotal}`;
  }
  return normalized;
}

function extractCollectorNumber(value: string) {
  return value.match(/\b(?:[A-Za-z]{1,4})?\d{1,3}\s*\/\s*(?:[A-Za-z]{1,4})?\d{1,3}\b/)?.[0] ?? "";
}

function setHintMatches(
  candidate: {
    setName: string;
    setId: string;
    setSeries: string;
    ptcgoCode: string;
    subtypes: string[];
  },
  setHint: string,
) {
  const candidateValues = [
    candidate.setName,
    candidate.setId,
    candidate.setSeries,
    candidate.ptcgoCode,
    ...candidate.subtypes,
  ]
    .map(normalizeText)
    .filter(Boolean);
  return setHint
    .split("/")
    .map(normalizeText)
    .filter(Boolean)
    .some((part) => candidateValues.includes(part));
}

function normalizeWords(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenOverlap(left: string, right: string) {
  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / Math.min(leftTokens.size, rightTokens.size);
}

type TcgplayerVariantPrice = { low?: number | null; mid?: number | null; high?: number | null; market?: number | null };

// pokemontcg.io returns TCGplayer prices inline (USD, in dollars) under a few
// variant keys. Pick the first variant with a usable market/mid value so we have
// a single fair-price anchor for the confirmed card.
function extractTcgplayerPricing(tcgplayer: PokemonTcgCard["tcgplayer"]) {
  const asOf = tcgplayer?.updatedAt ? toIsoDateOrNull(tcgplayer.updatedAt) : null;
  const empty = { marketUrl: tcgplayer?.url ?? null, marketLow: null, marketMid: null, marketHigh: null, marketSource: null, marketAsOf: null };
  const prices = (tcgplayer?.prices ?? {}) as Record<string, TcgplayerVariantPrice | undefined>;
  const preferred = ["holofoil", "normal", "reverseHolofoil", "reverse-holofoil", "1stEditionHolofoil", "unlimitedHolofoil"];
  const keys = [...preferred.filter((key) => prices[key]), ...Object.keys(prices).filter((key) => !preferred.includes(key))];
  for (const key of keys) {
    const variant = prices[key];
    if (!variant) continue;
    const mid = numberOrNull(variant.market) ?? numberOrNull(variant.mid);
    if (mid === null) continue;
    return {
      marketUrl: tcgplayer?.url ?? null,
      marketLow: numberOrNull(variant.low),
      marketMid: mid,
      marketHigh: numberOrNull(variant.high),
      marketSource: "pokemontcg" as const,
      marketAsOf: asOf,
    };
  }
  return empty;
}

function toIsoDateOrNull(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanCardName(title: string) {
  return title
    .replace(/\b(psa|bgs|cgc|sgc|ace|tag)[\s:._#-]*\d+(?:\.\d+)?\b/gi, "")
    .replace(/\b\d{1,3}\/\d{1,3}\b/g, "")
    .replace(/\b(nm|lp|mp|hp|mint|raw|pokemon|card)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function dedupeIdentities(identities: CardIdentityCandidate[]) {
  return Array.from(new Map(identities.map((identity) => [identity.id, identity])).values())
    .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence));
}

// A short rarity code in the search text ("Luffy sp", "Pikachu sir") should
// narrow the version picker to just those prints instead of every version of
// the character. Substring match against both the catalog rarity and variant
// label, since Pokémon rarities are full names ("Special Illustration Rare")
// while One Piece rarities are short codes ("SP") stored verbatim. If the
// guess matches nothing (e.g. the catalog uses a different label), fall back
// to the unfiltered list rather than showing the buyer zero results.
function filterByRequestedVariant(
  identities: CardIdentityCandidate[],
  requestedVariant: string,
  trace: ComparisonTrace[],
): CardIdentityCandidate[] {
  if (!requestedVariant.trim()) return identities;
  const needle = requestedVariant.toLowerCase();
  const narrowed = identities.filter((identity) =>
    identity.rarity?.toLowerCase().includes(needle)
    || identity.variant?.toLowerCase().includes(needle)
    || identity.setName.toLowerCase().includes(needle)
    || identity.collectorAliases?.some((alias) => alias.toLowerCase().includes(needle)));
  if (narrowed.length > 0) {
    trace.push({
      step: "card_identification",
      actor: "Rarity filter",
      summary: `Narrowed to ${narrowed.length} print(s) matching the requested "${requestedVariant}" rarity.`,
      status: "complete",
    });
    return narrowed;
  }
  const strictOnePieceFacets = new Set([
    "manga art",
    "gold",
    "silver",
    "wanted poster",
    "super alternate art",
    "red super alternate art",
    "treasure cup",
    "tournament pack",
    "tournament winner",
    "championship",
    "anniversary",
    "regional champion",
    "regional finalist",
    "regional participation",
    "promo",
    "premium collection",
    "signature",
    "serial numbered",
    "stamped",
    "textured",
  ]);
  if (
    strictOnePieceFacets.has(needle)
    && identities.some((identity) => isOnePieceCardKey(identity.cardNumber, identity.id))
  ) {
    trace.push({
      step: "card_identification",
      actor: "Exact print facet filter",
      summary: `No verified print matched the requested "${requestedVariant}" facet; sibling prints were not substituted.`,
      status: "complete",
    });
    return [];
  }
  trace.push({
    step: "card_identification",
    actor: "Rarity filter",
    summary: `No print matched the requested "${requestedVariant}" rarity; showing every version instead.`,
    status: "fallback",
  });
  return identities;
}

function dedupeSeeds(seeds: DemoListingSeed[]) {
  return Array.from(new Map(seeds.map((seed) => [seed.id, seed])).values());
}

function confidenceRank(value: CardIdentityCandidate["confidence"]) {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown comparison error.";
}
