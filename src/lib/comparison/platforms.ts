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

// A platform's outcome after it ran (or failed). The agent path and the
// deterministic path both produce these and feed them to the single builder
// below, so trace/result/warning shapes can never drift between the two.
export type PlatformOutcome = {
  agent: PlatformAgent;
  seeds?: PlatformSeed[];
  error?: string;
};

// Per-agent search timeout. The fan-out owns this rather than trusting every
// adapter to bound itself, so a single hung marketplace can never stall the
// whole comparison (Promise.all waits for the slowest agent).
const PLATFORM_SEARCH_TIMEOUT_MS = 10000;

export async function searchPlatformWithTimeout(
  agent: PlatformAgent,
  input: PlatformSearchInput,
  timeoutMs = PLATFORM_SEARCH_TIMEOUT_MS,
): Promise<PlatformSeed[]> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${agent.marketplace} search timed out after ${Math.round(timeoutMs / 1000)}s.`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([agent.search(input), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// The single source of truth for how a platform's outcome becomes a seed list,
// a trace entry, a sources-panel result, and (on failure) a warning. Shared by
// the deterministic fan-out and the model-allocator path.
export function summarizePlatformOutcome(outcome: PlatformOutcome): {
  seeds: PlatformSeed[];
  trace: ComparisonTrace;
  result: ComparisonPlatformResult;
  warning?: string;
} {
  const { agent } = outcome;
  if (outcome.seeds === undefined && outcome.error !== undefined) {
    return {
      seeds: [],
      warning: `Live ${agent.marketplace} listings could not be loaded: ${outcome.error}`,
      trace: { step: "marketplace_search", actor: agent.label, summary: `Live ${agent.marketplace} search failed: ${outcome.error}`, status: "fallback" },
      result: { id: agent.id, marketplace: agent.marketplace, label: agent.label, status: "fallback", configured: true, count: 0, detail: outcome.error },
    };
  }
  const seeds = outcome.seeds ?? [];
  return {
    seeds,
    trace: { step: "marketplace_search", actor: agent.label, summary: `Loaded ${seeds.length} live active-listing candidate${seeds.length === 1 ? "" : "s"}.`, status: "complete" },
    result: { id: agent.id, marketplace: agent.marketplace, label: agent.label, status: "complete", configured: true, count: seeds.length, detail: `${seeds.length} live candidate${seeds.length === 1 ? "" : "s"}.` },
  };
}

// A configured-but-absent platform: surfaced in the sources panel (no warning,
// no trace spam) so the operator sees which APIs would join once their keys are set.
export function skippedPlatformResult(agent: PlatformAgent): ComparisonPlatformResult {
  return { id: agent.id, marketplace: agent.marketplace, label: agent.label, status: "skipped", configured: false, count: 0, detail: `Not configured (needs ${agent.requiredEnv.join(", ")}).` };
}

// Fan out across every configured platform agent IN PARALLEL, isolating each
// agent's failure (and timeout) so one marketplace being down never sinks the
// others.
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
    configured.map(async (agent): Promise<PlatformOutcome> => {
      try {
        return { agent, seeds: await searchPlatformWithTimeout(agent, { card, buyer, fetcher, plan }) };
      } catch (error) {
        return { agent, error: error instanceof Error ? error.message : "Unknown marketplace error." };
      }
    }),
  );

  for (const outcome of settled) {
    const summary = summarizePlatformOutcome(outcome);
    seeds.push(...summary.seeds);
    traces.push(summary.trace);
    results.push(summary.result);
    if (summary.warning) warnings.push(summary.warning);
  }

  for (const agent of agents) {
    if (!agent.isConfigured()) results.push(skippedPlatformResult(agent));
  }

  return { seeds, traces, warnings, results, configuredCount: configured.length };
}
