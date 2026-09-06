import { describe, expect, it, vi } from "vitest";
import catalog from "./one-piece-catalog.generated.json";

// Simulate an older bundle to exercise live augmentation with real OP16 rows.
vi.mock("./one-piece-catalog", () => ({
  onePieceCatalog: [], findOnePieceCatalogCard: () => undefined, findOnePieceCatalogVariants: () => [],
}));
import { searchOnePieceCards } from "./one-piece-tcg";

describe("live catalog artwork preservation", () => {
  it("retains both real Ace artworks when the live catalog fills a missing family", async () => {
    const prints = catalog.filter((card) => card.card_set_id === "OP16-001");
    const result = await searchOnePieceCards({ query: "Portgas.D.Ace", pageSize: 250,
      fetcher: async () => Response.json(prints) });
    expect(result.cards.map((card) => card.card_image_id)).toEqual(["OP16-001", "OP16-001_p1"]);
  });
});
