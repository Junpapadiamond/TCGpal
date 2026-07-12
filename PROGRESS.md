---
document: tcglens-progress
schema_version: 1
updated_at: 2026-07-12
canonical_branch: origin/main
last_verified_product_commit: 484115bb097db004c49f24602861d5a1bf4454e9
max_lines: 300
---

# TCGlens Progress

This is the compact handoff for new threads. It is an index, not a history log. Use stable section and workstream IDs to load only the context needed for the current task.

<!-- progress:section id="BOOTSTRAP" -->
## BOOTSTRAP

- Product: TCGlens, an evidence-backed listing comparison tool for U.S. raw-single buyers. Internal package/module names may still say TCGpal.
- Primary user: Pokemon and One Piece collectors or players buying considered cards, probably often above $50; the actual useful spend band is not validated.
- Core promise: confirm the exact print, compare concrete active listings, return one defensible recommendation or abstain with useful next moves.
- Current live concrete source: eBay Browse. TCGCSV/TCGplayer is an aggregate catalog and market reference, never seller inventory.
- Product state: suitable for a private moderated pilot after live verification; not proven for unrestricted self-serve launch, paid acquisition, subscriptions, or ads.
- Source of truth: current origin/main, AGENTS.md, Zod contracts in src/lib/schemas.ts, deterministic decisions in src/lib/comparison/ranking.ts, and observable behavior tests.
- Non-negotiable: a same-name, same-number, cheaper sibling print must never replace the selected artwork.
- Non-negotiable: research output never changes runtime identity, anchors, or ranking without explicit human-reviewed curation.
- Non-goals until the comparison pilot passes: auth, payments, saved collections, recommendation feeds, automated grading, and marketplace scraping.
<!-- progress:end -->

<!-- progress:section id="TASK-INDEX" -->
## TASK-INDEX

| ID | Workstream | Size | State | Next action |
|---|---|---:|---|---|
| WS-IDENTITY | Exact-print selection and listing fidelity | Large refactor | Released; live verification active | Run a human-adjudicated live corpus |
| WS-METADATA | One Piece special-print research and publication | Large research stream | Review-gated | Choose and review a first publication cohort |
| WS-PILOT | Demand, usability, and trust validation | Large product stream | Not started | Recruit 10 target buyers and test 30 listings |
| WS-UX | Best Buy / Inspect First / Next Moves experience | Medium refactor | Released; user validation pending | Observe empty and ambiguous outcomes |
| WS-DISTRIBUTION | Additional marketplaces and growth | Large expansion | Deferred | Do not expand before correctness and pilot gates |
| WS-LOCAL | Dirty local experiments | Mixed | Base Set fix completed; photo search undecided | Decide D-PHOTO; preserve the original checkout |
<!-- progress:end -->

<!-- progress:section id="GOALS" -->
## GOALS

### Big goals

1. G-TRUST: Make the selected catalog image, marketplace listing, market anchor, and recommendation refer to the same exact print.
2. G-AHA: Make the result feel like “this is exactly the buy list I need; no more searching or confirmation.”
3. G-DEMAND: Prove collectors save time, trust the evidence, change or confirm a decision, and return for another card.
4. G-SCALE: Add marketplaces and distribution only after exact-match quality and provider boundaries are defensible.
5. G-BUSINESS: Test subscription or advertising only after repeat use and purchase authority are demonstrated.

### Small measurable gates

- At least five sequential searches per session across Pokemon and One Piece, including Edit and New Search, without state leakage.
- Human-adjudicated corpus of at least 30 real listings with zero known invariant violations and at least 90% expert agreement.
- At least 8 of 10 pilot users complete a comparison within 60 seconds.
- At least 30% report that evidence changed or confirmed their action.
- At least 4 of 10 return with another card within 14 days.
- Fewer than 10% correct the confirmed card/version.
- At least three voluntarily share a comparison receipt.
<!-- progress:end -->

<!-- progress:workstream id="WS-IDENTITY" state="released-unverified-live" tags="selection,matching,ebay,tcgplayer,nami,manga,special-print" -->
## WS-IDENTITY - Exact-print accuracy

### Done

- Canonical print identity survives selection, request/response validation, caching, querying, ranking, and rendering.
- Match classes are exact, compatible, unknown, and mismatch; confirmed mismatches cannot rank and unknowns cannot become Best Buy.
- One Piece manga, SP, wanted poster, gold/silver, super alternate, anniversary, tournament, promo, and reprint distinctions have curated/runtime support where explicitly reviewed.
- Nami SP and the eight bundled OP01-016 prints have regression coverage; selected P4 remains OP01-016_p4.
- eBay ePID use and TCGplayer product resolution abstain when exact identity cannot be proven.
- Signed/serialized aliases normalize to strict facets; unsupported textured/stamped searches abstain rather than show siblings.
- Vintage Base Set crosswalks rank the most specific TCGCSV group and reject loose collector-number collisions with another card name.

### What went wrong

- Earlier matching treated name, collector number, or broad alternate-art labels as sufficient and could substitute a cheaper sibling artwork.
- TCGplayer group/product fallback could select an arbitrary parallel.
- Special suffixes such as _p2 are not universally manga; suffix semantics cannot be guessed.

### Not finished or not verified

- Verified: automated gates passed on 484115b: lint, typecheck, 42 test files / 463 tests, and build. The earlier bilingual desktop/mobile visual QA and strict-facet manual abstention remain evidenced on 7637f56.
- Unknown: representative live eBay recall, false exclusions, ePID coverage, and p95 latency across a 30-listing corpus.
- Unknown: whether exact listings often fall below the bounded eBay item-detail enrichment window.
- Required: live checks for reported Nami, Charmander, Portgas.D.Ace, manga, tournament, gold/silver, anniversary, and Pokemon variant cases.

### Read first

- src/lib/schemas.ts
- src/lib/ai/listing-compare.ts
- src/lib/comparison/print-fidelity.ts
- src/lib/comparison/ranking.ts
- src/lib/external/ebay.ts
- src/lib/external/tcgcsv.ts
- src/lib/comparison/variant-fidelity.test.ts
<!-- progress:end -->

<!-- progress:workstream id="WS-METADATA" state="review-gated" tags="one-piece,research,audit,manga,promo,tournament,automation" -->
## WS-METADATA - One Piece research ledger

### Done

- Reproducible generator and weekly review-PR workflow cover 2,040 bundled English print records.
- Current audit: 1,579 verified, 225 conflicting, 236 unresolved, 784 manual-review candidates, and runtime publication blocked.
- Publication fails closed on weak confidence, conflicts, shared mappings, unknown provenance, missing hashes, insufficient global image margin, missing human approval, or an empty ledger.
- The generator retains unresolved/conflicting rows and refuses to overwrite output when candidate discovery is empty.
- Runtime imports no research ledger or audit artifact.

### Not finished

- All 2,040 rows still require an explicit human review decision before broad publication.
- Heuristic image RMSE and release-token matching remain research evidence, not proof.
- Many special prints still have unknown artwork/release semantics or shared external product mappings.
- No automatic safe promotion pipeline exists by design; promotion must update curated runtime metadata with tests and review.

### Decision needed

- D-METADATA-COHORT: choose the first cohort to review and publish, for example manga-only, high-value gold/silver, or tournament/promos. Do not publish all 784 candidates at once.

### Read first

- output/one-piece-exact-print-audit.json summary and blockers only
- scripts/research-one-piece-exact-prints.mjs
- scripts/lib/one-piece-metadata-audit.mjs
- src/lib/external/one-piece-print-metadata.ts
- .github/workflows/refresh-one-piece-metadata.yml

Avoid loading the 5+ MB ledger. Query a specific canonicalPrintId when needed.
<!-- progress:end -->

<!-- progress:workstream id="WS-PILOT" state="not-started" tags="demand,needs,taste,pricing,validation,buyer" -->
## WS-PILOT - Demand and buyer validation

### Current evidence

- Council conclusion: conditional GO for a private moderated pilot and NO-GO for paid acquisition or subscription work.
- The likely pain is reducing noisy listings for condition-sensitive, higher-consideration raw purchases.
- No completed buyer sessions, repeat-use evidence, willingness-to-pay result, or measured time savings exist.

### Not finished

- Recruit 10 recent raw-single buyers.
- Assemble and adjudicate 30 real listings across games, conditions, price bands, wrong versions, novelty items, and unknown shipping.
- Measure completion time, identity corrections, decision change, repeat comparison, receipt sharing, and trust objections.
- Investigate whether the useful price floor is near $50 or materially higher.

### Read first

- docs/validation-plan.md
- docs/product-spec.md
- docs/product-principles.md
- output/product-readiness-audit-2026-07-10/council/chairman.md (historical; missing from origin/main, retained as an artifact in the original checkout)
- docs/councils/tcgpal_feature_scorecard.md (historical; missing from origin/main, retained as an artifact in the original checkout)
<!-- progress:end -->

<!-- progress:workstream id="WS-UX" state="released-needs-observation" tags="best-buy,inspect-first,next-moves,empty-state,localization" -->
## WS-UX - Decision experience

### Done

- Card search now has explicit identity and comparison phases: name-only searches show the identity gallery, exact catalog matches proceed with a fixed confirmed-card anchor, and same-number sibling prints remain confirmation-gated.
- `POST /api/agent/card-identity` resolves catalog identity without marketplace fan-out, ranking, or market-anchor work; the comparison route remains backward-compatible.
- The result-page Edit button follows the newly typed query: set-only One Piece searches such as `luffy op01` say Browse card versions and return to identity confirmation instead of implying listing comparison.
- Exact version image selection immediately submits the canonical print.
- Results distinguish best_buy, inspect_first, and next_moves.
- Empty results do not use demo or low-confidence inventory as real recommendations.
- Selected catalog image and listing evidence remain visible; minimum condition can be edited.
- English and Chinese desktop/mobile states have automated and visual coverage.

### Not finished or not verified

- The no-trustworthy-listing state avoids false certainty but may still create a dopamine drop.
- Next Moves offers actions, but no user study proves which action preserves momentum.
- The “exact buy list” aha moment and result wording have not been tested with target buyers.

### Decision needed

- D-NEXT-MOVES: choose whether the empty state should prioritize refine search, paste a listing, marketplace reference links, alerts/retry, or educational identity help. Validate rather than filling space with weak listings.

### Read first

- src/features/comparison/ComparisonApp.tsx
- src/features/comparison/i18n.tsx
- src/features/comparison/ComparisonApp.test.tsx
- src/lib/testing/standard-comparison-flow.ts
<!-- progress:end -->

<!-- progress:workstream id="WS-DISTRIBUTION" state="deferred" tags="marketplaces,distribution,business,subscription,ads" -->
## WS-DISTRIBUTION - Sources, distribution, and business model

- eBay is the only live concrete-listing source. Manual links and pasted listings are clearly separate.
- Cross-marketplace discovery is desirable but scraping or unlicensed server-side fetching is outside current boundaries.
- Subscription and advertising are hypotheses, not implemented models.
- Marketplace expansion, paid acquisition, and monetization are deferred until WS-IDENTITY and WS-PILOT gates pass.
- Open launch question: marketplace/data terms and any required partner agreements need review before a public commercial launch.
<!-- progress:end -->

<!-- progress:section id="DECISIONS" -->
## DECISIONS

The user must decide these; agents must not infer them:

1. D-FOCUS: next primary focus - live accuracy corpus, metadata cohort review, pilot research, or a specific product bug.
2. D-METADATA-COHORT: which special-print cohort receives human approval first.
3. D-PHOTO: keep or discard the local photo-search experiment. It conflicts with the current “no scanning/image upload” scope and has not been approved.
4. D-SPEND: which purchase band to target; the current “mostly above $50” belief needs research.
5. D-NEXT-MOVES: which useful action should lead when no trustworthy buy exists.
6. D-MONETIZATION: subscription, advertising, or neither; defer implementation until repeat demand is measured.
<!-- progress:end -->

<!-- progress:section id="LOCAL-STATE" -->
## LOCAL-STATE

Observed on 2026-07-12 in /Users/chenjunhsu/Desktop/projects/TCGpal:

- Local main was at 5e6899e and diverged from origin/main. Use the progress snapshot for current ahead/behind counts; do not hard-code them here.
- The working tree contained user changes. Preserve them; do not reset, clean, or include them incidentally.
- Superseded local adjustment: src/lib/external/tcgcsv.ts and its test contain an older attempt to prevent vintage Base Set collisions. The reviewed origin/main-based implementation is commit 484115b; preserve the older dirty files until the user reconciles the divergent checkout.
- Unapproved experiment: photo-search route/tests and related package changes. Behavior and scope are not verified; see D-PHOTO.
- Untracked UI concept: TCGpal_more_ui_refine.html.
- Untracked council docs, research output, screenshots, Graphify backups, and cache files are artifacts, not automatically release work.

Refresh this section with /progress; do not assume it remains current.
<!-- progress:end -->

<!-- progress:section id="FIRST-READ" -->
## FIRST-READ

| Task | Read only these first |
|---|---|
| Any new thread | AGENTS.md, PROGRESS.md BOOTSTRAP + TASK-INDEX |
| Exact card/listing bug | WS-IDENTITY, schemas.ts, listing-compare.ts, print-fidelity.ts, relevant test |
| One Piece special metadata | WS-METADATA, audit summary, generator/audit code, curated runtime metadata |
| Ranking/recommendation | schemas.ts, ranking.ts, platforms.ts, ranking/platform tests |
| UI/product flow | WS-UX, ComparisonApp.tsx, i18n, standard flow |
| Product/demand decision | WS-PILOT, validation plan, product spec, council chairman |
| Marketplace expansion | AGENTS.md data boundaries, platforms.ts, architecture/data-sources doc |
| Dirty local work | LOCAL-STATE, then git diff for only the named files |

Use Graphify before broad cross-file exploration. Verify ambiguous graph edges in source.
<!-- progress:end -->

<!-- progress:section id="VERIFICATION" -->
## VERIFICATION

Last verified feature commit: 72c5b1a plus the pending result Edit CTA fix on 2026-07-12.

- Clean isolated worktree: `npm run lint` passed.
- Clean isolated worktree: `npm run typecheck` passed.
- Clean isolated worktree: `npm run test` passed, 44 files / 473 tests; includes the bilingual set-only Edit CTA regression, identity route/client regressions, and the sequential multi-card flow.
- Clean isolated worktree: `npm run build` passed on Next.js 16.2.6 and emitted `/api/agent/card-identity` as a dynamic route.
- Visual: identity-first English/Chinese desktop/mobile QA passed for the Pikachu identity shell/gallery, exact Umbreon VMAX 215/203 flow, and eight-print Nami OP01-016 sibling gallery. No mobile overflow or browser console errors were observed; evidence is under `output/identity-first-visual-qa/`.
- Visual: result Edit with `luffy op01` shows Browse card versions / 浏览卡片版本 and transitions to the Luffy identity gallery; evidence is under `output/edit-search-cta-fix/`.
- Reduced motion: the identity flow reads `prefers-reduced-motion`, and the global reduced-motion media rule remains present; a device-level emulation was not available in the in-app browser run.
- Dirty-checkout caveat: the full commands in the original checkout still fail because untracked photo-search tests reference absent implementation files. Those experiment files were not modified; feature verification used an isolated worktree.
- Peer review: identity and UX reviewers approved after fixes; chairman approved.
- Remote: origin/main matched 7637f56fb20c7bfeeeca278b7ab960b0b46b0928.

Still not verified:

- Representative live eBay accuracy/recall and latency.
- Human-adjudicated 30-listing quality gate.
- Ten-buyer demand/usability pilot.
- Monetization, distribution economics, and public-launch legal/provider readiness.
- Dirty local experiments in LOCAL-STATE.
<!-- progress:end -->

<!-- progress:section id="UPDATE-PROTOCOL" -->
## UPDATE-PROTOCOL

When the user invokes /progress or $progress:

1. Run the installed progress skill snapshot script.
2. Refresh branch/head/divergence and LOCAL-STATE without modifying unrelated work.
3. Update only affected workstream sections using stable IDs.
4. Record failures and unverified claims, not just successes.
5. Add user decisions to DECISIONS; remove them only after the user decides.
6. Keep this file under 300 lines and avoid transcript-style history.
7. In a new thread, load only BOOTSTRAP, TASK-INDEX, the selected WS-*, and its first-read files.
<!-- progress:end -->
