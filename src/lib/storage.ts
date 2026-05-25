import {
  decisionJournalEntrySchema,
  userProfileSchema,
  type DecisionJournalEntry,
  type DecisionPlanItem,
  type GeneratedPlanSet,
  type RawVsSlabResult,
  type UserProfile,
} from "./schemas";

const keys = {
  profile: "cardplan.profile",
  plan: "cardplan.latestPlan",
  decisionPlanItems: "cardplan.decisionPlanItems",
  rawResult: "cardplan.latestRawResult",
  journal: "cardplan.journalEntries",
};

export function loadProfile(): UserProfile | null {
  const stored = loadJson<Partial<UserProfile> | null>(keys.profile, null);
  if (!stored) return null;

  const parsed = userProfileSchema.safeParse(stored);
  if (parsed.success) return parsed.data;

  return userProfileSchema.parse({
    ip: stored.ip ?? "One Piece",
    favoriteTcgs: stored.favoriteTcgs?.length ? stored.favoriteTcgs : [stored.ip === "Pokemon" ? "Pokemon" : "One Piece"],
    playerType: stored.playerType ?? "Hybrid Collector-Seller",
    budgetRange: stored.budgetRange ?? "$300",
    goal: stored.goal ?? "Collection + resale",
    monthlyBudget: stored.monthlyBudget ?? 300,
    riskLevel: stored.riskLevel ?? "Medium",
    holdingPeriod: stored.holdingPeriod ?? "3-6 months",
    gradingPreference: stored.gradingPreference ?? "Maybe",
    preferredMarket: stored.preferredMarket ?? "eBay",
    favoriteCharacters: stored.favoriteCharacters ?? "",
  });
}

export function saveProfile(profile: UserProfile) {
  saveJson(keys.profile, profile);
}

export function loadLatestPlan(): GeneratedPlanSet | null {
  return loadJson<GeneratedPlanSet | null>(keys.plan, null);
}

export function saveLatestPlan(plan: GeneratedPlanSet) {
  saveJson(keys.plan, plan);
}

export function loadDecisionPlanItems(): DecisionPlanItem[] {
  return loadJson<DecisionPlanItem[]>(keys.decisionPlanItems, []);
}

export function saveDecisionPlanItems(items: DecisionPlanItem[]) {
  saveJson(keys.decisionPlanItems, items);
}

export function loadLatestRawResult(): RawVsSlabResult | null {
  return loadJson<RawVsSlabResult | null>(keys.rawResult, null);
}

export function saveLatestRawResult(result: RawVsSlabResult) {
  saveJson(keys.rawResult, result);
}

export function loadJournalEntries(): DecisionJournalEntry[] {
  const stored = loadJson<unknown>(keys.journal, []);
  if (!Array.isArray(stored)) return [];

  return stored
    .map((entry) => decisionJournalEntrySchema.safeParse(entry))
    .filter((entry): entry is { success: true; data: DecisionJournalEntry } => entry.success)
    .map((entry) => entry.data);
}

export function saveJournalEntries(entries: DecisionJournalEntry[]) {
  saveJson(keys.journal, entries);
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}
