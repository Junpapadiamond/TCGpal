import type { DecisionJournalEntry, GeneratedPlanSet, UserProfile } from "./schemas";

const keys = {
  profile: "cardplan.profile",
  plan: "cardplan.latestPlan",
  journal: "cardplan.journalEntries",
};

export function loadProfile(): UserProfile | null {
  return loadJson<UserProfile | null>(keys.profile, null);
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

export function loadJournalEntries(): DecisionJournalEntry[] {
  return loadJson<DecisionJournalEntry[]>(keys.journal, []);
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
