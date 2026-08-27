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

// Both floors are measurements, not aspirations: 173 of 174 catalogued Pokemon
// sets resolve as of 2026-08-21, and the one that does not (Pokemon Futsal
// Collection, 5 cards) exists on TCGplayer only inside a 1,500-product catch-all
// group whose contents drift. Raise these when coverage genuinely improves;
// never lower one to make a red run green.
const MIN_SET_COVERAGE = 0.98;
const MIN_CARD_COVERAGE = 0.97;

// The walk is sequential against a provider measured at 6/12 healthy, so its
// duration is set by that provider's mood rather than by the catalog's size.
// Left unbounded it was simply killed by the runner every day for a week, and a
// killed run cannot tell a coverage regression from a bad hour upstream. So the
// run now stops on its own terms and reports how far it got; the surrounding
// timeout stays well clear so the deadline is always what fires first.
const DEADLINE_MS = Number(process.env.MARKET_ANCHOR_DEADLINE_MS ?? 900_000);
const TEST_TIMEOUT_MS = DEADLINE_MS + 300_000;

describe.skipIf(!enabled)("market anchor coverage", () => {
  it("resolves a TCGplayer anchor for a card from nearly every catalogued set", async () => {
    const startedAt = Date.now();
    const outOfTime = () => Date.now() - startedAt > DEADLINE_MS;

    const sample = await fetchCatalogAnchorSample({ deadline: outOfTime });
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
    const failedSets = new Map<string, string>();
    for (const audit of audits) {
      if (audit.stage === "resolved") failedSets.delete(audit.setName);
      else if (!failedSets.has(audit.setName)) failedSets.set(audit.setName, `${audit.stage}: ${audit.detail.slice(0, 140)}`);
    }
    const resolvedSets = new Set(audits.filter((a) => a.stage === "resolved").map((a) => a.setName));
    for (const name of resolvedSets) failedSets.delete(name);

    // Only sets we actually reached can be scored. Counting an unvisited set as
    // a miss would turn "we ran out of time" into "coverage regressed", which is
    // the exact confusion this check must never make.
    const visitedSets = sample.sets.length - sample.unvisitedSets.length;
    const setCoverage = visitedSets === 0 ? 0 : (visitedSets - failedSets.size) / visitedSets;
    const feedErrors = summary.byStage.feed_error ?? 0;
    const truncated = sample.truncated || unauditedCards > 0;

    console.log(`\n  cards ${summary.resolved}/${summary.total} (${(summary.coverage * 100).toFixed(1)}%)`);
    console.log(`  stages ${JSON.stringify(summary.byStage)}`);
    console.log(`  sets visited ${visitedSets}/${sample.sets.length}, without any resolvable card: ${failedSets.size}`);
    for (const [setName, reason] of failedSets) console.log(`   - ${setName} — ${reason}`);

    const withinBudget = setCoverage >= MIN_SET_COVERAGE && summary.coverage >= MIN_CARD_COVERAGE;
    const verdict = truncated || feedErrors > 0 ? "inconclusive" : withinBudget ? "ok" : "regression";

    // Read by scripts/health/market-anchor.mjs, which owns the exit code. The
    // measurement reports what it saw; the judgment lives one layer up, the same
    // separation every other health check has.
    console.log(`::anchor::${JSON.stringify({
      verdict,
      cardCoverage: summary.coverage,
      setCoverage,
      cardsAudited: summary.total,
      cardsResolved: summary.resolved,
      setsVisited: visitedSets,
      setsTotal: sample.sets.length,
      setsWithoutAnchor: [...failedSets.keys()],
      unreadableSets: sample.unreadableSets.length,
      unauditedCards,
      feedErrors,
      elapsedMs: Date.now() - startedAt,
      minSetCoverage: MIN_SET_COVERAGE,
      minCardCoverage: MIN_CARD_COVERAGE,
    })}`);

    // An incomplete measurement is not evidence of anything, so it asserts
    // nothing. The wrapper reports it as INCONCLUSIVE, which by design never
    // pages anyone — and prints how far the run got, so a run that is
    // permanently inconclusive is visible rather than quietly green.
    if (verdict === "inconclusive") return;

    expect(setCoverage, `sets without a market anchor: ${[...failedSets.keys()].join(", ")}`).toBeGreaterThanOrEqual(MIN_SET_COVERAGE);
    expect(summary.coverage).toBeGreaterThanOrEqual(MIN_CARD_COVERAGE);
  }, TEST_TIMEOUT_MS);
});
