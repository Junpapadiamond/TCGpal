import { describe, expect, it } from "vitest";
import { runListingComparison } from "@/lib/ai/listing-compare";
import { cardIdentityCandidateSchema, comparisonReportSchema, type ComparisonRequest } from "@/lib/schemas";

// Keep the orchestration tests hermetic: stub the Pokémon catalog response so we
// never hit the live API. eBay/PriceCharting short-circuit on missing env creds
// before fetching, so the catalog endpoint is the only call the fetcher serves.
const catalogResponse = {
  data: [
    {
      id: "swsh9tg-TG23",
      name: "Umbreon VMAX",
      number: "TG23",
      set: { id: "swsh9tg", name: "Brilliant Stars Trainer Gallery", printedTotal: 30 },
      images: { small: "https://images.pokemontcg.io/swsh9tg/TG23.png", large: "https://images.pokemontcg.io/swsh9tg/TG23_hires.png" },
    },
    {
      id: "swsh7-215",
      name: "Umbreon VMAX",
      number: "215",
      rarity: "Rare Rainbow",
      set: {
        id: "swsh7",
        name: "Evolving Skies",
        printedTotal: 203,
        images: { symbol: "https://images.pokemontcg.io/swsh7/symbol.png" },
      },
      images: { small: "https://images.pokemontcg.io/swsh7/215.png", large: "https://images.pokemontcg.io/swsh7/215_hires.png" },
      tcgplayer: { url: "https://prices.pokemontcg.io/tcgplayer/swsh7-215", prices: { holofoil: { low: 300, mid: 350, high: 600, market: 420 } } },
    },
  ],
  page: 1,
  pageSize: 6,
  count: 2,
  totalCount: 2,
};

const fetcher = (async (input: RequestInfo | URL) => {
  if (String(input).includes("api.pokemontcg.io")) {
    if (new URL(String(input)).pathname === "/v2/cards/swsh7-215") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: catalogResponse.data[1] }),
      } as Response;
    }
    return { ok: true, status: 200, json: async () => catalogResponse } as Response;
  }
  throw new Error("network disabled in test");
}) as unknown as typeof fetch;

const request: ComparisonRequest = {
  sourceListing: {
    marketplace: "Facebook",
    url: "",
    title: "Umbreon VMAX Evolving Skies 215/203 raw",
    description: "Front and back photos, corner closeups, surface video. Clean copy with a tiny white dot.",
    price: 1240,
    shipping: 10,
    claimedCondition: "Near Mint",
    active: true,
    seller: {
      feedbackPercentage: null,
      feedbackCount: null,
      returnsAccepted: false,
      topRated: false,
      buyerProtection: false,
    },
    evidence: {
      photoCount: 8,
      frontBackExplicit: true,
      closeupsExplicit: true,
      surfaceExplicit: true,
      identityExplicit: true,
      substantiveConditionNotes: true,
      missing: [],
    },
  },
  buyer: {
    country: "US",
    postalCode: "10001",
    taxRate: 0.08,
    desiredCondition: "Unknown",
  },
  cardHint: {
    game: "pokemon" as const,
    name: "Umbreon VMAX",
    setCode: "SWSH7",
    cardNumber: "215/203",
    language: "English",
  },
  manualCandidates: [],
};

describe("listing comparison agent", () => {
  it("keeps identity metadata optional for older and demo responses", () => {
    const parsed = cardIdentityCandidateSchema.parse({
      id: "demo-card",
      name: "Demo card",
      setName: "Demo set",
      setCode: "DEMO",
      cardNumber: "1",
      language: "English",
      imageUrl: null,
      confidence: "high",
      matchReasons: [],
    });

    expect(parsed.rarity).toBeUndefined();
    expect(parsed.setSymbolUrl).toBeUndefined();
  });

  it("returns a schema-valid labeled demo report without marketplace credentials", async () => {
    const response = await runListingComparison(request, { fetcher });
    expect(comparisonReportSchema.safeParse(response).success).toBe(true);
    expect(response.confirmedCard?.id).toBe("swsh7-215");
    expect(response.confirmedCard?.cardNumber).toBe("215/203");
    expect(response.demoMode).toBe(true);
    expect(response.rankedChoices.length).toBe(3);
    expect(response.candidates.some((candidate) => candidate.demo)).toBe(true);
  });

  it("keeps optional/by-design degradations out of the result banner, in the trace only", async () => {
    // PriceCharting (optional reference pricing) and the AI->deterministic narrative
    // fallback are expected degradations, not live-data failures the buyer must act
    // on. They must not appear in `warnings` (the alarming result banner), but their
    // reason should remain visible in the technical trace.
    const response = await runListingComparison(request, { fetcher });

    expect(response.warnings.some((warning) => warning.includes("PRICECHARTING"))).toBe(false);
    expect(response.warnings.some((warning) => warning.includes("AI synthesis"))).toBe(false);

    const referenceStep = response.trace.find((step) => step.step === "reference_pricing");
    const synthesisStep = response.trace.find((step) => step.step === "evidence_synthesis");
    expect(referenceStep?.status).toBe("fallback");
    expect(synthesisStep?.status).toBe("fallback");
    expect(synthesisStep?.summary).toContain("local evidence summary");
  });

  it("requires confirmation when identity input is ambiguous", async () => {
    const response = await runListingComparison({
      ...request,
      cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English" },
    }, { fetcher });
    expect(response.status).toBe("needs_confirmation");
    expect(response.rankedChoices).toEqual([]);
  });

  it("does not substitute unrelated demo cards when the catalog has no match", async () => {
    const emptyCatalogFetcher = (async (input: RequestInfo | URL) => {
      if (String(input).includes("api.pokemontcg.io")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [], count: 0, totalCount: 0 }),
        } as Response;
      }
      throw new Error("network disabled in test");
    }) as unknown as typeof fetch;

    const response = await runListingComparison({
      ...request,
      sourceListing: { ...request.sourceListing, title: "" },
      cardHint: { game: "pokemon", name: "Missingmon", setCode: "", cardNumber: "", language: "English" },
    }, { fetcher: emptyCatalogFetcher });

    expect(response.status).toBe("needs_confirmation");
    expect(response.identityCandidates).toEqual([]);
  });

  it("finds Team Plasma Dialga cards when the collector number is unknown", async () => {
    const plasmaFetcher = (async (input: RequestInfo | URL) => {
      if (String(input).includes("api.pokemontcg.io")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: "bw10-65",
                name: "Dialga-EX",
                number: "65",
                subtypes: ["Basic", "EX", "Team Plasma"],
                set: { id: "bw10", name: "Plasma Blast", series: "Black & White", printedTotal: 101 },
              },
              {
                id: "bw10-99",
                name: "Dialga-EX",
                number: "99",
                subtypes: ["Basic", "EX", "Team Plasma"],
                set: { id: "bw10", name: "Plasma Blast", series: "Black & White", printedTotal: 101 },
              },
            ],
            count: 2,
            totalCount: 2,
          }),
        } as Response;
      }
      throw new Error("network disabled in test");
    }) as unknown as typeof fetch;

    const response = await runListingComparison({
      ...request,
      sourceListing: { ...request.sourceListing, title: "" },
      cardHint: { game: "pokemon", name: "Dialga", setCode: "Team plasma", cardNumber: "N", language: "English" },
    }, { fetcher: plasmaFetcher });

    expect(response.status).toBe("needs_confirmation");
    expect(response.identityCandidates.map((card) => card.id)).toEqual(["bw10-65", "bw10-99"]);
    expect(response.identityCandidates.map((card) => card.cardNumber)).toEqual(["65/101", "99/101"]);
  });

  it("continues after the user confirms a catalog identity", async () => {
    const response = await runListingComparison({
      ...request,
      cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English" },
      confirmedCardId: "swsh7-215",
    }, { fetcher });
    expect(response.status).toBe("complete");
    expect(response.confirmedCard?.id).toBe("swsh7-215");
    expect(response.confirmedCard?.rarity).toBe("Rare Rainbow");
    expect(response.confirmedCard?.setSymbolUrl).toBe("https://images.pokemontcg.io/swsh7/symbol.png");
  });

  it("routes One Piece requests to the bundled OPTCG catalog and confirms offline", async () => {
    // A throwing fetcher proves the One Piece path resolves with zero network:
    // the bundled catalog answers the confirm-by-id without any live call.
    const offline = (async () => {
      throw new Error("network disabled in test");
    }) as unknown as typeof fetch;

    const response = await runListingComparison(
      {
        ...request,
        cardHint: { game: "onePiece", name: "Monkey.D.Luffy", setCode: "OP-01", cardNumber: "OP01-024", language: "English" },
        confirmedCardId: "OP01-024",
      },
      { fetcher: offline },
    );

    expect(response.confirmedCard?.id).toBe("OP01-024");
    expect(response.confirmedCard?.name).toBe("Monkey.D.Luffy");
    expect(response.confirmedCard?.setName).toBe("Romance Dawn");
    expect(response.confirmedCard?.imageUrl).toBe(
      "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-024.png",
    );
    expect(response.trace.some((entry) => entry.actor === "One Piece catalog adapter")).toBe(true);
  });

  it("GUARANTEE: typing a One Piece name returns candidates even with no network", async () => {
    const offline = (async () => {
      throw new Error("network disabled in test");
    }) as unknown as typeof fetch;

    const response = await runListingComparison(
      {
        ...request,
        sourceListing: { ...request.sourceListing, title: "", url: "" },
        cardHint: { game: "onePiece", name: "luffy", setCode: "", cardNumber: "", language: "English" },
      },
      { fetcher: offline },
    );

    // The user-facing promise: search resolves to real options, not "no match".
    expect(response.identityCandidates.length).toBeGreaterThan(0);
    expect(
      response.identityCandidates.some((card) => card.name.toLowerCase().includes("luffy")),
    ).toBe(true);
  });

  it("ranks user-entered cross-platform listings in the same ledger", async () => {
    const response = await runListingComparison(
      {
        ...request,
        cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English" },
        confirmedCardId: "swsh7-215",
        manualCandidates: [
          { marketplace: "TCGplayer", url: "", title: "Umbreon VMAX 215/203", price: 980, shipping: 0, claimedCondition: "Near Mint" },
          { marketplace: "Mercari", url: "", title: "Umbreon VMAX alt art 215/203", price: 1150, shipping: 12, claimedCondition: "Lightly Played" },
        ],
      },
      { fetcher },
    );

    const marketplaces = response.candidates.map((candidate) => candidate.marketplace);
    expect(marketplaces).toContain("TCGplayer");
    expect(marketplaces).toContain("Mercari");
    expect(response.trace.some((entry) => entry.actor === "Cross-platform ledger")).toBe(true);
  });

  it("surfaces a lookup-unavailable warning (and retries) instead of a silent 'no match'", async () => {
    // The Pokémon catalog API is down: a transient failure must not look like
    // "this card doesn't exist". It should retry once, then report the real reason.
    let pokemonCalls = 0;
    const failing = (async (input: RequestInfo | URL) => {
      if (String(input).includes("api.pokemontcg.io")) {
        pokemonCalls += 1;
        throw new Error("503 Service Unavailable");
      }
      throw new Error("network disabled in test");
    }) as unknown as typeof fetch;

    const response = await runListingComparison(
      {
        ...request,
        sourceListing: { ...request.sourceListing, title: "", url: "" },
        cardHint: { game: "pokemon", name: "Zzqqx Nonexistent", setCode: "", cardNumber: "", language: "English" },
      },
      { fetcher: failing },
    );

    expect(response.status).toBe("needs_confirmation");
    expect(response.identityCandidates).toEqual([]);
    expect(pokemonCalls).toBe(2); // one retry on transient failure
    expect(response.warnings.some((w) => /Pok[eé]mon catalog lookup unavailable/i.test(w))).toBe(true);
  });

  it("ranks the requested One Piece set first and confirms it as high confidence", async () => {
    const offline = (async () => {
      throw new Error("network disabled in test");
    }) as unknown as typeof fetch;

    const response = await runListingComparison(
      {
        ...request,
        sourceListing: { ...request.sourceListing, title: "", url: "" },
        cardHint: { game: "onePiece", name: "Luffy", setCode: "EB-02", cardNumber: "", language: "English" },
      },
      { fetcher: offline },
    );

    expect(response.status).toBe("needs_confirmation");
    expect(response.identityCandidates[0]?.setCode).toBe("EB-02");
    expect(response.identityCandidates[0]?.confidence).toBe("high");
    // Every high-confidence candidate is from the requested set, not a different print.
    expect(
      response.identityCandidates
        .filter((card) => card.confidence === "high")
        .every((card) => card.setCode === "EB-02"),
    ).toBe(true);
  });

  it("without a set, a One Piece name stays a set-grouped pick (no false high confidence)", async () => {
    const offline = (async () => {
      throw new Error("network disabled in test");
    }) as unknown as typeof fetch;

    const response = await runListingComparison(
      {
        ...request,
        sourceListing: { ...request.sourceListing, title: "", url: "" },
        cardHint: { game: "onePiece", name: "Luffy", setCode: "", cardNumber: "", language: "English" },
      },
      { fetcher: offline },
    );

    expect(response.status).toBe("needs_confirmation");
    expect(response.identityCandidates.length).toBeGreaterThan(1);
    expect(new Set(response.identityCandidates.map((card) => card.setCode)).size).toBeGreaterThan(1);
    expect(response.identityCandidates.every((card) => card.confidence !== "high")).toBe(true);
  });
});
