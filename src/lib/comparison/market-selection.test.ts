import { describe, expect, it } from "vitest";
import { comparisonRequestSchema } from "@/lib/schemas";
import { marketSelectionKey } from "./market-selection";

describe("explicit marketplace selection", () => {
  it("keeps all, a subset and default eBay acquisition separate", () => {
    expect(marketSelectionKey({})).toBe("eBay");
    expect(marketSelectionKey({ marketplaces: ["Whatnot"] })).toBe("eBay");
    expect(marketSelectionKey({ marketScope: "cross" })).toBe("all");
    expect(marketSelectionKey({ marketScope: "cross", marketplaces: ["Whatnot"] })).toBe("Whatnot");
  });
  it("normalizes ordering and rejects an empty or unknown market list", () => {
    const base = { sourceListing: { marketplace: "eBay" }, buyer: {}, marketScope: "cross" };
    const a = comparisonRequestSchema.parse({ ...base, marketplaces: ["Whatnot", "eBay", "Whatnot"] });
    const b = comparisonRequestSchema.parse({ ...base, marketplaces: ["eBay", "Whatnot"] });
    expect(a.marketplaces).toEqual(b.marketplaces);
    expect(marketSelectionKey(a)).toBe(marketSelectionKey(b));
    expect(comparisonRequestSchema.safeParse({ ...base, marketplaces: [] }).success).toBe(false);
    expect(comparisonRequestSchema.safeParse({ ...base, marketplaces: ["unreviewed-scraper"] }).success).toBe(false);
  });
});
