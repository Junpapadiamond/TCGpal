import {
  cooldownTicketSchema,
  demoSessionSchema,
  decisionJournalEntrySchema,
  tcgPurchaseSchema,
  userProfileSchema,
  type CooldownTicket,
  type DemoSession,
  type DecisionJournalEntry,
  type DecisionPlanItem,
  type GeneratedPlanSet,
  type RawVsSlabResult,
  type TcgPurchase,
  type UserProfile,
} from "./schemas";

const keys = {
  profile: "cardplan.profile",
  plan: "cardplan.latestPlan",
  decisionPlanItems: "cardplan.decisionPlanItems",
  rawResult: "cardplan.latestRawResult",
  journal: "cardplan.journalEntries",
  demoSession: "cardplan.demoSession",
  purchases: "cardplan.todayPurchases",
  cooldownTickets: "cardplan.cooldownTickets",
};

export function loadProfile(): UserProfile | null {
  const stored = loadJson<Partial<UserProfile> | null>(keys.profile, null);
  if (!stored) return null;

  const parsed = userProfileSchema.safeParse(stored);
  if (parsed.success) return normalizeCurrentPhaseProfile(parsed.data);

  return normalizeCurrentPhaseProfile(userProfileSchema.parse({
    ip: stored.ip ?? "One Piece",
    favoriteTcgs: stored.favoriteTcgs?.length ? stored.favoriteTcgs : [stored.ip === "Pokemon" ? "Pokemon" : "One Piece"],
    playerType: stored.playerType ?? "Hybrid Collector-Seller",
    budgetRange: stored.budgetRange ?? "$300",
    goal: stored.goal ?? "Collection + resale",
    todayBudget: stored.todayBudget ?? 300,
    monthlyBudget: stored.monthlyBudget ?? 300,
    riskLevel: stored.riskLevel ?? "Medium",
    holdingPeriod: stored.holdingPeriod ?? "3-6 months",
    gradingPreference: stored.gradingPreference ?? "Maybe",
    preferredMarket: stored.preferredMarket ?? "eBay",
    favoriteCharacters: stored.favoriteCharacters ?? "",
  }));
}

export function saveProfile(profile: UserProfile) {
  saveJson(keys.profile, normalizeCurrentPhaseProfile(profile));
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

export function loadDemoSession(): DemoSession | null {
  const stored = loadJson<unknown>(keys.demoSession, null);
  const parsed = demoSessionSchema.safeParse(stored);
  return parsed.success && parsed.data.signedIn ? parsed.data : null;
}

export function saveDemoSession(session: DemoSession) {
  saveJson(keys.demoSession, session);
}

export function loadTodayPurchases(): TcgPurchase[] {
  const stored = loadJson<unknown>(keys.purchases, []);
  if (!Array.isArray(stored)) return [];

  const today = new Date().toISOString().slice(0, 10);
  return stored
    .map((purchase) => tcgPurchaseSchema.safeParse(purchase))
    .filter((purchase): purchase is { success: true; data: TcgPurchase } => purchase.success)
    .map((purchase) => purchase.data)
    .filter((purchase) => purchase.boughtAt.slice(0, 10) === today);
}

export function saveTodayPurchases(purchases: TcgPurchase[]) {
  saveJson(keys.purchases, purchases);
}

export function loadCooldownTickets(): CooldownTicket[] {
  const stored = loadJson<unknown>(keys.cooldownTickets, []);
  if (!Array.isArray(stored)) return [];

  return stored
    .map((ticket) => cooldownTicketSchema.safeParse(ticket))
    .filter((ticket): ticket is { success: true; data: CooldownTicket } => ticket.success)
    .map((ticket) => ticket.data);
}

export function saveCooldownTickets(tickets: CooldownTicket[]) {
  saveJson(keys.cooldownTickets, tickets);
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

function normalizeCurrentPhaseProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    ip: "Pokemon",
    favoriteTcgs: ["Pokemon"],
    budgetRange: profile.budgetRange || "$1000+",
    todayBudget: profile.todayBudget || Math.min(profile.monthlyBudget || 1000, 300),
    monthlyBudget: profile.monthlyBudget || 1000,
    favoriteCharacters: "Charizard, Umbreon, Giratina, Rayquaza, Gengar",
  };
}
