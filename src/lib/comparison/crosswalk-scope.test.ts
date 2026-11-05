import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCrosswalkCache, resolveCardCrosswalk } from "./crosswalk";
import { resolveEbayProductForCard } from "@/lib/external/ebay";
import { resolveTcgplayerProductVariants } from "@/lib/external/tcgcsv";
import { cardIdentityCandidateSchema } from "@/lib/schemas";

vi.mock("@/lib/external/ebay", () => ({ resolveEbayProductForCard: vi.fn(async () => null) }));
vi.mock("@/lib/external/tcgcsv", async importOriginal => ({ ...await importOriginal<object>(), resolveTcgplayerProductVariants: vi.fn(async () => []) }));

describe("crosswalk source selection", () => {
  beforeEach(() => { clearCrosswalkCache(); vi.clearAllMocks(); });
  it("keeps the reference while skipping eBay identity when eBay is not selected", async () => {
    const card = cardIdentityCandidateSchema.parse({ id: "OP01-016", name: "Nami", setName: "Romance Dawn", setCode: "OP01", cardNumber: "OP01-016", language: "English", confidence: "high", matchReasons: [] });
    await resolveCardCrosswalk(card, fetch, () => new Date(), undefined, { includeEbay: false });
    expect(resolveEbayProductForCard).not.toHaveBeenCalled();
    expect(resolveTcgplayerProductVariants).toHaveBeenCalledOnce();
    await resolveCardCrosswalk(card);
    expect(resolveEbayProductForCard).toHaveBeenCalledOnce();
  });
});
