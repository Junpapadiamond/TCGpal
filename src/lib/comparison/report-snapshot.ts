import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getJsonCache, setJsonCache } from "@/lib/ops/cache";
import { comparisonReportSchema, type ComparisonReport } from "@/lib/schemas";
import { isCacheableRequest } from "./report-cache";

const SNAPSHOT_SCOPE = "comparison-snapshot-v1";
const SNAPSHOT_TTL_SECONDS = 30 * 24 * 60 * 60;

export const comparisonSnapshotIdSchema = z.string().regex(/^[a-f0-9]{32}$/);
export const comparisonSnapshotSchema = z.object({
  id: comparisonSnapshotIdSchema,
  report: comparisonReportSchema,
  savedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type ComparisonSnapshot = z.infer<typeof comparisonSnapshotSchema>;

export async function saveComparisonSnapshot(
  reportInput: ComparisonReport,
  options: { id?: string; now?: Date } = {},
) {
  const report = comparisonReportSchema.parse(reportInput);
  if (report.status === "needs_confirmation" || report.demoMode || !isCacheableRequest(report.request)) {
    throw new Error("Only completed pure card searches can be published as result snapshots.");
  }

  const id = comparisonSnapshotIdSchema.parse(options.id ?? randomUUID().replaceAll("-", ""));
  const now = options.now ?? new Date();
  const snapshot = comparisonSnapshotSchema.parse({
    id,
    report: {
      ...report,
      request: {
        ...report.request,
        buyer: { ...report.request.buyer, postalCode: "" },
      },
    },
    savedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SNAPSHOT_TTL_SECONDS * 1000).toISOString(),
  });
  const backend = await setJsonCache(SNAPSHOT_SCOPE, id, snapshot, {
    ttlSeconds: SNAPSHOT_TTL_SECONDS,
    now,
  });
  return { ...snapshot, backend, durable: backend === "redis" };
}

export async function getComparisonSnapshot(idInput: string, now: Date = new Date()): Promise<ComparisonSnapshot | null> {
  const parsedId = comparisonSnapshotIdSchema.safeParse(idInput);
  if (!parsedId.success) return null;
  return getJsonCache(SNAPSHOT_SCOPE, parsedId.data, {
    now,
    validate(value) {
      const parsed = comparisonSnapshotSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
  });
}
