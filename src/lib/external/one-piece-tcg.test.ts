import { describe, expect, it, vi } from "vitest";
import {
  getOnePieceCard,
  mapOnePieceCardToIdentity,
  searchOnePieceCards,
} from "@/lib/external/one-piece-tcg";

const luffyCard = {
  card_name: "Monkey.D.Luffy",
  card_set_id: "OP01-001",
  set_id: "OP-01",
  set_name: "Romance Dawn",
  rarity: "L",
  card_color: "Red",
  card_type: "Leader",
  card_image: "https://www.optcgapi.com/images/OP01-001.png",
  market_price: 4.5,
  inventory_price: 3.9,
};

describe("OPTCG (One Piece) adapter", () => {
  it("GUARANTEE: resolves common name queries with zero network", async () => {
    // A fetcher that always throws simulates the live OPTCG API being down or
    // blocked. The bundled catalog must still return a real card.
    const offline = vi.fn(async () => {
      throw new Error("network disabled");
    }) as unknown as typeof fetch;
    const base = "https://www.optcgapi.com/api";

    for (const term of ["luffy", "zoro", "law", "nami", "sanji"]) {
      const result = await searchOnePieceCards({ query: term, baseUrl: base, fetcher: offline });
      expect(result.cards.length).toBeGreaterThan(0);
      expect(result.cards.some((card) => card.card_name.toLowerCase().includes(term))).toBe(true);
    }
  });

  it("GUARANTEE: confirms a bundled card id without any network call", async () => {
    const offline = vi.fn(async () => {
      throw new Error("network disabled");
    }) as unknown as typeof fetch;

    const card = await getOnePieceCard({ cardSetId: "OP01-024", fetcher: offline });

    expect(card?.card_name).toBe("Monkey.D.Luffy");
    expect(offline).not.toHaveBeenCalled();
  });

  it("augments the bundled catalog with live-only cards when reachable", async () => {
    const dump = [{ card_name: "Kaido", card_set_id: "OP09-001", set_id: "OP-09" }];
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe("/api/allSetCards/");
      return new Response(JSON.stringify(dump));
    }) as unknown as typeof fetch;

    const result = await searchOnePieceCards({
      query: "kaido",
      baseUrl: "https://www.optcgapi.com/api",
      fetcher,
    });

    // "Kaido" is not in the bundled seed, so its presence proves the live merge.
    expect(result.cards.map((card) => card.card_set_id)).toContain("OP09-001");
  });

  it("resolves a non-bundled card id via the live single-card endpoint", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe("/api/sets/card/OP09-099/");
      return new Response(JSON.stringify([{ card_name: "Kaido", card_set_id: "OP09-099" }]));
    }) as unknown as typeof fetch;

    const result = await searchOnePieceCards({
      query: "Kaido",
      cardNumber: "OP09-099",
      baseUrl: "https://www.optcgapi.com/api",
      fetcher,
    });

    expect(result.cards[0]?.card_set_id).toBe("OP09-099");
  });

  it("tries the deck endpoint for a non-bundled card id not in the main sets", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      if (url.pathname.startsWith("/api/sets/card/")) {
        return new Response("Not found", { status: 404 });
      }
      expect(url.pathname).toBe("/api/decks/card/ST99-001/");
      return new Response(
        JSON.stringify({ card_name: "Some Promo", card_set_id: "ST99-001" }),
      );
    }) as unknown as typeof fetch;

    const card = await getOnePieceCard({
      cardSetId: "ST99-001",
      baseUrl: "https://www.optcgapi.com/api",
      fetcher,
    });

    expect(card?.card_set_id).toBe("ST99-001");
  });

  it("matches dotted/partial names by token and gates fuzzy to avoid false positives", async () => {
    const dump = [
      { card_name: "Monkey.D.Luffy", card_set_id: "OP01-001", set_id: "OP-01" },
      { card_name: "Roronoa Zoro", card_set_id: "OP01-025", set_id: "OP-01" },
      { card_name: "Trafalgar Law", card_set_id: "OP01-002", set_id: "OP-01" },
      { card_name: "Raw Meat", card_set_id: "OP01-999", set_id: "OP-01" },
    ];
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe("/api/allSetCards/");
      return new Response(JSON.stringify(dump));
    }) as unknown as typeof fetch;

    const base = "https://www.optcgapi.com/api";

    // "luffy" matches the "Monkey.D.Luffy" token despite the dots.
    const luffy = await searchOnePieceCards({ query: "luffy", baseUrl: base, fetcher });
    expect(luffy.cards[0]?.card_set_id).toBe("OP01-001");

    // "law" resolves Trafalgar Law by exact token and does NOT fuzzy-match "Raw".
    const law = await searchOnePieceCards({ query: "law", baseUrl: base, fetcher });
    expect(law.cards.map((card) => card.card_set_id)).toEqual(["OP01-002"]);

    // A single-character typo on a >=4 char token is forgiven: puffy -> luffy.
    const puffy = await searchOnePieceCards({ query: "puffy", baseUrl: base, fetcher });
    expect(puffy.cards[0]?.card_set_id).toBe("OP01-001");
  });

  it("ranks an exact full-name hit above a partial-token hit", async () => {
    const dump = [
      { card_name: "Sanji's Pilaf", card_set_id: "OP05-100", set_id: "OP-05" },
      { card_name: "Sanji", card_set_id: "OP01-013", set_id: "OP-01" },
    ];
    const fetcher = vi.fn(async () => new Response(JSON.stringify(dump))) as unknown as typeof fetch;

    const result = await searchOnePieceCards({
      query: "sanji",
      baseUrl: "https://www.optcgapi.com/api",
      fetcher,
    });

    expect(result.cards[0]?.card_set_id).toBe("OP01-013");
  });

  it("maps an OPTCG card onto the shared identity candidate shape", () => {
    const identity = mapOnePieceCardToIdentity(luffyCard, {
      confidence: "high",
      matchReasons: ["Confirmed card id appears in the listing."],
    });

    expect(identity.id).toBe("OP01-001");
    expect(identity.setCode).toBe("OP-01");
    expect(identity.setName).toBe("Romance Dawn");
    expect(identity.imageUrl).toBe("https://www.optcgapi.com/images/OP01-001.png");
    expect(identity.marketMid).toBe(4.5);
    expect(identity.language).toBe("EN");
  });

  it("drops non-http image values instead of failing identity validation", () => {
    const identity = mapOnePieceCardToIdentity(
      { card_name: "Nami", card_set_id: "OP01-016", card_image: "" },
      { confidence: "low", matchReasons: [] },
    );

    expect(identity.imageUrl).toBeNull();
    expect(identity.marketMid).toBeNull();
  });
});
