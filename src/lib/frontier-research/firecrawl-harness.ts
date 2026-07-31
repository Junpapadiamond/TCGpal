import { z } from "zod";
import { assessPrintFidelity } from "@/lib/comparison/print-fidelity";
import { cardIdentityCandidateSchema } from "@/lib/schemas";

const confidenceSchema = z.enum(["high", "medium", "low"]);
const extractedValueSchema = z.union([z.string(), z.number().finite(), z.boolean()]).nullable();

export const firecrawlRawFieldSchema = z.object({
  value: extractedValueSchema,
  evidence: z.string().trim().max(500).nullable(),
  confidence: confidenceSchema,
}).strict();

const firecrawlFieldsSchema = z.object({
  title: firecrawlRawFieldSchema,
  cardName: firecrawlRawFieldSchema,
  collectorNumber: firecrawlRawFieldSchema,
  setName: firecrawlRawFieldSchema,
  variant: firecrawlRawFieldSchema,
  itemPrice: firecrawlRawFieldSchema,
  currency: firecrawlRawFieldSchema,
  shippingCost: firecrawlRawFieldSchema,
  tax: firecrawlRawFieldSchema,
  availability: firecrawlRawFieldSchema,
  condition: firecrawlRawFieldSchema,
  sellerEvidence: firecrawlRawFieldSchema,
}).strict();

export const firecrawlFixtureSchema = z.object({
  id: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  url: z.string().url().startsWith("https://"),
  card: cardIdentityCandidateSchema,
  expectedIdentity: z.enum(["exact", "sibling", "unrelated", "uncertain"]),
  expectedFacts: z.record(z.string(), extractedValueSchema),
}).strict();

export const firecrawlExperimentManifestSchema = z.object({
  experimentId: z.string().trim().min(1),
  label: z.literal("frontier-research"),
  owner: z.string().trim().min(1),
  reviewDate: z.string().date(),
  observerConfig: z.object({
    endpoint: z.literal("/scrape"),
    format: z.literal("json"),
    storeInCache: z.literal(false),
    redactPII: z.literal(true),
    proxy: z.literal("basic"),
    usdPerCredit: z.number().nonnegative().nullable().optional().default(null),
    discoveryCreditsUsed: z.number().nonnegative().optional().default(0),
    pricingAssumption: z.string().trim().min(1).max(240).optional(),
    pricingSourceUrl: z.string().url().startsWith("https://").optional(),
  }).strict(),
  thresholds: z.object({
    pageObservedRate: z.number().min(0).max(1),
    factualPrecision: z.number().min(0).max(1),
    costComparableRate: z.number().min(0).max(1),
    medianLatencyMs: z.number().int().positive(),
    maxCostUsd: z.number().positive(),
  }).strict(),
  fixtures: z.array(firecrawlFixtureSchema).min(1).max(100),
}).strict().superRefine((manifest, context) => {
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const [index, fixture] of manifest.fixtures.entries()) {
    if (ids.has(fixture.id)) {
      context.addIssue({ code: "custom", path: ["fixtures", index, "id"], message: "Fixture ids must be unique." });
    }
    if (urls.has(normalizeUrl(fixture.url))) {
      context.addIssue({ code: "custom", path: ["fixtures", index, "url"], message: "Fixture URLs must be unique." });
    }
    ids.add(fixture.id);
    urls.add(normalizeUrl(fixture.url));
  }
});

export const firecrawlObservationSchema = z.object({
  fixtureId: z.string().trim().min(1),
  sourceUrl: z.string().url().startsWith("https://"),
  observedAt: z.string().datetime(),
  acquisitionMethod: z.literal("firecrawl-scrape-json"),
  status: z.enum(["observed", "blocked", "failed"]),
  attemptCount: z.number().int().positive().optional().default(1),
  durationMs: z.number().int().nonnegative(),
  creditsUsed: z.number().nonnegative().nullable().optional().default(null),
  costUsd: z.number().nonnegative().nullable(),
  accessNotes: z.array(z.string().trim().min(1).max(240)),
  fields: firecrawlFieldsSchema,
}).strict();

export type FirecrawlFixture = z.infer<typeof firecrawlFixtureSchema>;
export type FirecrawlObservationInput = z.input<typeof firecrawlObservationSchema>;
export type FirecrawlObservation = z.output<typeof firecrawlObservationSchema>;
export type FirecrawlExperimentManifestInput = z.input<typeof firecrawlExperimentManifestSchema>;
export type FirecrawlExperimentManifest = z.output<typeof firecrawlExperimentManifestSchema>;
export type FrontierEvidenceState = "link-only" | "page-observed" | "identity-checked" | "cost-comparable";

export type ProvenancedField = {
  sourceUrl: string;
  observedAt: string;
  acquisitionMethod: "firecrawl-scrape-json";
  extractedValue: string | number | boolean | null;
  evidence: string | null;
  confidence: "high" | "medium" | "low";
};

export function evaluateFirecrawlObservation(input: {
  fixture: FirecrawlFixture;
  observation: FirecrawlObservationInput;
}) {
  const fixture = firecrawlFixtureSchema.parse(input.fixture);
  const parsedObservation = firecrawlObservationSchema.parse(input.observation);
  assertObservationMatchesFixture(fixture, parsedObservation);
  const { observation, criticNotes } = criticizeObservation(parsedObservation);

  const fields = Object.fromEntries(
    Object.entries(observation.fields).map(([name, field]) => [
      name,
      {
        sourceUrl: observation.sourceUrl,
        observedAt: observation.observedAt,
        acquisitionMethod: observation.acquisitionMethod,
        extractedValue: field.value,
        evidence: field.evidence,
        confidence: field.confidence,
      } satisfies ProvenancedField,
    ]),
  ) as Record<keyof FirecrawlObservation["fields"], ProvenancedField>;

  const hasObservedContent = observation.status === "observed"
    && Object.values(observation.fields).some((field) => field.value !== null && field.evidence !== null);
  const listingPrice = numberValue(observation.fields.itemPrice.value) ?? 0;
  const identity = hasObservedContent
    ? assessPrintFidelity({
      card: fixture.card,
      matchText: identityMatchText(observation),
      listingPrice,
      exactMarketAnchor: fixture.card.marketMid ?? null,
    })
    : { match: "unknown" as const, confidence: "low" as const, reasons: ["page_not_observed"], priceGuard: "none" as const };
  const identityChecked = identity.confidence === "high" && (identity.match === "exact" || identity.match === "compatible");
  const comparableCost = identityChecked ? comparableCostFrom(observation) : null;
  const evidenceState: FrontierEvidenceState = comparableCost
    ? "cost-comparable"
    : identityChecked
      ? "identity-checked"
      : hasObservedContent
        ? "page-observed"
        : "link-only";

  return {
    fixtureId: fixture.id,
    platform: fixture.platform,
    sourceUrl: observation.sourceUrl,
    observedAt: observation.observedAt,
    acquisitionMethod: observation.acquisitionMethod,
    status: observation.status,
    attemptCount: observation.attemptCount,
    evidenceState,
    identity,
    comparableCost,
    durationMs: observation.durationMs,
    creditsUsed: observation.creditsUsed,
    costUsd: observation.costUsd,
    accessNotes: observation.accessNotes,
    criticNotes,
    fields,
  };
}

export function evaluateFirecrawlExperiment(input: {
  manifest: FirecrawlExperimentManifestInput;
  observations: FirecrawlObservationInput[];
}) {
  const manifest = firecrawlExperimentManifestSchema.parse(input.manifest);
  const observations = z.array(firecrawlObservationSchema).parse(input.observations);
  const byFixtureId = new Map(observations.map((observation) => [observation.fixtureId, observation]));
  if (byFixtureId.size !== observations.length) throw new Error("Each fixture may have only one observation.");

  const results = manifest.fixtures.map((fixture) => {
    const observation = byFixtureId.get(fixture.id);
    if (!observation) throw new Error(`Missing observation for fixture ${fixture.id}.`);
    const result = evaluateFirecrawlObservation({ fixture, observation });
    const derivedCost = result.costUsd ?? (
      result.creditsUsed !== null && manifest.observerConfig.usdPerCredit !== null
        ? result.creditsUsed * manifest.observerConfig.usdPerCredit
        : null
    );
    return { ...result, costUsd: derivedCost };
  });
  const pageObservedCount = results.filter((result) => result.evidenceState !== "link-only").length;
  const costComparableCount = results.filter((result) => result.evidenceState === "cost-comparable").length;
  const knownSiblingSubstitutions = manifest.fixtures.filter((fixture, index) => (
    fixture.expectedIdentity === "sibling"
      && results[index].identity.confidence === "high"
      && (results[index].identity.match === "exact" || results[index].identity.match === "compatible")
  )).length;
  const factualChecks = scoreFactualChecks(manifest, byFixtureId);
  const pageObservedRate = ratio(pageObservedCount, results.length);
  const factualPrecision = ratio(factualChecks.correct, factualChecks.predictions);
  const factualCoverage = ratio(factualChecks.predictions, factualChecks.labels);
  const costComparableRate = ratio(costComparableCount, results.length);
  const medianLatencyMs = median(results.map((result) => result.durationMs));
  const scrapeCreditsUsed = roundMoney(results.reduce((sum, result) => sum + (result.creditsUsed ?? 0), 0));
  const totalCreditsUsed = roundMoney(scrapeCreditsUsed + manifest.observerConfig.discoveryCreditsUsed);
  const discoveryCostUsd = manifest.observerConfig.discoveryCreditsUsed === 0
    ? 0
    : manifest.observerConfig.usdPerCredit !== null
      ? manifest.observerConfig.discoveryCreditsUsed * manifest.observerConfig.usdPerCredit
      : null;
  const costsKnown = results.every((result) => result.costUsd !== null) && discoveryCostUsd !== null;
  const totalCostUsd = costsKnown
    ? roundMoney(results.reduce((sum, result) => sum + (result.costUsd ?? 0), discoveryCostUsd ?? 0))
    : null;
  const evidenceReplayable = results.every((result) => Object.values(result.fields).every((field) => (
    field.extractedValue === null || field.evidence !== null
  )));
  const accessPolicy = manifest.observerConfig.storeInCache === false
    && manifest.observerConfig.proxy === "basic"
    && results.every((result) => result.status === "observed" || result.accessNotes.length > 0);
  const gates = {
    pageObserved: (pageObservedRate ?? 0) >= manifest.thresholds.pageObservedRate,
    factualPrecision: factualPrecision !== null && factualPrecision >= manifest.thresholds.factualPrecision,
    zeroSiblingSubstitutions: knownSiblingSubstitutions === 0,
    costComparable: (costComparableRate ?? 0) >= manifest.thresholds.costComparableRate,
    latency: medianLatencyMs <= manifest.thresholds.medianLatencyMs,
    cost: totalCostUsd !== null && totalCostUsd <= manifest.thresholds.maxCostUsd,
    accessPolicy,
    evidenceReplayable,
  };

  return {
    experimentId: manifest.experimentId,
    label: manifest.label,
    owner: manifest.owner,
    reviewDate: manifest.reviewDate,
    observerConfig: manifest.observerConfig,
    thresholds: manifest.thresholds,
    summary: {
      totalFixtures: results.length,
      pageObservedCount,
      pageObservedRate,
      factualLabels: factualChecks.labels,
      factualPredictions: factualChecks.predictions,
      factualErrors: factualChecks.predictions - factualChecks.correct,
      factualCoverage,
      factualPrecision,
      knownSiblingSubstitutions,
      costComparableCount,
      costComparableRate,
      medianLatencyMs,
      scrapeCreditsUsed,
      discoveryCreditsUsed: manifest.observerConfig.discoveryCreditsUsed,
      totalCreditsUsed,
      totalCostUsd,
    },
    gates: { ...gates, overall: Object.values(gates).every(Boolean) },
    results,
  };
}

function assertObservationMatchesFixture(fixture: FirecrawlFixture, observation: FirecrawlObservation) {
  if (fixture.id !== observation.fixtureId) {
    throw new Error(`Observation fixtureId ${observation.fixtureId} does not match ${fixture.id}.`);
  }
  if (normalizeUrl(fixture.url) !== normalizeUrl(observation.sourceUrl)) {
    throw new Error(`Observation URL does not match fixture ${fixture.id}.`);
  }
}

function criticizeObservation(observation: FirecrawlObservation) {
  const criticNotes: string[] = [];
  const placeholderValues = [
    observation.fields.title.value,
    observation.fields.cardName.value,
    observation.fields.setName.value,
    observation.fields.variant.value,
  ].filter((value): value is string => typeof value === "string" && /\b(?:example|sample|placeholder|lorem ipsum)\b/i.test(value));
  if (placeholderValues.length >= 2 || /\b(?:example|sample|placeholder)\b/i.test(String(observation.fields.title.value ?? ""))) {
    criticNotes.push("Discarded schema-shaped placeholder payload.");
    const fields = Object.fromEntries(Object.entries(observation.fields).map(([name, field]) => [
      name,
      { value: null, evidence: field.evidence, confidence: "low" as const },
    ])) as FirecrawlObservation["fields"];
    return { observation: { ...observation, fields }, criticNotes };
  }
  const fields = Object.fromEntries(Object.entries(observation.fields).map(([name, field]) => {
    const sentinelValue = typeof field.value === "string"
      && /^(?:n\/?a|not\s+available|not\s+applicable|not\s+provided)$/i.test(field.value.trim());
    const genericSellerBoilerplate = name === "sellerEvidence"
      && /\b(?:generic signals?|page structure|organized online marketplace|professional selling evident)\b/i.test(`${field.value ?? ""} ${field.evidence ?? ""}`);
    if (sentinelValue || genericSellerBoilerplate) {
      criticNotes.push(`${name}: normalized unsupported sentinel or boilerplate to unknown.`);
      return [name, { value: null, evidence: field.evidence, confidence: "low" as const }];
    }
    const unsupportedDefault = field.value !== null
      && field.confidence === "low"
      && /\b(?:default(?:ing|ed)?|not\s+specified|unspecified|assum(?:e|ed|ing)|not\s+provided)\b/i.test(field.evidence ?? "");
    if (!unsupportedDefault) return [name, field];
    criticNotes.push(`${name}: discarded unsupported default value.`);
    return [name, { value: null, evidence: field.evidence, confidence: "low" as const }];
  })) as FirecrawlObservation["fields"];
  return { observation: { ...observation, fields }, criticNotes };
}

function scoreFactualChecks(
  manifest: FirecrawlExperimentManifest,
  observationsByFixtureId: Map<string, FirecrawlObservation>,
) {
  const primaryFacts = new Set(["title", "itemPrice", "currency", "availability"]);
  let labels = 0;
  let predictions = 0;
  let correct = 0;
  for (const fixture of manifest.fixtures) {
    const observation = observationsByFixtureId.get(fixture.id);
    if (!observation) throw new Error(`Missing observation for fixture ${fixture.id}.`);
    for (const [fieldName, expected] of Object.entries(fixture.expectedFacts)) {
      if (!primaryFacts.has(fieldName)) continue;
      const actual = observation.fields[fieldName as keyof FirecrawlObservation["fields"]]?.value;
      labels += 1;
      if (actual === null || actual === undefined) continue;
      predictions += 1;
      if (factEquals(actual, expected)) correct += 1;
    }
  }
  return { labels, predictions, correct };
}

function factEquals(actual: unknown, expected: unknown) {
  if (typeof actual === "number" && typeof expected === "number") {
    return Math.abs(actual - expected) <= 0.01;
  }
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.trim().toLowerCase() === expected.trim().toLowerCase();
  }
  return actual === expected;
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 10_000;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2)
    : sorted[midpoint];
}

function normalizeUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/$/, "") || "/";
  return url.href;
}

function identityMatchText(observation: FirecrawlObservation) {
  return ["title", "cardName", "collectorNumber", "setName", "variant"]
    .map((name) => observation.fields[name as keyof FirecrawlObservation["fields"]].value)
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function comparableCostFrom(observation: FirecrawlObservation) {
  if (observation.fields.availability.value !== "available") return null;
  const itemPrice = numberValue(observation.fields.itemPrice.value);
  const shippingCost = numberValue(observation.fields.shippingCost.value);
  const currency = stringValue(observation.fields.currency.value)?.toUpperCase() ?? null;
  if (itemPrice === null || shippingCost === null || !currency?.match(/^[A-Z]{3}$/)) return null;
  return {
    currency,
    preTaxTotal: roundMoney(itemPrice + shippingCost),
    taxKnown: numberValue(observation.fields.tax.value) !== null,
  };
}

function numberValue(value: string | number | boolean | null) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function stringValue(value: string | number | boolean | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
