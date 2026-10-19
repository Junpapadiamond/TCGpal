import { mkdirSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const cohortSchema = z.array(z.object({ id: z.string().min(1), game: z.enum(["pokemon", "onePiece"]) }).passthrough())
  .length(12).refine(rows => new Set(rows.map(r => r.id)).size === 12, "Duplicate cohort cards");

export function selectDailyCards(input: unknown, now: Date) {
  const cards = cohortSchema.parse(input);
  const day = Math.floor((now.getTime() - Date.UTC(2026, 9, 19)) / 86400000);
  if (!Number.isFinite(day)) throw new Error("Invalid date");
  return (["pokemon", "onePiece"] as const).map(game => {
    const group = cards.filter(c => c.game === game);
    if (group.length !== 6) throw new Error("Expected six cards per game");
    return group[((day % 6) + 6) % 6];
  });
}

// Reserve the entire daily allowance before acquisition. A crash never refunds it.
// A stale global lock requires investigation, not automatic deletion/retry.
export function reserveDailyRun(root: string, now: Date) {
  const date = now.toISOString().slice(0, 10);
  mkdirSync(root, { recursive: true });
  const lock = join(root, "running.lock");
  try { mkdirSync(lock); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return { status: "locked" as const };
    throw error;
  }
  const runDirectory = join(root, date);
  try {
    mkdirSync(runDirectory);
    writeFileSync(join(runDirectory, "reservation.json"), JSON.stringify({ version: 1, date,
      reservedAt: now.toISOString(), maxSearches: 2, maxAiCalls: 1, marketScope: "single" }, null, 2), { flag: "wx" });
  } catch (error) {
    rmdirSync(lock);
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return { status: "already_reserved" as const };
    throw error;
  }
  let released = false;
  return { status: "reserved" as const, runDirectory, release: () => {
    if (!released) { rmdirSync(lock); released = true; }
  } };
}

const baselineSchema = z.object({ datasetHash: z.string().min(1), rows: z.array(z.object({
  id: z.string(), pass: z.boolean().nullable(),
  actual: z.object({ identity: z.enum(["accept", "abstain", "reject"]), eligible: z.boolean() }),
})).min(1) });

export function compareAutomationBaseline(beforeInput: unknown, currentInput: unknown) {
  const before = baselineSchema.parse(beforeInput);
  const current = baselineSchema.parse(currentInput);
  const old = new Map(before.rows.map(r => [r.id, r]));
  const ids = new Set(current.rows.map(r => r.id));
  if (before.datasetHash !== current.datasetHash || before.rows.length !== current.rows.length
    || old.size !== before.rows.length || ids.size !== current.rows.length || [...ids].some(id => !old.has(id))) {
    throw new Error("Automation baseline changed; review dataset/labels and baseline explicitly.");
  }
  return {
    regressions: current.rows.filter(r => {
      const prior = old.get(r.id)!;
      return (prior.pass === true && r.pass !== true) || (prior.pass === false && r.pass !== true
        && (prior.actual.identity !== r.actual.identity || prior.actual.eligible !== r.actual.eligible));
    }).map(r => r.id),
    knownFailures: current.rows.filter(r => r.pass === false && old.get(r.id)!.pass === false).map(r => r.id),
    recoveries: current.rows.filter(r => r.pass === true && old.get(r.id)!.pass === false).map(r => r.id),
  };
}
