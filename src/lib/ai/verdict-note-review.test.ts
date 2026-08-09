// The founder read-through: runs the real writer over every corpus case and
// writes each note next to the fact sheet it was allowed to use, so a human can
// check for wrong facts in one sitting.
//
//   npm run verdict:review
//
// It is opt-in (VERDICT_NOTE_REVIEW=1) and needs live provider credentials, so
// `npm run test` never touches the network. Results land in
// docs/verdict-note-review-<date>.md and are committed as the sprint evidence.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildVerdictCopy } from "@/features/comparison/verdict-copy";
import { getAiConfig } from "@/lib/ai/config";
import { generateVerdictNote, resolveVerdictNoteTarget, type VerdictNoteResult } from "@/lib/ai/verdict-note";
import { verdictNoteReviewCases, type VerdictNoteReviewCase } from "@/lib/ai/verdict-note-fixtures";

const enabled = process.env.VERDICT_NOTE_REVIEW === "1";
// The gateway enforces a per-minute request cap, and a 429 here reads exactly
// like a rejected note in the results table. Pace the run and retry once so the
// artifact reports checker decisions, not throttling. Tune with
// VERDICT_NOTE_CONCURRENCY / VERDICT_NOTE_GAP_MS.
const CONCURRENCY = Number(process.env.VERDICT_NOTE_CONCURRENCY) || 1;
const GAP_MS = Number(process.env.VERDICT_NOTE_GAP_MS) || 5000;
const RETRY_DELAY_MS = 20_000;
const OUTPUT_DIR = path.resolve(process.cwd(), "docs");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function wasThrottled(result: VerdictNoteResult) {
  return /\b429\b|rate[_ ]limit/i.test(result.rejectedReason ?? "");
}

type ReviewRow = { entry: VerdictNoteReviewCase; decision: ReturnType<typeof buildVerdictCopy>["action"] | null; result: VerdictNoteResult };

// vitest does not read .env.local the way `next dev` does. Existing environment
// always wins, and nothing read here is ever written to the review artifact.
function loadLocalEnv() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "").trim();
  }
}

async function runCase(entry: VerdictNoteReviewCase): Promise<ReviewRow> {
  const target = resolveVerdictNoteTarget(entry.report, entry.role);
  if (!target) {
    return { entry, decision: null, result: { note: null, citedFactIds: [], usedAi: false, rejectedReason: "no ranked pick", facts: [] } };
  }
  const { action } = buildVerdictCopy({
    listing: target.listing,
    choice: target.choice,
    alternatives: target.alternatives,
    marketPrice: target.marketPrice,
    lang: entry.lang,
  });
  const input = {
    report: entry.report,
    role: entry.role,
    lang: entry.lang,
    decision: { kind: action.kind, label: action.label, fallbackNote: action.note },
  };
  let result = await generateVerdictNote(input);
  if (wasThrottled(result)) {
    await sleep(RETRY_DELAY_MS);
    result = await generateVerdictNote(input);
  }
  return { entry, decision: action, result };
}

async function runAll(cases: VerdictNoteReviewCase[]) {
  const rows: ReviewRow[] = [];
  for (let index = 0; index < cases.length; index += CONCURRENCY) {
    if (index > 0) await sleep(GAP_MS);
    rows.push(...await Promise.all(cases.slice(index, index + CONCURRENCY).map(runCase)));
  }
  return rows;
}

function renderReport(rows: ReviewRow[], model: string) {
  const accepted = rows.filter((row) => row.result.note !== null);
  const lines = [
    `# Verdict note review — ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Model: \`${model}\`. Cases: ${rows.length}. Notes accepted by the checker: ${accepted.length}. Fell back to the deterministic sentence: ${rows.length - accepted.length}.`,
    "",
    "Read every accepted note against its fact sheet. A single wrong fact fails the sprint.",
    "",
    "| # | Case | Lens | Lang | Verdict | Note written? |",
    "|---|---|---|---|---|---|",
    ...rows.map((row, index) => `| ${index + 1} | ${row.entry.name} | ${row.entry.role} | ${row.entry.lang} | ${row.decision?.kind ?? "-"} | ${row.result.note ? "yes" : "no — fell back"} |`),
    "",
  ];

  for (const [index, row] of rows.entries()) {
    lines.push(
      `## ${index + 1}. ${row.entry.name}`,
      "",
      `- Lens: \`${row.entry.role}\` · Language: \`${row.entry.lang}\``,
      `- Deterministic verdict: **${row.decision?.kind ?? "-"}** — ${row.decision?.label ?? "-"}`,
      `- Deterministic note (the fallback): ${row.decision?.note ?? "-"}`,
      "",
      row.result.note
        ? `**AI note:** ${row.result.note}\n\nCited facts: ${row.result.citedFactIds.join(", ") || "none"}`
        : `**AI note:** none — kept the deterministic sentence (${row.result.rejectedReason ?? "unknown reason"})`,
      "",
      "<details><summary>Fact sheet the model was given</summary>",
      "",
      ...row.result.facts.map((fact) => `${fact.id}. ${fact.text}`),
      "",
      "</details>",
      "",
    );
  }

  return lines.join("\n");
}

describe.skipIf(!enabled)("verdict note live review", () => {
  it("writes every generated note next to its fact sheet", { timeout: 600_000 }, async () => {
    loadLocalEnv();
    const config = getAiConfig();
    expect(config.hasApiKey, "live review needs provider credentials").toBe(true);

    const rows = await runAll(verdictNoteReviewCases);
    const model = config.provider === "anthropic" ? config.anthropicModel : config.cheapModel;
    const outputPath = path.join(OUTPUT_DIR, `verdict-note-review-${new Date().toISOString().slice(0, 10)}.md`);
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(outputPath, renderReport(rows, model), "utf8");

    // Anything the checker let through is what the human now reads. A note that
    // was rejected is a non-event: the buyer would have seen today's sentence.
    for (const row of rows) {
      if (!row.result.note) continue;
      expect(row.result.facts.length).toBeGreaterThan(0);
      expect(row.result.citedFactIds.length).toBeGreaterThan(0);
    }
    console.log(`Verdict note review written to ${outputPath}`);
  });
});
