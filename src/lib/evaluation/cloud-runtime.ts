import { randomUUID } from "node:crypto";
import { getRedisClient } from "@/lib/ops/redis";
import { comparisonRequestSchema } from "@/lib/schemas";
import { runListingComparison } from "@/lib/ai/listing-compare";
import { ebayPlatformAgent } from "@/lib/comparison/platforms";
import { getAiConfig } from "@/lib/ai/config";
import { createAiProvider } from "@/lib/ai/provider";
import { datasetFromReport, evaluateAccuracy } from "./card-accuracy";
import { evaluationHistorySchema, reviewWithModels } from "./model-routing";
import { cloudReportSchema, type CloudDependencies, type CohortCard, type Sample } from "./cloud-runner";

const prefix = "tcglens:card-eval:v1:";
const retention = 30 * 86400;
// No expiry/refund on reservations. The global lease outlives the 300s function.
export const reserveCloudScript = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 'already_reserved' end
if redis.call('EXISTS', KEYS[2]) == 1 then return 'locked' end
redis.call('SET', KEYS[2], ARGV[1], 'EX', 600)
redis.call('SET', KEYS[1], ARGV[1])
return 'reserved'`;
export const releaseCloudScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;

export function cloudCompareRequest(card: CohortCard) {
  return comparisonRequestSchema.parse({ marketScope: "single", sourceListing: { marketplace: "eBay", url: "" },
    buyer: { country: "US", postalCode: "", taxRate: null, desiredCondition: "Near Mint" },
    cardHint: { game: card.game, name: card.name, setCode: card.setCode, cardNumber: card.cardNumber,
      language: "English", variant: "", gradingClaim: "" },
    confirmedCardId: card.confirmedCardId, manualCandidates: [], webDiscoveryMode: "off" });
}

async function sampleCard(card: CohortCard): Promise<Sample> {
  // Explicit structured identity skips query-model calls; injected eBay agent
  // excludes paid fan-out and production report-cache reads/writes.
  const report = await runListingComparison(cloudCompareRequest(card), {
    agents: [ebayPlatformAgent], signal: AbortSignal.timeout(60000),
  });
  const summary: Sample = { id: card.id, status: report.status, observedAt: report.generatedAt,
    candidateCount: report.candidates.length, coverage: [], cases: [] };
  if (!report.candidates.length || report.confirmedCard?.id.toLowerCase() !== card.confirmedCardId.toLowerCase()) {
    return { ...summary, status: "identity_or_source_unavailable" };
  }
  const probes = (report.searchCoverage ?? []).flatMap(c => [c.listing, ...(c.excluded ?? [])].filter(r => !!r));
  const rows = [...report.candidates, ...probes];
  const dataset = datasetFromReport({ ...report, candidates: rows }, card.split === "tuning" ? "tuning" : "held_out");
  const winners = new Set(report.rankedChoices.map(c => c.listingId));
  // Stable ordering: review primary lens winners first, retain every observation.
  summary.cases = dataset.cases.map((c, index) => ({ c, winner: winners.has(rows[index].id) }))
    .sort((a, b) => Number(b.winner) - Number(a.winner)).map(r => r.c);
  summary.coverage = (report.searchCoverage ?? []).map(c => ({ status: c.status,
    baselineCheapestTotal: c.baselineCheapestTotal,
    probeTotal: c.listing?.costComplete ? c.listing.preTaxTotal : null }));
  return summary;
}

export function createCloudDependencies(): CloudDependencies {
  const redis = getRedisClient();
  if (!redis) throw new Error("Shared storage required");
  const owner = randomUUID();
  return {
    reserve: async key => {
      const value = await redis.eval(reserveCloudScript, [`${prefix}reserved:${key}`, `${prefix}lock`], [owner]);
      if (typeof value !== "string" || !["reserved", "already_reserved", "locked"].includes(value)) throw new Error("Invalid reservation");
      return value as "reserved" | "already_reserved" | "locked";
    },
    load: async key => {
      const value = await redis.get(`${prefix}report:${key}`);
      return value === null ? null : cloudReportSchema.parse(value);
    },
    save: async (key, report, samples) => {
      await redis.set(`${prefix}observations:${key}`, samples, { ex: retention });
      await redis.set(`${prefix}report:${key}`, report, { ex: retention });
    },
    release: async () => { await redis.eval(releaseCloudScript, [`${prefix}lock`], [owner]); },
    sample: sampleCard,
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    review: async cases => {
      const config = getAiConfig();
      const models = (process.env.CARD_EVAL_MODELS || (config.provider === "anthropic" ? config.anthropicModel : config.primaryModel))
        .split(",").map(s => s.trim());
      if (models.some(m => config.provider === "anthropic" ? !m.startsWith("claude-") : !m.startsWith("gpt-"))) {
        throw new Error("Model must use configured provider");
      }
      const history = evaluationHistorySchema.parse(await redis.get(`${prefix}model-history`) ?? []);
      const result = evaluateAccuracy({ version: 1, id: "cloud-tuning-review", cases }, "tuning");
      const reviewed = await reviewWithModels(result, models, history, model => createAiProvider({ ...config,
        anthropicModel: model, primaryModel: model, cheapModel: model }));
      await redis.set(`${prefix}model-history`, reviewed.history, { ex: retention });
      return { ...reviewed.triage, selectedModel: reviewed.selectedModel };
    },
  };
}
