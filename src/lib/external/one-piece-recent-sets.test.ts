import { describe, expect, it, vi } from "vitest";
import official from "@/lib/testing/one-piece-op16-op17-official.json";
import { findOnePieceCatalogVariant, findOnePieceCatalogVariants } from "./one-piece-catalog";
import { mapOnePieceCardToIdentity, searchOnePieceCards } from "./one-piece-tcg";
import { comparisonCacheKey } from "@/lib/comparison/report-cache";
import { comparisonRequestSchema } from "@/lib/schemas";

describe("OP16 and OP17 artwork coverage", () => {
  it.each(official.sets)("includes every official $code print, including older-number inserts", ({ code, printIds }) => {
    expect(printIds).toHaveLength(code === "OP-16" ? 155 : 169);
    expect(printIds.filter((id) => !findOnePieceCatalogVariant(id))).toEqual([]);
  });

  it("keeps every same-code artwork independently searchable, reloadable and cacheable", async () => {
    const offline = vi.fn(async () => { throw new Error("Unexpected network"); });
    const numbers = new Set(official.sets.flatMap((set) => set.printIds.map((id) => id.split("_")[0])));
    const request = comparisonRequestSchema.parse({ sourceListing: { marketplace: "Other" }, buyer: {} });
    for (const number of numbers) {
      const expected = findOnePieceCatalogVariants(number);
      expect(expected.length, number).toBeGreaterThan(0);
      const result = await searchOnePieceCards({ query: number, cardNumber: number, pageSize: 250, fetcher: offline });
      expect(result.cards.map((row) => row.card_image_id)).toEqual(expected.map((row) => row.card_image_id));
      const identities = result.cards.map((row) => mapOnePieceCardToIdentity(row, { confidence: "high", matchReasons: [] }));
      expect(new Set(identities.map((card) => card.id)).size, number).toBe(expected.length);
      expect(new Set(identities.map((card) => card.imageUrl)).size, number).toBe(expected.length);
      expect(new Set(identities.map((card) => comparisonCacheKey(request, card.id))).size, number).toBe(expected.length);
      for (const identity of identities) expect(findOnePieceCatalogVariant(identity.id)?.card_image).toBe(identity.imageUrl);
    }
    expect(offline).not.toHaveBeenCalled();
  });

  it("finds OP17's Luffy insert by release even though its number is EB04-061", async () => {
    const result = await searchOnePieceCards({ query: "Luffy", setHint: "OP17", pageSize: 250 });
    expect(result.cards.map((row) => row.card_image_id)).toContain("EB04-061_p2");
    expect(result.cards.every((row) => row.set_name?.includes("Strongest Warriors"))).toBe(true);
  });
});
