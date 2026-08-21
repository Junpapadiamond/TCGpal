// Does every confirmed card actually reach a TCGplayer market anchor?
//
// The anchor is not decoration. `MARKET_FLOOR_RATIO` in ranking.ts multiplies it
// to reject novelty replicas, and the result screen reads item price against it.
// When the crosswalk misses, the buyer sees "Exact TCGplayer mapping unavailable"
// on a card TCGplayer prices fine — and the floor gate loses its input.
//
// This module is the deterministic half of that audit: given catalog cards it
// replays the real crosswalk (no reimplementation, no HTTP mocking) and names
// the stage that dropped each one, so a coverage regression is a diff and not a
// bug report.
import {
  findTcgplayerGroup,
  inferTcgplayerCategoryId,
  resolveTcgplayerProductVariants,
} from "@/lib/external/tcgcsv";
import { selectExactTcgplayerProduct } from "@/lib/comparison/crosswalk";
import { assessPrintFidelity } from "@/lib/comparison/print-fidelity";
import { cardIdentityCandidateSchema, type CardIdentityCandidate } from "@/lib/schemas";

// Ordered by where the card fell out of the crosswalk, earliest first. Only
// `resolved` produces a market anchor; every other stage renders as "Exact
// TCGplayer mapping unavailable" and leaves the market-floor gate without input.
export type AnchorStage =
  | "resolved"
  | "no_group"
  | "no_product_for_number"
  | "rejected_or_ambiguous"
  | "feed_error";

export type AnchorAudit = {
  cardId: string;
  name: string;
  setName: string;
  cardNumber: string;
  stage: AnchorStage;
  variantCount: number;
  productId: number | null;
  groupName: string | null;
  detail: string;
};

export function toAuditCard(input: {
  id: string;
  name: string;
  setName: string;
  setCode?: string;
  cardNumber: string;
  language?: string;
}): CardIdentityCandidate {
  return cardIdentityCandidateSchema.parse({
    id: input.id,
    name: input.name,
    setName: input.setName,
    setCode: input.setCode ?? "",
    cardNumber: input.cardNumber,
    language: input.language ?? "English",
    confidence: "high",
    matchReasons: [],
  });
}

export async function auditCardAnchor(
  card: CardIdentityCandidate,
  fetcher: typeof fetch = fetch,
): Promise<AnchorAudit> {
  const base = {
    cardId: card.id,
    name: card.name,
    setName: card.setName,
    cardNumber: card.cardNumber,
    variantCount: 0,
    productId: null as number | null,
    groupName: null as string | null,
  };

  try {
    const group = await findTcgplayerGroup(inferTcgplayerCategoryId(card), card.setName, fetcher);
    if (!group) {
      return { ...base, stage: "no_group", detail: `no TCGplayer group matches set name "${card.setName}"` };
    }

    const variants = await resolveTcgplayerProductVariants(card, fetcher);
    if (variants.length === 0) {
      return {
        ...base,
        stage: "no_product_for_number",
        groupName: group.name,
        detail: `group "${group.name}" carries no product numbered ${card.cardNumber} under this card name`,
      };
    }

    const chosen = selectExactTcgplayerProduct(card, variants);
    if (chosen) {
      return {
        ...base,
        stage: "resolved",
        variantCount: variants.length,
        productId: chosen.productId,
        groupName: chosen.groupName,
        detail: chosen.productName,
      };
    }

    // Products matched the number but the exact-print selector refused them.
    // Report each one's verdict: an ambiguous pair and a single rejected product
    // are different fixes (tie-break vs. matcher), and both are invisible in the
    // product count alone.
    const verdicts = variants.map((product) => {
      const assessment = assessPrintFidelity({
        card,
        matchText: `${product.productName} ${product.collectorNumber} ${product.groupName} ${card.language} ${product.productUrl}`,
        listingPrice: 0,
        exactMarketAnchor: null,
      });
      return `#${product.productId} "${product.productName}" @${product.groupName} → ${assessment.match} (${assessment.reasons.join("|")})`;
    });
    return {
      ...base,
      stage: "rejected_or_ambiguous",
      variantCount: variants.length,
      groupName: variants[0]?.groupName ?? group.name,
      detail: verdicts.join(" ;; "),
    };
  } catch (error) {
    return { ...base, stage: "feed_error", detail: error instanceof Error ? error.message : String(error) };
  }
}

export function summarizeAudits(audits: AnchorAudit[]) {
  const byStage = new Map<AnchorStage, number>();
  for (const audit of audits) byStage.set(audit.stage, (byStage.get(audit.stage) ?? 0) + 1);
  const resolved = byStage.get("resolved") ?? 0;
  return {
    total: audits.length,
    resolved,
    coverage: audits.length === 0 ? 1 : resolved / audits.length,
    byStage: Object.fromEntries(byStage) as Record<AnchorStage, number>,
  };
}
