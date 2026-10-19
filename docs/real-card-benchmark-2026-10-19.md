# Real card benchmark — October 19, 2026

The benchmark now contains **87 real listing observations across 12 cards: six Pokémon and six One Piece**: an immutable 86-row first cohort plus one separately frozen production follow-up. Eighty-one observations have provisional agent field reviews; six Ace observations remain pending. This is textual identity and eligibility agreement, not human-adjudicated artwork accuracy or population buy accuracy.

## Decision and experiment

The useful instinct is to optimize against actual buyer failures. The strongest case for an evaluation agent is faster discovery of release collisions and missed complete-cost offers. Two serious objections are self-grading (production output becomes its own answer key) and stale/incomplete prices masquerading as savings. A third is tuning leakage across the same card's prints.

Decision: freeze source observations and independently review explicit fields, separate identity from eligibility and retrieval, then have a strong model propose tests. Only deterministic, tested fixes enter production. Owner: Codex implementation; founder owns final artwork/gold review. Review date: October 19, 2026. Success: recover observed tuning failures with zero new unsafe eligibility or held-out regressions. Kill/revert: any new wrong-print eligible row, invented charge, label mutation, or unapproved acquisition expansion. A remaining held-out miss is reported, not tuned away and relabeled as validation.

## Acquisition and evidence

- Fixed cohort: `src/lib/evaluation/real-card-cohort.json`; label dataset: `src/lib/evaluation/real-card-dataset.json`.
- 12 eBay-only public comparison requests, spaced 31 seconds apart, 628 primary candidates. No Apify allowance consumed. Eleven complete reports and one partial Ace report. One explicit follow-up retained Ace's 30 actual observations and source failure status instead of silently losing partial results.
- Main run: October 19 21:43–21:49 UTC. Giratina reused a server report observed at 21:29 UTC; observation times are retained. The collector does not claim every response was a cache miss.
- Minimal case evidence retains title, structured attributes, charges, seller claim, aggregate seller/evidence signals, source URL and timestamp. Buyer ZIP, seller identifiers, marketplace image URLs and raw page captures are absent. eBay tracking query parameters were removed from committed evidence; variation IDs are preserved.
- Agent labels explicitly state what they assess. `identity: null` allows an exclusion such as unknown shipping to be scored without pretending that artwork was checked. Agent reviews never count as human gold. Provider claims are not independent proof of authenticity, physical condition or current inventory.
- Six tuning families and six held-out families. Canonical number aliases and identical catalog names cannot cross splits. Optimization prompts exclude held-out rows even when the caller requests `--split all`. Historical price observations obey the same family split.
- Existing 32 synthetic tests remain a separate dataset. They are not mixed into these real-case percentages.

## First correction cycle

| Measurement on identical frozen inputs | Before (`a00557c` rules) | After |
| --- | ---: | ---: |
| Provisional field agreement | 70/80 (87.5%) | 79/80 (98.75%) |
| False identity accepts | 9 | 1 |
| Incorrectly eligible | 3 | 0 |
| Tuning agreement | 35/44 | 44/44 |
| Held-out agreement | 35/36 | 35/36 |
| Human gold | 0 | 0 |

The three defects corrected, each reproduced before changing implementation:

1. **Pokémon same-number commemorative releases.** A [Celebrations Charizard 4/102](https://www.ebay.com/itm/820256564156) was marked compatible with Base Set. Explicit Celebrations / Classic Collection / anniversary release claims now veto a conflicting confirmed release, including when item specifics claim the original set. Ordinary selling years are not a release veto. Searches for the actual Celebrations release retain positive controls.
2. **One Piece deck reprints.** The [Nami default winner](https://www.ebay.com/itm/306680357872) named LD-01 and Learn Together Deck Set while the selected card was Romance Dawn. These release aliases now participate in the existing unknown-release veto. No catalog metadata or reviewed mapping was invented or promoted.
3. **Graded product admitted as raw.** The [Charizard default winner](https://www.ebay.com/itm/307239721266) explicitly said “PCG 7.5 Graded”. PCG numeric grades are now recognized. Local aspirations such as “PSA 10 candidate” are not asserted grades; a separate actual slab claim still excludes. The comparison cache revision changes so earlier winners are not reused.

Remaining held-out failure: `base1-2-6` explicitly names **Base Set 2** with the original **2/102** number and is still classified compatible with Base Set. Its LP condition excludes it from NM ranking. This is an unresolved identity defect and must seed a subsequent tuning cycle with a new independent validation cohort; it is not counted as a pass here.

The immutable baseline is `docs/real-card-benchmark-baseline-2026-10-19.json`. After removing tracking parameters, the baseline was actually rerun with the old grading, print-fidelity and taxonomy modules loaded from Git `a00557c`; labels and listing fields were not changed to improve scores. The reproducible dataset hash is recorded in the JSON evidence.

## Price recall, separately measured

| Card / observation | Primary Cheapest | Additional probe | Gap, pre-tax | Evidence |
| --- | ---: | ---: | ---: | --- |
| Shanks OP09-001, Oct 19 | $1.49 | $1.48 | $0.01 | New, rule-passing; provisional |
| Law OP05-069, Oct 19 | $1.75 | $1.50 | $0.25 | New, rule-passing; provisional |
| Luffy OP05-119, Sep 28 | $38.98 | $5.02 | $33.96 | Historical, not a current offer |
| Law OP05-069, Sep 28 | $1.75 | $1.73 | $0.02 | Historical |
| Shanks OP09-001, Sep 28 | $1.59 | $0.99 | $0.60 | Historical |

These are incremental misses in a bounded sample, not guaranteed available bargains. The two new observations are small: neither passes the reporting threshold of both $1 and 5% improvement. Missing fees/shipping, incompatible condition, wrong prints and already-retrieved rows cannot count as missed opportunities. Negative probes never establish exhaustive recall. The main run had eight negative samples, two cheaper samples, one inconclusive sample and one missing observation from the initial partial response; the Ace follow-up added a negative sample.

No recall-probe result was promoted into ranking, and its ten-summary/two-second budget is unchanged. This cycle demonstrates identity/exclusion improvements; **it does not demonstrate improved retrieval coverage**. More aggressive acquisition needs its own bounded experiment and validation under the existing source contract.

## Agent and model selection

The existing Intenext provider was used with `claude-opus-4-8`. `--models` accepts up to three configured strong Opus/Sonnet/GPT models using the existing provider and credential group. Routing selects from recent schema-success history (last five outcomes per model), records the selected model, makes one call and stops on failure. It does not scan the gateway, create credentials, or silently use Haiku/mini/nano/luna. Availability is not a quality score. Optional triage has a configured 45-second request timeout; it is not on the buyer's search path.

The model proposed the release and PCG investigations, but also made unsupported suggestions. Its “2026 is temporally impossible” explanation was rejected. Its later request to increase the recall probe to 50 rows was also rejected: the source contract allows ten, and a historical timestamp cannot be fetched again. Suggestions do not execute code, change labels, expand budgets or deploy themselves.

Audit note: an initial price-triage call made **after the frozen identity replay** included historical Law/Shanks records with an incorrect tuning tag. That output was discarded; a cross-dataset split test now prevents it, and the final price review saw only Luffy tuning evidence. No identity correction followed that call. Do not reuse these families as unseen model-evaluation data in a later cycle.

## Commands

```powershell
# Offline real tuning replay; no network
node scripts/evaluate-card-accuracy.mjs --dataset src/lib/evaluation/real-card-dataset.json

# All real labels, compared with the frozen old-rule baseline
node scripts/evaluate-card-accuracy.mjs --dataset src/lib/evaluation/real-card-dataset.json --split all --baseline docs/real-card-benchmark-baseline-2026-10-19.json

# One optional strong-model review; only tuning observations reach the model
node scripts/evaluate-card-accuracy.mjs --dataset src/lib/evaluation/real-card-dataset.json --ai --models claude-opus-4-8

# Frozen historical/current price evidence; optional --ai is one extra call
node scripts/evaluate-price-recall.mjs

# Explicit new batch: 12 eBay-only comparisons, no automatic retries or scheduler
node scripts/collect-card-benchmark.mjs
```

Equivalent npm scripts: `eval:real`, `eval:recall`, `eval:collect`. Collected reports start pending; they are not automatically answer keys. Review the evidence and explicitly update versioned labels before scoring. The all-split command deliberately exits 1 while the Base Set 2 discrepancy remains; that exit is an evaluation finding, not a broken runner.

## Verification

Production follow-up: `87404ab` deployed READY as `dpl_96Gz466eRtshvzaQVsFTv9NbXPQm`. The actual Charizard flow removed the PCG slab winner and displayed the remaining $2,000 raw listing with a prominent “Consider waiting” / +110% reference warning. Nami's replacement winner exposed another pre-existing release conflict: its structured Set said **One Piece Demo Deck Cards** despite the Romance Dawn title. This became a separately versioned, one-row follow-up dataset (`src/lib/evaluation/real-card-followups.json`) so the original 86-row baseline stays immutable. A failing replay reproduced its incorrect eligibility; the existing release-veto table now recognizes Demo Deck, and the cache advances again. The original held-out family was not used to tune this follow-up.

Run the added regression independently with `node scripts/evaluate-card-accuracy.mjs --dataset src/lib/evaluation/real-card-followups.json`. Total retained evidence is now 87 cases, including this follow-up; the 70/80 → 79/80 figures above still describe the original frozen cohort only.

TDD reproduced the real failures and added label-state, family leakage, held-out prompt isolation, model routing, partial import, price math and unknown-cost checks. After the follow-up, the full suite passed **1,893 tests**, five optional tests skipped; lint, typecheck, metadata audit and webpack production build passed. The first parallel build/test attempt had one UI test timeout under load plus the expected old cache-key assertion; the cache expectation was updated and the full suite passed at four workers. Graphify's existing AST graph was consulted; its CLI is unavailable on this Windows host, so regeneration is not claimed.

Live built-in-browser smoke on `87404ab`: Charizard → Nami → Mew → Shanks → Giratina in one session, covering Edit and New search plus One Piece artwork confirmation. Shanks's receipt showed $1.48 in the separate recall check versus the original $1.49 Cheapest result, without changing the recommendation. English desktop, Chinese desktop and a 390×844 mobile viewport were inspected; mobile content width and scroll width both measured 375px (scrollbar excluded), with no horizontal overflow. Browser error log was empty. Screenshots: `C:/Users/徐晨濬/.codex/visualizations/2026/10/19/01a155ed-2546-7f01-b774-dc35f5ea5bd8/real-benchmark/production-{en,zh,zh-mobile}.png`.

Final runtime `79e08e9` is READY as `dpl_EqQwaQJdSXGuYjTdG9PBLG7D9inF`, aliased to lenstcg.com. The Git push was confirmed on main but produced no visible automatic deployment/check, so the existing Vercel Git connection was explicitly deployed at that exact SHA. A fresh Nami search and Romance Dawn base-art confirmation at 22:14 UTC returned 50 listings, 47 excluded and a $6.76 ordinary-version candidate (`940014409008`), replacing the Demo Deck winner. The page retained its +39% reference warning and wait suggestion. Receipt: `c1befde6aea14087bed2463688f58336`; screenshot: `production-nami-final.png` in the same folder. Browser error log and scoped deployment error/fatal log query were empty. No Apify request was involved.
