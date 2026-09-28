import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardIdentityCandidate } from "@/lib/schemas";
import { resolveTcgplayerProductVariants, searchTcgplayerListings } from "@/lib/external/tcgcsv";
import { selectExactTcgplayerProduct } from "./crosswalk";
import { loadBrowseMarketReferences } from "./browse-market";

vi.mock("@/lib/external/tcgcsv", () => ({ resolveTcgplayerProductVariants: vi.fn(), searchTcgplayerListings: vi.fn() }));
vi.mock("./crosswalk", () => ({ selectExactTcgplayerProduct: vi.fn() }));
const card: CardIdentityCandidate = { id: "a", name: "Charizard", setName: "Base", setCode: "BS", cardNumber: "4/102", language: "English", imageUrl: null, confidence: "high", matchReasons: [] };

describe("bounded browse reference enrichment", () => {
  beforeEach(() => vi.resetAllMocks());
  it("checks at most 24 versions with four workers and retains the remaining cards", async () => {
    let active = 0;
    let peak = 0;
    vi.mocked(resolveTcgplayerProductVariants).mockImplementation(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return [];
    });
    vi.mocked(selectExactTcgplayerProduct).mockReturnValue({ productId: 1, groupId: 1 } as NonNullable<ReturnType<typeof selectExactTcgplayerProduct>>);
    vi.mocked(searchTcgplayerListings).mockResolvedValue({ product: null, seeds: [], anchor: { mid: 70, low: 60, high: 80, url: "https://www.tcgplayer.com/product/1", subTypeName: "Holofoil" }, asOf: "2026-09-28T00:00:00Z" });
    const result = await loadBrowseMarketReferences(Array.from({ length: 30 }, (_, i) => ({ ...card, id: String(i) })));
    expect(result.checked).toBe(24);
    expect(result.cards).toHaveLength(30);
    expect(result.cards.filter(c => c.marketSource === "tcgcsv")).toHaveLength(24);
    expect(peak).toBeLessThanOrEqual(4);
    expect(result.cards[24].marketMid).toBeUndefined();
  });
  it("preserves sourced catalog facts on failure and never prices an unresolved print", async () => {
    vi.mocked(resolveTcgplayerProductVariants).mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue([]);
    vi.mocked(selectExactTcgplayerProduct).mockReturnValue(null);
    const cards = [{ ...card, marketMid: 90, marketSource: "pokemontcg" as const, marketAsOf: "2026-09-27T00:00:00Z" }, { ...card, id: "b" }];
    const result = await loadBrowseMarketReferences(cards);
    expect(result.cards).toEqual(cards);
    expect(result.checked).toBe(2);
    expect(searchTcgplayerListings).not.toHaveBeenCalled();
  });
  it("does not start reference work for an already-cancelled request", async () => {
    await loadBrowseMarketReferences([card], AbortSignal.abort());
    expect(resolveTcgplayerProductVariants).not.toHaveBeenCalled();
  });
});
