import type { DecisionJournalEntry, PlanInput, RawVsSlabInput, UserProfile } from "./schemas";

export const defaultProfile: UserProfile = {
  ip: "One Piece",
  goal: "Collection + resale",
  monthlyBudget: 300,
  riskLevel: "Medium",
  holdingPeriod: "3-6 months",
  gradingPreference: "Maybe",
  preferredMarket: "eBay",
  favoriteCharacters: "Tony Tony Chopper, Nami, Law, Pikachu",
};

export const defaultPlanInput: PlanInput = {
  ip: "One Piece",
  theme: "Tony Tony Chopper",
  budget: 300,
  goal: "Collection + resale",
  riskLevel: "Medium",
  holdingPeriod: "3-6 months",
  gradingPreference: "Maybe",
  preferredMarket: "eBay",
  notes: "I want one representative Chopper card without overpaying for grading hype.",
};

export const defaultRawVsSlabInput: RawVsSlabInput = {
  rawPrice: 80,
  psa10Price: 220,
  psa9Price: 95,
  otherPrice: 45,
  gradingCost: 35,
  marketplaceFeeRate: 0.13,
  shippingCost: 5,
  psa10Probability: 0.5,
  psa9Probability: 0.4,
};

export const starterJournalEntry: DecisionJournalEntry = {
  id: "starter-chopper",
  cardName: "Tony Tony Chopper EB01-006 AA",
  version: "Japanese alternate art",
  date: new Date().toISOString().slice(0, 10),
  actionType: "Considering purchase",
  price: 80,
  userGoal: "Collection + resale",
  thesis: "I want one representative Chopper card that can stay in my collection while preserving resale flexibility.",
  buyCondition: "Only buy below $80 with clean front/back photos and clear version.",
  sellCondition: "Review if net profit exceeds 30% after fees or if I need to rotate budget.",
  stopCondition: "Skip if version is unclear or the raw-vs-slab math only works with an optimistic PSA10 assumption.",
  risks: "Version ambiguity, condition uncertainty, and low liquidity for lower-end cards.",
  missingInfo: "Back photo, corner closeups, recent sold comps.",
  reviewDate: "",
  finalOutcome: "",
  lessonsLearned: "",
  createdAt: new Date().toISOString(),
};
