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
- Unproven: alias-enabled PRB/promo anchors will resolve uniquely against live TCGCSV products.
- Unproven: image-equal twin rows can be merged, or scope guards can safely be relaxed.

## Phase checklist

| Phase | Required evidence | State |
|---|---|---|
| 0 | Census, taxonomy/failure doc, source-backed lexicons, full gate | Passed: lint/typecheck/build; 89 test files, 1,385 tests passed, 4 live reviews skipped |
| 1 | Completeness across rarity/stem/release and synthetic IR rejection; full gate | Pending |
| 2 | Shared taxonomy, each consumer audited, no duplicated class regexes; full gate | Pending |
| 3a | Unique anchor aliases, real-name tests, live before/after anchors; full gate | Pending |
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
