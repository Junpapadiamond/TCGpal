import { describe, expect, it, vi } from "vitest";
import catalog from "./one-piece-catalog.generated.json";

// Simulate an older bundle to exercise live augmentation with real OP16 rows.
vi.mock("./one-piece-catalog", () => ({
  onePieceCatalog: [], findOnePieceCatalogCard: () => undefined, findOnePieceCatalogVariants: () => [],
}));
import { getOnePieceCard, searchOnePieceCards } from "./one-piece-tcg";

// Minimal projection of /api/sets/card/OP16-001/, observed 2026-09-06.
// The provider returns all prints at the NUMBER endpoint (the _p1 URL is 404),
// omits bundled enrichment fields, and sends counter_amount as a number.
const liveAce = [
  { card_name: "Portgas.D.Ace (001)", card_set_id: "OP16-001", card_image_id: "OP16-001", counter_amount: 0 },
  { card_name: "Portgas.D.Ace (001) (Alternate Art)", card_set_id: "OP16-001", card_image_id: "OP16-001_p1", counter_amount: 0 },
];

describe("live catalog artwork preservation", () => {
  it("retains both real Ace artworks when the live catalog fills a missing family", async () => {
    const prints = catalog.filter((card) => card.card_set_id === "OP16-001");
    const result = await searchOnePieceCards({ query: "Portgas.D.Ace", pageSize: 250,
      fetcher: async () => Response.json(prints) });
    expect(result.cards.map((card) => card.card_image_id)).toEqual(["OP16-001", "OP16-001_p1"]);
  });

  it("returns every artwork from a live number lookup, with the full count before pagination", async () => {
    const fetcher: typeof fetch = async (input) => {
      expect(new URL(String(input)).pathname).toBe("/api/sets/card/OP16-001/");
      return Response.json(liveAce);
    };
    const result = await searchOnePieceCards({ query: "Ace", cardNumber: "OP16-001", fetcher });
    expect(result.cards.map((card) => card.card_image_id)).toEqual(["OP16-001", "OP16-001_p1"]);
    const page = await searchOnePieceCards({ query: "Ace", cardNumber: "OP16-001", pageSize: 1, fetcher });
    expect(page.cards).toHaveLength(1);
    expect(page.count).toBe(2);
  });

  it.each(["OP16-001", "OP16-001_p1"])("reloads exactly %s from its number endpoint regardless of response order", async (id) => {
    const fetcher: typeof fetch = async (input) => {
      expect(new URL(String(input)).pathname).toBe("/api/sets/card/OP16-001/");
      return Response.json([...liveAce].reverse());
    };
    expect((await getOnePieceCard({ cardSetId: id, fetcher }))?.card_image_id).toBe(id);
  });

  it("never substitutes an alternate when the requested base print is absent", async () => {
    const fetcher: typeof fetch = async () => Response.json([{ ...liveAce[1], counter_amount: "0" }]);
    expect(await getOnePieceCard({ cardSetId: "OP16-001", fetcher })).toBeNull();
  });

  it("does not turn a failed number lookup into a different card with the same name", async () => {
    const otherAce = catalog.filter((card) => card.card_set_id === "OP07-053");
    expect(otherAce.length).toBeGreaterThan(0);
    const fetcher: typeof fetch = async () => Response.json(otherAce);
    expect(await getOnePieceCard({ cardSetId: "OP16-001", fetcher })).toBeNull();
    const result = await searchOnePieceCards({ query: "Ace", cardNumber: "OP16-001", fetcher });
    expect(result.cards).toEqual([]);
  });
});
