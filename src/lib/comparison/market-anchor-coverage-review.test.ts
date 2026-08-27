import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditCardAnchor, summarizeAudits, toAuditCard } from "@/lib/testing/market-anchor-coverage";
import { fetchCatalogAnchorSample } from "@/lib/testing/catalog-anchor-sample";

// Live coverage check: `npm run review:market-anchor`, or `node
// scripts/health/market-anchor.mjs` for the pass/fail/inconclusive verdict.
//
// This is the instrument for one specific product failure. The market anchor is
// not decoration: ranking.ts multiplies it by MARKET_FLOOR_RATIO to reject
// novelty replicas, and the result screen reads item price against it. When the
// crosswalk misses, the buyer sees "Exact TCGplayer mapping unavailable" on a
// card TCGplayer prices fine, and the floor gate silently loses its input.
//
// It stayed invisible for months because nothing measured it — a buyer reported
// Suicune HGSS21 by hand. Skipped unless MARKET_ANCHOR_REVIEW=1 so the hermetic
// suite never depends on live pokemontcg.io or tcgcsv.com.
const enabled = process.env.MARKET_ANCHOR_REVIEW === "1";

// The gated claim is the one the check's name makes: can the crosswalk price at
// least one card from every catalogued set? Raise this when coverage genuinely
// improves; never lower it to make a red run green.
const MIN_SET_COVERAGE = 0.98;

// Cards per set. It used to be 1, and that quietly measured something else: the
// API returns cards in collector order, so a single card is always card #1 —
// which in a promo or energy set is the most ambiguous card there is. Measured
// 2026-08-27, that reported 11 sets with no anchor when 5 of the 11 resolve on
// a different card (HGSS Black Star Promos resolves 7 of 8; the sample drew the
// one that does not). Several cards cost the same request, since pageSize is
// free, and 78ms each to audit.
const PER_SET = Number(process.env.MARKET_ANCHOR_PER_SET ?? 5);

// The walk is sequential against a provider measured at 6/12 healthy, so its
// duration is set by that provider's mood rather than by the catalog's size.
// Left unbounded it was simply killed by the runner every day for a week, and a
// killed run cannot tell a coverage regression from a bad hour upstream. So the
// run now stops on its own terms and reports how far it got; the surrounding
// timeout stays well clear so the deadline is always what fires first.
const DEADLINE_MS = Number(process.env.MARKET_ANCHOR_DEADLINE_MS ?? 900_000);
const TEST_TIMEOUT_MS = DEADLINE_MS + 300_000;

// Which card represents each set. Checked in because it is identity, not
// measurement: the audit asks whether the crosswalk can price a card, and that
// answer does not depend on the card having been fetched seconds ago. Drawing it
// live cost 10.3s per set — half an hour for the 174 sets — against 78ms per
// card for the audit that is the actual point. Sets missing from the file are
// still fetched, so a new set is never served from memory.
// Refresh with `MARKET_ANCHOR_WRITE_SAMPLE=1 npm run review:market-anchor`.
const SAMPLE_FILE = path.join(process.cwd(), "src/lib/testing/market-anchor-sample.json");

// Sets measured to have no anchor, each with the reason. This is not a lowered
// floor wearing a different hat: every entry prints in every report, a set that
// starts resolving is called out so its entry can be deleted, and any set NOT
// listed that loses its anchor fails at the full floor — which a percentage
// cannot do, since one set recovering would mask another breaking.
const KNOWN_GAPS_FILE = path.join(process.cwd(), "src/lib/testing/market-anchor-known-gaps.json");

function loadKnownGaps(): Record<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(KNOWN_GAPS_FILE, "utf8")) as Record<string, string>;
    const entries = Object.entries(parsed).filter(([key]) => !key.startsWith("_"));
    for (const [set, reason] of entries) {
      if (typeof reason !== "string" || reason.trim() === "") {
        throw new Error(`Known gap "${set}" needs a written reason; an unexplained entry would hide a regression.`);
      }
    }
    return Object.fromEntries(entries);
  } catch (error) {
    if (error instanceof Error && error.message.includes("needs a written reason")) throw error;
    return {};
  }
}

function loadSample() {
  try {
    return existsSync(SAMPLE_FILE) ? JSON.parse(readFileSync(SAMPLE_FILE, "utf8")) : {};
  } catch {
    return {};
  }
}

// Emitted with process.stdout.write, not console.log: vitest intercepts console
// output and drops it entirely for a passing test on a non-TTY, which is how the
// original coverage numbers were invisible in every CI log this check produced.
function emit(line: string) {
  process.stdout.write(`${line}\n`);
}

describe.skipIf(!enabled)("market anchor coverage", () => {
  it("resolves a TCGplayer anchor for a card from nearly every catalogued set", async () => {
    const startedAt = Date.now();
    const outOfTime = () => Date.now() - startedAt > DEADLINE_MS;

    const sample = await fetchCatalogAnchorSample({ deadline: outOfTime, cache: loadSample(), perSet: PER_SET });
    if (process.env.MARKET_ANCHOR_WRITE_SAMPLE === "1") {
      mkdirSync(path.dirname(SAMPLE_FILE), { recursive: true });
      const ordered = Object.fromEntries(Object.entries(sample.cacheable).sort(([a], [b]) => a.localeCompare(b)));
      writeFileSync(SAMPLE_FILE, `${JSON.stringify(ordered, null, 2)}\n`);
    }
    expect(sample.sets.length, "no catalog sets were sampled").toBeGreaterThan(100);

    const audits = [];
    let unauditedCards = 0;
    for (const card of sample.cards) {
      if (outOfTime()) {
        unauditedCards = sample.cards.length - audits.length;
        break;
      }
      audits.push(await auditCardAnchor(toAuditCard(card)));
    }

    const summary = summarizeAudits(audits);

    // A set is covered when ANY of its sampled cards reaches an anchor. That is
    // the claim being tested — the set has a crosswalk — and it is why one card
    // per set was the wrong instrument rather than merely a small one.
    const resolvedSets = new Set(audits.filter((a) => a.stage === "resolved").map((a) => a.setName));
    const failedSets = new Map<string, string>();
    for (const audit of audits) {
      if (resolvedSets.has(audit.setName)) continue;
      if (!failedSets.has(audit.setName)) failedSets.set(audit.setName, `${audit.stage}: ${audit.detail.slice(0, 140)}`);
    }

    // Only sets we actually audited can be scored. A set the deadline never
    // reached, or whose cards the catalogue would not hand over, is a missing
    // measurement — counting it as a miss would turn "we could not look" into
    // "coverage regressed", the exact confusion this check must never make.
    const auditedSets = new Set(audits.map((a) => a.setName));
    const visitedSets = auditedSets.size;
    const setCoverage = visitedSets === 0 ? 0 : (visitedSets - failedSets.size) / visitedSets;
    const knownGaps = loadKnownGaps();
    const unexplainedGaps = [...failedSets.keys()].filter((name) => !(name in knownGaps));
    const recoveredGaps = Object.keys(knownGaps).filter((name) => resolvedSets.has(name));
    // Scored against unexplained gaps only. The known ones are still counted and
    // printed; they simply do not re-raise an alarm that has already been read.
    const scoredCoverage = visitedSets === 0 ? 0 : (visitedSets - unexplainedGaps.length) / visitedSets;
    const feedErrors = summary.byStage.feed_error ?? 0;
    const truncated = sample.truncated || unauditedCards > 0;

    emit(`\n  cards ${summary.resolved}/${summary.total} (${(summary.coverage * 100).toFixed(1)}%)`);
    emit(`  stages ${JSON.stringify(summary.byStage)}`);
    emit(`  sets audited ${visitedSets}/${sample.sets.length} at ${PER_SET} card(s) each, ${sample.cacheMisses.length} fetched fresh, without any resolvable card: ${failedSets.size}`);
    for (const [setName, reason] of failedSets) {
      emit(`   - ${setName in knownGaps ? "known" : "NEW"}: ${setName} — ${reason}`);
    }
    for (const name of recoveredGaps) emit(`   + recovered, delete its entry: ${name}`);

    const withinBudget = scoredCoverage >= MIN_SET_COVERAGE;
    const verdict = truncated || feedErrors > 0 ? "inconclusive" : withinBudget ? "ok" : "regression";

    // Read by scripts/health/market-anchor.mjs, which owns the exit code. The
    // measurement reports what it saw; the judgment lives one layer up, the same
    // separation every other health check has.
    const payload = JSON.stringify({
      verdict,
      cardCoverage: summary.coverage,
      setCoverage,
      scoredCoverage,
      unexplainedGaps,
      knownGaps: [...failedSets.keys()].filter((name) => name in knownGaps),
      recoveredGaps,
      cardsAudited: summary.total,
      cardsResolved: summary.resolved,
      setsVisited: visitedSets,
      setsTotal: sample.sets.length,
      setsWithoutAnchor: [...failedSets.keys()],
      unreadableSets: sample.unreadableSets.length,
      unauditedCards,
      feedErrors,
      elapsedMs: Date.now() - startedAt,
      setsFetchedFresh: sample.cacheMisses.length,
      perSet: PER_SET,
      minSetCoverage: MIN_SET_COVERAGE,
      // Card coverage is reported, not gated: with several cards per set it
      // measures how often an arbitrary card resolves, which is a different
      // question from whether the set has a crosswalk at all.
      minCardCoverage: null,
    });
    emit(`::anchor::${payload}`);
    // Also written to a file the wrapper reads first. stdout works today, but a
    // reporter change would silently take the verdict away again, and a verdict
    // that can go missing is one the wrapper has to read as "could not measure".
    if (process.env.MARKET_ANCHOR_VERDICT_FILE) {
      writeFileSync(process.env.MARKET_ANCHOR_VERDICT_FILE, payload);
    }

    // An incomplete measurement is not evidence of anything, so it asserts
    // nothing. The wrapper reports it as INCONCLUSIVE, which by design never
    // pages anyone — and prints how far the run got, so a run that is
    // permanently inconclusive is visible rather than quietly green.
    if (verdict === "inconclusive") return;

    expect(scoredCoverage, `sets that lost their market anchor with no recorded reason: ${unexplainedGaps.join(", ")}`).toBeGreaterThanOrEqual(MIN_SET_COVERAGE);
  }, TEST_TIMEOUT_MS);
});
