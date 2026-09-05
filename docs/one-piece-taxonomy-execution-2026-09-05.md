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
| 3b | Taxonomy labels; English/中文 desktop and mobile captures; full gate | Pending |
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
