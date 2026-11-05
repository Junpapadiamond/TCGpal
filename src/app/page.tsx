import { ComparisonApp } from "@/features/comparison/ComparisonApp";
import { MarketAvailabilityProvider } from "@/features/comparison/MarketSelector";
import { getPlatformAgents } from "@/lib/comparison/platforms";
import { searchableMarketplaceSchema } from "@/lib/schemas";

export default function Page() {
  const configured = new Set(getPlatformAgents().filter(agent => agent.isConfigured()).map(agent => agent.marketplace));
  const pendingMarkets = searchableMarketplaceSchema.options.filter(market => !configured.has(market));
  // Only marketplace names cross the server/client boundary, never credentials
  // or their values. Configuration is evaluated for this deployment's build.
  return <MarketAvailabilityProvider pendingMarkets={pendingMarkets}><ComparisonApp /></MarketAvailabilityProvider>;
}
