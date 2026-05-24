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

export type UserProfile = z.infer<typeof userProfileSchema>;
export type PlanInput = z.infer<typeof planInputSchema>;
export type ListingRiskInput = z.infer<typeof listingRiskInputSchema>;
export type RawVsSlabInput = z.infer<typeof rawVsSlabInputSchema>;
export type DecisionJournalEntry = z.infer<typeof decisionJournalEntrySchema>;

export type GeneratedPlan = {
  title: string;
  posture: "Conservative" | "Balanced" | "Aggressive";
  summary: string;
  budgetSplit: string[];
  buyConditions: string[];
  doNotBuyConditions: string[];
  sellConditions: string[];
  risks: string[];
  nextActions: string[];
};

export type GeneratedPlanSet = {
  input: PlanInput;
  generatedAt: string;
  plans: GeneratedPlan[];
};

export type ListingRiskReport = {
  score: "Low" | "Medium" | "Medium-High" | "High";
  confidence: "Low" | "Medium-low" | "Medium" | "High";
  missingInfo: string[];
  keyRisks: string[];
  sellerQuestions: string[];
  suitability: string;
  cautiousSummary: string;
};

export type RawVsSlabResult = {
  psa10NetValue: number;
  psa9NetValue: number;
  otherNetValue: number;
  expectedProfit: number;
  worstCaseOutcome: number;
  breakEvenPsa10Probability: number | null;
  recommendation: string;
  explanation: string;
  assumptions: string[];
};
