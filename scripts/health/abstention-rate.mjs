// What share of a real card basket actually ends in a usable buy?
//
// The unit tests prove each rule; this measures what the rules add up to on live
// inventory. Two regressions are invisible to the hermetic suite and obvious
// here: an eligibility rule that quietly excludes everything, and a market
// anchor that stops resolving — the second is exactly the Suicune HGSS21 bug,
// seen from the buyer's side rather than the crosswalk's.
//
// This drives the deployed public endpoint the way a browser does. It is polite
// by construction: sequential, with a pause between cards, and it treats a rate
// limit as "could not measure" rather than a product failure.
//
// Usage: TARGET=https://lenstcg.com node scripts/health/abstention-rate.mjs
import { resolve } from "../lib/compare-probe.mjs";
import { FAIL, INCONCLUSIVE, PASS, pct, percentile, report, sleep } from "./lib/check.mjs";

const BASE = process.env.TARGET || "https://lenstcg.com";
const GAP_MS = Number(process.env.HEALTH_GAP_MS || 2500);

// A deliberately mixed basket, every card pinned to its canonical id.
//
// Pinning matters: an unpinned query can resolve to a different print between
// runs — "Miriam 245/198" is three real Miriam prints — and then the anchor this
// check reports is measuring identity ambiguity instead of crosswalk coverage.
// Identity deserves its own instrument; this one holds it still.
//
// The Pokemon half covers the releases whose set names the crosswalk historically
// could not map (Base, Scarlet & Violet, HGSS promos), so a coverage regression
// shows up here first. The One Piece half uses the curated Manga Art prints,
// because those are the ones with a reviewed TCGplayer product id — an
// uncurated base print legitimately has no anchor and would measure nothing.
const BASKET = [
  { label: "Umbreon VMAX 215/203", game: "pokemon", name: "Umbreon VMAX", setCode: "SWSH7", cardNumber: "215/203", query: "Umbreon VMAX 215/203", confirmedCardId: "swsh7-215" },
  { label: "Giratina V 186/196", game: "pokemon", name: "Giratina V", setCode: "SWSH11", cardNumber: "186/196", query: "Giratina V 186/196", confirmedCardId: "swsh11-186" },
  { label: "Pikachu 58/102", game: "pokemon", name: "Pikachu", setCode: "BASE1", cardNumber: "58/102", query: "Pikachu 58/102", confirmedCardId: "base1-58" },
  { label: "Suicune HGSS21", game: "pokemon", name: "Suicune", setCode: "HSP", cardNumber: "HGSS21", query: "Suicune HGSS21", confirmedCardId: "hsp-HGSS21" },
  { label: "Miriam 251/198", game: "pokemon", name: "Miriam", setCode: "SV1", cardNumber: "251/198", query: "Miriam 251/198", confirmedCardId: "sv1-251" },
  { label: "Mewtwo & Mew-GX 222/236", game: "pokemon", name: "Mewtwo & Mew-GX", setCode: "SM11", cardNumber: "222/236", query: "Mewtwo & Mew-GX 222/236", confirmedCardId: "sm11-222" },
  { label: "Luffy OP05-119 manga", game: "onePiece", name: "Monkey.D.Luffy", setCode: "OP-05", cardNumber: "OP05-119", query: "Monkey.D.Luffy OP05-119", confirmedCardId: "OP05-119_p2" },
  { label: "Nami OP01-016 manga", game: "onePiece", name: "Nami", setCode: "OP-01", cardNumber: "OP01-016", query: "Nami OP01-016", confirmedCardId: "OP01-016_p8" },
];

// Floors, not targets. Live inventory moves, so these sit below the measured
// values with room to breathe; a breach means something changed in our rules,
// not that eBay had a quiet morning. Abstention is capped rather than floored
// because abstaining is a correct outcome — the failure is abstaining on
// *everything*, which is what a broken eligibility rule looks like.
const MIN_ANCHOR_COVERAGE = 0.85;
const MAX_ABSTENTION = 0.6;

const results = [];
for (const card of BASKET) {
  try {
    const started = Date.now();
    const { report: reportBody, confirmationRequired } = await resolve(BASE, card, { log: () => {} });
    const eligible = (reportBody.candidates ?? []).filter((candidate) => candidate.eligible);
    results.push({
      label: card.label,
      game: card.game,
      confirmationRequired,
      ms: Date.now() - started,
      anchor: reportBody.confirmedCard?.marketMid ?? null,
      anchorSource: reportBody.confirmedCard?.marketSource ?? null,
      eligible: eligible.length,
      lenses: (reportBody.rankedChoices ?? []).length,
      outcome: reportBody.outcome ?? "next_moves",
      warnings: reportBody.warnings ?? [],
    });
  } catch (error) {
    results.push({ label: card.label, error: String(error).slice(0, 120) });
  }
  await sleep(GAP_MS);
}

const measured = results.filter((result) => !result.error);
const withAnchor = measured.filter((result) => typeof result.anchor === "number");
const abstained = measured.filter((result) => result.outcome === "next_moves");

const rows = results.map((result) => result.error
  ? `${result.label.padEnd(26)} ERROR ${result.error}`
  : `${result.label.padEnd(26)} anchor ${result.anchor === null ? "  none  " : `$${result.anchor.toFixed(2).padStart(8)}`}` +
    ` (${(result.anchorSource ?? "-").padEnd(10)})  eligible ${String(result.eligible).padStart(2)}  lenses ${result.lenses}  ${result.outcome.padEnd(13)} ${(result.ms / 1000).toFixed(1)}s`);
rows.push("");
rows.push(`anchor coverage ${withAnchor.length}/${measured.length} (${pct(withAnchor.length, measured.length)})  ` +
  `abstained ${abstained.length}/${measured.length} (${pct(abstained.length, measured.length)})  ` +
  `p95 ${((percentile(measured.map((result) => result.ms), 95) ?? 0) / 1000).toFixed(1)}s`);

const anchorCoverage = measured.length === 0 ? 0 : withAnchor.length / measured.length;
const abstentionRate = measured.length === 0 ? 1 : abstained.length / measured.length;

const status = measured.length < BASKET.length / 2
  ? INCONCLUSIVE
  : anchorCoverage < MIN_ANCHOR_COVERAGE || abstentionRate > MAX_ABSTENTION
    ? FAIL
    : PASS;

process.exit(report({
  name: "abstention-rate",
  status,
  headline: status === INCONCLUSIVE
    ? `only ${measured.length}/${BASKET.length} cards could be measured`
    : status === FAIL
      ? `anchor coverage ${pct(withAnchor.length, measured.length)} (floor ${MIN_ANCHOR_COVERAGE * 100}%), abstention ${pct(abstained.length, measured.length)} (ceiling ${MAX_ABSTENTION * 100}%)`
      : `${pct(withAnchor.length, measured.length)} of the basket anchored, ${pct(abstained.length, measured.length)} abstained`,
  rows,
  detail: { anchorCoverage, abstentionRate, results },
}));
