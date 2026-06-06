import type { DecisionJournalEntry, ListingRiskInput, RawVsSlabInput, UserProfile } from "./schemas";

export type CuratedCardRecommendation = {
  id: string;
  tcg: UserProfile["favoriteTcgs"][number];
  cardName: string;
  version: string;
  rarity: string;
  imageUrl?: string;
  imageSource?: string;
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
    id: "pokemon-mega-charizard-x-ex-phantasmal-flames-sir",
    tcg: "Pokemon",
    cardName: "Mega Charizard X ex",
    version: "Phantasmal Flames 125/094",
    rarity: "Special Illustration Rare",
    imageUrl: "https://images.pokemontcg.io/me2/125.png",
    imageSource: "Pokemon TCG API",
    personas: ["Collector", "Hybrid Collector-Seller", "Seller / Vendor"],
    budgetRanges: ["$1000+", "Talk about it later"],
    suggestedRawPrice: 820,
    suggestedPsa9Price: 760,
    suggestedPsa10Price: 1600,
    psa10Probability: 0.18,
    buyTone: "Treat as a flagship chase only after checking recent sold comps, print quality, and whether hype premium has cooled.",
    riskFlags: ["High hype premium", "Very condition-sensitive", "Entry price needs current sold comps"],
    listingSample: {
      title: "Mega Charizard X ex 125/094 Phantasmal Flames SIR Near Mint",
      description: "Near mint. Front and back photos available. No whitening visible.",
      price: 820,
      marketplace: "eBay",
      userGoal: "Resale",
    },
  },
  {
    id: "pokemon-umbreon-vmax-evolving-skies-alt",
    tcg: "Pokemon",
    cardName: "Umbreon VMAX",
    version: "Evolving Skies Alternate Art 215/203",
    rarity: "Secret Rare",
    imageUrl: "https://images.pokemontcg.io/swsh7/215.png",
    imageSource: "Pokemon TCG API",
    personas: ["Collector", "Hybrid Collector-Seller", "Seller / Vendor"],
    budgetRanges: ["$1000+", "Talk about it later"],
    suggestedRawPrice: 1300,
    suggestedPsa9Price: 1150,
    suggestedPsa10Price: 2200,
    psa10Probability: 0.16,
    buyTone: "Moonbreon is collector-icon territory; only review copies with clean edges, surface, centering, and recent sold-comparable support.",
    riskFlags: ["Icon premium", "High fake/repack attention", "PSA10 margin depends heavily on condition"],
    listingSample: {
      title: "Umbreon VMAX 215/203 Evolving Skies Alternate Art Near Mint",
      description: "Beautiful card. Front and back photos shown. Ships insured.",
      price: 1300,
      marketplace: "eBay",
      userGoal: "Self-collection",
    },
  },
  {
    id: "pokemon-giratina-v-lost-origin-alt",
    tcg: "Pokemon",
    cardName: "Giratina V",
    version: "Lost Origin Alternate Art 186/196",
    rarity: "Secret Rare",
    imageUrl: "https://images.pokemontcg.io/swsh11/186.png",
    imageSource: "Pokemon TCG API",
    personas: ["Collector", "Hybrid Collector-Seller", "Seller / Vendor"],
    budgetRanges: ["$300", "$1000+", "Talk about it later"],
    suggestedRawPrice: 390,
    suggestedPsa9Price: 330,
    suggestedPsa10Price: 750,
    psa10Probability: 0.2,
    buyTone: "Strong modern chase with durable demand, but raw grading upside should be checked against centering and surface photos first.",
    riskFlags: ["Centering matters", "Raw copies can be over-described", "High liquidity but volatile premium"],
    listingSample: {
      title: "Giratina V 186/196 Lost Origin Alternate Art Near Mint",
      description: "Clean raw copy. Includes front/back photos and corner closeups.",
      price: 390,
      marketplace: "eBay",
      userGoal: "Grading",
    },
  },
  {
    id: "pokemon-rayquaza-vmax-evolving-skies-alt",
    tcg: "Pokemon",
    cardName: "Rayquaza VMAX",
    version: "Evolving Skies Alternate Art 218/203",
    rarity: "Secret Rare",
    imageUrl: "https://images.pokemontcg.io/swsh7/218.png",
    imageSource: "Pokemon TCG API",
    personas: ["Collector", "Hybrid Collector-Seller", "Seller / Vendor"],
    budgetRanges: ["$300", "$1000+", "Talk about it later"],
    suggestedRawPrice: 520,
    suggestedPsa9Price: 450,
    suggestedPsa10Price: 950,
    psa10Probability: 0.18,
    buyTone: "Review as a grail-level Evolving Skies card; avoid raw copies unless photos clearly support the condition claim.",
    riskFlags: ["Evolving Skies premium", "Condition photos required", "PSA10 spread can compress"],
    listingSample: {
      title: "Rayquaza VMAX 218/203 Evolving Skies Alternate Art NM",
      description: "Near mint, front/back included. Minor factory edge mark possible.",
      price: 520,
      marketplace: "eBay",
      userGoal: "Self-collection",
    },
  },
  {
    id: "pokemon-gengar-vmax-fusion-strike-alt",
    tcg: "Pokemon",
    cardName: "Gengar VMAX",
    version: "Fusion Strike Alternate Art 271/264",
    rarity: "Secret Rare",
    imageUrl: "https://images.pokemontcg.io/swsh8/271.png",
    imageSource: "Pokemon TCG API",
    personas: ["Collector", "Hybrid Collector-Seller", "Seller / Vendor"],
    budgetRanges: ["$300", "$1000+", "Talk about it later"],
    suggestedRawPrice: 430,
    suggestedPsa9Price: 370,
    suggestedPsa10Price: 820,
    psa10Probability: 0.19,
    buyTone: "A major character chase; compare raw entry against PSA9 downside before assuming grading upside.",
    riskFlags: ["Character premium", "Surface/edge evidence needed", "Grading route needs conservative PSA10 odds"],
    listingSample: {
      title: "Gengar VMAX 271/264 Fusion Strike Alternate Art Near Mint",
      description: "Front photo only. Seller says mint and PSA10 candidate.",
      price: 430,
      marketplace: "eBay",
      userGoal: "Grading",
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
  const tcgs = profile.favoriteTcgs?.length ? profile.favoriteTcgs : ["Pokemon"];
  const exact = curatedRecommendations.filter((card) =>
    tcgs.includes(card.tcg) &&
    card.personas.includes(profile.playerType) &&
    (profile.budgetRange === "Talk about it later" || card.budgetRanges.includes(profile.budgetRange)),
  );

  if (exact.length) return exact.slice(0, 5);

  return curatedRecommendations.filter((card) => tcgs.includes(card.tcg)).slice(0, 5);
}

export function getJournalBasedRecommendations(profile: UserProfile, entries: DecisionJournalEntry[]): JournalBasedRecommendation[] {
  const fallbackCards = getCuratedRecommendations(profile);
  const selectedTcgs = profile.favoriteTcgs?.length ? profile.favoriteTcgs : ["Pokemon"];
  const cards = Array.from(new Map([...curatedRecommendations, ...fallbackCards].map((card) => [card.id, card])).values())
    .filter((card) => selectedTcgs.includes(card.tcg));
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
    .slice(0, 5);
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
