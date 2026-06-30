import { z } from "zod";

export const marketplaceSchema = z.enum([
  "eBay",
  "TCGplayer",
  "Facebook",
  "Reddit",
  "Mercari",
  "Whatnot",
  "Local shop",
  "Other",
]);

export const conditionClaimSchema = z.enum([
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
  "Unknown",
]);

export const confidenceSchema = z.enum(["low", "medium", "high"]);

export const moneySchema = z.object({
  value: z.number().min(0),
  currency: z.literal("USD").default("USD"),
});

export const sellerTrustSignalsSchema = z.object({
  feedbackPercentage: z.number().min(0).max(100).nullable().default(null),
  feedbackCount: z.number().int().min(0).nullable().default(null),
  returnsAccepted: z.boolean().nullable().default(null),
  topRated: z.boolean().nullable().default(null),
  buyerProtection: z.boolean().nullable().default(null),
});

export const listingEvidenceSchema = z.object({
  photoCount: z.number().int().min(0).default(0),
  frontBackExplicit: z.boolean().default(false),
  closeupsExplicit: z.boolean().default(false),
  surfaceExplicit: z.boolean().default(false),
  identityExplicit: z.boolean().default(false),
  substantiveConditionNotes: z.boolean().default(false),
  missing: z.array(z.string()).default([]),
});

export const sourceListingSchema = z.object({
  marketplace: marketplaceSchema,
  url: z.string().url().optional().or(z.literal("")),
  title: z.string().trim().default(""),
  description: z.string().trim().default(""),
  price: z.number().min(0).nullable().default(null),
  shipping: z.number().min(0).nullable().default(null),
  claimedCondition: conditionClaimSchema.default("Unknown"),
  active: z.boolean().default(true),
  seller: sellerTrustSignalsSchema.default({
    feedbackPercentage: null,
    feedbackCount: null,
    returnsAccepted: null,
    topRated: null,
    buyerProtection: null,
  }),
  evidence: listingEvidenceSchema.default({
    photoCount: 0,
    frontBackExplicit: false,
    closeupsExplicit: false,
    surfaceExplicit: false,
    identityExplicit: false,
    substantiveConditionNotes: false,
    missing: [],
  }),
});

export const buyerContextSchema = z.object({
  country: z.literal("US").default("US"),
  postalCode: z.string().trim().max(10).default(""),
  taxRate: z.number().min(0).max(0.2).nullable().default(null),
  desiredCondition: conditionClaimSchema.default("Unknown"),
});

export const tcgGameSchema = z.enum(["pokemon", "onePiece"]);

export const cardHintSchema = z.object({
  game: tcgGameSchema.default("pokemon"),
  name: z.string().trim().default(""),
  setCode: z.string().trim().default(""),
  cardNumber: z.string().trim().default(""),
  language: z.string().trim().default("English"),
});

// A quick cross-platform listing the buyer enters by hand. Kept minimal so a
// row is fast to add; richer seller/photo evidence stays on the single detailed
// `sourceListing` path.
export const manualCandidateSchema = z.object({
  marketplace: marketplaceSchema,
  url: z.string().url().optional().or(z.literal("")),
  title: z.string().trim().default(""),
  price: z.number().min(0).nullable().default(null),
  shipping: z.number().min(0).nullable().default(null),
  claimedCondition: conditionClaimSchema.default("Unknown"),
});

export const comparisonRequestSchema = z.object({
  sourceListing: sourceListingSchema,
  buyer: buyerContextSchema,
  cardHint: cardHintSchema.default({
    game: "pokemon",
    name: "",
    setCode: "",
    cardNumber: "",
    language: "English",
  }),
  // Lightweight listings the buyer found on other platforms (TCGplayer,
  // Facebook, Mercari, Whatnot, local shop...). They are user-supplied facts —
  // never fetched server-side — and rank in the same ledger as eBay results.
  manualCandidates: z.array(manualCandidateSchema).default([]),
  confirmedCardId: z.string().trim().optional(),
});

export const cardIdentityCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  setName: z.string(),
  setCode: z.string(),
  cardNumber: z.string(),
  language: z.string(),
  imageUrl: z.string().url().nullable().default(null),
  rarity: z.string().nullable().optional(),
  setSymbolUrl: z.string().url().nullable().optional(),
  confidence: confidenceSchema,
  matchReasons: z.array(z.string()),
  // Live TCGplayer market price for this exact version (USD), used as the
  // fair-price anchor. Optional so demo identities without pricing stay valid.
  marketUrl: z.string().url().nullable().optional(),
  marketLow: z.number().nullable().optional(),
  marketMid: z.number().nullable().optional(),
  marketHigh: z.number().nullable().optional(),
});

export const normalizedListingSchema = z.object({
  id: z.string(),
  marketplace: marketplaceSchema,
  url: z.string().url().nullable().default(null),
  title: z.string(),
  cardId: z.string(),
  matchConfidence: confidenceSchema,
  matchReasons: z.array(z.string()),
  active: z.boolean(),
  raw: z.boolean(),
  currency: z.literal("USD"),
  price: z.number().min(0),
  shipping: z.number().min(0).nullable(),
  estimatedTax: z.number().min(0).nullable(),
  preTaxTotal: z.number().min(0),
  estimatedLandedCost: z.number().min(0).nullable(),
  claimedCondition: conditionClaimSchema,
  imageUrl: z.string().url().nullable().default(null),
  seller: sellerTrustSignalsSchema,
  evidence: listingEvidenceSchema,
  sellerTrustScore: z.number().int().min(0).max(100),
  evidenceCompletenessScore: z.number().int().min(0).max(100),
  safetyScore: z.number().int().min(0).max(100),
  eligible: z.boolean(),
  exclusionReasons: z.array(z.string()),
  observedAt: z.string(),
  demo: z.boolean().default(false),
});

export const rankedChoiceRoleSchema = z.enum([
  "lowest_landed_cost",
  "safest_listing",
  "best_condition_evidence",
]);

export const rankedChoiceSchema = z.object({
  role: rankedChoiceRoleSchema,
  listingId: z.string(),
  label: z.string(),
  reason: z.string(),
  confidence: confidenceSchema,
});

export const comparisonReferenceSchema = z.object({
  label: z.string(),
  status: z.enum(["used", "unavailable", "missing"]),
  observedAt: z.string(),
  url: z.string().url().nullable().default(null),
  note: z.string(),
  rawLow: z.number().nullable().default(null),
  rawMid: z.number().nullable().default(null),
  rawHigh: z.number().nullable().default(null),
});

export const comparisonTraceSchema = z.object({
  step: z.string(),
  actor: z.string(),
  summary: z.string(),
  status: z.enum(["complete", "fallback", "skipped"]),
});

export const comparisonNarrativeSchema = z.object({
  summary: z.string(),
  cautions: z.array(z.string()),
});

// One entry per platform agent in the cross-platform fan-out: whether it ran,
// was unavailable, or sat out because its API is not configured. Powers the
// "sources checked" panel so the user can see exactly which marketplaces are live.
export const comparisonPlatformResultSchema = z.object({
  id: z.string(),
  marketplace: marketplaceSchema,
  label: z.string(),
  status: z.enum(["complete", "fallback", "skipped"]),
  configured: z.boolean(),
  count: z.number().int().min(0).default(0),
  detail: z.string().default(""),
});

export const comparisonReportSchema = z.object({
  status: z.enum(["needs_confirmation", "complete", "partial"]),
  request: comparisonRequestSchema,
  identityCandidates: z.array(cardIdentityCandidateSchema),
  confirmedCard: cardIdentityCandidateSchema.nullable(),
  candidates: z.array(normalizedListingSchema),
  rankedChoices: z.array(rankedChoiceSchema),
  references: z.array(comparisonReferenceSchema),
  narrative: comparisonNarrativeSchema,
  warnings: z.array(z.string()),
  trace: z.array(comparisonTraceSchema),
  platforms: z.array(comparisonPlatformResultSchema).default([]),
  demoMode: z.boolean(),
  generatedAt: z.string(),
});

export const listingRiskInputSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  price: z.number().min(0),
  marketplace: marketplaceSchema,
  userGoal: z.enum(["Self-collection", "Grading", "Resale"]),
});

export const listingRiskReportSchema = z.object({
  score: z.enum(["Low", "Medium", "Medium-High", "High"]),
  confidence: z.enum(["Low", "Medium-low", "Medium", "High"]),
  missingInfo: z.array(z.string()),
  keyRisks: z.array(z.string()).min(1),
  sellerQuestions: z.array(z.string()).min(1),
  suitability: z.string(),
  cautiousSummary: z.string(),
});

export const rawVsSlabInputSchema = z.object({
  rawPrice: z.number().min(0),
  psa10Price: z.number().min(0),
  psa9Price: z.number().min(0),
  otherPrice: z.number().min(0),
  gradingCost: z.number().min(0),
  marketplaceFeeRate: z.number().min(0).max(1),
  shippingCost: z.number().min(0),
  psa10Probability: z.number().min(0).max(1),
  psa9Probability: z.number().min(0).max(1),
});

export const rawVsSlabResultSchema = z.object({
  psa10NetValue: z.number(),
  psa9NetValue: z.number(),
  otherNetValue: z.number(),
  expectedProfit: z.number(),
  worstCaseOutcome: z.number(),
  breakEvenPsa10Probability: z.number().nullable(),
  recommendation: z.string(),
  explanation: z.string(),
  assumptions: z.array(z.string()),
});

export type Marketplace = z.infer<typeof marketplaceSchema>;
export type ConditionClaim = z.infer<typeof conditionClaimSchema>;
export type SellerTrustSignals = z.infer<typeof sellerTrustSignalsSchema>;
export type ListingEvidence = z.infer<typeof listingEvidenceSchema>;
export type SourceListing = z.infer<typeof sourceListingSchema>;
export type BuyerContext = z.infer<typeof buyerContextSchema>;
export type ComparisonRequest = z.infer<typeof comparisonRequestSchema>;
export type TcgGame = z.infer<typeof tcgGameSchema>;
export type ManualCandidate = z.infer<typeof manualCandidateSchema>;
export type CardIdentityCandidate = z.infer<typeof cardIdentityCandidateSchema>;
export type NormalizedListing = z.infer<typeof normalizedListingSchema>;
export type RankedChoice = z.infer<typeof rankedChoiceSchema>;
export type ComparisonReference = z.infer<typeof comparisonReferenceSchema>;
export type ComparisonReport = z.infer<typeof comparisonReportSchema>;
export type ComparisonTrace = z.infer<typeof comparisonTraceSchema>;
export type ComparisonPlatformResult = z.infer<typeof comparisonPlatformResultSchema>;
export type ListingRiskInput = z.infer<typeof listingRiskInputSchema>;
export type ListingRiskReport = z.infer<typeof listingRiskReportSchema>;
export type RawVsSlabInput = z.infer<typeof rawVsSlabInputSchema>;
export type RawVsSlabResult = z.infer<typeof rawVsSlabResultSchema>;
