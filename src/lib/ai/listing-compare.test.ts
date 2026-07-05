import { afterEach, describe, expect, it, vi } from "vitest";
import { applyQueryParser, applyQueryParserWithAi, runListingComparison } from "@/lib/ai/listing-compare";
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
      subRatings: null,
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
    variant: "",
    gradingClaim: "",
  },
  manualCandidates: [],
  webDiscoveryMode: "off",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// A 2-party rendezvous: each side blocks in `arrive()` until BOTH have arrived. If two async
// operations are dispatched sequentially rather than concurrently, the second never starts
// until the first fully resolves — but the first can't resolve because it's waiting on the
// second. That deadlocks (and the test times out), which is exactly the regression this proves.
function makeBarrier(parties: number) {
  let remaining = parties;
  let resolveAll: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveAll = resolve;
  });
  return {
    arrive: async () => {
      remaining -= 1;
      if (remaining <= 0) resolveAll();
      await ready;
    },
  };
}

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

  it("does not mix labeled demo inventory into a user-supplied comparison", async () => {
    const response = await runListingComparison(request, { fetcher });
    expect(comparisonReportSchema.safeParse(response).success).toBe(true);
    expect(response.confirmedCard?.id).toBe("swsh7-215");
    expect(response.confirmedCard?.cardNumber).toBe("215/203");
    expect(response.demoMode).toBe(false);
    expect(response.rankedChoices.length).toBe(4);
    expect(response.rankedChoices[0]?.role).toBe("best_value");
    expect(response.candidates.some((candidate) => candidate.demo)).toBe(false);
  });

  it("uses labeled demo inventory only for a pure card search with no live rows", async () => {
    const pureSearch: ComparisonRequest = {
      ...request,
      sourceListing: {
        ...request.sourceListing,
        marketplace: "eBay",
        url: "",
        title: "",
        description: "",
        price: null,
        shipping: null,
      },
      manualCandidates: [],
    };

    const response = await runListingComparison(pureSearch, { fetcher });

    expect(response.demoMode).toBe(true);
    expect(response.candidates.length).toBeGreaterThan(0);
    expect(response.candidates.every((candidate) => candidate.demo)).toBe(true);
    expect(response.candidates.every((candidate) => candidate.marketComparable === false)).toBe(true);
  });

  it("does not run expanded web discovery unless the buyer opts in", async () => {
    vi.stubEnv("EXA_API_KEY", "exa-test");
    vi.stubEnv("TAVILY_API_KEY", "tavily-test");
    vi.stubEnv("WEB_DISCOVERY", "1");
    const guardedFetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.exa.ai") || url.includes("api.tavily.com")) {
        throw new Error("web discovery should be opt-in");
      }
      return fetcher(input);
    }) as unknown as typeof fetch;

    const response = await runListingComparison(request, { fetcher: guardedFetcher });

    expect(response.webDiscoveries).toEqual([]);
    expect(response.trace.some((step) => step.step === "web_marketplace_discovery")).toBe(false);
  });

  it("keeps expanded discoveries as manual links and out of deterministic ranking", async () => {
    vi.stubEnv("EXA_API_KEY", "exa-test");
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubEnv("WEB_DISCOVERY", "1");
    const expandedFetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("api.exa.ai")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { includeDomains?: string[] };
        const domains = body.includeDomains ?? [];
        return new Response(JSON.stringify({
          results: domains.includes("mercari.com")
            ? [{
              title: "Mercari Umbreon VMAX 215/203 Evolving Skies Near Mint $1200",
              url: "https://www.mercari.com/us/item/m123",
              text: "Available raw single. Front and back photos shown.",
            }]
            : [],
        }));
      }
      return fetcher(input);
    }) as unknown as typeof fetch;

    const response = await runListingComparison({
      ...request,
      webDiscoveryMode: "expanded",
    }, { fetcher: expandedFetcher, now: () => new Date("2026-07-04T00:00:00.000Z") });

    expect(response.candidates.some((candidate) => candidate.webDiscovered)).toBe(false);
    expect(response.webDiscoveries.some((discovery) => discovery.marketplace === "Mercari")).toBe(true);
    expect(response.webDiscoveries.every((discovery) => discovery.rankedCandidateId === null)).toBe(true);
    expect(response.trace.find((step) => step.step === "web_marketplace_discovery")?.summary).toContain("manual review");
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
    expect(synthesisStep?.status).toBe("complete");
    expect(synthesisStep?.summary).toContain("without adding a model round trip");
  });

  it("uses an exact-URL Tavily rescue without presenting the successful fallback as a live-data failure", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tavily-test");
    vi.stubEnv("OPENAI_API_KEY", "");
    const mercariUrl = "https://www.mercari.com/us/item/mblocked/";
    const fallbackFetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://www.mercari.com/robots.txt") {
        return new Response("User-agent: *\nAllow: /\n");
      }
      if (url === mercariUrl) return new Response("blocked", { status: 403 });
      if (url === "https://api.tavily.com/extract") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { urls?: string[] };
        expect(body.urls).toEqual([mercariUrl]);
        return new Response(JSON.stringify({
          results: [{
            url: mercariUrl,
            title: "Umbreon VMAX 215/203 Evolving Skies Near Mint",
            raw_content: "Price $1,200.00. Shipping $5.00. Front and back photos.",
          }],
          failed_results: [],
        }));
      }
      return fetcher(input);
    }) as unknown as typeof fetch;

    const response = await runListingComparison({
      ...request,
      sourceListing: {
        ...request.sourceListing,
        marketplace: "Mercari",
        url: mercariUrl,
        title: "",
        description: "",
        price: null,
        shipping: null,
        claimedCondition: "Unknown",
      },
    }, { fetcher: fallbackFetcher });

    const rescued = response.candidates.find((candidate) => candidate.userSupplied);
    expect(rescued?.marketplace).toBe("Mercari");
    expect(rescued?.title).toContain("Umbreon VMAX");
    expect(rescued?.price).toBe(1200);
    expect(rescued?.shipping).toBe(5);
    expect(response.warnings.some((warning) => /Tavily|HTTP 403|pasted listing/i.test(warning))).toBe(false);
    const ingestion = response.trace.find((step) => step.step === "source_ingestion");
    expect(ingestion?.status).toBe("complete");
    expect(ingestion?.summary).toContain("Tavily Extract recovered stated facts");
  });

  it("requires confirmation when identity input is ambiguous", async () => {
    const response = await runListingComparison({
      ...request,
      cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
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
      cardHint: { game: "pokemon", name: "Missingmon", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
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
      cardHint: { game: "pokemon", name: "Dialga", setCode: "Team plasma", cardNumber: "N", language: "English", variant: "", gradingClaim: "" },
    }, { fetcher: plasmaFetcher });

    expect(response.status).toBe("needs_confirmation");
    expect(response.identityCandidates.map((card) => card.id)).toEqual(["bw10-65", "bw10-99"]);
    expect(response.identityCandidates.map((card) => card.cardNumber)).toEqual(["65/101", "99/101"]);
  });

  it("continues after the user confirms a catalog identity", async () => {
    const response = await runListingComparison({
      ...request,
      cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
      confirmedCardId: "swsh7-215",
    }, { fetcher });
    expect(response.status).toBe("complete");
    expect(response.confirmedCard?.id).toBe("swsh7-215");
    expect(response.confirmedCard?.rarity).toBe("Rare Rainbow");
    expect(response.confirmedCard?.setSymbolUrl).toBe("https://images.pokemontcg.io/swsh7/symbol.png");
  });

  it("passes a resolved eBay ePID through the crosswalk into Browse search", async () => {
    process.env.EBAY_CLIENT_ID = "id";
    process.env.EBAY_CLIENT_SECRET = "secret";
    const { resetEbayTokenCacheForTests } = await import("@/lib/external/ebay");
    resetEbayTokenCacheForTests();
    const seen: string[] = [];
    const ePidFetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("api.pokemontcg.io")) {
        return { ok: true, status: 200, json: async () => ({ data: catalogResponse.data[1] }) } as Response;
      }
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 7200 }) } as Response;
      }
      if (url.includes("/commerce/catalog/") && url.includes("/product_summary/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            productSummaries: [{
              epid: "19049841301",
              title: "Umbreon VMAX Evolving Skies 215/203",
              localizedAspects: [{ name: "Card Number", value: "215/203" }],
            }],
          }),
        } as Response;
      }
      if (url.includes("/buy/browse/v1/item_summary/search")) {
        const params = new URL(url).searchParams;
        expect(params.get("epid")).toBe("19049841301");
        expect(params.has("q")).toBe(false);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemSummaries: [{
              itemId: "v1|123|0",
              title: "Umbreon VMAX 215/203 Evolving Skies",
              condition: "Ungraded",
              price: { value: "420.00", currency: "USD" },
              shippingOptions: [{ shippingCost: { value: "6.00", currency: "USD" } }],
            }],
          }),
        } as Response;
      }
      if (url.includes("/buy/browse/v1/item/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemId: "v1|123|0",
            title: "Umbreon VMAX 215/203 Evolving Skies",
            condition: "Ungraded",
            conditionDescriptors: [{ name: "Card Condition", values: [{ content: "Near Mint" }] }],
            price: { value: "420.00", currency: "USD" },
            shippingOptions: [{ shippingCost: { value: "6.00", currency: "USD" } }],
          }),
        } as Response;
      }
      throw new Error(`network disabled in test: ${url}`);
    }) as unknown as typeof fetch;

    try {
      const response = await runListingComparison({
        ...request,
        sourceListing: { ...request.sourceListing, marketplace: "eBay", title: "", description: "", url: "", price: null, shipping: null },
        cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
        confirmedCardId: "swsh7-215",
      }, { fetcher: ePidFetcher });

      expect(seen.some((url) => url.includes("/commerce/catalog/"))).toBe(true);
      expect(response.trace.find((entry) => entry.step === "card_crosswalk")?.summary).toContain("eBay ePID 19049841301");
      expect(response.candidates.some((candidate) =>
        candidate.matchReasons.some((reason) => reason.includes("ePID 19049841301"))
      )).toBe(true);
      expect(response.demoMode).toBe(false);
    } finally {
      delete process.env.EBAY_CLIENT_ID;
      delete process.env.EBAY_CLIENT_SECRET;
      resetEbayTokenCacheForTests();
    }
  });

  it("hero search box: one free-text query auto-confirms exactly like the structured multi-field form", async () => {
    const response = await runListingComparison({
      ...request,
      query: "Umbreon VMAX 215/203",
      cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
    }, { fetcher });
    expect(response.status).toBe("complete");
    expect(response.confirmedCard?.id).toBe("swsh7-215");
    expect(response.trace.some((entry) => entry.actor === "Smart query parser")).toBe(true);
  });


  it("hero search box: an explicit structured cardHint field is not overwritten by the query parse", () => {
    const merged = applyQueryParser(
      {
        ...request,
        query: "Pikachu 25/102",
        cardHint: { game: "pokemon", name: "Umbreon VMAX", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
      },
      [],
    );
    // Explicit name wins over the query's parsed name ("Pikachu").
    expect(merged.cardHint.name).toBe("Umbreon VMAX");
    // Blank cardNumber is filled from the query's parsed collector number.
    expect(merged.cardHint.cardNumber).toBe("25/102");
  });

  it("hero search box: AI fills hints only when deterministic parsing has no structured signal", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_WIRE_API", "chat");
    vi.stubEnv("OPENAI_BASE_URL", "https://ai.test/v1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ game: "pokemon", name: "Umbreon VMAX", cardNumber: "", language: "", variant: "Alternate Art", gradingClaim: "" }) } }],
    }))));
    const trace: Parameters<typeof applyQueryParserWithAi>[1] = [];

    const merged = await applyQueryParserWithAi(
      {
        ...request,
        query: "big moon cat",
        cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
      },
      trace,
    );

    expect(merged.cardHint.name).toBe("Umbreon VMAX");
    expect(merged.cardHint.variant).toBe("Alternate Art");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(trace.some((entry) => entry.actor.toString().includes("AI query parser"))).toBe(true);
  });

  it("hero search box: structured regex parses skip the AI fallback", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubGlobal("fetch", vi.fn());

    const merged = await applyQueryParserWithAi(
      {
        ...request,
        query: "Umbreon VMAX 215/203",
        cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
      },
      [],
    );

    expect(merged.cardHint.cardNumber).toBe("215/203");
    expect(fetch).not.toHaveBeenCalled();
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
        cardHint: { game: "onePiece", name: "Monkey.D.Luffy", setCode: "OP-01", cardNumber: "OP01-024", language: "English", variant: "", gradingClaim: "" },
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
        cardHint: { game: "onePiece", name: "luffy", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
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
        cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
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

  it("dispatches the marketplace fan-out and reference pricing concurrently, not sequentially", async () => {
    process.env.EBAY_CLIENT_ID = "id";
    process.env.EBAY_CLIENT_SECRET = "secret";
    process.env.PRICECHARTING_API_TOKEN = "token";
    const { resetEbayTokenCacheForTests } = await import("@/lib/external/ebay");
    resetEbayTokenCacheForTests();

    const barrier = makeBarrier(2);
    const concurrentFetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.pokemontcg.io")) {
        if (new URL(url).pathname === "/v2/cards/swsh7-215") {
          return { ok: true, status: 200, json: async () => ({ data: catalogResponse.data[1] }) } as Response;
        }
        return { ok: true, status: 200, json: async () => catalogResponse } as Response;
      }
      if (url.includes("/identity/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 7200 }) } as Response;
      }
      if (url.includes("api.ebay.com/buy/browse")) {
        // Blocks until PriceCharting has also been dispatched — proves the two calls were
        // in flight at the same time (references no longer waits for the fan-out to finish).
        await barrier.arrive();
        return { ok: true, status: 200, json: async () => ({ itemSummaries: [] }) } as Response;
      }
      if (url.includes("pricecharting.com")) {
        await barrier.arrive();
        return { ok: true, status: 200, json: async () => ({ products: [] }) } as Response;
      }
      throw new Error(`unexpected fetch in concurrency test: ${url}`);
    }) as unknown as typeof fetch;

    try {
      const response = await runListingComparison(
        { ...request, cardHint: { game: "pokemon", name: "", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" }, confirmedCardId: "swsh7-215" },
        { fetcher: concurrentFetcher },
      );
      expect(response.status).not.toBe("needs_confirmation");
    } finally {
      delete process.env.EBAY_CLIENT_ID;
      delete process.env.EBAY_CLIENT_SECRET;
      delete process.env.PRICECHARTING_API_TOKEN;
      resetEbayTokenCacheForTests();
    }
  }, 5000);

  it("surfaces a lookup-unavailable warning (and retries) instead of a silent 'no match'", async () => {
    // The Pokémon catalog API is down: a transient failure must not look like
    // "this card doesn't exist". It should retry (3 attempts with backoff), then
    // report the real reason.
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
        cardHint: { game: "pokemon", name: "Zzqqx Nonexistent", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
      },
      { fetcher: failing },
    );

    expect(response.status).toBe("needs_confirmation");
    expect(response.identityCandidates).toEqual([]);
    expect(pokemonCalls).toBe(3); // one retry on transient failure
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
        cardHint: { game: "onePiece", name: "Luffy", setCode: "EB-02", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
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

  it("surfaces every same-number One Piece art variant before auto-confirming", async () => {
    // A number with alternate arts must open the version picker (not auto-confirm the
    // base) so the buyer can pick the exact print — and it must do so with zero
    // network, straight from the bundled variant catalog.
    const offline = (async () => {
      throw new Error("network disabled in test");
    }) as unknown as typeof fetch;

    const response = await runListingComparison(
      {
        ...request,
        sourceListing: { ...request.sourceListing, title: "", url: "", price: null },
        cardHint: { game: "onePiece", name: "Monkey.D.Luffy", setCode: "OP-01", cardNumber: "OP01-024", language: "English", variant: "", gradingClaim: "" },
      },
      { fetcher: offline },
    );

    expect(response.status).toBe("needs_confirmation");

    const prints = response.identityCandidates.filter((card) => card.cardNumber === "OP01-024");
    // Base art plus at least one alternate art, every one its own selectable print.
    expect(prints.length).toBeGreaterThan(1);
    expect(new Set(prints.map((card) => card.id)).size).toBe(prints.length);
    expect(new Set(prints.map((card) => card.imageUrl)).size).toBe(prints.length);

    // The base print carries no variant label; the parallels do.
    const base = prints.find((card) => card.id === "OP01-024");
    expect(base?.variant ?? null).toBeNull();
    const alts = prints.filter((card) => card.id !== "OP01-024");
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((card) => Boolean(card.variant))).toBe(true);
    // Each parallel's SAMPLE image is wired to its own print id (e.g. OP01-024_p1.png).
    expect(alts.every((card) => card.imageUrl?.endsWith(`${card.id}.png`))).toBe(true);
  });

  it("without a set, a One Piece name stays a set-grouped pick (no false high confidence)", async () => {
    const offline = (async () => {
      throw new Error("network disabled in test");
    }) as unknown as typeof fetch;

    const response = await runListingComparison(
      {
        ...request,
        sourceListing: { ...request.sourceListing, title: "", url: "" },
        cardHint: { game: "onePiece", name: "Luffy", setCode: "", cardNumber: "", language: "English", variant: "", gradingClaim: "" },
      },
      { fetcher: offline },
    );

    expect(response.status).toBe("needs_confirmation");
    expect(response.identityCandidates.length).toBeGreaterThan(1);
    expect(new Set(response.identityCandidates.map((card) => card.setCode)).size).toBeGreaterThan(1);
    expect(response.identityCandidates.every((card) => card.confidence !== "high")).toBe(true);
  });
});
