import {
  hasEbayCredentials,
  searchEbayAlternatives,
} from "@/lib/external/ebay";
import type {
  BuyerContext,
  CardIdentityCandidate,
  ComparisonPlatformResult,
  ComparisonTrace,
  Marketplace,
  NormalizedListing,
} from "@/lib/schemas";

// A "platform agent" is one marketplace the comparison can pull live listings
// from. Each agent self-declares whether it is configured (its own API
// credentials), so the cross-platform system simply works for whatever APIs the
// operator has — add a key, and that platform joins the fan-out; remove it, and
// the platform sits out cleanly. Adding a new marketplace is one PlatformAgent.
//
// The seed shape is the pre-scored listing: deterministic normalization, tax,
// and ranking are applied uniformly afterwards, so every platform reconciles in
// the same ledger regardless of where it came from.
export type PlatformSeed = Omit<
  NormalizedListing,
  | "estimatedTax"
  | "preTaxTotal"
  | "estimatedLandedCost"
  | "sellerTrustScore"
  | "evidenceCompletenessScore"
  | "safetyScore"
  | "eligible"
  | "exclusionReasons"
>;

// Optional per-search hints. Today only a model-refined query string; kept as an
// object so future hints (price ceiling, condition floor) extend without churning
// every agent signature.
export type PlatformSearchPlan = {
  query?: string;
};

export type PlatformSearchInput = {
  card: CardIdentityCandidate;
  buyer: BuyerContext;
  fetcher: typeof fetch;
  plan?: PlatformSearchPlan;
};

export type PlatformAgent = {
  // Stable machine id used in tool names and results (e.g. "ebay").
  id: string;
  marketplace: Marketplace;
  // Human label shown in the trace and the "sources checked" panel.
  label: string;
  // Env vars this agent needs. Surfaced for diagnostics only — never the values.
  requiredEnv: string[];
  isConfigured: () => boolean;
  search: (input: PlatformSearchInput) => Promise<PlatformSeed[]>;
};

// eBay is the one marketplace with a real, legal Browse API wired today. Other
// platforms stay manual-ledger until a licensed provider is connected; when one
// is, it becomes another PlatformAgent here and the fan-out picks it up.
export const ebayPlatformAgent: PlatformAgent = {
  id: "ebay",
  marketplace: "eBay",
  label: "eBay Browse adapter",
  requiredEnv: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"],
  isConfigured: hasEbayCredentials,
  search: ({ card, buyer, fetcher, plan }) =>
    searchEbayAlternatives(card, buyer, fetcher, plan?.query),
};

const DEFAULT_AGENTS: PlatformAgent[] = [ebayPlatformAgent];

// The registry is the single source of truth for which marketplaces participate.
export function getPlatformAgents(): PlatformAgent[] {
  return DEFAULT_AGENTS;
}

export function getConfiguredPlatformAgents(agents: PlatformAgent[] = getPlatformAgents()): PlatformAgent[] {
  return agents.filter((agent) => agent.isConfigured());
}

export type PlatformFanout = {
  seeds: PlatformSeed[];
  traces: ComparisonTrace[];
  warnings: string[];
  results: ComparisonPlatformResult[];
  // How many agents actually ran (were configured). When this is zero the caller
  // is responsible for the labeled-demo fallback — there is no live source at all.
  configuredCount: number;
};

export type RunPlatformFanoutInput = {
  card: CardIdentityCandidate;
  buyer: BuyerContext;
  fetcher: typeof fetch;
  plan?: PlatformSearchPlan;
  agents?: PlatformAgent[];
};

// Fan out across every configured platform agent IN PARALLEL, isolating each
// agent's failure so one marketplace being down (auth, rate limit, timeout) never
// sinks the others. Each agent contributes its seeds, one trace entry, and a
// per-platform result for the "sources checked" panel. Unconfigured agents are
// reported as "skipped" (no warning, no trace spam) so the user can still see
// which marketplaces would join once their API is connected.
export async function runPlatformFanout({
  card,
  buyer,
  fetcher,
  plan,
  agents = getPlatformAgents(),
}: RunPlatformFanoutInput): Promise<PlatformFanout> {
  const seeds: PlatformSeed[] = [];
  const traces: ComparisonTrace[] = [];
  const warnings: string[] = [];
  const results: ComparisonPlatformResult[] = [];

  const configured = agents.filter((agent) => agent.isConfigured());

  const settled = await Promise.all(
    configured.map(async (agent) => {
      try {
        return { agent, seeds: await agent.search({ card, buyer, fetcher, plan }), error: null as unknown };
      } catch (error) {
        return { agent, seeds: [] as PlatformSeed[], error };
      }
    }),
  );

  for (const { agent, seeds: agentSeeds, error } of settled) {
    if (error) {
      const detail = error instanceof Error ? error.message : "Unknown marketplace error.";
      warnings.push(`Live ${agent.marketplace} listings could not be loaded: ${detail}`);
      traces.push({
        step: "marketplace_search",
        actor: agent.label,
        summary: `Live ${agent.marketplace} search failed: ${detail}`,
        status: "fallback",
      });
      results.push({
        id: agent.id,
        marketplace: agent.marketplace,
        label: agent.label,
        status: "fallback",
        configured: true,
        count: 0,
        detail,
      });
      continue;
    }

    seeds.push(...agentSeeds);
    traces.push({
      step: "marketplace_search",
      actor: agent.label,
      summary: `Loaded ${agentSeeds.length} live active-listing candidate${agentSeeds.length === 1 ? "" : "s"}.`,
      status: "complete",
    });
    results.push({
      id: agent.id,
      marketplace: agent.marketplace,
      label: agent.label,
      status: "complete",
      configured: true,
      count: agentSeeds.length,
      detail: `${agentSeeds.length} live candidate${agentSeeds.length === 1 ? "" : "s"}.`,
    });
  }

  // Surface configured-but-absent platforms so the operator can see exactly which
  // APIs are live and which would join the fan-out once their keys are set.
  for (const agent of agents) {
    if (agent.isConfigured()) continue;
    results.push({
      id: agent.id,
      marketplace: agent.marketplace,
      label: agent.label,
      status: "skipped",
      configured: false,
      count: 0,
      detail: `Not configured (needs ${agent.requiredEnv.join(", ")}).`,
    });
  }

  return { seeds, traces, warnings, results, configuredCount: configured.length };
}
