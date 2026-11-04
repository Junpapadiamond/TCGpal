# Ranking lens audit — November 3, 2026

The founder reported mediocre Best Value choices and Best-documented selecting fewer photos. Three independent agent audits reviewed scoring, photo acquisition and frozen real reports. This is a correction of demonstrated ranking defects, not evidence of improved overall buyer satisfaction.

## Observed failures

- With a fresh $100 item-only market reference, otherwise identical $90 + $20 shipping could beat $100 delivered. Best Value consumed the item-price score and only considered complete cost in tie-breaking.
- Without an applicable reference, min/max scaling turned a $100/$101 spread into the full 40-point value-price contribution. Adding a dominated $1,000 offer changed the winner without changing either relevant offer.
- Photo evidence plateaued at eight images. Equal evidence then favored seller score, so a real 10-photo Giratina at $1,106 beat a 21-photo listing at $900. Both were eligible for that Any-condition request; the latter was LP, not NM.
- Five excluded rows across the Giratina/Charizard captures counted the same eBay image at two sizes as two photos. These captures do not establish a winner affected by this acquisition defect.

## Decision and bounded test

Underlying need: a defensible buy that accounts for money actually paid, and a documentation lens whose ordering matches its evidence. Strongest case: correct the observable contradictions before tuning subjective preference weights.

Two objections constrain the mechanism. First, the cheapest observed compatible listing is not a market valuation; an entirely expensive field can still contain a relative winner. Retain item-only market warnings, freshness rules and price/identity guards. Second, more photos can repeat views and never prove condition/authenticity; genuinely confirmed coverage remains ahead of raw photo count. Photo count is limited to distinct images returned by the bounded source, not the complete marketplace gallery.

Use `costScore = round(100 × lowest recommendable complete cost / this complete cost)` for Best Value's existing 40% cost input. Keep condition/seller/evidence weights at 25/20/15. A 10% premium scores 91 for cost (roughly 3.6 composite points less), while a 40-point seller improvement contributes eight composite points. This is a transparent policy tradeoff, not a learned buyer preference. Both-zero costs score 100; positive costs against a zero baseline score zero. Unknown costs and review/excluded rows never enter the baseline. Item-only `priceScore` remains separate.

Keep diminishing photo evidence points for Best Value/Safest. For Best-documented, compare evidence score, distinct returned photo count, seller score, complete cost and stable ID. Use one comparator for selection and alternative ordering. Deduplicate official eBay image-size variants by returned image ID and retain the largest returned URL without constructing or fetching another image.

Smallest falsifiable test: behavioral counterexamples plus frozen report replay at original observation times. Success requires cost-split invariance, dominance, no reversal from adding a dominated expensive offer, stronger evidence winning a small-price-gap case, deterministic ordering, correct photo ties and zero promotions across identity/condition/cost/high-value review gates. Kill criteria: any such invariant fails, any review-only row wins, or UI describes a market discount/verified condition without evidence. Owner: TCGlens maintainer (Codex implementation); review date: November 10, 2026. The next preference review requires buyer-adjudicated comparisons; current identity/eligibility accuracy metrics cannot measure recommendation satisfaction. No new automated job is created.

## Compatibility and verification

`costScore` is additive and defaults to null for historical receipts. Saved scores are preserved; the diagnostic formula appears only when the score is present. Fresh report and eBay source-cache namespaces invalidate earlier scoring/photo counts. Existing snapshots remain explicitly saved observations and are not silently reranked.

TDD: new ranking, independent invariant, photo identity, receipt ordering, schema compatibility and diagnostic tests failed before their corresponding fixes and passed afterward. Frozen replay covers three reports / 150 rows. Giratina retains Best Value $820.99 NM / six photos, and Best-documented becomes $900 LP / 21 photos. Charizard and Umbreon retain zero buy recommendations; eligibility/exclusion counts are unchanged. Raw captures and local replay artifacts stay ignored. This is a regression check, not a representative recommendation-quality benchmark.

Release gate passes lint, TypeScript, metadata validation, 2,019 tests (five optional live checks skipped), and the webpack production build. Built-in browser QA used the real development UI with frozen source facts and current ranking, visibly labeled as local QA. Documented selected the 21-photo LP offer; English/Chinese desktop and 390px mobile views were checked, with no broken images or horizontal overflow. The photo dialog opened and advanced from 1/21 to 2/21. Search/confirmation/Edit/New Search behavior did not change; the automated sequential multi-card contract passed. A React review found no new fetching, effects, component remounts or accessibility changes.

Graphify and the plugin validator are absent at the documented Windows/legacy paths; no regeneration or validator success is claimed. No provider permissions, paid starts, acquisition budgets or automated schedules were changed.

## Production verification

Product commit `77dbec4` is READY in deployment `dpl_D1Ym9FaAew7UvkQ4jgSMxEh899Mm`, aliased to `lenstcg.com`. One fresh Giratina V 186/196 Any-condition search at `2026-11-04T03:24:31Z` used only eBay: 50 listings, 28 excluded, 20 eligible-but-review-only and two recommendable. The persisted report contains the new complete-cost scores: $900 LP / 21 photos scores cost 100 and value 82; $1,106 NM / 10 photos scores cost 81 and value 80. Best Value, Cheapest and Documented select the former; Safest selects the latter. These are a later live field, distinct from the frozen replay above.

Built-in browser lens switching matches those report choices. English/Chinese desktop and 390px mobile screens pass, with zero broken images, no horizontal overflow and no console errors observed. Receipt `7cecdbaf31314dcaa29f0c40e2f0268b` restores the saved result without acquisition. No cross-market provider was started. Local screenshots and the private live report are under `output/qa/ranking-audit-2026-11-03/` (ignored).
