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
      referrer_class: "reddit",
    })).toEqual({
      marketplace: "eBay",
      status: "complete",
      referrer_class: "reddit",
    });
  });

  it("accepts only coarse receipt referrer classes", () => {
    expect(sanitizeAnalyticsProperties({ referrer_class: "discord" })).toEqual({ referrer_class: "discord" });
    expect(sanitizeAnalyticsProperties({ referrer_class: "https://example.com/private-path" })).toEqual({});
  });
});
