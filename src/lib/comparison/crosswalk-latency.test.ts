import { afterEach, expect, it, vi } from "vitest";
import { resolveCardCrosswalk, clearCrosswalkCache } from "./crosswalk";
import { resolveEbayProductForCard } from "@/lib/external/ebay";
import { resolveTcgplayerProductVariants } from "@/lib/external/tcgcsv";
import { cardIdentityCandidateSchema } from "@/lib/schemas";

vi.mock("@/lib/external/ebay", () => ({ resolveEbayProductForCard: vi.fn() }));
vi.mock("@/lib/external/tcgcsv", async importOriginal => ({ ...await importOriginal<object>(), resolveTcgplayerProductVariants: vi.fn() }));
afterEach(() => { clearCrosswalkCache(); vi.clearAllMocks(); });

it("starts independent catalog mappings together and isolates a failed eBay mapping", async () => {
  let failEbay!: (reason: Error) => void;
  vi.mocked(resolveEbayProductForCard).mockReturnValue(new Promise((_, reject) => { failEbay = reject; }));
  vi.mocked(resolveTcgplayerProductVariants).mockResolvedValue([]);
  const pending = resolveCardCrosswalk(cardIdentityCandidateSchema.parse({
    id: "base1-58", name: "Pikachu", setName: "Base", setCode: "BASE1", cardNumber: "58/102", language: "English", imageUrl: null, confidence: "high", matchReasons: [],
  }));
  try { expect(resolveTcgplayerProductVariants).toHaveBeenCalledOnce(); }
  finally { failEbay(new Error("Catalog unavailable")); await pending; }
  expect((await pending).ebayProduct).toBeNull();
});
