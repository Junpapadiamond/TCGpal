import { z } from "zod";
import cohort from "./real-card-cohort.json";
import frozen from "./real-card-dataset.json";
import followups from "./real-card-followups.json";
import baseline from "./automation-baseline.json";
import { accuracyDatasetSchema, evaluateAccuracy, type AccuracyDataset } from "./card-accuracy";
import { safeAiFailure, type AiFailure } from "@/lib/ai/failure-diagnostics";
import { compareAutomationBaseline, selectDailyCards } from "./automation";

export const cloudRequestSchema = z.object({ mode: z.enum(["daily", "verify"]).default("daily") }).strict();
export type CloudMode = z.infer<typeof cloudRequestSchema>["mode"];
export type CohortCard = typeof cohort.cards[number];
export type Sample = { id: string; status: string; candidateCount: number; observedAt?: string;
  coverage: { status: string; baselineCheapestTotal?: number | null; probeTotal?: number | null }[];
  cases: AccuracyDataset["cases"] };
type Review = { status: string; findings: { caseId: string; hypothesis: string; nextTest: string }[];
  model?: string; selectedModel?: string; diagnostic?: AiFailure };
export type CloudDependencies = {
  reserve: (key: string) => Promise<"reserved" | "already_reserved" | "locked">;
  load: (key: string) => Promise<CloudReport | null>;
  save: (key: string, report: CloudReport, samples: Sample[]) => Promise<void>;
  release: () => Promise<void>;
  sample: (card: CohortCard) => Promise<Sample>;
  review: (cases: AccuracyDataset["cases"]) => Promise<Review>;
  wait: (ms: number) => Promise<void>;
};
export type CloudReport = {
  version: 1; mode: CloudMode; date: string; status: string; startedAt: string;
  offline: { datasetId: string; scored: number; passed: number; pending: number;
    regressions: string[]; knownFailures: string[]; recoveries: string[] }[];
  cards: Omit<Sample, "cases">[]; ai: Review;
};
export const cloudReportSchema = z.object({
  version: z.literal(1), mode: z.enum(["daily", "verify"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.string(), startedAt: z.iso.datetime(),
  offline: z.array(z.object({ datasetId: z.string(), scored: z.number().int(), passed: z.number().int(),
    pending: z.number().int(), regressions: z.array(z.string()), knownFailures: z.array(z.string()), recoveries: z.array(z.string()) })),
  cards: z.array(z.object({ id: z.string(), status: z.string(), candidateCount: z.number().int(), observedAt: z.iso.datetime().optional(),
    coverage: z.array(z.object({ status: z.string(), baselineCheapestTotal: z.number().nullable().optional(), probeTotal: z.number().nullable().optional() })) })),
  ai: z.object({ status: z.string(), model: z.string().optional(), selectedModel: z.string().optional(),
    findings: z.array(z.object({ caseId: z.string(), hypothesis: z.string().max(600), nextTest: z.string().max(600) })).max(12),
    diagnostic: z.object({ code: z.string(), httpStatus: z.number().int().optional() }).optional() }),
});

export async function runCloudEvaluation(mode: CloudMode, now: Date, d: CloudDependencies): Promise<CloudReport> {
  const date = now.toISOString().slice(0, 10);
  const key = `${mode}:${date}`;
  const report: CloudReport = { version: 1, mode, date, status: "ok", startedAt: now.toISOString(),
    offline: [], cards: [], ai: { status: "skipped", findings: [] } };
  // October 19 was already acquired by the retired local runner. Never refund it.
  if (mode === "daily" && date < "2026-10-20") return { ...report, status: "migration_day_spent" };
  const reserved = await d.reserve(key);
  if (reserved !== "reserved") return await d.load(key) ?? { ...report, status: reserved };
  const samples: Sample[] = [];
  try {
    for (const [index, dataset] of [frozen, followups].entries()) {
      const result = evaluateAccuracy(dataset, "all");
      report.offline.push({ datasetId: result.datasetId, scored: result.scored,
        passed: result.rows.filter(r => r.pass === true).length, pending: result.total - result.scored,
        ...compareAutomationBaseline(baseline.datasets[index], result) });
    }
    if (report.offline.some(r => r.regressions.length)) report.status = "regression";
    else {
      let reviewCases: AccuracyDataset["cases"] = [];
      if (mode === "verify") {
        // Explicit deployment check: real frozen tuning observations, zero live searches.
        const cases = accuracyDatasetSchema.parse(frozen).cases;
        reviewCases = (["pokemon", "onePiece"] as const).flatMap(game => cases
          .filter(c => c.game === game && c.split === "tuning").slice(0, 6)
          .map(c => ({ ...c, labelStatus: "pending" as const, expected: null })));
      } else {
        const ids = selectDailyCards(cohort.cards, now).map(c => c.id);
        for (const [index, id] of ids.entries()) {
          if (index) await d.wait(31000);
          const card = cohort.cards.find(c => c.id === id)!;
          try {
            const sample = await d.sample(card);
            samples.push(sample);
            const { cases, ...summary } = sample;
            report.cards.push(summary);
            if (sample.status !== "complete" || !sample.candidateCount) report.status = "inconclusive";
            if (card.split === "tuning") reviewCases.push(...cases.filter(c => c.split === "tuning").slice(0, 6));
          } catch {
            report.status = "inconclusive";
            report.cards.push({ id, status: "request_failed", candidateCount: 0, coverage: [] });
          }
        }
      }
      if (reviewCases.length) {
        try { report.ai = await d.review(reviewCases); }
        catch (error) { report.ai = { status: "unavailable", findings: [], diagnostic: safeAiFailure(error) }; }
        if (["unavailable", "rejected"].includes(report.ai.status)) report.status = "inconclusive";
      }
    }
    await d.save(key, report, samples);
    return report;
  } finally { await d.release(); }
}
