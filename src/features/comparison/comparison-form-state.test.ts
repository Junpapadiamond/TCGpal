import { describe, expect, it } from "vitest";
import {
  defaultComparisonFormValues,
  resetForNewCardSearch,
  type ComparisonForm,
} from "@/features/comparison/comparison-form-state";

describe("comparison form search state", () => {
  it("clears card and listing fields for a new search while preserving buyer context", () => {
    const previous: ComparisonForm = {
      ...defaultComparisonFormValues,
      heroQuery: "Monkey.D.Luffy OP01-024",
      game: "onePiece",
      url: "https://www.ebay.com/itm/123456789012",
      marketplace: "Mercari",
      cardName: "Monkey.D.Luffy",
      setCode: "OP-01",
      cardNumber: "OP01-024",
      listingTitle: "Monkey.D.Luffy OP01-024 alt art",
      description: "Front and back photos.",
      price: "75",
      shipping: "4",
      postalCode: "10001",
      taxRatePercent: "8.875",
      preferredRole: "safest_listing",
      claimedCondition: "Lightly Played",
      desiredCondition: "Near Mint",
      feedbackPercentage: "99.8",
      feedbackCount: "2500",
      returnsAccepted: true,
      buyerProtection: true,
      photoCount: "8",
      frontBackExplicit: true,
      closeupsExplicit: true,
      surfaceExplicit: true,
      substantiveConditionNotes: true,
      manualCandidates: [{
        marketplace: "Facebook",
        price: "70",
        shipping: "0",
        claimedCondition: "Near Mint",
        title: "Local Luffy",
        url: "",
      }],
    };

    const reset = resetForNewCardSearch(previous);

    expect(reset).toMatchObject({
      heroQuery: "",
      game: "pokemon",
      url: "",
      marketplace: "eBay",
      cardName: "",
      setCode: "",
      cardNumber: "",
      listingTitle: "",
      description: "",
      price: "",
      shipping: "",
      postalCode: "10001",
      taxRatePercent: "8.875",
      preferredRole: "safest_listing",
      claimedCondition: "Unknown",
      desiredCondition: "Near Mint",
      feedbackPercentage: "",
      feedbackCount: "",
      returnsAccepted: false,
      buyerProtection: false,
      photoCount: "0",
      frontBackExplicit: false,
      closeupsExplicit: false,
      surfaceExplicit: false,
      substantiveConditionNotes: false,
      manualCandidates: [],
    });
  });
});
