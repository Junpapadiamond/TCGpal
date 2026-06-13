import { z } from "zod";

export const ipOptions = ["One Piece", "Pokemon", "Yu-Gi-Oh", "Sports Cards", "Other"] as const;
export const favoriteTcgOptions = ["Pokemon", "One Piece", "Yu-Gi-Oh", "League / Riot TCG", "Other"] as const;
export const playerTypeOptions = ["Collector", "Hybrid Collector-Seller", "Seller / Vendor"] as const;
export const budgetRangeOptions = ["$50", "$150", "$300", "$1000+", "Talk about it later"] as const;
export const goalOptions = [
  "Collection",
  "Collection + resale",
  "Grading play",
  "Small seller inventory",
  "Set completion",
] as const;
export const riskOptions = ["Low", "Medium", "High"] as const;
export const holdingOptions = ["Short-term", "3-6 months", "1 year+", "Long-term collection"] as const;
export const gradingOptions = ["No", "Maybe", "Yes"] as const;
export const marketOptions = ["eBay", "TCGplayer", "Cardmarket", "Mercari", "Local community", "Other"] as const;
export const actualGradeOptions = ["UNKNOWN", "PSA10", "PSA9", "PSA8_OR_LOWER"] as const;
export const decisionSourceOptions = ["manual", "listing_risk", "raw_vs_slab"] as const;
export const decisionPlanStatusOptions = ["open", "done", "skipped"] as const;
export const journalSentimentOptions = ["Still interested", "Cautious", "Passed for now", "Exited", "Needs review"] as const;
export const journalReviewStatusOptions = ["Watching", "Needs review", "Resolved"] as const;
export const journalActionOptions = [
  "Considering purchase",
  "Bought",
  "Skipped",
  "Sent for grading",
  "Listed for sale",
  "Sold",
  "Holding",
  "Re-evaluation",
] as const;

export const userProfileSchema = z.object({
  ip: z.enum(ipOptions),
  favoriteTcgs: z.array(z.enum(favoriteTcgOptions)).default(["One Piece"]),
  playerType: z.enum(playerTypeOptions).default("Hybrid Collector-Seller"),
  budgetRange: z.enum(budgetRangeOptions).default("$300"),
  goal: z.enum(goalOptions),
  todayBudget: z.number().min(0).default(300),
  monthlyBudget: z.number().min(0),
  riskLevel: z.enum(riskOptions),
  holdingPeriod: z.enum(holdingOptions),
  gradingPreference: z.enum(gradingOptions),
  preferredMarket: z.enum(marketOptions),
  favoriteCharacters: z.string().trim().default(""),
});

export const planInputSchema = z.object({
  ip: z.enum(ipOptions),
  theme: z.string().trim().min(1),
  budget: z.number().positive(),
  goal: z.enum(goalOptions),
  riskLevel: z.enum(riskOptions),
  holdingPeriod: z.enum(holdingOptions),
  gradingPreference: z.enum(gradingOptions),
  preferredMarket: z.enum(marketOptions),
  notes: z.string().trim().default(""),
});

export const listingRiskInputSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  price: z.number().min(0),
  marketplace: z.enum(marketOptions),
  userGoal: z.enum(["Self-collection", "Grading", "Resale"]),
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

export const fomoCheckInputSchema = z.object({
  cardName: z.string().trim().min(1),
  cardVersion: z.string().trim().default(""),
  askingPrice: z.number().min(0),
  todayBudget: z.number().min(0).default(0),
  monthlyBudget: z.number().min(0),
  budgetRange: z.enum(budgetRangeOptions),
  versionConfirmed: z.boolean().default(true),
  feelingText: z.string().trim().min(1),
  evidenceText: z.string().trim().default(""),
});

export const fomoMetricSchema = z.object({
  score: z.number().int().min(0).max(100),
  label: z.enum(["Low", "Medium", "High"]),
  reasons: z.array(z.string()).min(1).max(4),
});

export const fomoCheckResultSchema = z.object({
  decisionPosture: z.enum(["Cool", "Warm", "Hot", "Overheated"]),
  nextStep: z.enum(["Pause", "Ask for evidence", "Run math", "Proceed within guardrails"]),
  fomoHeat: fomoMetricSchema,
  budgetStrain: fomoMetricSchema,
  evidenceStrength: fomoMetricSchema,
  versionClarity: fomoMetricSchema,
  hardStop: z.boolean(),
  cooldownRecommended: z.boolean(),
  warmSummary: z.string(),
  guardrail: z.string(),
});

export const marketCheckDecisionSchema = z.enum(["Buy", "Ask seller", "Wait", "Pause"]);
export const marketCheckConfidenceSchema = z.enum(["low", "medium", "high"]);

export const marketCheckSourceSchema = z.object({
  label: z.string(),
  url: z.string().nullable().default(null),
  status: z.enum(["used", "missing", "unavailable"]),
  note: z.string(),
});

export const marketCheckToolTraceSchema = z.object({
  step: z.string(),
  tool: z.string(),
  model: z.string(),
  summary: z.string(),
  sources: z.array(marketCheckSourceSchema).default([]),
});

export const marketCheckRequestSchema = z.object({
  cardName: z.string().trim().min(1),
  cardVersion: z.string().trim().default(""),
  tcg: z.enum(favoriteTcgOptions).default("Pokemon"),
  askingPrice: z.number().min(0),
  feelingText: z.string().trim().min(1),
  evidenceText: z.string().trim().default(""),
  profile: userProfileSchema,
});

export const identifiedCardSchema = z.object({
  cardName: z.string(),
  version: z.string(),
  tcg: z.enum(favoriteTcgOptions),
  confidence: marketCheckConfidenceSchema,
  candidates: z.array(z.object({
    name: z.string(),
    version: z.string(),
    source: z.string(),
    imageUrl: z.string().nullable().default(null),
    url: z.string().nullable().default(null),
  })),
  missing: z.array(z.string()),
});

export const referencePricesSchema = z.object({
  available: z.boolean(),
  source: z.string(),
  rawLow: z.number().nullable(),
  rawMid: z.number().nullable(),
  rawHigh: z.number().nullable(),
  psa9: z.number().nullable(),
  psa10: z.number().nullable(),
  notes: z.array(z.string()),
});

export const soldCompsSchema = z.object({
  available: z.boolean(),
  source: z.string(),
  manualCheckUrl: z.string().default(""),
  lookupQuery: z.string().default(""),
  comps: z.array(z.object({
    label: z.string(),
    price: z.number(),
    soldAt: z.string().nullable().default(null),
    url: z.string().nullable().default(null),
  })),
  notes: z.array(z.string()),
});

export const evidenceGapCheckSchema = z.object({
  score: z.number().int().min(0).max(100),
  gaps: z.array(z.string()),
  strengths: z.array(z.string()),
});

export const marketBudgetRulesSchema = z.object({
  hardStop: z.boolean(),
  budgetStrain: z.number().int().min(0).max(100),
  activeBudget: z.number(),
  remainingToday: z.number(),
  notes: z.array(z.string()),
});

export const marketCheckDecisionSummarySchema = z.object({
  decision: marketCheckDecisionSchema,
  confidence: marketCheckConfidenceSchema,
  summary: z.string(),
  nextActions: z.array(z.string()).min(1),
  assumptions: z.array(z.string()),
  missingInformation: z.array(z.string()),
});

export const marketCheckResponseSchema = z.object({
  input: marketCheckRequestSchema,
  identifiedCard: identifiedCardSchema,
  referencePrices: referencePricesSchema,
  soldComps: soldCompsSchema,
  evidence: evidenceGapCheckSchema,
  budget: marketBudgetRulesSchema,
  result: marketCheckDecisionSummarySchema,
  sources: z.array(marketCheckSourceSchema),
  trace: z.array(marketCheckToolTraceSchema),
  warnings: z.array(z.string()),
  fallbackUsed: z.boolean(),
  model: z.string(),
});

export const demoSessionSchema = z.object({
  signedIn: z.boolean(),
  mode: z.enum(["login", "signup"]),
  createdAt: z.string(),
});

export const tcgPurchaseSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  cardName: z.string().trim().min(1),
  cardVersion: z.string().trim().default(""),
  askingPrice: z.number().min(0),
  boughtAt: z.string(),
});

export const cooldownTicketSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  cardName: z.string().trim().min(1),
  cardVersion: z.string().trim().default(""),
  askingPrice: z.number().min(0),
  originalThesis: z.string().trim().min(1),
  missingEvidence: z.string().trim().default(""),
  decisionPosture: fomoCheckResultSchema.shape.decisionPosture,
  nextStep: fomoCheckResultSchema.shape.nextStep,
  createdAt: z.string(),
  revisitDate: z.string(),
  status: z.enum(["cooling", "reviewed", "skipped", "bought"]).default("cooling"),
});

export const decisionJournalEntrySchema = z.object({
  id: z.string(),
  tcg: z.enum(favoriteTcgOptions).default("One Piece"),
  cardName: z.string().trim().min(1),
  version: z.string().trim().default(""),
  date: z.string(),
  actionType: z.enum(journalActionOptions),
  price: z.number().min(0),
  userGoal: z.enum(goalOptions),
  tags: z.string().trim().default(""),
  sentiment: z.enum(journalSentimentOptions).default("Cautious"),
  thesis: z.string().trim().min(1),
  watchReason: z.string().trim().default(""),
  buyCondition: z.string().trim().default(""),
  sellCondition: z.string().trim().default(""),
  stopCondition: z.string().trim().default(""),
  risks: z.string().trim().default(""),
  missingInfo: z.string().trim().default(""),
  reviewDate: z.string().default(""),
  reviewStatus: z.enum(journalReviewStatusOptions).default("Needs review"),
  finalOutcome: z.string().trim().default(""),
  lessonsLearned: z.string().trim().default(""),
  assumedPsa10Probability: z.number().min(0).max(1).optional(),
  actualGrade: z.enum(actualGradeOptions).default("UNKNOWN"),
  source: z.enum(decisionSourceOptions).default("manual"),
  createdAt: z.string(),
});

export const decisionPlanItemSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  source: z.enum(["journal", "listing_risk", "raw_vs_slab"]),
  title: z.string().trim().min(1),
  cardName: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  dueDate: z.string(),
  status: z.enum(decisionPlanStatusOptions),
});

export const generatedPlanSchema = z.object({
  title: z.string(),
  posture: z.enum(["Conservative", "Balanced", "Aggressive"]),
  summary: z.string(),
  budgetSplit: z.array(z.string()).min(1),
  buyConditions: z.array(z.string()).min(1),
  doNotBuyConditions: z.array(z.string()).min(1),
  sellConditions: z.array(z.string()).min(1),
  risks: z.array(z.string()).min(1),
  nextActions: z.array(z.string()).min(1),
});

export const generatedPlanSetSchema = z.object({
  input: planInputSchema,
  generatedAt: z.string(),
  plans: z.array(generatedPlanSchema).length(3),
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

export const evidenceFieldSchema = z.object({
  value: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  source: z.enum(["explicit_title", "explicit_description", "inferred", "unknown"]),
});

export const conditionClaimSchema = z.object({
  claim: z.string(),
  source: z.enum(["seller_claim", "observed_photo", "inferred"]),
  confidence: z.enum(["high", "medium", "low"]),
});

export const listingEvidenceSchema = z.object({
  cardName: evidenceFieldSchema,
  setCode: evidenceFieldSchema,
  cardNumber: evidenceFieldSchema,
  language: evidenceFieldSchema,
  conditionClaims: z.array(conditionClaimSchema),
  sellerPolicy: z.object({
    returns: z.enum(["allowed", "none", "unspecified"]),
    shipping: z.string().nullable(),
  }),
  photosClaimed: z.object({
    front: z.boolean(),
    back: z.boolean(),
    corners: z.boolean(),
    edges: z.boolean(),
    surface: z.boolean(),
  }),
  missingEvidence: z.array(z.string()),
});

export const riskDimensionSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string()).max(3),
  triggeredRules: z.array(z.string()),
});

export const riskScoreSchema = z.object({
  overall: z.number().int().min(0).max(100),
  level: z.enum(["low", "medium", "high", "critical"]),
  verdict: z.string().max(120),
  dimensions: z.object({
    condition: riskDimensionSchema,
    versionClarity: riskDimensionSchema,
    priceVsComps: riskDimensionSchema,
    sellerPolicy: riskDimensionSchema,
    gradingViability: riskDimensionSchema,
  }),
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

export const pipelineMathResultSchema = z.object({
  input: rawVsSlabInputSchema,
  result: rawVsSlabResultSchema,
  toolUsed: z.literal("calculateRawVsSlab"),
  assumptionNotes: z.array(z.string()),
});

export const pipelineCriticResultSchema = z.object({
  passed: z.boolean(),
  finalRecommendation: z.string(),
  warnings: z.array(z.string()),
  bannedPhrasesFlagged: z.array(z.string()),
});

export const listingRiskPipelineResultSchema = z.object({
  listingInput: listingRiskInputSchema,
  evidence: listingEvidenceSchema,
  riskScore: riskScoreSchema,
  math: pipelineMathResultSchema,
  critic: pipelineCriticResultSchema,
});

export const hermesTaskTypeSchema = z.enum([
  "PLAN_GENERATION",
  "LISTING_RISK_CHECK",
  "LISTING_RISK_PIPELINE",
  "RAW_VS_SLAB_EXPLAIN",
  "JOURNAL_DRAFT",
]);

export const agentTraceStepSchema = z.object({
  step: z.string(),
  agent: z.string(),
  model: z.string(),
  summary: z.string(),
  toolsUsed: z.array(z.string()).default([]),
});

export const criticResultSchema = z.object({
  passed: z.boolean(),
  flags: z.array(z.string()),
  rewrittenSummary: z.string().nullable(),
});

export const journalDraftSchema = z.object({
  cardName: z.string(),
  actionType: z.enum(journalActionOptions),
  thesis: z.string(),
  buyCondition: z.string(),
  sellCondition: z.string(),
  stopCondition: z.string(),
  risks: z.string(),
  missingInfo: z.string(),
  reviewPrompt: z.string(),
});

export const hermesRequestSchema = z.object({
  taskHint: hermesTaskTypeSchema.optional(),
  profile: userProfileSchema.optional(),
  planInput: planInputSchema.optional(),
  listingInput: listingRiskInputSchema.optional(),
  rawInput: rawVsSlabInputSchema.optional(),
  rawResult: rawVsSlabResultSchema.optional(),
  journalEntry: decisionJournalEntrySchema.optional(),
  journalSummary: z.string().default(""),
});

export const hermesResponseSchema = z.object({
  taskType: hermesTaskTypeSchema,
  result: z.union([
    generatedPlanSetSchema,
    listingRiskReportSchema,
    listingRiskPipelineResultSchema,
    rawVsSlabResultSchema,
    journalDraftSchema,
  ]),
  trace: z.array(agentTraceStepSchema),
  warnings: z.array(z.string()),
  fallbackUsed: z.boolean(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type PlanInput = z.infer<typeof planInputSchema>;
export type ListingRiskInput = z.infer<typeof listingRiskInputSchema>;
export type RawVsSlabInput = z.infer<typeof rawVsSlabInputSchema>;
export type FomoCheckInput = z.infer<typeof fomoCheckInputSchema>;
export type FomoCheckResult = z.infer<typeof fomoCheckResultSchema>;
export type MarketCheckDecision = z.infer<typeof marketCheckDecisionSchema>;
export type MarketCheckRequest = z.infer<typeof marketCheckRequestSchema>;
export type MarketCheckResponse = z.infer<typeof marketCheckResponseSchema>;
export type MarketCheckSource = z.infer<typeof marketCheckSourceSchema>;
export type MarketCheckToolTrace = z.infer<typeof marketCheckToolTraceSchema>;
export type IdentifiedCard = z.infer<typeof identifiedCardSchema>;
export type ReferencePrices = z.infer<typeof referencePricesSchema>;
export type SoldComps = z.infer<typeof soldCompsSchema>;
export type EvidenceGapCheck = z.infer<typeof evidenceGapCheckSchema>;
export type MarketBudgetRules = z.infer<typeof marketBudgetRulesSchema>;
export type DemoSession = z.infer<typeof demoSessionSchema>;
export type TcgPurchase = z.infer<typeof tcgPurchaseSchema>;
export type CooldownTicket = z.infer<typeof cooldownTicketSchema>;
export type DecisionJournalEntry = z.infer<typeof decisionJournalEntrySchema>;
export type DecisionPlanItem = z.infer<typeof decisionPlanItemSchema>;
export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;
export type GeneratedPlanSet = z.infer<typeof generatedPlanSetSchema>;
export type ListingRiskReport = z.infer<typeof listingRiskReportSchema>;
export type ListingEvidence = z.infer<typeof listingEvidenceSchema>;
export type RiskScore = z.infer<typeof riskScoreSchema>;
export type RawVsSlabResult = z.infer<typeof rawVsSlabResultSchema>;
export type PipelineMathResult = z.infer<typeof pipelineMathResultSchema>;
export type PipelineCriticResult = z.infer<typeof pipelineCriticResultSchema>;
export type ListingRiskPipelineResult = z.infer<typeof listingRiskPipelineResultSchema>;
export type HermesTaskType = z.infer<typeof hermesTaskTypeSchema>;
export type AgentTraceStep = z.infer<typeof agentTraceStepSchema>;
export type CriticResult = z.infer<typeof criticResultSchema>;
export type JournalDraft = z.infer<typeof journalDraftSchema>;
export type HermesRequest = z.infer<typeof hermesRequestSchema>;
export type HermesResponse = z.infer<typeof hermesResponseSchema>;
export type AiPlanResult = GeneratedPlanSet;
export type AiListingRiskResult = ListingRiskReport;
