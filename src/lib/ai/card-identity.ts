import { resolveCardIdentityCandidates } from "@/lib/ai/listing-compare";
import {
  cardIdentitySearchRequestSchema,
  cardIdentitySearchResponseSchema,
  comparisonRequestSchema,
  type CardIdentitySearchRequestInput,
  type CardIdentitySearchResponse,
} from "@/lib/schemas";

export async function resolveCardIdentity(
  rawInput: CardIdentitySearchRequestInput,
  dependencies: { fetcher?: typeof fetch; now?: () => Date; signal?: AbortSignal } = {},
): Promise<CardIdentitySearchResponse> {
  const input = cardIdentitySearchRequestSchema.parse(rawInput);
  const comparisonRequest = comparisonRequestSchema.parse({
    query: input.query,
    cardHint: input.cardHint,
    sourceListing: {
      marketplace: "eBay",
      url: "",
      title: "",
      description: "",
      price: null,
      shipping: null,
      claimedCondition: "Unknown",
      active: true,
      seller: {},
      evidence: {},
    },
    buyer: {},
    manualCandidates: [],
    webDiscoveryMode: "off",
  });
  const result = await resolveCardIdentityCandidates(comparisonRequest, dependencies);
  const status = result.confirmedCard
    ? "resolved"
    : result.candidates.length > 0
      ? "needs_confirmation"
      : result.warnings.length > 0
        ? "unavailable"
        : "not_found";

  return cardIdentitySearchResponseSchema.parse({
    identityContractVersion: 1,
    status,
    candidates: result.candidates,
    confirmedCard: result.confirmedCard,
    warnings: result.warnings,
    generatedAt: result.generatedAt,
  });
}
