import { z } from "zod";

export const ipOptions = ["One Piece", "Pokemon", "Yu-Gi-Oh", "Sports Cards", "Other"] as const;
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
export const productTypeOptions = ["Sealed Box", "Sealed Pack", "Single Card", "Other"] as const;
export const sellerTypeOptions = ["Official Distributor", "Marketplace Seller", "Individual", "Unknown"] as const;
export const sellerRatingOptions = [
  "High (98%+)",
  "Medium (90-97%)",
  "Low (under 90%)",
  "New / No history",
  "Unknown",
] as const;
export const returnsPolicyOptions = ["Returns accepted", "No returns", "Unknown"] as const;

export const userProfileSchema = z.object({
  ip: z.enum(ipOptions),
  goal: z.enum(goalOptions),
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
  // Optional authenticity / seller-credibility context (Phase 0: user-provided only, no scraping).
  productType: z.enum(productTypeOptions).optional(),
  sellerType: z.enum(sellerTypeOptions).optional(),
  sellerRating: z.enum(sellerRatingOptions).optional(),
  returnsPolicy: z.enum(returnsPolicyOptions).optional(),
  region: z.string().trim().optional(),
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

export const decisionJournalEntrySchema = z.object({
  id: z.string(),
  cardName: z.string().trim().min(1),
  version: z.string().trim().default(""),
  date: z.string(),
  actionType: z.enum(journalActionOptions),
  price: z.number().min(0),
  userGoal: z.enum(goalOptions),
  thesis: z.string().trim().min(1),
  buyCondition: z.string().trim().default(""),
  sellCondition: z.string().trim().default(""),
  stopCondition: z.string().trim().default(""),
  risks: z.string().trim().default(""),
  missingInfo: z.string().trim().default(""),
  reviewDate: z.string().default(""),
  finalOutcome: z.string().trim().default(""),
  lessonsLearned: z.string().trim().default(""),
  createdAt: z.string(),
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

export const authenticityAssessmentSchema = z.object({
  authenticityRisk: z.enum(["Low", "Medium", "Medium-High", "High"]),
  counterfeitSignals: z.array(z.string()),
  sellerCredibilitySignals: z.array(z.string()),
  authenticityQuestions: z.array(z.string()).min(1),
  authenticitySummary: z.string(),
});

export const listingRiskReportSchema = z.object({
  score: z.enum(["Low", "Medium", "Medium-High", "High"]),
  confidence: z.enum(["Low", "Medium-low", "Medium", "High"]),
  missingInfo: z.array(z.string()),
  keyRisks: z.array(z.string()).min(1),
  sellerQuestions: z.array(z.string()).min(1),
  suitability: z.string(),
  cautiousSummary: z.string(),
  authenticity: authenticityAssessmentSchema.optional(),
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

export const hermesTaskTypeSchema = z.enum([
  "PLAN_GENERATION",
  "LISTING_RISK_CHECK",
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
  rewrittenSummary: z.string().optional(),
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
  journalSummary: z.string().default(""),
});

export const hermesResponseSchema = z.object({
  taskType: hermesTaskTypeSchema,
  result: z.union([generatedPlanSetSchema, listingRiskReportSchema, rawVsSlabResultSchema, journalDraftSchema]),
  trace: z.array(agentTraceStepSchema),
  warnings: z.array(z.string()),
  fallbackUsed: z.boolean(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type PlanInput = z.infer<typeof planInputSchema>;
export type ListingRiskInput = z.infer<typeof listingRiskInputSchema>;
export type RawVsSlabInput = z.infer<typeof rawVsSlabInputSchema>;
export type DecisionJournalEntry = z.infer<typeof decisionJournalEntrySchema>;
export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;
export type GeneratedPlanSet = z.infer<typeof generatedPlanSetSchema>;
export type ListingRiskReport = z.infer<typeof listingRiskReportSchema>;
export type AuthenticityAssessment = z.infer<typeof authenticityAssessmentSchema>;
export type RawVsSlabResult = z.infer<typeof rawVsSlabResultSchema>;
export type HermesTaskType = z.infer<typeof hermesTaskTypeSchema>;
export type AgentTraceStep = z.infer<typeof agentTraceStepSchema>;
export type CriticResult = z.infer<typeof criticResultSchema>;
export type JournalDraft = z.infer<typeof journalDraftSchema>;
export type HermesRequest = z.infer<typeof hermesRequestSchema>;
export type HermesResponse = z.infer<typeof hermesResponseSchema>;
export type AiPlanResult = GeneratedPlanSet;
export type AiListingRiskResult = ListingRiskReport;
