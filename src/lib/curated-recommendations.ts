import type { ListingRiskInput, RawVsSlabInput, UserProfile } from "./schemas";
import { listingRiskInputSchema, rawVsSlabInputSchema } from "./schemas";

export type CuratedCardRecommendation = {
  id: string;
  tcg: UserProfile["favoriteTcgs"][number];
  cardName: string;
  version: string;
  rarity: string;
  personas: UserProfile["playerType"][];
  budgetRange: UserProfile["budgetRange"][];
  suggestedRawPrice: number;
  suggestedPsa9Price: number;
  suggestedPsa10Price: number;
  psa10Probability: number;
  buyTone: string;
  riskFlags: string[];
  listingSample: ListingRiskInput;
};

export const curatedRecommendations: CuratedCardRecommendation[] = [
  {
    id: "op-chopper-eb01-aa",
    tcg: "One Piece",
    cardName: "Tony Tony Chopper",
    version: "EB01 Japanese Alternate Art",
    rarity: "Alt Art",
    personas: ["Collector", "Hybrid Collector-Seller"],
    budgetRange: ["$150", "$300", "Talk about it later"],
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
    id: "pokemon-pikachu-promo",
    tcg: "Pokemon",
    cardName: "Pikachu",
    version: "Japanese Promo",
    rarity: "Promo",
    personas: ["Collector", "Hybrid Collector-Seller"],
    budgetRange: ["$50", "$150", "Talk about it later"],
    suggestedRawPrice: 45,
    suggestedPsa9Price: 70,
    suggestedPsa10Price: 160,
    psa10Probability: 0.22,
    buyTone: "A reasonable watchlist card for collectors, but avoid paying slab-premium pricing for raw copies without clean surface photos.",
    riskFlags: ["Promo versions can be confused", "Surface scratches matter", "Raw entry must stay disciplined"],
    listingSample: {
      title: "Pikachu Japanese Promo Pokemon Card Clean Mint",
      description: "Nice card, see front photo. Not graded.",
      price: 45,
      marketplace: "eBay",
      userGoal: "Self-collection",
    },
  },
  {
    id: "ygo-dark-magician-qcr",
    tcg: "Yu-Gi-Oh",
    cardName: "Dark Magician",
    version: "Quarter Century Secret Rare",
    rarity: "QCSR",
    personas: ["Collector", "Seller / Vendor"],
    budgetRange: ["$150", "$300", "$1000+", "Talk about it later"],
    suggestedRawPrice: 140,
    suggestedPsa9Price: 165,
    suggestedPsa10Price: 360,
    psa10Probability: 0.18,
    buyTone: "Strong display appeal, but vendor-style buys need margin after fees and very clear surface/edge evidence.",
    riskFlags: ["Foil surface is hard to judge", "Condition spread affects liquidity", "Fee drag is meaningful"],
    listingSample: {
      title: "Dark Magician Quarter Century Secret Rare Near Mint",
      description: "Beautiful foil, looks perfect, front photo only.",
      price: 140,
      marketplace: "eBay",
      userGoal: "Resale",
    },
  },
  {
    id: "pokemon-charizard-vstar",
    tcg: "Pokemon",
    cardName: "Charizard VSTAR",
    version: "Crown Zenith",
    rarity: "Ultra Rare",
    personas: ["Hybrid Collector-Seller", "Seller / Vendor"],
    budgetRange: ["$50", "$150", "$300", "Talk about it later"],
    suggestedRawPrice: 65,
    suggestedPsa9Price: 80,
    suggestedPsa10Price: 170,
    psa10Probability: 0.28,
    buyTone: "Better as a disciplined inventory candidate than a chase-card bet; entry price and liquidity matter more than hype.",
    riskFlags: ["High population risk", "Margin depends on entry", "Avoid overpaying for raw"],
    listingSample: {
      title: "Charizard VSTAR Crown Zenith Pokemon NM Raw",
      description: "Fresh pull, sleeved immediately. Front and back photos included.",
      price: 65,
      marketplace: "eBay",
      userGoal: "Resale",
    },
  },
  {
    id: "league-ahri-first-edition",
    tcg: "League / Riot TCG",
    cardName: "Ahri",
    version: "Launch Preview",
    rarity: "Showcase",
    personas: ["Collector", "Hybrid Collector-Seller"],
    budgetRange: ["$50", "$150", "Talk about it later"],
    suggestedRawPrice: 55,
    suggestedPsa9Price: 70,
    suggestedPsa10Price: 155,
    psa10Probability: 0.2,
    buyTone: "Treat early Riot TCG cards as collection-first until market history is deeper; keep grading assumptions conservative.",
    riskFlags: ["Thin comps", "New-market liquidity", "Version history may shift"],
    listingSample: {
      title: "Ahri Launch Preview Riot TCG Showcase Card",
      description: "Early preview card, clean condition, limited photos.",
      price: 55,
      marketplace: "eBay",
      userGoal: "Self-collection",
    },
  },
];

export function getCuratedRecommendations(profile: UserProfile) {
  const selectedTcgs = profile.favoriteTcgs?.length ? profile.favoriteTcgs : [profile.ip === "Pokemon" ? "Pokemon" : "One Piece"];
  const matching = curatedRecommendations.filter((card) => {
    const tcgMatches = selectedTcgs.includes(card.tcg);
    const personaMatches = card.personas.includes(profile.playerType);
    const budgetMatches = profile.budgetRange === "Talk about it later" || card.budgetRange.includes(profile.budgetRange);
    return tcgMatches && personaMatches && budgetMatches;
  });

  if (matching.length) return matching.slice(0, 4);

  return curatedRecommendations.filter((card) => selectedTcgs.includes(card.tcg)).slice(0, 4);
}

export function toRawVsSlabInput(card: CuratedCardRecommendation): RawVsSlabInput {
  return rawVsSlabInputSchema.parse({
    rawPrice: card.suggestedRawPrice,
    psa10Price: card.suggestedPsa10Price,
    psa9Price: card.suggestedPsa9Price,
    otherPrice: Math.round(card.suggestedRawPrice * 0.55),
    gradingCost: 35,
    marketplaceFeeRate: 0.13,
    shippingCost: 5,
    psa10Probability: card.psa10Probability,
    psa9Probability: 0.4,
  });
}

export function toListingRiskInput(card: CuratedCardRecommendation): ListingRiskInput {
  return listingRiskInputSchema.parse(card.listingSample);
}
