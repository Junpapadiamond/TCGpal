import { describe, expect, it } from "vitest";
import { getAgentCapabilities } from "@/lib/agent-capabilities";
import { agentCapabilitiesSchema } from "@/lib/schemas";

describe("agent capabilities", () => {
  it("returns the versioned public support matrix", () => {
    const capabilities = getAgentCapabilities();

    expect(agentCapabilitiesSchema.parse(capabilities)).toEqual(capabilities);
    expect(capabilities).toMatchObject({
      capabilitiesContractVersion: 1,
      games: ["pokemon", "onePiece"],
      languages: ["English", "Japanese"],
      productTypes: ["raw_single"],
      currencies: ["USD"],
      liveListingPlatforms: ["eBay"],
      gradedListings: false,
      imageIdentificationInput: false,
      imageGrading: false,
      soldHistory: false,
      maxDiscoveryResults: 5,
      identityContractVersion: 1,
      discoveryContractVersion: 1,
      comparisonContractVersion: 4,
      handoffContractVersion: 1,
    });
    expect(capabilities.sourceAccess.live).toContainEqual({
      name: "eBay",
      role: "active_listings",
      mode: "official_api",
    });
    expect(capabilities.sourceAccess.referenceOnly).toContain("TCGCSV / TCGplayer market reference");
    expect(capabilities.sourceAccess.manualFallback).toContain("User-pasted exact listing URL");
  });
});
