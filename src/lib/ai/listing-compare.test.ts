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
    name: "Umbreon VMAX",
    setCode: "SWSH7",
    cardNumber: "215/203",
    language: "English",
  },
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

  it("requires confirmation when identity input is ambiguous", async () => {
    const response = await runListingComparison({
      ...request,
      cardHint: { name: "", setCode: "", cardNumber: "", language: "English" },
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
      cardHint: { name: "Missingmon", setCode: "", cardNumber: "", language: "English" },
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
      cardHint: { name: "Dialga", setCode: "Team plasma", cardNumber: "N", language: "English" },
    }, { fetcher: plasmaFetcher });

    expect(response.status).toBe("needs_confirmation");
    expect(response.identityCandidates.map((card) => card.id)).toEqual(["bw10-65", "bw10-99"]);
    expect(response.identityCandidates.map((card) => card.cardNumber)).toEqual(["65/101", "99/101"]);
  });

  it("continues after the user confirms a catalog identity", async () => {
    const response = await runListingComparison({
      ...request,
      cardHint: { name: "", setCode: "", cardNumber: "", language: "English" },
      confirmedCardId: "swsh7-215",
    }, { fetcher });
    expect(response.status).toBe("complete");
    expect(response.confirmedCard?.id).toBe("swsh7-215");
    expect(response.confirmedCard?.rarity).toBe("Rare Rainbow");
    expect(response.confirmedCard?.setSymbolUrl).toBe("https://images.pokemontcg.io/swsh7/symbol.png");
  });
});
