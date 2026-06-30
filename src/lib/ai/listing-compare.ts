import { createAiProvider } from "@/lib/ai/provider";
import { getAiConfig } from "@/lib/ai/config";
import { demoIdentities, demoListingSeeds } from "@/lib/comparison/fixtures";
import { normalizeListing, rankListings } from "@/lib/comparison/ranking";
import {
  EbayUnavailableError,
  getEbayListingByUrl,
  parseEbayUrl,
} from "@/lib/external/ebay";
import { getConfiguredPlatformAgents } from "@/lib/comparison/platforms";
import { runMarketSearch } from "@/lib/ai/agent/market-agent";
import { PriceChartingUnavailableError, searchPriceChartingProducts } from "@/lib/external/price-charting";
import { getPokemonCard, searchPokemonCards, type PokemonTcgCard } from "@/lib/external/pokemon-tcg";
import {
  getOnePieceCard,
  mapOnePieceCardToIdentity,
  onePieceSetMatches,
  searchOnePieceCards,
  type OnePieceTcgCard,
} from "@/lib/external/one-piece-tcg";
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
  type NormalizedListing,
  type SourceListing,
} from "@/lib/schemas";

// Broad queries (e.g. "pikachu") legitimately match many prints. Show enough to
// let the buyer find the right version; the IdentityConfirmation UI groups these
// by set so the list stays scannable.
const MAX_IDENTITY_CANDIDATES = 24;

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

  const sourceResult = await ingestSourceListing(request, fetcher, warnings, trace);
  const identities = await identifyCards(request, sourceResult, fetcher, warnings, trace);
  const confirmedCard = resolveConfirmedCard(request, identities);

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
      platforms: [],
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

  const seeds: typeof demoListingSeeds = [];
  const manualSeed = sourceToSeed(sourceResult, confirmedCard, generatedAt);
  if (manualSeed) seeds.push(manualSeed);

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
  const fanout = await runMarketSearch({ card: confirmedCard, buyer: request.buyer, fetcher });
  seeds.push(...fanout.seeds);
  warnings.push(...fanout.warnings);
  trace.push(...fanout.traces);
  const platformResults = fanout.results;

  if (fanout.configuredCount === 0) {
    // No live marketplace API is configured at all, so there is no real source to
    // fail — fall back to labeled demo inventory the buyer cannot mistake for real
    // offers, rather than masking the gap.
    demoMode = true;
    seeds.push(...demoListingSeeds);
    warnings.push("No live marketplace API is configured. Showing labeled demo inventory instead.");
    trace.push({
      step: "marketplace_search",
      actor: "Platform fan-out",
      summary: "No marketplace API is configured; loaded labeled fixtures.",
      status: "fallback",
    });
  }

  const normalized = dedupeSeeds(seeds).map((listing) => normalizeListing({ listing, buyer: request.buyer, marketPrice: confirmedCard.marketMid ?? null }));
  const rankedChoices = rankListings(normalized);
  trace.push({
    step: "validation_and_ranking",
    actor: "Deterministic TypeScript",
    summary: `Validated ${normalized.length} candidates and ranked ${rankedChoices.length} distinct choices.`,
    status: "complete",
  });

  const references = await getReferences(confirmedCard, fetcher, trace, generatedAt);
  const narrative = await buildNarrative(confirmedCard, normalized, rankedChoices, references, trace);
  const partial = normalized.filter((listing) => listing.eligible).length === 0
    || (!demoMode && references.every((reference) => reference.status !== "used"));

  return comparisonReportSchema.parse({
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
    demoMode,
    generatedAt,
  });
}

async function ingestSourceListing(
  request: ComparisonRequest,
  fetcher: typeof fetch,
  warnings: string[],
  trace: ComparisonTrace[],
) {
  const url = request.sourceListing.url?.trim();
  if (!url) {
    trace.push({
      step: "source_ingestion",
      actor: "Manual listing adapter",
      summary: "Accepted user-supplied listing facts without fetching an external URL.",
      status: "complete",
    });
    return request.sourceListing;
  }

  const parsed = parseEbayUrl(url);
  if (!parsed.supported) {
    trace.push({
      step: "source_ingestion",
      actor: "URL allowlist",
      summary: "Unsupported marketplace URL was not fetched; only user-supplied facts are used.",
      status: "complete",
    });
    return request.sourceListing;
  }

  try {
    const source = await getEbayListingByUrl(url, request.buyer, fetcher);
    trace.push({
      step: "source_ingestion",
      actor: "eBay Browse adapter",
      summary: "Fetched the source listing through the official eBay API.",
      status: "complete",
    });
    return source;
  } catch (error) {
    if (!(error instanceof EbayUnavailableError)) warnings.push(errorMessage(error));
    trace.push({
      step: "source_ingestion",
      actor: "eBay Browse adapter",
      summary: "Live source lookup was unavailable; retained only user-supplied facts.",
      status: "fallback",
    });
    return request.sourceListing;
  }
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
    // pricing payloads, so allow more headroom than the 8s default. Retry once: a
    // transient rate-limit/network blip should not look like "this card doesn't
    // exist". Responses are cached for an hour.
    const result = await searchPokemonWithRetry(
      {
        query: searchName,
        cardNumber: request.cardHint.cardNumber,
        setHint: request.cardHint.setCode,
        pageSize: request.cardHint.cardNumber ? 12 : 30,
        fetcher,
        timeoutMs: 15000,
      },
      warnings,
    );

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
      return dedupeIdentities(apiMatches).slice(0, MAX_IDENTITY_CANDIDATES);
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
async function searchPokemonWithRetry(
  options: Parameters<typeof searchPokemonCards>[0],
  warnings: string[],
): Promise<Awaited<ReturnType<typeof searchPokemonCards>> | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await searchPokemonCards(options);
    } catch (error) {
      if (attempt === 1) {
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
        pageSize: directId ? 12 : 30,
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
        summary: `Found ${matches.length} possible One Piece identities and ranked exact id and name matches first.`,
        status: "complete",
      });
      return dedupeIdentities(matches).slice(0, MAX_IDENTITY_CANDIDATES);
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
): typeof demoListingSeeds[number] | null {
  if (source.price === null) return null;
  const titleText = `${source.title} ${source.description}`;
  const explicitNumber = normalizeText(titleText).includes(normalizeText(card.cardNumber));
  return {
    id: "source-listing",
    marketplace: source.marketplace,
    url: source.url || null,
    title: source.title || `${card.name} ${card.cardNumber}`,
    cardId: card.id,
    matchConfidence: explicitNumber ? "high" : "medium",
    matchReasons: explicitNumber ? ["Confirmed collector number appears in the listing."] : ["User confirmed the card identity."],
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
  };
}

// Cross-platform ledger: turn each hand-entered listing into a ranked seed.
// These are user-supplied facts only — no URL is ever fetched server-side, and
// they carry no seller/photo evidence beyond what the buyer typed.
function manualCandidatesToSeeds(
  candidates: ComparisonRequest["manualCandidates"],
  card: CardIdentityCandidate,
  observedAt: string,
): typeof demoListingSeeds {
  return candidates.flatMap((candidate, index) => {
    if (candidate.price === null) return [];
    const titleText = candidate.title || `${card.name} ${card.cardNumber}`;
    const explicitNumber = normalizeText(titleText).includes(normalizeText(card.cardNumber));
    return [{
      id: `manual-${index}`,
      marketplace: candidate.marketplace,
      url: candidate.url || null,
      title: titleText,
      cardId: card.id,
      matchConfidence: explicitNumber ? "high" : "medium",
      matchReasons: [`Listing you entered from ${candidate.marketplace}.`],
      active: true,
      raw: !/\b(psa|bgs|cgc|sgc)\s*\d|\bslab(?:bed)?\b/i.test(titleText),
      currency: "USD",
      price: candidate.price,
      shipping: candidate.shipping,
      claimedCondition: candidate.claimedCondition,
      imageUrl: card.imageUrl,
      seller: {
        feedbackPercentage: null,
        feedbackCount: null,
        returnsAccepted: null,
        topRated: null,
        buyerProtection: null,
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
    }];
  });
}

async function getReferences(
  card: CardIdentityCandidate,
  fetcher: typeof fetch,
  trace: ComparisonTrace[],
  observedAt: string,
) {
  const references: ComparisonReference[] = [];

  // Primary fair-price anchor: live TCGplayer market price carried on the
  // confirmed card from the Pokémon catalog. No extra request needed.
  if (typeof card.marketMid === "number") {
    references.push({
      label: "TCGplayer market price",
      status: "used",
      observedAt,
      url: card.marketUrl ?? null,
      note: "Live TCGplayer market price for this exact version — a fair-price reference, not a guaranteed sale.",
      rawLow: card.marketLow ?? null,
      rawMid: card.marketMid,
      rawHigh: card.marketHigh ?? null,
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
    // PriceCharting is an optional reference-price enrichment, not a required source.
    // Its absence is already shown honestly in the references panel (status pill +
    // note), so keep the reason in the trace rather than the alarming result banner.
    const unavailable = error instanceof PriceChartingUnavailableError;
    references.push({
      label: "PriceCharting reference",
      status: unavailable ? "unavailable" : "missing",
      observedAt,
      url: null,
      note: "Optional reference pricing is unavailable. Active listings remain visible, but no transaction price is claimed.",
      rawLow: null,
      rawMid: null,
      rawHigh: null,
    });
    trace.push({
      step: "reference_pricing",
      actor: "PriceCharting adapter",
      summary: `Reference pricing was unavailable and was not fabricated: ${errorMessage(error)}`,
      status: "fallback",
    });
  }
  references.push({
    label: "Sold transactions",
    status: "unavailable",
    observedAt,
    url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`${card.name} ${card.cardNumber}`)}&LH_Sold=1&LH_Complete=1`,
    note: "Automated sold history is not connected. Open the manual eBay sold search before buying.",
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
  trace: ComparisonTrace[],
) {
  const local = localNarrative(card, listings, rankedChoices, references);
  const config = getAiConfig();
  const provider = createAiProvider(config);

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
      user: { card, listings, rankedChoices, references },
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
    // Falling back to the deterministic narrative is by design (deterministic-first),
    // not a live-data failure the buyer must act on. Keep the reason in the trace for
    // debugging instead of raising it in the result-level "live data couldn't load" banner.
    trace.push({
      step: "evidence_synthesis",
      actor: "Deterministic critic",
      summary: `Used the local evidence summary because model synthesis was unavailable or rejected: ${errorMessage(error)}`,
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
  return comparisonNarrativeSchema.parse({
    summary: eligible.length
      ? `TCGpal found ${eligible.length} eligible ${card.name} listings and separated price, seller safety, and condition evidence instead of collapsing them into one magic answer.`
      : `TCGpal could not find an eligible exact-match listing for ${card.name}.`,
    cautions: [
      choices.length < 3 ? "Fewer than three distinct choices met the eligibility rules." : "Each choice wins for a different reason; none is a grade prediction.",
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
  const empty = { marketUrl: tcgplayer?.url ?? null, marketLow: null, marketMid: null, marketHigh: null };
  const prices = (tcgplayer?.prices ?? {}) as Record<string, TcgplayerVariantPrice | undefined>;
  const preferred = ["holofoil", "normal", "reverseHolofoil", "reverse-holofoil", "1stEditionHolofoil", "unlimitedHolofoil"];
  const keys = [...preferred.filter((key) => prices[key]), ...Object.keys(prices).filter((key) => !preferred.includes(key))];
  for (const key of keys) {
    const variant = prices[key];
    if (!variant) continue;
    const mid = numberOrNull(variant.market) ?? numberOrNull(variant.mid);
    if (mid === null) continue;
    return { marketUrl: tcgplayer?.url ?? null, marketLow: numberOrNull(variant.low), marketMid: mid, marketHigh: numberOrNull(variant.high) };
  }
  return empty;
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

function dedupeSeeds(seeds: typeof demoListingSeeds) {
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
