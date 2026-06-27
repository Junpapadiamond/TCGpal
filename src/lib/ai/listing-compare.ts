import { createAiProvider } from "@/lib/ai/provider";
import { getAiConfig } from "@/lib/ai/config";
import { demoIdentities, demoListingSeeds } from "@/lib/comparison/fixtures";
import { normalizeListing, rankListings } from "@/lib/comparison/ranking";
import {
  EbayUnavailableError,
  getEbayListingByUrl,
  hasEbayCredentials,
  parseEbayUrl,
  searchEbayAlternatives,
} from "@/lib/external/ebay";
import { PriceChartingUnavailableError, searchPriceChartingProducts } from "@/lib/external/price-charting";
import { searchPokemonCards, type PokemonTcgCard } from "@/lib/external/pokemon-tcg";
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

  const seeds: typeof demoListingSeeds = [];
  const manualSeed = sourceToSeed(sourceResult, confirmedCard, generatedAt);
  if (manualSeed) seeds.push(manualSeed);

  try {
    const ebaySeeds = await searchEbayAlternatives(confirmedCard, request.buyer, fetcher);
    seeds.push(...ebaySeeds);
    trace.push({
      step: "marketplace_search",
      actor: "eBay Browse adapter",
      summary: `Loaded ${ebaySeeds.length} live active-listing candidates.`,
      status: "complete",
    });
  } catch (error) {
    demoMode = true;
    seeds.push(...demoListingSeeds);
    warnings.push(`${errorMessage(error)} Showing labeled demo inventory instead.`);
    trace.push({
      step: "marketplace_search",
      actor: "eBay Browse adapter",
      summary: "Live eBay search was unavailable; loaded labeled fixtures.",
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

  const references = await getReferences(confirmedCard, fetcher, warnings, trace, generatedAt);
  const narrative = await buildNarrative(confirmedCard, normalized, rankedChoices, references, warnings, trace);
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
  const query = [request.cardHint.name, source.title].filter(Boolean).join(" ").trim();
  const localMatches = matchDemoIdentities(`${query} ${request.cardHint.cardNumber} ${request.cardHint.setCode}`);

  // The Pokémon TCG catalog is queryable without a key (the key only raises rate
  // limits), so resolve real card identities whenever we have a usable query.
  if (query.length >= 2) {
    try {
      // pokemontcg.io's first (uncached) response can take 5-8s because it carries
      // pricing payloads, so allow more headroom than the 8s default to avoid an
      // unnecessary fall back to demo identities. Responses are cached for an hour.
      const result = await searchPokemonCards({ query: request.cardHint.name || cleanCardName(source.title), pageSize: 6, fetcher, timeoutMs: 15000 });
      const apiMatches = result.cards.map((card) => cardIdentityCandidateSchema.parse({
        id: card.id,
        name: card.name,
        setName: card.set?.name ?? "Unknown set",
        setCode: card.set?.id?.toUpperCase() ?? "",
        cardNumber: card.number ?? "",
        language: request.cardHint.language || "English",
        imageUrl: card.images?.large ?? card.images?.small ?? null,
        confidence: identityConfidence(card.name, card.number ?? "", request, source),
        matchReasons: buildIdentityReasons(card.name, card.number ?? "", request, source),
        ...extractTcgplayerPricing(card.tcgplayer),
      }));
      const merged = dedupeIdentities([...localMatches, ...apiMatches]);
      trace.push({
        step: "card_identification",
        actor: "Pokémon catalog adapter",
        summary: `Found ${merged.length} possible identities and preserved ambiguity for user confirmation.`,
        status: "complete",
      });
      return merged.slice(0, 6);
    } catch (error) {
      warnings.push(`Pokémon catalog lookup unavailable: ${errorMessage(error)}`);
    }
  }

  const fallback = localMatches.length ? localMatches : demoIdentities;
  trace.push({
    step: "card_identification",
    actor: "Local identity matcher",
    summary: `Returned ${fallback.length} catalog candidates without inventing a version match.`,
    status: "fallback",
  });
  return fallback;
}

function resolveConfirmedCard(request: ComparisonRequest, identities: CardIdentityCandidate[]) {
  if (request.confirmedCardId) {
    return identities.find((candidate) => candidate.id === request.confirmedCardId) ?? null;
  }
  const top = identities[0];
  const hasExplicitIdentity = Boolean(request.cardHint.cardNumber && request.cardHint.name);
  return top?.confidence === "high" && hasExplicitIdentity ? top : null;
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

async function getReferences(
  card: CardIdentityCandidate,
  fetcher: typeof fetch,
  warnings: string[],
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
    const unavailable = error instanceof PriceChartingUnavailableError;
    warnings.push(errorMessage(error));
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
      summary: "Reference pricing was unavailable and was not fabricated.",
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
  warnings: string[],
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

function matchDemoIdentities(text: string) {
  const normalized = normalizeText(text);
  const matches = demoIdentities.filter((identity) =>
    normalized.includes(normalizeText(identity.name))
    || normalized.includes(normalizeText(identity.cardNumber))
  );
  return matches.length ? matches : [];
}

function identityConfidence(name: string, number: string, request: ComparisonRequest, source: SourceListing) {
  const text = normalizeText(`${source.title} ${source.description} ${request.cardHint.name} ${request.cardHint.cardNumber}`);
  if (number && text.includes(normalizeText(number)) && text.includes(normalizeText(name))) return "high" as const;
  if (text.includes(normalizeText(name))) return "medium" as const;
  return "low" as const;
}

function buildIdentityReasons(name: string, number: string, request: ComparisonRequest, source: SourceListing) {
  const text = normalizeText(`${source.title} ${source.description} ${request.cardHint.name} ${request.cardHint.cardNumber}`);
  return [
    text.includes(normalizeText(name)) ? "Card name matches." : "Card name is uncertain.",
    number && text.includes(normalizeText(number)) ? "Collector number matches." : "Collector number needs confirmation.",
  ];
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
