import { describe, expect, it, vi } from "vitest";
import {
  getOnePieceCard,
  mapOnePieceCardToIdentity,
  scoreOnePieceCard,
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
    // A fake card id/name that is NOT in the bundled catalog, so its presence in the
    // result can only come from the live dump — proving the merge path still works.
    const dump = [{ card_name: "Liveonlymon", card_set_id: "OP99-001", set_id: "OP-99" }];
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe("/api/allSetCards/");
      return new Response(JSON.stringify(dump));
    }) as unknown as typeof fetch;

    const result = await searchOnePieceCards({
      query: "liveonlymon",
      baseUrl: "https://www.optcgapi.com/api",
      fetcher,
    });

    expect(result.cards.map((card) => card.card_set_id)).toContain("OP99-001");
  });

  it("resolves a non-bundled card id via the live single-card endpoint", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe("/api/sets/card/OP99-099/");
      return new Response(JSON.stringify([{ card_name: "Liveonlymon", card_set_id: "OP99-099" }]));
    }) as unknown as typeof fetch;

    const result = await searchOnePieceCards({
      query: "Liveonlymon",
      cardNumber: "OP99-099",
      baseUrl: "https://www.optcgapi.com/api",
      fetcher,
    });

    expect(result.cards[0]?.card_set_id).toBe("OP99-099");
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

  it("scores dotted/partial names by token and gates single-typo fuzzy", () => {
    const luffy = { card_name: "Monkey.D.Luffy", card_set_id: "OP01-024" };
    const law = { card_name: "Trafalgar Law", card_set_id: "OP01-002" };
    const raw = { card_name: "Raw Meat", card_set_id: "OP01-999" };

    // "luffy" matches the dotted name; "law" matches the Trafalgar Law token.
    expect(scoreOnePieceCard(luffy, "luffy")).toBeGreaterThan(0);
    expect(scoreOnePieceCard(law, "law")).toBeGreaterThan(0);

    // A single-character typo on a one-word query of length >= 4 is forgiven.
    expect(scoreOnePieceCard(luffy, "puffy")).toBeGreaterThan(0);

    // But the short "law" must not fuzzy-match "raw".
    expect(scoreOnePieceCard(raw, "law")).toBe(0);
  });

  it("ranks an exact full-name match above a partial-token match", () => {
    const exact = { card_name: "Sanji", card_set_id: "OP01-013" };
    const partial = { card_name: "Sanji's Pilaf", card_set_id: "OP05-100" };

    expect(scoreOnePieceCard(exact, "sanji")).toBeGreaterThan(scoreOnePieceCard(partial, "sanji"));
  });

  it("narrows to the requested set instead of padding out with every print of the name", async () => {
    const offline = vi.fn(async () => {
      throw new Error("network disabled");
    }) as unknown as typeof fetch;

    // "Luffy" has 100+ prints across 30+ sets; "Luffy op15" means "just the OP-15
    // prints", not an arbitrary top slice of every set.
    const result = await searchOnePieceCards({ query: "luffy", setHint: "OP-15", fetcher: offline });
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.cards.every((card) => card.set_id === "OP-15")).toBe(true);
  });

  it("falls back to every print when the set hint matches nothing", async () => {
    const offline = vi.fn(async () => {
      throw new Error("network disabled");
    }) as unknown as typeof fetch;

    const withHint = await searchOnePieceCards({ query: "luffy", setHint: "OP-99", pageSize: 250, fetcher: offline });
    const withoutHint = await searchOnePieceCards({ query: "luffy", pageSize: 250, fetcher: offline });
    expect(withHint.cards.length).toBe(withoutHint.cards.length);
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
