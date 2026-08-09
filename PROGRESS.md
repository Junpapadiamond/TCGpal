---
document: tcglens-progress
schema_version: 1
updated_at: 2026-08-09
canonical_branch: origin/main
last_verified_product_commit: 47ec98b
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
- Product state: receipt-first founder testing is ready; recruit a small moderated pilot only after repeated trust testing, not for unrestricted launch, paid acquisition, subscriptions, or ads.
- Source of truth: current origin/main, AGENTS.md, Zod contracts in src/lib/schemas.ts, deterministic decisions in src/lib/comparison/ranking.ts, and observable behavior tests.
- Non-negotiable: a same-name, same-number, cheaper sibling print must never replace the selected artwork.
- Non-negotiable: research output never changes runtime identity, anchors, or ranking without explicit human-reviewed curation.
- Non-goals until the comparison pilot passes: auth, payments, saved collections, recommendation feeds, automated grading, and marketplace scraping.
<!-- progress:end -->

<!-- progress:section id="TASK-INDEX" -->
## TASK-INDEX

| ID | Workstream | Size | State | Next action |
|---|---|---:|---|---|
| WS-IDENTITY | Exact-print selection and listing fidelity | Large refactor | Catalog-outage fixture leak closed and verified | Monitor live timeout and recall evidence |
| WS-METADATA | One Piece special-print research and publication | Large research stream | Review-gated | Choose and review a first publication cohort |
| WS-PILOT | Demand, usability, and trust validation | Large product stream | Founder self-test ready | Test receipts repeatedly, then recruit 10 target buyers |
| WS-UX | Best Buy / Inspect First / Next Moves experience | Medium refactor | Receipt experience verified at `47ec98b` | Observe trust, sharing, and empty outcomes |
| WS-DISTRIBUTION | Agent interfaces, plugins, and additional marketplaces | Mixed | MCP released; Firecrawl frontier tracer killed | Keep Firecrawl out of production; revisit only after tracer failure modes change |
| WS-LOCAL | Dirty local artifacts and tools | Mixed | Photo/UI cleanup decided; advisor skill installed | Preserve Graphify, research, and screenshot artifacts |
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

<!-- progress:workstream id="WS-IDENTITY" state="v5-released-needs-observation" tags="selection,matching,ebay,tcgplayer,nami,robin,zoro,manga,special-print,mew,history" -->
## WS-IDENTITY - Exact-print accuracy

### Done

- Canonical print identity survives selection, request/response validation, caching, querying, ranking, and rendering.
- Match classes are exact, compatible, unknown, and mismatch; confirmed mismatches cannot rank and unknowns cannot become Best Buy.
- One Piece manga, SP, wanted poster, gold/silver, super alternate, anniversary, tournament, promo, and reprint distinctions have curated/runtime support where explicitly reviewed.
- Nami SP and the eight bundled OP01-016 prints have regression coverage; selected P4 remains OP01-016_p4.
- eBay ePID use and TCGplayer product resolution abstain when exact identity cannot be proven.
- Signed/serialized aliases normalize to strict facets; unsupported textured/stamped searches abstain rather than show siblings.
- Vintage Base Set crosswalks rank the most specific TCGCSV group and reject loose collector-number collisions with another card name.
- Shared collector-number parsing now owns zero-padding equivalence, boundary-safe matching, and conflicts across eBay, print fidelity, pasted/manual candidates, identity selection, crosswalk, and TCGCSV. Bubble Mew `232/91` accepts seller `232/091`; wrong numbers are explicit high-confidence mismatches.
- One Piece positive proof now intersects evidence across every same-number sibling. Shared release/class wording and internal `_pN/_rN` IDs cannot prove a print; sibling/language/treatment conflicts veto acceptance.
- Shared raw/slab detection covers PSA/BGS/CGC/SGC/ACE/TAG descriptor forms and ranking. MCP comparison/identity contract v4 and plugin 1.0.1 separate canonical print proof from seller/photo purchase review.
- Comparison contract v5 and plugin 1.0.2 add typed product/condition/cost/price/language/identity/availability issues. Law Manga and Robin Heroines SP use seller-visible positive proof; graded, language, condition, and shipping exclusions no longer masquerade as artwork mismatches.
- Pokémon search now keeps Mew/Mewtwo, combination cards, and Trainer products in strict name tiers, requests a bounded identity-only payload, and reloads full data only after stable-ID confirmation.
- Client request generations abort stale identity/comparison work. Native Next.js 16 history entries restore search, confirmation, and result snapshots without placing buyer or listing facts in the URL.
- Identity search now carries cancellation from browser to route, resolver, and Pokémon fetch; one 18-second server budget permits the adapter's bounded 8-second attempt, 400 ms backoff, and retry while still returning before the 20-second route cap. Identical requests coalesce per server instance, successful identities use hashed 15-minute cache entries with a six-hour stale fallback, and provider deadlines return an explicit temporary-unavailable result.
- Closed One Piece version groups no longer mount their cards until opened. A 2026-07-17 five-card live check measured One Piece resolution at 16–50 ms, uncached Pokémon at 7.427 s, cached repeat at 20 ms.
- A catalog-outage lookup now returns an explicit empty/unavailable result instead of the bundled demo identities: while pokemontcg.io was 500ing, `umbreon` resolved to the two Umbreon VMAX fixtures rather than the catalog's 42 prints. Retries are two backoffs (300 ms, 1200 ms) under a 14 s ceiling, and single-word names walk the relaxed wildcard ladder.
- A 2026-07-30 production check reproduced `Suicune` unavailable after 13.76 s: the catalog's first attempt can consume its full 8 s timeout, and the former 10 s shared deadline cancelled the retry. Regression coverage preserves a 10.5 s recovery; after deployment `Suicune` returned 27 candidates in 5.65 s.

### What went wrong

- Earlier matching treated name, collector number, or broad alternate-art labels as sufficient and could substitute a cheaper sibling artwork.
- TCGplayer group/product fallback could select an arbitrary parallel.
- Special suffixes such as _p2 are not universally manga; suffix semantics cannot be guessed.
- Live diagnostics on 2026-07-12 reproduced cross-facet false positives for Nami `OP01-016_p4`, Nami `EB03-053_p2`, Robin `EB03-055_p2`, and Zoro siblings. Later market-floor hardening rejects implausibly cheap rows but does not repair the underlying artwork-facet proof gap.
- The demo-fixture identity fallback survived because every outage test used a name no fixture matched, so the leak only ever fired for Umbreon; outage tests now assert an empty candidate list for a name the fixtures *do* match. Separately, `exclusionPatterns` required the literal `extended art case`, so a bare `... 215/203 Extended Art` ranked as an eligible raw single — neither game has that print class, and the phrase only names aftermarket product.

### Current evidence and remaining gate

- Automated: all 39 historical unrelated-product fixtures remain ineligible at the complete v5 boundary; sibling matrices and six-family sealed holdout remain the identity substitution gates. The provisional corpus is pending human review and is no longer allowed to label correct Manga/SP identity as a mismatch merely because a row is graded or non-English.
- Performance: classifier p99 0.0917 ms; hermetic full-comparison p95 changed +2.33%, within the 10% gate.
- Official eBay Browse checks passed for Bubble Mew, Base Alakazam, Nami/Robin/Zoro, manga, anniversary, tournament, Winner, and graded/custom exclusions. Genuine evidence gaps still abstain.
- Remaining: complete a human-adjudicated 30-listing production sample before claiming population accuracy; monitor live recall and the 12-item enrichment window. Gold/silver and broader market families retain automated coverage but still need periodic live sampling.
- Review the seven-day production identity timeout rate after the 2026-07-30 repair. If more than 5% of uncached Pokémon searches still hit the 18-second deadline, or p95 remains above 8 seconds, promote the lightweight local Pokémon identity index from a parked option to a separately evaluated workstream.

### Read first

- src/lib/schemas.ts
- src/lib/ai/listing-compare.ts
- src/lib/ai/card-identity-runtime.ts
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
- Card-version investigations now follow `docs/card-identity-research-policy.md`: official evidence first, structured/specialist cross-checks second, and Reddit/forums/community reports as discovery or corroboration only. Promotion still requires explicit human approval and sibling-negative tests.

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
- docs/card-identity-research-policy.md
- .github/workflows/refresh-one-piece-metadata.yml

Avoid loading the 5+ MB ledger. Query a specific canonicalPrintId when needed.
<!-- progress:end -->

<!-- progress:workstream id="WS-PILOT" state="founder-testing" tags="demand,needs,taste,pricing,validation,buyer" -->
## WS-PILOT - Demand and buyer validation

### Current evidence

- Council conclusion: conditional GO for a private moderated pilot and NO-GO for paid acquisition or subscription work; no new buyer-session evidence was recorded from July 17 through July 23.
- The likely pain is reducing noisy listings for condition-sensitive, higher-consideration raw purchases.
- No completed external buyer sessions, repeat-use evidence, willingness-to-pay result, or measured time savings exist; the founder will test receipts before recruiting.

### Not finished

- Recruit 10 recent raw-single buyers.
- Assemble and adjudicate 30 real listings across games, conditions, price bands, wrong versions, novelty items, and unknown shipping.
- Measure completion time, identity corrections, decision change, repeat comparison, receipt sharing, and trust objections.
- Investigate whether the useful price floor is near $50 or materially higher.

### Read first

- docs/validation-plan.md
- docs/product-spec.md
- docs/product-principles.md
- Historical council artifacts (`output/product-readiness-audit-2026-07-10/council/chairman.md`, `docs/councils/tcgpal_feature_scorecard.md`) are absent from origin/main and retained only in the original checkout.
<!-- progress:end -->

<!-- progress:workstream id="WS-UX" state="released-needs-observation" tags="best-buy,inspect-first,next-moves,empty-state,localization" -->
## WS-UX - Decision experience

### Done

- Card search now has explicit identity and comparison phases: name-only searches show the identity gallery, exact catalog matches proceed with a fixed confirmed-card anchor, and same-number sibling prints remain confirmation-gated.
- `POST /api/agent/card-identity` resolves catalog identity without marketplace fan-out, ranking, or market-anchor work; the comparison route remains backward-compatible.
- The result-page Edit button follows the newly typed query: set-only One Piece searches such as `luffy op01` say Browse card versions and return to identity confirmation instead of implying listing comparison.
- The comparison loader keeps one fixed confirmed-card anchor and restores motion with three decorative copies of that same print only; reduced-motion users keep the static anchor without positional movement.
- Exact version image selection immediately submits the canonical print.
- Results distinguish best_buy, inspect_first, and next_moves.
- Empty results do not use demo or low-confidence inventory as real recommendations.
- Result listings show only the seller/listing image; the selected print remains explicit in the separate text identity block, avoiding an unsupported implication that TCGlens visually compared it with the catalog reference. Minimum condition remains editable.
- eBay results preserve up to 24 official seller-photo URLs and open them in a lazy-mounted in-page gallery with thumbnails, keyboard navigation, focus restoration, and zoom. Copy explicitly says TCGlens has not verified condition or authenticity from the photos.
- Supporting listings now read as one hairline ledger; generic exact-print evidence collapses to a keyboard-focusable `✓ print` / `✓ 版本` tag while special-print reasons retain the full evidence block.
- Single identity candidates are centered, the recommendation explainer is compressed, and the landing marquee excludes SAMPLE-watermarked One Piece hosts while filling from curated clean card art.
- Immutable public-by-link `/r/{id}` receipts preserve the exact card, one pick plus one second look, evidence/unknowns, timestamp, stable sharing, OG/Twitter metadata, and a fresh re-check. New result journey URLs restore the newest card/condition receipt without re-running providers; EN/中文 desktop and 390px mobile are verified.
- Non-NM searches now show an item-price read again. `deriveMarketRead` in `ranking.ts` reports the delta plus a `conditionMatched` flag: NM↔NM keeps the existing badge, everything else renders neutral as "under/above NM reference" with the condition-blind caveat and stays out of `priceScore`. No condition multiplier is invented.

### Not finished or not verified

- The no-trustworthy-listing state avoids false certainty but may still create a dopamine drop.
- Next Moves offers actions, but no user study proves which action preserves momentum.
- The “exact buy list” aha moment, receipt trust surface, and shareability have not been tested with target buyers.

### Decision needed

- D-NEXT-MOVES: choose whether the empty state should prioritize refine search, paste a listing, marketplace reference links, alerts/retry, or educational identity help. Validate rather than filling space with weak listings.

### Read first

- src/features/comparison/ComparisonApp.tsx
- src/features/comparison/i18n.tsx
- src/features/comparison/ComparisonApp.test.tsx
- Receipt flow: src/features/receipt/ReceiptPageClient.tsx, src/lib/comparison/report-snapshot.ts
- src/lib/testing/standard-comparison-flow.ts
<!-- progress:end -->

<!-- progress:workstream id="WS-DISTRIBUTION" state="mcp-released-firecrawl-frontier-killed" tags="mcp,plugin,agents,marketplaces,distribution,business,firecrawl,frontier" -->
## WS-DISTRIBUTION - Sources, distribution, and business model

- A versioned capabilities REST endpoint and production-path Streamable HTTP MCP server expose identity browsing, bounded discovery, exact-card comparison, and deep-link continuation through the existing domain engine.
- The repo/team `tcglens` Work plugin 1.0.1 bundles the production remote MCP connection and an anti-FOMO usage skill. Other Codex users can add the public GitHub marketplace and install it, but it is not published in ChatGPT's universal plugin directory and therefore is not searchable/installable from the phone plugin catalog.
- MCP comparison contract v4 has a separate rate-limit/request-ID/ops boundary and separates canonical-ID/print proof from seller/photo purchase review without full traces or provider credentials.
- v1 uses deep links back to the website. Inline Apps SDK UI, OAuth, and per-user quota are explicitly deferred.
- eBay is the only live concrete-listing source. Manual links and pasted listings are clearly separate.
- Cross-marketplace discovery is desirable but scraping or unlicensed server-side fetching is outside current boundaries.
- Subscription and advertising are hypotheses, not implemented models.
- Marketplace expansion, paid acquisition, and monetization are deferred until WS-IDENTITY and WS-PILOT gates pass.
- Open launch question: marketplace/data terms and any required partner agreements need review before a public commercial launch.
- Firecrawl `/scrape` JSON mode failed the 2026-07-31 six-platform frontier tracer: 3/6 reviewable pages, 56.25% raw factual precision, 0/6 cost-comparable, 14.768-second median latency, and 72 total credits. Yahoo Auctions JP and SNKRDUNK returned high-confidence schema-shaped example payloads; Mercari JP was region-blocked after a JP tunnel failure.
- The deterministic frontier harness discards placeholder payloads, unsupported zero defaults, `N/A` sentinels, and generic seller boilerplate. It is isolated from product routes, `PlatformAgent`, caches, analytics, and ranking. The 30-page expansion was stopped by its predefined kill criteria; evidence and retest conditions are in `docs/frontier-firecrawl-pilot.md`.
<!-- progress:end -->

<!-- progress:section id="DECISIONS" -->
## DECISIONS

The user must decide these; agents must not infer them:

1. D-METADATA-COHORT: which special-print cohort receives human approval first.
2. D-SPEND: which purchase band to target; the current “mostly above $50” belief needs research.
3. D-NEXT-MOVES: which useful action should lead when no trustworthy buy exists.
4. D-MONETIZATION: subscription, advertising, or neither; defer implementation until repeat demand is measured.
5. D-NAMING: whether public copy and internal package/module naming should converge on TCGlens or TCGpal; do not change either without owner direction.
<!-- progress:end -->

<!-- progress:section id="LOCAL-STATE" -->
## LOCAL-STATE

Observed on 2026-08-09 in the primary checkout `/Users/chenjunhsu/Desktop/projects/TCGpal`:

- Receipt branch `codex/receipt-pages` is at verified product commit `47ec98b`, one commit ahead of local/remote `main` at `da56731`; fast-forward and push are pending.
- Eight tracked files are modified: this handoff, six generated Graphify files, and `package-lock.json`. There are 218 untracked entries, dominated by generated Graphify and `output/` artifacts; their intent and verification are unknown except for `output/receipt-visual-qa/`, created for this receipt check and not staged.
- Eighteen worktrees exist. Preserve all dirty Graphify, research, screenshot, review, and design artifacts as local work-in-progress; do not include, clean, or prune them without an explicit scoped task.

Refresh this section with /progress; do not assume it remains current.
<!-- progress:end -->

<!-- progress:section id="FIRST-READ" -->
## FIRST-READ

| Task | Read only these first |
|---|---|
| Any new thread | AGENTS.md, PROGRESS.md BOOTSTRAP + TASK-INDEX |
| Exact card/listing bug | WS-IDENTITY, `src/lib/schemas.ts`, `src/lib/ai/listing-compare.ts`, `src/lib/comparison/print-fidelity.ts`, relevant colocated test |
| One Piece special metadata | WS-METADATA, `output/one-piece-exact-print-audit.json` summary, generator/audit code, curated runtime metadata |
| Ranking/recommendation | `src/lib/schemas.ts`, `src/lib/comparison/ranking.ts`, `src/lib/comparison/platforms.ts`, relevant tests |
| UI/product flow | WS-UX, `src/features/comparison/ComparisonApp.tsx`, `src/features/receipt/ReceiptPageClient.tsx`, `src/lib/comparison/report-snapshot.ts`, `src/lib/testing/standard-comparison-flow.ts` |
| Product/demand decision | WS-PILOT, `docs/validation-plan.md`, `docs/product-spec.md`; historical council artifacts are missing from `origin/main` |
| Agent/MCP or marketplace expansion | AGENTS.md production/frontier boundaries, `src/app/mcp/route.ts`, `src/lib/mcp/tools.ts`, `docs/architecture-and-data-sources.md`, `docs/frontier-firecrawl-pilot.md`, and `src/lib/comparison/platforms.ts` |
| Dirty local work | LOCAL-STATE, then git diff for only the named files |

Use Graphify before broad cross-file exploration. Verify ambiguous graph edges in source.
<!-- progress:end -->

<!-- progress:section id="VERIFICATION" -->
## VERIFICATION

Current verified product commit: `47ec98b` on 2026-08-09 (receipt-first implementation; pending fast-forward to `main` at this update).

- 2026-08-09 receipt release: artifact-excluded lint passed; typecheck passed; 67 files / 886 tests passed; Next.js 16.2.6 production build passed with dynamic `/r/[id]` and OG routes. Built-in-browser QA covered EN/中文 desktop, 390px mobile with no horizontal overflow, stable URL copying, latest-receipt replay with no second provider POST, and five sequential live searches across Pokémon/One Piece using both Edit and New Search. Full unfiltered lint/test remain red only because preserved untracked `output/exact-print-eval` research contains four lint errors and 115 explicitly expected failures.
- 2026-08-03 catalog-outage/market-read fix: lint, typecheck, 62 files / 858 src tests, and a Next.js production build passed. A live re-check while pokemontcg.io was ~60% 500ing returned 42 real `umbreon` prints on three consecutive runs with no warnings (browser: 42 matches across 25 sets). Built-in-browser QA covered EN/中文 desktop and 375px mobile — Lightly Played rendered the neutral "under NM reference" badge, Near Mint kept the condition-matched badge, console empty. Caveat: `npm run test` also runs 115 pre-existing failures and 4 lint errors under untracked `output/` research artifacts (`corpus-false-positives.test.ts` is titled "expected to fail today"), confirmed byte-identical on the base commit; `vitest.config.ts` now excludes `.claude/worktrees/**`, which was running other branches' copies of every test.
- Earlier UI release `d613d66` passed lint, typecheck, 845 tests, build, and English/中文 desktop/mobile browser QA without overflow or browser errors.
- The merged result retained the eBay seller-photo gallery, 44px listing actions, keyboard order, and reduced-motion behavior; browser error logs were empty.
- Seller photos remain display-only evidence: no automated condition/authenticity inference and no ranking integration. Extra images mount only after the gallery opens.

Still not verified:

- Population-level live eBay recall and precision remain unproven until the 30-listing human-adjudicated sample; the known cross-facet sibling reproductions are fixed in v4 and covered by zero-substitution regressions.
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
