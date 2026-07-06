import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsProperties } from "@/lib/analytics";

describe("analytics privacy boundary", () => {
  it("drops listing text, URLs, seller identifiers, and images", () => {
    expect(sanitizeAnalyticsProperties({
      marketplace: "eBay",
      status: "complete",
      url: "https://example.com/private",
      listingText: "private listing",
      sellerName: "seller-123",
      imageUrl: "https://example.com/card.jpg",
    })).toEqual({
      marketplace: "eBay",
      status: "complete",
    });
  });
});
