import { defaultPlanInput, defaultProfile, defaultRawVsSlabInput } from "../../lib/sample-data";
import type { HermesRequest, HermesTaskType } from "../../lib/schemas";

export type HermesFixture = {
  name: string;
  expectedTask: HermesTaskType;
  request: HermesRequest;
};

export const hermesFixtures: HermesFixture[] = [
  {
    name: "risky PSA10 listing without back photo",
    expectedTask: "LISTING_RISK_CHECK",
    request: {
      profile: defaultProfile,
      listingInput: {
        title: "Tony Tony Chopper EB01 Alt Art Japanese One Piece Mint PSA10?",
        description: "Front photo only. Great condition, possible PSA10. No returns.",
        price: 120,
        marketplace: "eBay",
        userGoal: "Grading",
      },
      journalSummary: "",
    },
  },
  {
    name: "ambiguous version listing",
    expectedTask: "LISTING_RISK_CHECK",
    request: {
      profile: defaultProfile,
      listingInput: {
        title: "Chopper rare One Piece card",
        description: "Nice card, not sure exact set. Stock image.",
        price: 45,
        marketplace: "Mercari",
        userGoal: "Resale",
      },
      journalSummary: "",
    },
  },
  {
    name: "raw price too close to PSA10",
    expectedTask: "RAW_VS_SLAB_EXPLAIN",
    request: {
      profile: defaultProfile,
      rawInput: {
        ...defaultRawVsSlabInput,
        rawPrice: 140,
        psa10Price: 180,
        psa9Price: 90,
      },
      journalSummary: "",
    },
  },
  {
    name: "beginner over-concentrating budget",
    expectedTask: "PLAN_GENERATION",
    request: {
      profile: {
        ...defaultProfile,
        goal: "Collection + resale",
        riskLevel: "Low",
        monthlyBudget: 150,
      },
      planInput: {
        ...defaultPlanInput,
        budget: 150,
        riskLevel: "Low",
        theme: "one expensive manga rare",
        notes: "I am new and want to put everything into one chase card.",
      },
      journalSummary: "",
    },
  },
  {
    name: "buy decision above comp with risky listing",
    expectedTask: "BUY_SELL_DECISION",
    request: {
      profile: defaultProfile,
      decisionInput: {
        cardName: "Tony Tony Chopper EB01-006 AA",
        action: "Evaluate buy",
        askingPrice: 140,
        soldComp: 105,
        budget: 300,
        monthlyBudget: 300,
        goal: "Collection + resale",
        riskLevel: "Medium",
        holdingPeriod: "3-6 months",
        collectionNeed: "Nice to have",
        restockRisk: "High (reprint/promo likely)",
        versionNotes: "Confirm EB01-006 vs reprint.",
        listingInput: {
          title: "Chopper alt art One Piece 重封 box deal",
          description: "Front photo only. No returns.",
          price: 140,
          marketplace: "Local community",
          userGoal: "Resale",
          productType: "Single Card",
          sellerType: "Individual",
          sellerRating: "New / No history",
          returnsPolicy: "No returns",
        },
      },
      journalSummary: "",
    },
  },
  {
    name: "safe personal collection listing",
    expectedTask: "LISTING_RISK_CHECK",
    request: {
      profile: defaultProfile,
      listingInput: {
        title: "Pikachu Japanese promo card number shown",
        description: "Includes front/back photos, corner closeups, and surface angle photos. Personal collection sale.",
        price: 35,
        marketplace: "eBay",
        userGoal: "Self-collection",
      },
      journalSummary: "",
    },
  },
];
