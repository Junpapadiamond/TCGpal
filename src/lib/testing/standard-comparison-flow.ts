import type {
  ComparisonReport,
  ComparisonRequest,
  ConditionClaim,
  TcgGame,
} from "@/lib/schemas";

export type StandardComparisonEntryMode = "first_search" | "edit_search" | "new_search";

export type StandardComparisonFlowCard = {
  label: string;
  game: TcgGame;
  query: string;
  name: string;
  setCode: string;
  cardNumber: string;
  expectedCardId: string;
  entryMode: StandardComparisonEntryMode;
  desiredCondition?: ConditionClaim;
};

export type StandardComparisonFlowStep = {
  label: string;
  game: TcgGame;
  entryMode: StandardComparisonEntryMode;
  query: string;
  initialStatus: ComparisonReport["status"];
  finalStatus: ComparisonReport["status"];
  confirmationRequired: boolean;
  confirmedCardId: string | null;
  rankedChoiceCount: number;
  sourceResultCount: number;
  demoMode: boolean;
};

export type StandardComparisonFlowResult = {
  cards: StandardComparisonFlowStep[];
};

export type StandardComparisonFlowOptions = {
  cards?: StandardComparisonFlowCard[];
  compare: (request: ComparisonRequest) => Promise<ComparisonReport>;
};

export const STANDARD_COMPARISON_FLOW_CARDS: StandardComparisonFlowCard[] = [
  {
    label: "Pokemon explicit search: Umbreon VMAX 215/203",
    game: "pokemon",
    query: "Umbreon VMAX 215/203",
    name: "Umbreon VMAX",
    setCode: "SWSH7",
    cardNumber: "215/203",
    expectedCardId: "swsh7-215",
    entryMode: "first_search",
  },
  {
    label: "One Piece edit search: Monkey.D.Luffy OP01-024",
    game: "onePiece",
    query: "Monkey.D.Luffy OP01-024",
    name: "Monkey.D.Luffy",
    setCode: "OP-01",
    cardNumber: "OP01-024",
    expectedCardId: "OP01-024",
    entryMode: "edit_search",
  },
  {
    label: "Pokemon new search: Charizard 4/102",
    game: "pokemon",
    query: "Charizard 4/102",
    name: "Charizard",
    setCode: "BASE",
    cardNumber: "4/102",
    expectedCardId: "base1-4",
    entryMode: "new_search",
  },
  {
    label: "One Piece edit search: Roronoa Zoro OP01-001",
    game: "onePiece",
    query: "Roronoa Zoro OP01-001",
    name: "Roronoa Zoro",
    setCode: "OP-01",
    cardNumber: "OP01-001",
    expectedCardId: "OP01-001",
    entryMode: "edit_search",
  },
  {
    label: "Pokemon new search: Pikachu 25/165",
    game: "pokemon",
    query: "Pikachu 25/165",
    name: "Pikachu",
    setCode: "SV3PT5",
    cardNumber: "25/165",
    expectedCardId: "sv3pt5-25",
    entryMode: "new_search",
  },
  {
    // Variant-heavy step: OP01-016 spans a base print, five alternate arts, and an
    // SP CARD. Confirming the SP print keeps the multi-print identity path — the
    // class of bug where a confirmed SP compared regular alt arts — in the standard.
    label: "One Piece SP print search: Nami OP01-016 SP",
    game: "onePiece",
    query: "Nami OP01-016",
    name: "Nami",
    setCode: "OP-01",
    cardNumber: "OP01-016",
    expectedCardId: "OP01-016_p4",
    entryMode: "new_search",
  },
];

export function assertStandardComparisonFlowPlan(cards: StandardComparisonFlowCard[]) {
  if (cards.length < 5) {
    throw new Error("Standard comparison flow must search at least five cards in one session.");
  }
  const games = new Set(cards.map((card) => card.game));
  for (const game of ["pokemon", "onePiece"] satisfies TcgGame[]) {
    if (!games.has(game)) {
      throw new Error(`Standard comparison flow must include ${game} searches.`);
    }
  }
  if (cards[0]?.entryMode !== "first_search") {
    throw new Error("Standard comparison flow must begin with a first_search entry.");
  }
  if (cards.slice(1).some((card) => card.entryMode === "first_search")) {
    throw new Error("Only the first standard comparison flow entry may use first_search.");
  }
  if (!cards.some((card) => card.entryMode === "edit_search")) {
    throw new Error("Standard comparison flow must exercise edit_search between cards.");
  }
  if (!cards.some((card) => card.entryMode === "new_search")) {
    throw new Error("Standard comparison flow must exercise new_search between cards.");
  }
  const queries = new Set(cards.map((card) => card.query.trim().toLowerCase()));
  if (queries.size !== cards.length) {
    throw new Error("Standard comparison flow cards must use distinct search queries.");
  }
  for (const card of cards) {
    if (!card.query.trim() || !card.name.trim() || !card.cardNumber.trim() || !card.expectedCardId.trim()) {
      throw new Error(`Standard comparison flow card "${card.label}" is missing required identity fields.`);
    }
  }
}

export async function runStandardComparisonFlow({
  cards = STANDARD_COMPARISON_FLOW_CARDS,
  compare,
}: StandardComparisonFlowOptions): Promise<StandardComparisonFlowResult> {
  assertStandardComparisonFlowPlan(cards);

  const steps: StandardComparisonFlowStep[] = [];
  for (const card of cards) {
    const request = buildStandardComparisonRequest(card);
    const initial = await compare(request);
    const final = initial.status === "needs_confirmation"
      ? await compare({ ...initial.request, confirmedCardId: selectConfirmationId(initial, card) })
      : initial;

    steps.push({
      label: card.label,
      game: card.game,
      entryMode: card.entryMode,
      query: card.query,
      initialStatus: initial.status,
      finalStatus: final.status,
      confirmationRequired: initial.status === "needs_confirmation",
      confirmedCardId: final.confirmedCard?.id ?? null,
      rankedChoiceCount: final.rankedChoices.length,
      sourceResultCount: final.candidates.length,
      demoMode: final.demoMode,
    });
  }

  return { cards: steps };
}

export function buildStandardComparisonRequest(card: StandardComparisonFlowCard): ComparisonRequest {
  return {
    query: card.query,
    sourceListing: {
      marketplace: "eBay",
      url: "",
      title: "",
      description: "",
      price: null,
      shipping: null,
      claimedCondition: "Unknown",
      active: true,
      seller: {
        feedbackPercentage: null,
        feedbackCount: null,
        returnsAccepted: null,
        topRated: null,
        buyerProtection: null,
        subRatings: null,
      },
      evidence: {
        photoCount: 0,
        frontBackExplicit: false,
        closeupsExplicit: false,
        surfaceExplicit: false,
        identityExplicit: false,
        substantiveConditionNotes: false,
        missing: [],
      },
    },
    buyer: {
      country: "US",
      postalCode: "10001",
      taxRate: 0.08,
      desiredCondition: card.desiredCondition ?? "Near Mint",
    },
    cardHint: {
      game: card.game,
      name: card.name,
      setCode: card.setCode,
      cardNumber: card.cardNumber,
      language: "English",
      variant: "",
      gradingClaim: "",
    },
    manualCandidates: [],
    webDiscoveryMode: "off",
  };
}

function selectConfirmationId(report: ComparisonReport, card: StandardComparisonFlowCard): string {
  const expected = report.identityCandidates.find((candidate) => candidate.id === card.expectedCardId);
  if (expected) return expected.id;
  const highConfidence = report.identityCandidates.find((candidate) => candidate.confidence === "high");
  if (highConfidence) return highConfidence.id;
  const first = report.identityCandidates[0];
  if (first) return first.id;
  throw new Error(`Standard comparison flow could not confirm ${card.label}; no identity candidates returned.`);
}
