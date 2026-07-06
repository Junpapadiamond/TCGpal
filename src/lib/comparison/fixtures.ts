import type { CardIdentityCandidate, ListingSeed } from "@/lib/schemas";

export const demoIdentities: CardIdentityCandidate[] = [
  {
    id: "swsh7-215",
    name: "Umbreon VMAX",
    setName: "Evolving Skies",
    setCode: "SWSH7",
    cardNumber: "215/203",
    language: "English",
    imageUrl: "https://images.pokemontcg.io/swsh7/215_hires.png",
    confidence: "high",
    matchReasons: ["Card name, set, and collector number match."],
  },
  {
    id: "swsh7-TG23",
    name: "Umbreon VMAX",
    setName: "Brilliant Stars Trainer Gallery",
    setCode: "SWSH9",
    cardNumber: "TG23/TG30",
    language: "English",
    imageUrl: "https://images.pokemontcg.io/swsh9tg/TG23_hires.png",
    confidence: "medium",
    matchReasons: ["Same Pokémon and card type, but a different set and number."],
  },
];

// Kept as an alias so existing imports read naturally; every seed shares the
// canonical pre-scored shape.
export type DemoListingSeed = ListingSeed;

// Demo inventory must never impersonate offers for a different card than the
// one the buyer confirmed (searching Zoro must not surface Umbreon fixtures).
// Each fixture profile is built directly against the confirmed card — id,
// image, a manual eBay search link, an unmistakably-labeled templated title —
// and the fake prices scale to the card's market anchor when one exists so
// the demo math reads coherently at any price level. Titles and reasons live
// inline with each seed, so adding or editing a profile cannot drift from the
// re-anchoring the way an external id-keyed lookup could.
export function demoListingSeedsFor(
  card: Pick<CardIdentityCandidate, "id" | "name" | "cardNumber" | "setName" | "imageUrl" | "marketMid">,
): DemoListingSeed[] {
  const cardLabel = `${card.name} ${card.cardNumber}`.trim();
  const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(cardLabel)}`;
  const market = typeof card.marketMid === "number" && card.marketMid > 0 ? card.marketMid : null;
  const scaled = (factor: number, fallback: number) =>
    market !== null ? Math.round(market * factor * 100) / 100 : fallback;
  const shared = {
    marketplace: "eBay" as const,
    url: searchUrl,
    cardId: card.id,
    matchConfidence: "high" as const,
    matchReasons: ["Labeled demo fixture anchored to the confirmed card — not a live offer."],
    active: true,
    raw: true,
    currency: "USD" as const,
    imageUrl: card.imageUrl,
    observedAt: new Date().toISOString(),
    demo: true,
    userSupplied: false,
  };
  return [
    {
      ...shared,
      id: "demo-ebay-value",
      title: `${cardLabel} ${card.setName} raw — demo listing`.trim(),
      price: scaled(0.93, 1225),
      shipping: 0,
      claimedCondition: "Lightly Played",
      seller: { feedbackPercentage: 99.6, feedbackCount: 846, returnsAccepted: true, topRated: false, buyerProtection: true, subRatings: null },
      evidence: {
        photoCount: 4,
        frontBackExplicit: true,
        closeupsExplicit: false,
        surfaceExplicit: false,
        identityExplicit: true,
        substantiveConditionNotes: true,
        missing: ["No corner closeups.", "No surface video or glare-free closeup."],
      },
    },
    {
      ...shared,
      id: "demo-ebay-safe",
      title: `${cardLabel} raw card, established seller — demo listing`,
      price: scaled(0.98, 1295),
      shipping: 8.95,
      claimedCondition: "Near Mint",
      seller: { feedbackPercentage: 100, feedbackCount: 4200, returnsAccepted: true, topRated: true, buyerProtection: true, subRatings: null },
      evidence: {
        photoCount: 5,
        frontBackExplicit: true,
        closeupsExplicit: true,
        surfaceExplicit: false,
        identityExplicit: true,
        substantiveConditionNotes: true,
        missing: ["Surface evidence is limited."],
      },
    },
    {
      ...shared,
      id: "demo-ebay-evidence",
      title: `${cardLabel} raw, front back corners surface video — demo listing`,
      price: scaled(1, 1320),
      shipping: 5,
      claimedCondition: "Near Mint",
      seller: { feedbackPercentage: 99.2, feedbackCount: 318, returnsAccepted: true, topRated: false, buyerProtection: true, subRatings: null },
      evidence: {
        photoCount: 9,
        frontBackExplicit: true,
        closeupsExplicit: true,
        surfaceExplicit: true,
        identityExplicit: true,
        substantiveConditionNotes: true,
        missing: [],
      },
    },
  ];
}

export const demoListingSeeds: DemoListingSeed[] = [
  {
    id: "demo-ebay-value",
    marketplace: "eBay",
    url: "https://www.ebay.com/sch/i.html?_nkw=Umbreon+VMAX+215%2F203",
    title: "Umbreon VMAX 215/203 Evolving Skies Alt Art - raw",
    cardId: "swsh7-215",
    matchConfidence: "high",
    matchReasons: ["Exact card number and set name appear in the title."],
    active: true,
    raw: true,
    currency: "USD",
    price: 1225,
    shipping: 0,
    claimedCondition: "Lightly Played",
    imageUrl: "https://images.pokemontcg.io/swsh7/215_hires.png",
    seller: {
      feedbackPercentage: 99.6,
      feedbackCount: 846,
      returnsAccepted: true,
      topRated: false,
      buyerProtection: true,
      subRatings: null,
    },
    evidence: {
      photoCount: 4,
      frontBackExplicit: true,
      closeupsExplicit: false,
      surfaceExplicit: false,
      identityExplicit: true,
      substantiveConditionNotes: true,
      missing: ["No corner closeups.", "No surface video or glare-free closeup."],
    },
    observedAt: new Date().toISOString(),
    demo: true,
    userSupplied: false,
  },
  {
    id: "demo-ebay-safe",
    marketplace: "eBay",
    url: "https://www.ebay.com/sch/i.html?_nkw=Umbreon+VMAX+215%2F203",
    title: "2021 Pokémon Umbreon VMAX 215/203 Alternate Art raw card",
    cardId: "swsh7-215",
    matchConfidence: "high",
    matchReasons: ["Exact collector number, year, and set match."],
    active: true,
    raw: true,
    currency: "USD",
    price: 1295,
    shipping: 8.95,
    claimedCondition: "Near Mint",
    imageUrl: "https://images.pokemontcg.io/swsh7/215_hires.png",
    seller: {
      feedbackPercentage: 100,
      feedbackCount: 4200,
      returnsAccepted: true,
      topRated: true,
      buyerProtection: true,
      subRatings: null,
    },
    evidence: {
      photoCount: 5,
      frontBackExplicit: true,
      closeupsExplicit: true,
      surfaceExplicit: false,
      identityExplicit: true,
      substantiveConditionNotes: true,
      missing: ["Surface evidence is limited."],
    },
    observedAt: new Date().toISOString(),
    demo: true,
    userSupplied: false,
  },
  {
    id: "demo-ebay-evidence",
    marketplace: "eBay",
    url: "https://www.ebay.com/sch/i.html?_nkw=Umbreon+VMAX+215%2F203",
    title: "Umbreon VMAX 215/203 raw - front back corners surface video",
    cardId: "swsh7-215",
    matchConfidence: "high",
    matchReasons: ["Exact number and version are explicitly stated."],
    active: true,
    raw: true,
    currency: "USD",
    price: 1320,
    shipping: 5,
    claimedCondition: "Near Mint",
    imageUrl: "https://images.pokemontcg.io/swsh7/215_hires.png",
    seller: {
      feedbackPercentage: 99.2,
      feedbackCount: 318,
      returnsAccepted: true,
      topRated: false,
      buyerProtection: true,
      subRatings: null,
    },
    evidence: {
      photoCount: 9,
      frontBackExplicit: true,
      closeupsExplicit: true,
      surfaceExplicit: true,
      identityExplicit: true,
      substantiveConditionNotes: true,
      missing: [],
    },
    observedAt: new Date().toISOString(),
    demo: true,
    userSupplied: false,
  },
];
