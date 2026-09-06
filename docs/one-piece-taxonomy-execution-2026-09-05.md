# One Piece taxonomy execution evidence

Owner: Codex for implementation and measurement; founder for rule scope, twin merging and
mapping-row approval. Review date: 2026-09-06 or before promotion, whichever comes first.
Starting branch: `codex/one-piece-taxonomy`, from `0109532`; origin/main is an ancestor.

## Decision and falsifiable boundary

The underlying instinct is to stop vocabulary drift. A shared module is the proposed
mechanism. The strongest case is the observed Treasure Rare substitution: one missing
consumer detector defeated otherwise correct knowledge. Two serious objections are that
moving vocabulary can alter precedence and break exact-print proof, and that a taxonomy can
force ambiguous releases into unsupported classes. It also consumes effort without moving
the four image-dependent accuracy misses.

Proceed with Phase 0/1 evidence first, then one consumer at a time. The smallest test is a
synthetic unseen rarity failing completeness while current catalog values pass. During Phase 2,
success is at least 656 target self-acceptances, at most 90 target abstentions and zero target
or whole-catalog substitutions/self-rejections after each move. An unexplained regression
kills consolidation; preserve Phase 1. The plan's two-session limit remains in force.
Phase 3 requires separate behavior tests and a live PRB/promo anchor run with unchanged booster
anchors before merging that matcher. Founder decisions are reported, never assumed approved.

## Evidence versus assumptions

- Observed: inherited alignment/base-title tests pass locally (55 tests).
- Observed: raw census has 53 prefixes, 7 overlapping leader-named deck families, 476 prints
  under the explicitly listed event keywords, and TR prints before OP16. The plan's contrary
  estimates are corrected in the census; no runtime classification changed to fit them.
- Observed: 629 twin prints / 247 families reproduce, with 258 distinct twin groups.
- Assumption to test: shared vocabulary can preserve every classifier decision.
- Observed: live alias matching adds two PRB and four promo anchors; six booster controls are unchanged.
- Unproven: image-equal twin rows can be merged, or scope guards can safely be relaxed.

## Phase checklist

| Phase | Required evidence | State |
|---|---|---|
| 0 | Census, taxonomy/failure doc, source-backed lexicons, full gate | Passed: lint/typecheck/build; 89 test files, 1,385 tests passed, 4 live reviews skipped |
| 1 | Completeness across rarity/stem/release and synthetic IR rejection; full gate | Passed: lint/typecheck/build; 90 files, 1,394 tests passed, 4 live reviews skipped |
| 2 | Shared taxonomy, each consumer audited, no duplicated class regexes; full gate | Passed: lint/typecheck/build; 90 files, 1,395 tests passed, 4 live reviews skipped; each consumer audit unchanged |
| 3a | Unique anchor aliases, real-name tests, live before/after anchors; full gate | Passed: lint/typecheck/build; 91 files, 1,411 tests passed, 5 live reviews skipped; live run passed |
| 3b | Taxonomy labels; English/中文 desktop and mobile captures; full gate | Passed: lint/typecheck/build; 92 files, 1,416 tests passed, 5 live reviews skipped; five-search browser smoke passed |
| 3c | Above-market review disposition, exact anchor only; full gate | Pending |
| 4 | Buy accuracy, market anchors, official twin images, ePID probe; founder report | Pending |

## Environment

This Windows checkout started without dependencies or npm. Node was supplied by the desktop
runtime; npm 10.9.3 was installed outside the repository and dependencies installed from the
existing lockfile. No dependency changes were requested. The checked-in Graphify graph is
older than the inherited classifier work and its documented CLI path is macOS-only; use
focused source inspection until a local graph updater is available. `.env.local` is absent;
credential availability and live source readiness must be measured without exposing secrets.

The metadata audit initially failed because Git converted its hashed source to CRLF.
Normalizing to LF reproduced the committed SHA-256 exactly; `.gitattributes` now preserves
LF for the source and audit without changing either JSON payload. `graphify update .` was
attempted and is unavailable on this host; no graph regeneration is claimed.
No eBay or other provider credentials were present in the process environment or local env
files at this checkpoint. TCGCSV is public and its market-anchor measurement remains possible.

Phase 0 commit: `aeacba9`. Phase 1 adds a taxonomy module that no runtime consumer imports
yet. Coverage names every unseen rarity/stem/release, including synthetic `IR`; six unresolved
release names are explicitly enumerated rather than admitted by a catch-all. It found eight
Uta Deck Battle rows missing from the first pattern pass. A full-suite UI test exposed its
existing typewriter timing assumption; that static-copy assertion now requests reduced motion,
and the subsequent full suite passed. No UI runtime code changed.

Phase 1 commit: `2e4e3ee`. Phase 2 consumer audits so far:

| Move | Target accepted / abstained / rejected / substitutions | Whole catalog accepted / abstained / rejected / substitutions |
|---|---|---|
| Pre-migration source, independently rerun | 656 / 90 / 0 / 0 | 3,977 / 594 / 0 / 0 |
| Print-fidelity vocabulary and detector precedence | 656 / 90 / 0 / 0 | 3,977 / 594 / 0 / 0 |
| Ranking vocabulary and shared class derivation | 656 / 90 / 0 / 0 | 3,977 / 594 / 0 / 0 |
| eBay class/research/release query terms | 656 / 90 / 0 / 0 | 3,977 / 594 / 0 / 0 |
| Metadata enrichment and release facets | 656 / 90 / 0 / 0 | 3,977 / 594 / 0 / 0 |
| Shared class-rule data and remaining treatment/release detectors | 656 / 90 / 0 / 0 | 3,977 / 594 / 0 / 0 |

The original 590 whole-catalog abstentions was stale. The pre-migration source was temporarily
loaded and audited, then restored in a `finally` block; 594 is not a consolidation regression.
The audit writer now includes the whole-catalog summary and the target test pins the
656/90 thresholds. Its npm entry point now runs on Windows as well as POSIX.
An AST test guards against class-word regexes returning to the four runtime consumers.
Only `{phrase, axis, value}` lexicon projections enter the module; supporting titles and
unapproved ledger rows remain outside runtime imports. Public schema subsets and detector
precedence are preserved; the taxonomy's starter-deck description does not silently expand
the current public release-channel contract.

## Phase 3a anchor evidence

Phase 2 shipped in `c72ccf9`. The anchor matcher uses exact taxonomy group aliases and
requires full card name, collector number, and a single print-proven product. The heterogeneous
Promotion Cards group cannot supply release evidence. No seed IDs were added. A candidate
feed failure remains a provider failure rather than becoming evidence of uniqueness.

Real-name crosswalk tests failed first (9 of 14); the final 16 tests also cover wrong names,
wrong numbers, competing credible rows, different volumes and a failed alias feed. The
metadata revision changes to invalidate cached crosswalks. The classifier audit remains
656/90/0/0 target and 3977/594/0/0 catalog-wide.

`npm run measure:market-anchor -- --taxonomy` records public TCGCSV reference evidence,
separately from the older eBay-based price-deviation measurement. See the
[before](one-piece-taxonomy-anchors-before-2026-09-05.json) and
[after](one-piece-taxonomy-anchors-after-2026-09-05.json) artifacts. The after run includes
normalized source hashes because the implementation was uncommitted when measured.
Two PRB prints and four promo prints gained anchors; P-001_p3 still abstains. The six sampled
booster controls retained the same product IDs, groups and reference prices. This establishes
the named sample, not an empirical claim about every booster. No listing availability or
artwork accuracy is inferred from aggregate reference prices. Full gate: lint, typecheck,
1,411 tests across 91 files (5 live reviews skipped), and production build passed.

## Phase 3b picker evidence

Phase 3a shipped in `d4269fd`. Presentation derives artwork class, reviewed treatment,
reprint provenance and release name from the taxonomy; semantic identity fields are untouched.
All 4,571 prints have English/Chinese labels without internal P/R ordinals. Text twins still
share labels and remain separate catalog choices. Real Nami and gold Luffy tests verify that
localized buttons submit the original exact IDs. Pokémon image descriptions are preserved.

Built-in browser, 1440×1000 desktop and 390×844 mobile:
[English desktop](taxonomy-qa-2026-09-05/picker-en-desktop.png),
[Chinese desktop](taxonomy-qa-2026-09-05/picker-zh-desktop.png),
[Chinese mobile](taxonomy-qa-2026-09-05/picker-zh-mobile.png),
[mobile labels](taxonomy-qa-2026-09-05/picker-zh-mobile-labels.png).
No horizontal overflow (375px document inside a 390px viewport). Five sequential searches
completed using both Edit and New Search: Nami OP01-016_p3, Charizard base1-4, Pikachu base1-58,
Zoro OP06-118, and Luffy ST01-001. Nami's result URL preserved the selected exact ID.
No browser console errors were observed. Local eBay credentials are absent: all five results
abstained from recommending inventory. These are UI/source-degradation checks, not buy-accuracy
measurements. Nami displayed the newly resolved TCGCSV anchor; Luffy had no exact mapping.
The full gate passed after the final layout refinement (1,416 tests, 92 files, 5 live skips).

## Phase 3c exact-anchor price review

Phase 3b shipped in `8d8874b`. The ceiling sends a proven One Piece NM listing to
Inspect First when its item price is strictly above five times its selected print's
TCGCSV reference and at least $20 higher. The listing stays identity-compatible and
eligible, with a price issue carrying `review` disposition, but cannot win any buy lens.
The report schema enforces this boundary, and the ranking cache revision changes.
Shipping, tax, played/unknown conditions, demo inventory, missing or unmatched anchors,
and unresolved identities do not activate the ceiling.

The underlying instinct is to prevent an extreme ask from becoming the recommended buy.
The strongest case is the adjudicated $79.99 ST01-001 listing against the documented
approximate $2 base reference. Two objections are stale/incorrect anchors and legitimate
premiums that a condition-blind aggregate cannot describe. Five times plus $20 is a
conservative experiment, not a calibrated economic boundary. The $2 fixture is modeled;
the current live Luffy anchor is absent, so this change cannot be claimed to fix that miss.
Owner: Codex for implementation; founder for threshold policy. Review: 2026-09-06 with
the Phase 4 results. Success: outliers become price-review leads, ordinary prices and
noncomparable cases remain unchanged, and identity audits stay at zero errors. Kill:
an unexplained identity regression or the rule firing on those ordinary/boundary cases.

Real-title TDD covers all lenses, factor/dollar boundaries, item-only cost, condition,
anchor provenance and public report validation. A hermetic comparison uses the observed
Nami product 527619 and its real product name. Browser QA found two missing positive
identity-reason translations; these now describe the existing rules without changing them.
Captures use a visibly labeled historical-title fixture with a modeled anchor, not live
inventory: [English desktop](taxonomy-qa-2026-09-06/ceiling-en-desktop.png),
[Chinese desktop](taxonomy-qa-2026-09-06/ceiling-zh-desktop.png), and
[Chinese mobile](taxonomy-qa-2026-09-06/ceiling-zh-mobile.png). Mobile document and viewport
are both 390px. The temporary visual route was removed before the production build.
The existing deploy-drift tests exceeded their Git-process time budgets on Windows;
only that suite's setup/probe timeouts were increased, with all six assertions preserved.
Full gate passed: lint, typecheck, 1,426 tests in 93 files (5 live reviews skipped),
and production build. The 2026-09-06 audit remains 656/90/0/0 target and
3977/594/0/0 catalog-wide. Graphify remains unavailable on this Windows host; its
checked-in graph was not regenerated.

## Phase 4 completion

Phase 3c shipped in `a147d00` and its Vercel production deployment was observed READY.
The [Phase 4 report](one-piece-taxonomy-phase4-2026-09-06.md) records all requested live
instruments, all 629 official twin images/513 pairs, and the founder-owned decisions.
The buy run returned 12 Best Buy / 1 Inspect First. Provisional agent observations are
8 matching / 2 wrong-print-or-product / 3 unclear; human review is pending. The Ace
price-review trigger worked live, but its photo was a different artwork. The Chopper
winner was a slab-art accessory. The ePID probe returned a keyword fallback and is
inconclusive about Catalog print discrimination. These findings are reported, not promoted.

Final Phase 4 handoff gate: lint passed with one research-export unused-variable warning;
typecheck, 1,430 tests in 94 files (5 opt-in reviews skipped), and production build passed.
Report links, JSON parsing and diff whitespace checks passed; PROGRESS remains 299 lines.
