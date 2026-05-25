import type { DecisionJournalEntry, ListingRiskInput, RawVsSlabInput, UserProfile } from "./schemas";

export type CuratedCardRecommendation = {
  id: string;
  tcg: UserProfile["favoriteTcgs"][number];
  cardName: string;
  version: string;
  rarity: string;
  personas: UserProfile["playerType"][];
  budgetRanges: UserProfile["budgetRange"][];
  suggestedRawPrice: number;
  suggestedPsa9Price: number;
  suggestedPsa10Price: number;
  psa10Probability: number;
  buyTone: string;
  riskFlags: string[];
  listingSample: ListingRiskInput;
};

export type JournalBasedRecommendation = {
  card: CuratedCardRecommendation;
  reason: string;
  score: number;
  signals: string[];
};

export const curatedRecommendations: CuratedCardRecommendation[] = [
  {
    id: "op-chopper-eb01-aa",
    tcg: "One Piece",
    cardName: "Tony Tony Chopper",
    version: "EB01 Japanese Alternate Art",
    rarity: "Alt Art",
    personas: ["Collector", "Hybrid Collector-Seller"],
    budgetRanges: ["$150", "$300", "$1000+", "Talk about it later"],
    suggestedRawPrice: 80,
    suggestedPsa9Price: 95,
    suggestedPsa10Price: 220,
    psa10Probability: 0.25,
    buyTone: "Only move forward if the listing has front/back photos, corner closeups, and clear Japanese EB01 version evidence.",
    riskFlags: ["Condition claims need photos", "Grading upside is sensitive", "Version clarity matters"],
    listingSample: {
      title: "Tony Tony Chopper EB01 Alt Art Japanese One Piece Mint",
      description: "Great condition, looks PSA10. No returns.",
      price: 120,
      marketplace: "eBay",
      userGoal: "Grading",
    },
  },
  {
    id: "pokemon-charizard-vstar-cz",
    tcg: "Pokemon",
    cardName: "Charizard VSTAR",
    version: "Crown Zenith",
    rarity: "Ultra Rare",
    personas: ["Collector", "Hybrid Collector-Seller", "Seller / Vendor"],
    budgetRanges: ["$150", "$300", "$1000+", "Talk about it later"],
    suggestedRawPrice: 65,
    suggestedPsa9Price: 78,
    suggestedPsa10Price: 155,
    psa10Probability: 0.28,
    buyTone: "Better as a disciplined inventory candidate than a chase-card bet; entry price and liquidity matter more than hype.",
    riskFlags: ["Population may be high", "Condition must be verified", "Grading margin needs sold comps"],
    listingSample: {
      title: "Charizard VSTAR Crown Zenith Ultra Rare Near Mint",
      description: "Near mint, front and back photos available. Returns accepted.",
      price: 65,
      marketplace: "eBay",
      userGoal: "Resale",
    },
  },
  {
    id: "riot-ahri-launch-preview",
    tcg: "League / Riot TCG",
    cardName: "Ahri",
    version: "Launch Preview",
    rarity: "Preview",
    personas: ["Collector", "Hybrid Collector-Seller"],
    budgetRanges: ["$50", "$150", "$300", "$1000+", "Talk about it later"],
    suggestedRawPrice: 35,
    suggestedPsa9Price: 45,
    suggestedPsa10Price: 95,
    psa10Probability: 0.2,
    buyTone: "Treat this as a watchlist candidate until the game has more liquidity and clearer market comps.",
    riskFlags: ["New-market liquidity", "No stable grading comps", "Collector-first only"],
    listingSample: {
      title: "Ahri Launch Preview Riot TCG near mint",
      description: "Clean card, front photo only.",
      price: 35,
      marketplace: "eBay",
      userGoal: "Self-collection",
    },
  },
  {
    id: "ygo-dark-magician-qcsr",
    tcg: "Yu-Gi-Oh",
    cardName: "Dark Magician",
    version: "25th Quarter Century Secret Rare",
    rarity: "QCSR",
    personas: ["Collector", "Hybrid Collector-Seller"],
    budgetRanges: ["$300", "$1000+", "Talk about it later"],
    suggestedRawPrice: 140,
    suggestedPsa9Price: 165,
    suggestedPsa10Price: 310,
    psa10Probability: 0.22,
    buyTone: "Treat this as a collector-first review; only consider grading if edges and foil surface are clearly documented.",
    riskFlags: ["Foil surface risk", "Version naming ambiguity", "High entry price"],
    listingSample: {
      title: "Dark Magician QCSR 25th Anniversary Mint",
      description: "Pack fresh. No closeups. No returns.",
      price: 140,
      marketplace: "eBay",
      userGoal: "Grading",
    },
  },
];

export function getCuratedRecommendations(profile: UserProfile) {
  const tcgs = profile.favoriteTcgs?.length ? profile.favoriteTcgs : ["One Piece"];
  const exact = curatedRecommendations.filter((card) =>
    tcgs.includes(card.tcg) &&
    card.personas.includes(profile.playerType) &&
    (profile.budgetRange === "Talk about it later" || card.budgetRanges.includes(profile.budgetRange)),
  );

  if (exact.length) return exact.slice(0, 4);

  return curatedRecommendations.filter((card) => tcgs.includes(card.tcg)).slice(0, 4);
}

export function getJournalBasedRecommendations(profile: UserProfile, entries: DecisionJournalEntry[]): JournalBasedRecommendation[] {
  const fallbackCards = getCuratedRecommendations(profile);
  const cards = Array.from(new Map([...curatedRecommendations, ...fallbackCards].map((card) => [card.id, card])).values());
  const journalSignals = buildJournalSignals(profile, entries);

  if (!entries.length) {
    return fallbackCards.map((card, index) => ({
      card,
      score: 100 - index,
      reason: "No journal pattern yet, so TCGpal is using your onboarding profile as the starting radar.",
      signals: ["profile-based fallback"],
    }));
  }

  return cards
    .map((card) => scoreCardFromJournal(card, profile, journalSignals))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
}

export function toRawVsSlabInput(card: CuratedCardRecommendation): RawVsSlabInput {
  return {
    rawPrice: card.suggestedRawPrice,
    psa10Price: card.suggestedPsa10Price,
    psa9Price: card.suggestedPsa9Price,
    otherPrice: Math.round(card.suggestedRawPrice * 0.55),
    gradingCost: 35,
    marketplaceFeeRate: 0.13,
    shippingCost: 5,
    psa10Probability: card.psa10Probability,
    psa9Probability: 0.4,
  };
}

export function toListingRiskInput(card: CuratedCardRecommendation): ListingRiskInput {
  return card.listingSample;
}

function buildJournalSignals(profile: UserProfile, entries: DecisionJournalEntry[]) {
  const recent = entries.slice(0, 8);
  const text = recent.map((entry) => [
    entry.cardName,
    entry.version,
    entry.tcg,
    entry.tags,
    entry.thesis,
    entry.watchReason,
    entry.risks,
    entry.lessonsLearned,
  ].join(" ")).join(" ").toLowerCase();
  const cautiousCount = recent.filter((entry) =>
    entry.sentiment === "Cautious" ||
    entry.sentiment === "Passed for now" ||
    entry.reviewStatus === "Needs review" ||
    /unclear|risk|condition|photo|version|liquidity|overpay|hype/i.test(`${entry.risks} ${entry.stopCondition} ${entry.missingInfo}`),
  ).length;
  const tcgCounts = new Map<UserProfile["favoriteTcgs"][number], number>();

  for (const entry of recent) {
    tcgCounts.set(entry.tcg, (tcgCounts.get(entry.tcg) ?? 0) + 1);
  }

  return {
    recent,
    text,
    cautiousCount,
    favoriteTerms: tokenize(`${profile.favoriteCharacters} ${text}`),
    tcgCounts,
  };
}

function scoreCardFromJournal(
  card: CuratedCardRecommendation,
  profile: UserProfile,
  signals: ReturnType<typeof buildJournalSignals>,
): JournalBasedRecommendation {
  const cardText = `${card.cardName} ${card.version} ${card.tcg} ${card.rarity} ${card.buyTone} ${card.riskFlags.join(" ")}`.toLowerCase();
  const matchedTerms = signals.favoriteTerms.filter((term) => cardText.includes(term));
  const signalsUsed: string[] = [];
  let score = 0;

  if (profile.favoriteTcgs.includes(card.tcg)) {
    score += 35;
    signalsUsed.push(`${card.tcg} matches your selected TCGs`);
  }

  if (card.personas.includes(profile.playerType)) {
    score += 18;
    signalsUsed.push(`fits ${profile.playerType.toLowerCase()} posture`);
  }

  if (profile.budgetRange === "Talk about it later" || card.budgetRanges.includes(profile.budgetRange)) {
    score += 16;
    signalsUsed.push(`respects ${profile.budgetRange} budget guardrail`);
  } else if (card.suggestedRawPrice <= profile.monthlyBudget) {
    score += 8;
    signalsUsed.push("raw guide is within monthly budget");
  }

  if (matchedTerms.length) {
    score += Math.min(30, matchedTerms.length * 10);
    signalsUsed.push(`matches journal terms: ${matchedTerms.slice(0, 3).join(", ")}`);
  }

  const priorTcgCount = signals.tcgCounts.get(card.tcg) ?? 0;
  if (priorTcgCount > 0) {
    score += Math.min(44, priorTcgCount * 22);
    signalsUsed.push(`${priorTcgCount} recent journal note${priorTcgCount === 1 ? "" : "s"} in ${card.tcg}`);
  }

  if (signals.text.includes(card.cardName.toLowerCase())) {
    score += 30;
    signalsUsed.push("matches a card name already in your journal");
  }

  if (signals.cautiousCount >= 2 && card.riskFlags.some((flag) => /condition|version|liquidity|margin|grading/i.test(flag))) {
    score += 10;
    signalsUsed.push("surfaces the same risk themes you have been recording");
  }

  if (profile.riskLevel === "Low" && card.psa10Probability < 0.23) {
    score -= 12;
    signalsUsed.push("lower PSA10 assumption keeps this as a cautious review");
  }

  const reason = signalsUsed.length
    ? `Recommended because it ${sentenceJoin(signalsUsed.slice(0, 3))}.`
    : "Recommended as a profile fit while TCGpal gathers more journal history.";

  return { card, score, reason, signals: signalsUsed };
}

function tokenize(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !commonTerms.has(token)),
    ),
  ).slice(0, 20);
}

function sentenceJoin(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

const commonTerms = new Set([
  "the",
  "and",
  "for",
  "with",
  "card",
  "cards",
  "condition",
  "version",
  "risk",
  "risks",
  "buy",
  "sell",
  "only",
  "review",
  "collection",
  "resale",
  "grading",
  "photos",
  "photo",
  "clear",
  "price",
]);
