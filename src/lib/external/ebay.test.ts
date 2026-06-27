import { describe, expect, it, vi } from "vitest";
import { getEbayListingByUrl, parseEbayUrl } from "@/lib/external/ebay";

describe("eBay URL boundary", () => {
  it("extracts allowlisted eBay item IDs", () => {
    expect(parseEbayUrl("https://www.ebay.com/itm/Umbreon/123456789012").itemId).toBe("123456789012");
  });

  it("rejects arbitrary and lookalike URLs", () => {
    expect(parseEbayUrl("https://evil.example/itm/123456789012").supported).toBe(false);
    expect(parseEbayUrl("https://ebay.com.evil.example/itm/123456789012").supported).toBe(false);
  });

  it("never fetches unsupported URLs", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(getEbayListingByUrl(
      "https://evil.example/itm/123456789012",
      { country: "US", postalCode: "", taxRate: null, desiredCondition: "Unknown" },
      fetcher,
    )).rejects.toThrow("allowlisted eBay URLs");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
