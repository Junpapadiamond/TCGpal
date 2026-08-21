import { describe, expect, it } from "vitest";
import { auditCardAnchor, summarizeAudits, toAuditCard } from "@/lib/testing/market-anchor-coverage";
import { fetchCatalogAnchorSample } from "@/lib/testing/catalog-anchor-sample";

// Live coverage check: `npm run review:market-anchor`.
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

describe.skipIf(!enabled)("market anchor coverage", () => {
  it("resolves a TCGplayer anchor for a card from nearly every catalogued set", async () => {
    const sample = await fetchCatalogAnchorSample();
    expect(sample.sets.length, "no catalog sets were sampled").toBeGreaterThan(100);

    const audits = [];
    for (const card of sample.cards) {
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

    console.log(`\n  cards ${summary.resolved}/${summary.total} (${(summary.coverage * 100).toFixed(1)}%)`);
    console.log(`  stages ${JSON.stringify(summary.byStage)}`);
    console.log(`  sets without any resolvable card: ${failedSets.size}`);
    for (const [setName, reason] of failedSets) console.log(`   - ${setName} — ${reason}`);

    const setCoverage = (sample.sets.length - failedSets.size) / sample.sets.length;
    expect(summary.byStage.feed_error ?? 0, "a provider feed failed; rerun before treating this as a coverage regression").toBe(0);
    expect(setCoverage, `sets without a market anchor: ${[...failedSets.keys()].join(", ")}`).toBeGreaterThanOrEqual(MIN_SET_COVERAGE);
    expect(summary.coverage).toBeGreaterThanOrEqual(MIN_CARD_COVERAGE);
  }, 600000);
});
