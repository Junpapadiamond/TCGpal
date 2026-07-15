import { getPlatformAgents } from "@/lib/comparison/platforms";
import { agentCapabilitiesSchema, tcgGameSchema, type AgentCapabilities } from "@/lib/schemas";

export function getAgentCapabilities(): AgentCapabilities {
  const live = getPlatformAgents()
    .filter((agent) => agent.sourceMode === "official_api")
    .map((agent) => ({
      name: agent.marketplace,
      role: "active_listings" as const,
      mode: agent.sourceMode,
    }));

  return agentCapabilitiesSchema.parse({
    capabilitiesContractVersion: 1,
    games: [...tcgGameSchema.options],
    languages: ["English", "Japanese"],
    productTypes: ["raw_single"],
    currencies: ["USD"],
    liveListingPlatforms: live.map((source) => source.name),
    gradedListings: false,
    imageIdentificationInput: false,
    imageGrading: false,
    soldHistory: false,
    maxDiscoveryResults: 5,
    identityContractVersion: 1,
    discoveryContractVersion: 1,
    comparisonContractVersion: 4,
    handoffContractVersion: 1,
    sourceAccess: {
      live,
      referenceOnly: [
        "TCGCSV / TCGplayer market reference",
        "Pokémon TCG catalog",
        "One Piece bundled catalog",
        "PriceCharting optional reference",
      ],
      manualFallback: [
        "User-pasted exact listing URL",
        "User-entered marketplace facts",
        "Outbound Japan and sold-search links",
      ],
    },
  });
}
