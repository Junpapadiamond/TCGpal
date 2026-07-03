import { createAiProvider } from "@/lib/ai/provider";
import { getAiConfig } from "@/lib/ai/config";
import { resolveCardCrosswalk, type CardCrosswalkEntry } from "@/lib/comparison/crosswalk";
import { demoIdentities, demoListingSeeds } from "@/lib/comparison/fixtures";
import { normalizeListing, rankListings } from "@/lib/comparison/ranking";
import {
  comparisonCacheKey,
  getCachedComparison,
  isCacheableRequest,
  setCachedComparison,
} from "@/lib/comparison/report-cache";
import { runPlatformAdapters, type PlatformAdapter } from "@/lib/external/adapter";
import {
  EbayUnavailableError,
  getEbayListingByUrl,
  hasEbayCredentials,
  parseEbayUrl,
  searchEbayAlternatives,
} from "@/lib/external/ebay";
import { PriceChartingUnavailableError, searchPriceChartingProducts } from "@/lib/external/price-charting";
import { getPokemonCard, searchPokemonCards, type PokemonTcgCard } from "@/lib/external/pokemon-tcg";
import {
  buildManualMarketplaceReferenceLinks,
  publicMarketplaceSearchTargets,
  searchPublicMarketplace,
} from "@/lib/external/public-marketplace-search";
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
  cardIdentityCandidateSchema,
  comparisonNarrativeSchema,
  comparisonReportSchema,
  comparisonRequestSchema,
  type CardIdentityCandidate,
  type ComparisonReference,
  type ComparisonReport,
  type ComparisonRequest,
  type ComparisonTrace,
  type ListingSeed,
  type NormalizedListing,
  type SourceListing,
  type SourceStatus,
} from "@/lib/schemas";

const forbiddenNarrative = [
  /\bguaranteed\b/i,
  /\bscam\b/i,
  /\bwill grade\b/i,
  /\bpsa\s*10\b/i,
  /\bsold comps? (show|prove|confirm)/i,
];

export async function runListingComparison(
  rawRequest: ComparisonRequest,
  dependencies: {
    fetcher?: typeof fetch;
    now?: () => Date;
  } = {},
): Promise<ComparisonReport> {
  const request = comparisonRequestSchema.parse(rawRequest);
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const warnings: string[] = [];
  const trace: ComparisonTrace[] = [];
  let demoMode = false;

  const { source: sourceResult, universal } = await ingestSourceListing(request, fetcher, warnings, trace);
  const identities = await identifyCards(request, sourceResult, fetcher, warnings, trace);
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
        summary: "Confirm the exact card before TCGpal compares prices. Similar artwork and reprints can produce a precise-looking but wrong result.",
        cautions: ["No marketplace ranking has been created yet."],
      },
      warnings,
      trace,
      demoMode: !hasEbayCredentials(),
      generatedAt,
    });
  }

  trace.push({
    step: "identity_confirmation",
    actor: "Deterministic validator",
    summary: `Confirmed ${confirmedCard.name}, ${confirmedCard.setName} ${confirmedCard.cardNumber}.`,
    status: "complete",
  });

  // Pure card searches are served from a 15-minute cache keyed by
  // card + condition + delivery context (R7).
  const cacheable = isCacheableRequest(request);
  const cacheKey = comparisonCacheKey(request, confirmedCard.id);
  if (cacheable) {
    const cached = getCachedComparison(cacheKey, now());
    if (cached) {
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
  }

  // R1: resolve the crosswalk once, then hand each connector its
  // platform-native identifier.
  const crosswalk = await resolveCardCrosswalk(confirmedCard, fetcher, now);
  trace.push({
    step: "card_crosswalk",
    actor: "Catalog crosswalk",
    summary: crosswalk.tcgplayerProductId
      ? `Mapped ${confirmedCard.id} → TCGplayer product #${crosswalk.tcgplayerProductId} and an eBay query template.`
      : `Mapped ${confirmedCard.id} → eBay query template; no TCGplayer product match (that source degrades to "no match").`,
    status: crosswalk.tcgplayerProductId ? "complete" : "fallback",
  });

  // R2/R7: fan out over the platform adapters in parallel; one slow or failed
  // source never blanks the comparison.
  let tcgplayerResult: TcgplayerSearchResult | null = null;
  const adapters: PlatformAdapter[] = [
    {
      platform: "eBay",
      isConfigured: hasEbayCredentials,
      search: async ({ card, buyer, fetcher: adapterFetch }) => ({
        seeds: await searchEbayAlternatives(card, buyer, adapterFetch, crosswalk.ebayQueryTemplate),
        asOf: null,
      }),
    },
    {
      platform: "TCGplayer",
      isConfigured: () => true,
      search: async ({ card, fetcher: adapterFetch }) => {
        const result = await searchTcgplayerListings(card, crosswalk.tcgplayerProduct, adapterFetch, now);
        tcgplayerResult = result;
        return {
          seeds: result.seeds,
          asOf: result.asOf,
          note: result.product
            ? `Matched TCGplayer product #${result.product.productId} in the daily price feed.`
            : "TCGplayer: no match in the product crosswalk.",
        };
      },
    },
    ...publicMarketplaceSearchTargets.map((target): PlatformAdapter => ({
      platform: target.platform,
      isConfigured: () => true,
      search: async ({ card, buyer, fetcher: adapterFetch }) => {
        const result = await searchPublicMarketplace(target, card, buyer, adapterFetch, now);
        return {
          seeds: result.seeds,
          asOf: null,
          note: result.seeds.length
            ? `Fetched one public ${target.platform} search page and extracted ${result.seeds.length} priced candidate(s).`
            : `Fetched one public ${target.platform} search page; no match with priced exact-card hits was extractable.`,
        };
      },
    })),
  ];

  const fanOut = await runPlatformAdapters(adapters, {
    card: confirmedCard,
    buyer: request.buyer,
    fetcher,
  });
  const sources: SourceStatus[] = [...fanOut.statuses];
  for (const status of fanOut.statuses) {
    trace.push({
      step: "marketplace_search",
      actor: `${status.platform} adapter`,
      summary: status.status === "ok"
        ? `Loaded ${status.count} candidates in ${((status.durationMs ?? 0) / 1000).toFixed(1)}s.`
        : status.note || `${status.platform}: ${status.status}.`,
      status: status.status === "ok" || status.status === "empty" ? "complete" : "fallback",
    });
    if (status.status === "failed") {
      warnings.push(`${status.platform} search failed: ${status.note}`);
    }
  }

  // R3: the confirmed TCGplayer daily feed becomes the market anchor when the
  // crosswalk resolves; the inline catalog price stays as the fallback anchor.
  confirmedCard = applyMarketAnchor(confirmedCard, crosswalk, tcgplayerResult);
  if (confirmedCard.marketSource === "tcgcsv" && isTcgcsvStale(confirmedCard.marketAsOf ?? null, now())) {
    warnings.push(`TCGplayer prices are more than 48 hours old (as of ${formatDate(confirmedCard.marketAsOf)}). Treat the market reference with extra care.`);
  }

  const seeds: ListingSeed[] = [];
  const manualSeed = sourceToSeed(sourceResult, confirmedCard, generatedAt, universal);
  if (manualSeed) {
    seeds.push(manualSeed);
    sources.push({
      platform: universal ? `${universal.marketplace} (user-added)` : `${sourceResult.marketplace} (user-added)`,
      status: "user_added",
      count: 1,
      note: universal
        ? "Pasted listing extracted from the page you provided."
        : "Listing facts you supplied joined the comparison.",
      durationMs: null,
      asOf: null,
    });
    if (manualSeed.matchConfidence === "low") {
      warnings.push("The pasted listing appears to describe a different card or version than the one you confirmed, so it is excluded from the recommendation.");
    }
  }

  seeds.push(...fanOut.seeds);

  // Demo fixtures only step in when no live source produced a single listing —
  // a manual/pasted candidate still deserves labeled context to compare against.
  if (!fanOut.seeds.length) {
    demoMode = true;
    seeds.push(...demoListingSeeds);
    warnings.push("No live marketplace source was available. Showing labeled demo inventory instead.");
    trace.push({
      step: "marketplace_search",
      actor: "Demo fixtures",
      summary: "Every live source was unavailable; loaded labeled fixtures.",
      status: "fallback",
    });
  }

  const normalized = dedupeSeeds(seeds).map((listing) => normalizeListing({ listing, buyer: request.buyer, marketPrice: confirmedCard.marketMid ?? null }));
  const rankedChoices = rankListings(normalized, { marketPrice: confirmedCard.marketMid ?? null });
  trace.push({
    step: "validation_and_ranking",
    actor: "Deterministic TypeScript",
    summary: `Validated ${normalized.length} candidates and ranked ${rankedChoices.length} distinct choices.`,
    status: "complete",
  });

  const references = await getReferences(confirmedCard, request.buyer, fetcher, warnings, trace, generatedAt);
  const narrative = await buildNarrative(confirmedCard, normalized, rankedChoices, references, warnings, trace);
  // Demo mode is its own clearly-labeled state; "partial" is reserved for live
  // comparisons that are missing eligible listings, a live source, or the anchor.
  const partial = normalized.filter((listing) => listing.eligible).length === 0
    || (!demoMode && sources.some((source) => source.status === "failed"))
    || (!demoMode && references.every((reference) => reference.status !== "used"));

  const report = comparisonReportSchema.parse({
    status: partial ? "partial" : "complete",
    request: { ...request, sourceListing: sourceResult },
    identityCandidates: identities,
    confirmedCard,
    candidates: normalized,
    rankedChoices,
    references,
    sources,
    narrative,
    warnings,
    trace,
    demoMode,
    generatedAt,
  });

  if (cacheable) setCachedComparison(cacheKey, report, now());
  return report;
}

// Prefer the daily TCGplayer feed (with an explicit as-of timestamp) over the
// inline catalog approximation, but never drop an existing anchor for nothing.
function applyMarketAnchor(
  card: CardIdentityCandidate,
  crosswalk: CardCrosswalkEntry,
  tcgplayer: TcgplayerSearchResult | null,
): CardIdentityCandidate {
  if (tcgplayer?.anchor && tcgplayer.anchor.mid !== null) {
    return {
      ...card,
      marketLow: tcgplayer.anchor.low,
      marketMid: tcgplayer.anchor.mid,
      marketHigh: tcgplayer.anchor.high,
      marketUrl: tcgplayer.anchor.url,
      marketSource: "tcgcsv",
      marketAsOf: tcgplayer.asOf,
      tcgplayerProductId: crosswalk.tcgplayerProductId,
    };
  }
  if (typeof card.marketMid === "number") {
    return { ...card, marketSource: card.marketSource ?? "pokemontcg", tcgplayerProductId: crosswalk.tcgplayerProductId };
  }
  return { ...card, tcgplayerProductId: crosswalk.tcgplayerProductId };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
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

  // R6: any other pasted marketplace URL is fetched once, user-initiated, and
  // extracted into the same listing shape. User-typed facts stay source truth
  // where they exist; the extraction only fills the gaps.
  try {
    const universal = await fetchUniversalListing(url, fetcher);
    const merged = mergeSourceFacts(request.sourceListing, universal.listing);
    warnings.push(...universal.notes);
    trace.push({
      step: "source_ingestion",
      actor: "Paste-a-URL adapter",
      summary: `Fetched the pasted ${universal.marketplace} listing you provided (single user-initiated fetch) and extracted its stated facts${universal.usedAi ? " with AI assistance" : " from structured page data"}.`,
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
    try {
      // pokemontcg.io's first (uncached) response can take 5-8s because it carries
      // pricing payloads, so allow more headroom than the 8s default to avoid an
      // unnecessary fall back to demo identities. Responses are cached for an hour.
      const result = await searchPokemonCards({
        query: searchName,
        cardNumber: request.cardHint.cardNumber,
        setHint: request.cardHint.setCode,
        pageSize: request.cardHint.cardNumber ? 12 : 30,
        fetcher,
        timeoutMs: 15000,
      });
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
      return dedupeIdentities(apiMatches).slice(0, 6);
    } catch (error) {
      warnings.push(`Pokémon catalog lookup unavailable: ${errorMessage(error)}`);
    }
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

function resolveConfirmedCard(request: ComparisonRequest, identities: CardIdentityCandidate[]) {
  if (request.confirmedCardId) {
    return identities.find((candidate) => candidate.id === request.confirmedCardId) ?? null;
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
  universal: UniversalListingResult | null,
): ListingSeed | null {
  if (source.price === null) return null;
  const titleText = `${source.title} ${source.description}`;
  const explicitNumber = normalizeText(titleText).includes(normalizeText(card.cardNumber));

  // R6 identity critic (deterministic): if the pasted page states a card name
  // or collector number that disagrees with the confirmed version, the listing
  // is flagged and drops out of Top Pick eligibility instead of being silently
  // included.
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
    raw: !/\b(psa|bgs|cgc|sgc)\s*\d|\bslab(?:bed)?\b/i.test(titleText),
    currency: "USD",
    price: source.price,
    shipping: source.shipping,
    claimedCondition: source.claimedCondition,
    imageUrl: card.imageUrl,
    seller: source.seller,
    evidence: source.evidence,
    observedAt,
    demo: false,
    userSupplied: true,
  };
}

function detectIdentityMismatch(universal: UniversalListingResult, card: CardIdentityCandidate) {
  const extractedNumber = collectorNumberParts(universal.extractedCard.number).number;
  const confirmedNumber = collectorNumberParts(card.cardNumber).number;
  if (extractedNumber && confirmedNumber && extractedNumber !== confirmedNumber) {
    return `The pasted page states collector number ${universal.extractedCard.number}, which does not match the confirmed ${card.cardNumber}.`;
  }
  const extractedName = normalizeWords(universal.extractedCard.name);
  if (extractedName && tokenOverlap(extractedName, normalizeWords(card.name)) < 0.5) {
    return `The pasted page appears to describe "${universal.extractedCard.name}", not the confirmed ${card.name}.`;
  }
  return null;
}

async function getReferences(
  card: CardIdentityCandidate,
  buyer: ComparisonRequest["buyer"],
  fetcher: typeof fetch,
  warnings: string[],
  trace: ComparisonTrace[],
  observedAt: string,
) {
  const references: ComparisonReference[] = [];

  // Primary fair-price anchor: the TCGplayer daily feed when the crosswalk
  // resolved, otherwise the inline catalog price. Freshness is always stated.
  if (typeof card.marketMid === "number") {
    const freshness = card.marketSource === "tcgcsv"
      ? `TCGplayer prices as of ${formatDate(card.marketAsOf)} (daily feed).`
      : "Inline catalog price from the Pokémon TCG API (approximate freshness).";
    const stale = card.marketSource === "tcgcsv" && isTcgcsvStale(card.marketAsOf ?? null)
      ? " Warning: this feed is more than 48 hours old."
      : "";
    references.push({
      label: "TCGplayer market price",
      status: "used",
      observedAt,
      url: card.marketUrl ?? null,
      links: [],
      note: `${freshness}${stale} A fair-price reference for this exact version — not a guaranteed sale.`,
      rawLow: card.marketLow ?? null,
      rawMid: card.marketMid,
      rawHigh: card.marketHigh ?? null,
    });
  } else {
    references.push({
      label: "TCGplayer market price",
      status: "missing",
      observedAt,
      url: null,
      links: [],
      note: "No TCGplayer market price was found for this exact version, so no fair-price anchor is claimed.",
      rawLow: null,
      rawMid: null,
      rawHigh: null,
    });
  }

  try {
    const result = await searchPriceChartingProducts({
      query: `${card.name} ${card.setName} ${card.cardNumber}`,
      fetcher,
    });
    const match = result.products[0];
    references.push({
      label: "PriceCharting reference",
      status: match ? "used" : "missing",
      observedAt,
      url: null,
      links: [],
      note: match
        ? `Matched ${match.productName}. Reference pricing is not a guaranteed transaction price.`
        : "No matching PriceCharting product was returned.",
      rawLow: match?.loosePrice ?? null,
      rawMid: match?.completeInBoxPrice ?? match?.loosePrice ?? null,
      rawHigh: match?.newPrice ?? null,
    });
    trace.push({
      step: "reference_pricing",
      actor: "PriceCharting adapter",
      summary: match ? "Loaded optional reference pricing." : "No reference-price match was found.",
      status: "complete",
    });
  } catch (error) {
    const unavailable = error instanceof PriceChartingUnavailableError;
    warnings.push(errorMessage(error));
    references.push({
      label: "PriceCharting reference",
      status: unavailable ? "unavailable" : "missing",
      observedAt,
      url: null,
      links: [],
      note: "Optional reference pricing is unavailable. Active listings remain visible, but no transaction price is claimed.",
      rawLow: null,
      rawMid: null,
      rawHigh: null,
    });
    trace.push({
      step: "reference_pricing",
      actor: "PriceCharting adapter",
      summary: "Reference pricing was unavailable and was not fabricated.",
      status: "fallback",
    });
  }
  references.push({
    label: "Sold transactions",
    status: "unavailable",
    observedAt,
    url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`${card.name} ${card.cardNumber}`)}&LH_Sold=1&LH_Complete=1`,
    links: [{
      label: "eBay sold search",
      url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`${card.name} ${card.cardNumber}`)}&LH_Sold=1&LH_Complete=1`,
    }],
    note: "Automated sold history is not connected. Open the manual eBay sold search before buying.",
    rawLow: null,
    rawMid: null,
    rawHigh: null,
  });
  references.push({
    label: "Manual marketplace checks",
    status: "unavailable",
    observedAt,
    url: null,
    links: buildManualMarketplaceReferenceLinks(card, buyer),
    note: "Open these platform searches to review sources that were blocked, empty, or too sparse for automated ranking. TCGpal does not claim those pages were fetched unless their source chip says so.",
    rawLow: null,
    rawMid: null,
    rawHigh: null,
  });
  return references;
}

async function buildNarrative(
  card: CardIdentityCandidate,
  listings: NormalizedListing[],
  rankedChoices: ReturnType<typeof rankListings>,
  references: ComparisonReference[],
  warnings: string[],
  trace: ComparisonTrace[],
) {
  const local = localNarrative(card, listings, rankedChoices, references);
  const config = getAiConfig();
  const provider = createAiProvider(config);

  // The model only explains the winners; sending every candidate row inflates
  // latency and cost for nothing. It sees the chosen listings in full, plus
  // aggregate counts — still strictly a subset of deterministic source truth.
  const chosenIds = new Set(rankedChoices.map((choice) => choice.listingId));
  const compactInput = {
    card: {
      name: card.name,
      setName: card.setName,
      cardNumber: card.cardNumber,
      marketMid: card.marketMid ?? null,
      marketSource: card.marketSource ?? null,
      marketAsOf: card.marketAsOf ?? null,
    },
    totals: {
      candidates: listings.length,
      eligible: listings.filter((listing) => listing.eligible).length,
    },
    rankedChoices,
    chosenListings: listings
      .filter((listing) => chosenIds.has(listing.id))
      .map((listing) => ({
        id: listing.id,
        marketplace: listing.marketplace,
        title: listing.title,
        preTaxTotal: listing.preTaxTotal,
        estimatedLandedCost: listing.estimatedLandedCost,
        claimedCondition: listing.claimedCondition,
        sellerTrustScore: listing.sellerTrustScore,
        evidenceCompletenessScore: listing.evidenceCompletenessScore,
        safetyScore: listing.safetyScore,
        riskLabel: listing.riskLabel,
        trustNotes: listing.trustNotes,
        matchConfidence: listing.matchConfidence,
        missingEvidence: listing.evidence.missing,
        userSupplied: listing.userSupplied,
      })),
    references: references.map((reference) => ({
      label: reference.label,
      status: reference.status,
      rawMid: reference.rawMid,
      note: reference.note,
    })),
  };

  try {
    const response = await provider.completeJson({
      role: "primary",
      schemaName: "listing_comparison_narrative",
      schema: comparisonNarrativeSchema,
      system: [
        "You are TCGpal's evidence synthesis agent.",
        "Use only the supplied normalized listings, rankings, and references.",
        "Never claim automated sold comps, call a seller a scam, predict a grade, or guarantee condition.",
        "Do not use the words \"scam\", \"guaranteed\", or \"PSA 10\" anywhere, and never say sold comps prove, show, or confirm anything — describe missing evidence or risk signals in plain language instead.",
        "Explain why the choices differ in two short sentences and add concise cautions.",
      ].join("\n"),
      user: compactInput,
    });
    if (forbiddenNarrative.some((pattern) => pattern.test(`${response.data.summary} ${response.data.cautions.join(" ")}`))) {
      throw new Error("Critic rejected an unsupported claim.");
    }
    trace.push({
      step: "evidence_synthesis",
      actor: `TCGpal agent · ${response.model}`,
      summary: "Synthesized the ranked evidence, then passed the unsupported-claim critic.",
      status: "complete",
    });
    return response.data;
  } catch (error) {
    warnings.push(`AI synthesis used a deterministic fallback: ${errorMessage(error)}`);
    trace.push({
      step: "evidence_synthesis",
      actor: "Deterministic critic",
      summary: "Used the local evidence summary because model synthesis was unavailable or rejected.",
      status: "fallback",
    });
    return local;
  }
}

function localNarrative(
  card: CardIdentityCandidate,
  listings: NormalizedListing[],
  choices: ReturnType<typeof rankListings>,
  references: ComparisonReference[],
) {
  const eligible = listings.filter((listing) => listing.eligible);
  const marketMid = typeof card.marketMid === "number" && card.marketMid > 0 ? card.marketMid : null;
  const cheapestTotal = eligible.length
    ? Math.min(...eligible.map((listing) => listing.estimatedLandedCost ?? listing.preTaxTotal))
    : null;
  const allAboveMarket = marketMid !== null && cheapestTotal !== null && cheapestTotal > marketMid * 1.02;

  const cautions = [
    choices.length < 3 ? "Fewer than three distinct choices met the eligibility rules." : "Each choice wins for a different reason; none is a grade prediction.",
    references.some((reference) => reference.label === "Sold transactions" && reference.status !== "used")
      ? "Recent sold transactions still require manual verification."
      : "Reference prices can lag the market.",
  ];
  if (allAboveMarket && cheapestTotal !== null && marketMid !== null) {
    cautions.unshift(`Supply is thin: every eligible copy currently costs more than the $${marketMid.toFixed(2)} market reference (cheapest is +${Math.round(((cheapestTotal - marketMid) / marketMid) * 100)}%). Waiting may beat buying.`);
  }

  return comparisonNarrativeSchema.parse({
    summary: eligible.length
      ? `TCGpal found ${eligible.length} eligible ${card.name} listings and separated price, seller safety, and condition evidence instead of collapsing them into one magic answer.`
      : `TCGpal could not find an eligible exact-match listing for ${card.name}.`,
    cautions,
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

function collectorNumberParts(value: string) {
  const [rawNumber = "", rawTotal = ""] = value.trim().replace(/\s+/g, "").split("/", 2);
  return {
    number: normalizeCollectorSegment(rawNumber),
    total: normalizeCollectorSegment(rawTotal),
  };
}

function normalizeCollectorSegment(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/\d/.test(normalized)) return "";
  const match = normalized.match(/^([A-Z]*)(\d+)$/);
  if (!match) return normalized;
  return `${match[1]}${Number(match[2])}`;
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
  const asOf = tcgplayer?.updatedAt ? toIsoDate(tcgplayer.updatedAt) : null;
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

function toIsoDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanCardName(title: string) {
  return title
    .replace(/\b(psa|bgs|cgc|sgc)\s*\d+(?:\.\d+)?\b/gi, "")
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

function dedupeSeeds(seeds: ListingSeed[]) {
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
