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

  it("allows only approved enums for result sharing and marketplace follow-ups", () => {
    expect(sanitizeAnalyticsProperties({
      marketplace: "Mercari",
      game: "onePiece",
      share_method: "url",
      result_state: "best_buy",
      url: "https://www.mercari.com/search/?keyword=private-card-name",
      card_name: "private card name",
    })).toEqual({
      marketplace: "Mercari",
      game: "onePiece",
      share_method: "url",
      result_state: "best_buy",
    });

    expect(sanitizeAnalyticsProperties({
      marketplace: "not-a-marketplace",
      game: "private-game",
      share_method: "clipboard-with-card-name",
      result_state: "secret-state",
    })).toEqual({});
  });
});
