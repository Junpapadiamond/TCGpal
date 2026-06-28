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
  it("resolves a concrete card id through the single-card endpoint", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe("/api/sets/card/OP01-001/");
      return new Response(JSON.stringify([luffyCard]));
    }) as unknown as typeof fetch;

    const result = await searchOnePieceCards({
      query: "Luffy",
      cardNumber: "OP01-001",
      baseUrl: "https://www.optcgapi.com/api",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("optcg-api");
    expect(result.cards[0]?.card_set_id).toBe("OP01-001");
  });

  it("falls back to the full dump and filters by name when no id is given", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe("/api/allSetCards/");
      return new Response(
        JSON.stringify([
          luffyCard,
          { card_name: "Roronoa Zoro", card_set_id: "OP01-025" },
          { card_name: "Nami", card_set_id: "OP01-016" },
        ]),
      );
    }) as unknown as typeof fetch;

    const result = await searchOnePieceCards({
      query: "zoro",
      baseUrl: "https://www.optcgapi.com/api",
      fetcher,
    });

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.card_set_id).toBe("OP01-025");
  });

  it("tries the deck endpoint when a card id is not in the main sets", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      if (url.pathname.startsWith("/api/sets/card/")) {
        return new Response("Not found", { status: 404 });
      }
      expect(url.pathname).toBe("/api/decks/card/ST01-001/");
      return new Response(
        JSON.stringify({ card_name: "Monkey.D.Luffy", card_set_id: "ST01-001" }),
      );
    }) as unknown as typeof fetch;

    const card = await getOnePieceCard({
      cardSetId: "ST01-001",
      baseUrl: "https://www.optcgapi.com/api",
      fetcher,
    });

    expect(card?.card_set_id).toBe("ST01-001");
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
