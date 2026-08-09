// Report fixtures for the verdict-note work: the shared factory used by the unit
// tests, plus the review corpus the writer is read against before the flag is
// ever considered for production. These are test/review material only — they are
// never served as inventory (AGENTS.md: demo fixtures never become fallback data).
import type {
  ComparisonReport,
  ConditionClaim,
  NormalizedListing,
  RankedChoice,
} from "@/lib/schemas";

type ListingOverrides = Partial<NormalizedListing>;

export function listingFixture(overrides: ListingOverrides = {}): NormalizedListing {
  const price = overrides.price ?? 799.99;
  const shipping = overrides.shipping === undefined ? 34.25 : overrides.shipping;
  const estimatedTax = overrides.estimatedTax === undefined ? null : overrides.estimatedTax;
  const preTaxTotal = price + (shipping ?? 0);
  return {
    id: "pick-listing",
    marketplace: "eBay",
    url: "https://www.ebay.com/itm/1234567890",
    title: "Charizard ex Special Illustration Rare 199/165 Near Mint",
    cardId: "sv3pt5-199",
    matchConfidence: "high",
    matchReasons: ["Name and collector number match the confirmed print."],
    printMatch: "exact",
    printMatchConfidence: "high",
    printMatchReasons: ["Collector number and rarity wording match."],
    printPriceGuard: "none",
    matchAspectText: "",
    active: true,
    raw: true,
    currency: "USD",
    price,
    shipping,
    costComplete: shipping !== null,
    estimatedTax,
    preTaxTotal,
    estimatedLandedCost: estimatedTax === null ? null : preTaxTotal + estimatedTax,
    claimedCondition: "Near Mint",
    listingLanguage: "English",
    imageUrl: null,
    imageUrls: [],
    seller: {
      feedbackPercentage: 99.6,
      feedbackCount: 4120,
      returnsAccepted: false,
      topRated: true,
      buyerProtection: true,
      subRatings: null,
    },
    evidence: {
      photoCount: 10,
      frontBackExplicit: true,
      closeupsExplicit: true,
      surfaceExplicit: false,
      identityExplicit: true,
      substantiveConditionNotes: true,
      missing: [],
    },
    sellerTrustScore: 78,
    evidenceCompletenessScore: 71,
    conditionCompatibilityScore: 100,
    marketComparable: true,
    priceScore: 65,
    safetyScore: 74,
    valueScore: 86,
    riskLabel: "low_risk",
    trustNotes: [],
    eligible: true,
    eligibilityIssues: [],
    exclusionReasons: [],
    observedAt: "2026-08-10T15:00:00.000Z",
    demo: false,
    userSupplied: false,
    webDiscovered: false,
    ...overrides,
  };
}

export type ComparisonReportOptions = {
  pick?: ListingOverrides;
  rivals?: NormalizedListing[];
  rankedChoices?: RankedChoice[];
  desiredCondition?: ConditionClaim;
  claimedCondition?: ConditionClaim;
  userSupplied?: boolean;
  marketMid?: number | null;
  demoMode?: boolean;
  cardName?: string;
  cardNumber?: string;
  setCode?: string;
  setName?: string;
};

const DEFAULT_MARKET_MID = 888.88;

export function comparisonReport(options: ComparisonReportOptions = {}): ComparisonReport {
  const pick = listingFixture({
    ...(options.claimedCondition ? { claimedCondition: options.claimedCondition } : {}),
    ...(options.userSupplied ? { userSupplied: true, url: null } : {}),
    ...options.pick,
  });
  const rivals = options.rivals ?? [
    listingFixture({
      id: "cheap-rival",
      title: "Charizard ex 199/165 SIR",
      price: 776.03,
      shipping: 0,
      evidence: { photoCount: 1, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: true, substantiveConditionNotes: false, missing: ["Back photo"] },
      seller: { feedbackPercentage: 92.1, feedbackCount: 38, returnsAccepted: false, topRated: false, buyerProtection: true, subRatings: null },
      sellerTrustScore: 41,
      evidenceCompletenessScore: 18,
      safetyScore: 29,
      valueScore: 61,
      riskLabel: "higher_risk",
      trustNotes: ["Seller feedback is below the platform baseline."],
    }),
    listingFixture({
      id: "mid-rival",
      title: "Charizard ex 199/165 Special Illustration Rare",
      price: 845.5,
      shipping: 5.99,
      evidence: { photoCount: 4, frontBackExplicit: true, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: true, substantiveConditionNotes: false, missing: [] },
      sellerTrustScore: 69,
      evidenceCompletenessScore: 45,
      safetyScore: 62,
      valueScore: 73,
      riskLabel: "low_risk",
    }),
  ];
  const marketMid = options.marketMid === undefined ? DEFAULT_MARKET_MID : options.marketMid;

  return {
    status: "complete",
    request: {
      sourceListing: { url: "", title: "", price: null, shipping: null, marketplace: "eBay" },
      buyer: { country: "US", postalCode: "10003", taxRate: null, desiredCondition: options.desiredCondition ?? "Near Mint" },
      cardHint: {
        game: "pokemon",
        name: options.cardName ?? "Charizard ex",
        setCode: options.setCode ?? "SV3PT5",
        cardNumber: options.cardNumber ?? "199/165",
        language: "English",
        variant: "",
        gradingClaim: "",
      },
      manualCandidates: [],
    } as unknown as ComparisonReport["request"],
    identityCandidates: [],
    confirmedCard: {
      id: "sv3pt5-199",
      name: options.cardName ?? "Charizard ex",
      setName: options.setName ?? "151",
      setCode: options.setCode ?? "SV3PT5",
      cardNumber: options.cardNumber ?? "199/165",
      language: "English",
      imageUrl: null,
      confidence: "high",
      matchReasons: [],
      marketMid,
      marketSource: marketMid === null ? null : "tcgcsv",
      marketAsOf: marketMid === null ? null : "2026-08-10T06:00:00.000Z",
    } as unknown as ComparisonReport["confirmedCard"],
    candidates: [pick, ...rivals],
    rankedChoices: options.rankedChoices ?? [
      { role: "best_value", listingId: pick.id, label: "Best Value", reason: "Strongest combined read.", confidence: "high" },
    ],
    references: [],
    narrative: { summary: "Summary", cautions: [] },
    warnings: [],
    trace: [],
    platforms: [],
    webDiscoveries: [],
    outcome: "best_buy",
    demoMode: options.demoMode ?? false,
    generatedAt: "2026-08-10T15:00:00.000Z",
  } as unknown as ComparisonReport;
}

export type VerdictNoteReviewCase = {
  id: string;
  name: string;
  role: RankedChoice["role"];
  lang: "en" | "zh";
  report: ComparisonReport;
};

function withLensChoices(report: ComparisonReport): ComparisonReport {
  const [pick] = report.candidates;
  return {
    ...report,
    rankedChoices: [
      { role: "best_value", listingId: pick.id, label: "Best Value", reason: "Strongest combined read.", confidence: "high" },
      { role: "lowest_landed_cost", listingId: report.candidates[1]?.id ?? pick.id, label: "Cheapest", reason: "Lowest comparable total.", confidence: "high" },
      { role: "safest_listing", listingId: pick.id, label: "Safest", reason: "Strongest seller and evidence read.", confidence: "medium" },
      { role: "best_condition_evidence", listingId: pick.id, label: "Best documented", reason: "Most reviewable evidence.", confidence: "medium" },
    ],
  };
}

// The review corpus: one case per report shape the note has to survive. Read the
// generated notes against these fact sheets before the flag is turned on.
export const verdictNoteReviewCases: VerdictNoteReviewCase[] = [
  { id: "baseline-en", name: "Baseline Best Value pick (English)", role: "best_value", lang: "en", report: comparisonReport() },
  { id: "baseline-zh", name: "Baseline Best Value pick (Chinese)", role: "best_value", lang: "zh", report: comparisonReport() },
  {
    id: "no-market-anchor",
    name: "No market reference available",
    role: "best_value",
    lang: "en",
    report: comparisonReport({ marketMid: null, pick: { marketComparable: false, priceScore: 50 } }),
  },
  {
    id: "unknown-condition",
    name: "Seller stated no condition",
    role: "best_value",
    lang: "en",
    report: comparisonReport({ claimedCondition: "Unknown", pick: { conditionCompatibilityScore: 40, marketComparable: false } }),
  },
  {
    id: "non-nm-request",
    name: "Lightly Played request against the NM-only reference",
    role: "best_value",
    lang: "en",
    report: comparisonReport({ desiredCondition: "Lightly Played", claimedCondition: "Lightly Played", pick: { price: 640, marketComparable: false } }),
  },
  {
    id: "risky-seller",
    name: "Higher-risk seller (deterministic pass)",
    role: "best_value",
    lang: "en",
    report: comparisonReport({
      pick: { riskLabel: "higher_risk", sellerTrustScore: 31, seller: { feedbackPercentage: 88.4, feedbackCount: 21, returnsAccepted: false, topRated: false, buyerProtection: true, subRatings: null }, trustNotes: ["Seller feedback is below the platform baseline."] },
    }),
  },
  {
    id: "thin-evidence",
    name: "Almost nothing to review (deterministic wait)",
    role: "best_value",
    lang: "en",
    report: comparisonReport({
      pick: { evidenceCompletenessScore: 12, evidence: { photoCount: 1, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: true, substantiveConditionNotes: false, missing: ["Back photo", "Close-ups"] } },
    }),
  },
  {
    id: "thin-evidence-zh",
    name: "Almost nothing to review (Chinese)",
    role: "best_value",
    lang: "zh",
    report: comparisonReport({
      pick: { evidenceCompletenessScore: 12, evidence: { photoCount: 1, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: true, substantiveConditionNotes: false, missing: ["Back photo", "Close-ups"] } },
    }),
  },
  {
    id: "above-market",
    name: "Item price well over the reference (deterministic wait)",
    role: "best_value",
    lang: "en",
    report: comparisonReport({ pick: { price: 1066.66, shipping: 0 } }),
  },
  {
    id: "user-supplied",
    name: "Buyer-entered listing facts",
    role: "best_value",
    lang: "en",
    report: comparisonReport({ userSupplied: true, pick: { marketplace: "Other", evidenceCompletenessScore: 35 } }),
  },
  {
    id: "single-listing",
    name: "Only one comparable listing",
    role: "best_value",
    lang: "en",
    report: comparisonReport({ rivals: [] }),
  },
  {
    id: "cheapest-lens",
    name: "Cheapest lens selected",
    role: "lowest_landed_cost",
    lang: "en",
    report: withLensChoices(comparisonReport()),
  },
  {
    id: "safest-lens",
    name: "Safest lens selected",
    role: "safest_listing",
    lang: "en",
    report: withLensChoices(comparisonReport()),
  },
  {
    id: "documented-lens",
    name: "Best-documented lens selected",
    role: "best_condition_evidence",
    lang: "en",
    report: withLensChoices(comparisonReport()),
  },
  {
    id: "tax-known",
    name: "Estimated tax known (landed total)",
    role: "best_value",
    lang: "en",
    report: comparisonReport({ pick: { estimatedTax: 74.06 } }),
  },
  {
    id: "returns-unknown",
    name: "Return policy not verified",
    role: "best_value",
    lang: "en",
    report: comparisonReport({
      pick: { seller: { feedbackPercentage: 99.1, feedbackCount: 812, returnsAccepted: null, topRated: false, buyerProtection: true, subRatings: null } },
    }),
  },
  {
    id: "unverified-seller",
    name: "No seller track record at all",
    role: "best_value",
    lang: "en",
    report: comparisonReport({
      pick: {
        riskLabel: "unverified",
        sellerTrustScore: 50,
        seller: { feedbackPercentage: null, feedbackCount: null, returnsAccepted: null, topRated: null, buyerProtection: null, subRatings: null },
        trustNotes: ["No seller track record was available; the score stays neutral."],
      },
    }),
  },
  {
    id: "japanese-listing",
    name: "Japanese-language listing",
    role: "best_value",
    lang: "en",
    report: comparisonReport({
      cardName: "Monkey.D.Luffy",
      cardNumber: "OP01-024",
      setCode: "OP-01",
      setName: "Romance Dawn",
      pick: { listingLanguage: "Japanese", title: "ワンピースカード ルフィ OP01-024 パラレル", cardId: "OP01-024" },
    }),
  },
  {
    id: "pick-is-cheapest",
    name: "Pick is also the cheapest comparable copy",
    role: "best_value",
    lang: "en",
    report: comparisonReport({ pick: { price: 690, shipping: 0 } }),
  },
  {
    id: "many-rivals",
    name: "Six rivals in a tight price band",
    role: "best_value",
    lang: "en",
    report: comparisonReport({
      rivals: [822.4, 838.75, 841.1, 849.99, 858.5, 863.25].map((price, index) => listingFixture({
        id: `rival-${index}`,
        title: `Charizard ex 199/165 copy ${index + 1}`,
        price,
        shipping: 0,
        evidence: { photoCount: 2 + index, frontBackExplicit: index > 1, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: true, substantiveConditionNotes: false, missing: [] },
        sellerTrustScore: 55 + index,
        evidenceCompletenessScore: 30 + index * 3,
        valueScore: 70 - index,
      })),
    }),
  },
  {
    id: "one-piece-manga-rare",
    name: "One Piece manga rare, no tax, strong evidence",
    role: "best_value",
    lang: "zh",
    report: comparisonReport({
      cardName: "Roronoa Zoro",
      cardNumber: "OP01-025",
      setCode: "OP-01",
      setName: "Romance Dawn",
      marketMid: 412.5,
      pick: {
        cardId: "OP01-025",
        title: "One Piece Zoro OP01-025 Manga Rare",
        price: 389.99,
        shipping: 12.5,
        evidence: { photoCount: 8, frontBackExplicit: true, closeupsExplicit: true, surfaceExplicit: true, identityExplicit: true, substantiveConditionNotes: true, missing: [] },
        evidenceCompletenessScore: 88,
      },
      rivals: [
        listingFixture({ id: "op-rival", title: "One Piece Zoro OP01-025", price: 375, shipping: 0, evidenceCompletenessScore: 22, sellerTrustScore: 47, riskLabel: "unverified", evidence: { photoCount: 2, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: true, substantiveConditionNotes: false, missing: ["Back photo"] } }),
      ],
    }),
  },
];
