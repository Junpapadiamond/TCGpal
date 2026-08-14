---
document: tcglens-progress
schema_version: 1
updated_at: 2026-08-11
canonical_branch: origin/main
last_verified_product_commit: 289d334
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
| WS-IDENTITY | Exact-print selection and listing fidelity | Large refactor | D-OP-BASE-PROOF run and KILLED at 52.6%; four deterministic gates added; One Piece buy accuracy measured at 9/13 (69.2%) | Decide D-OP-IMAGE-PROOF: all four remaining misses need the photo, not the text |
| WS-METADATA | One Piece special-print research and publication | Large research stream | Review-gated | Choose and review a first publication cohort |
| WS-PILOT | Demand, usability, and trust validation | Large product stream | Founder self-test ready | Test receipts repeatedly, then recruit 10 target buyers |
| WS-UX | Best Buy / Inspect First / Next Moves experience | Medium refactor | Version picker opened + release-ordered at `22ccb64` | Observe trust, sharing, and empty outcomes; watch picker length on flagship names |
| WS-DISTRIBUTION | Agent interfaces, plugins, and additional marketplaces | Mixed | MCP released; retrieval-agent Phase 0 done, Phase 1 not started | Do not build the agent: Phase 0 measured its premise as unfounded (see WS-DISTRIBUTION) |
| LOCAL-STATE | Dirty local artifacts and tools | Mixed | Photo/UI cleanup decided; advisor skill installed | Preserve Graphify, research, and screenshot artifacts (no separate WS section; see LOCAL-STATE) |
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

- Canonical print identity survives selection, validation, caching, querying, ranking, and rendering. Match classes are exact/compatible/unknown/mismatch; confirmed mismatches cannot rank and unknowns cannot become Best Buy.
- Nami SP and the eight bundled OP01-016 prints have regression coverage; selected P4 remains OP01-016_p4. One Piece manga, SP, wanted poster, gold/silver, super alternate, anniversary, tournament, promo, and reprint distinctions have curated/runtime support where explicitly reviewed.
- eBay ePID and TCGplayer product resolution abstain when exact identity cannot be proven; signed/serialized aliases normalize to strict facets and unsupported textured/stamped searches abstain rather than show siblings.
- Vintage Base Set crosswalks rank the most specific TCGCSV group and reject loose collector-number collisions. Shared collector-number parsing owns zero-padding equivalence, boundary-safe matching, and conflicts across eBay, print fidelity, pasted/manual candidates, identity selection, crosswalk, and TCGCSV: Bubble Mew `232/91` accepts seller `232/091`, wrong numbers are high-confidence mismatches.
- One Piece positive proof now intersects evidence across every same-number sibling. Shared release/class wording and internal `_pN/_rN` IDs cannot prove a print; sibling/language/treatment conflicts veto acceptance.
- Shared raw/slab detection covers PSA/BGS/CGC/SGC/ACE/TAG forms. Comparison contract v5 and plugin 1.0.2 add typed product/condition/cost/price/language/identity/availability issues, separating canonical print proof from purchase review; graded, language, condition, and shipping exclusions no longer masquerade as artwork mismatches.
- Pokémon search now keeps Mew/Mewtwo, combination cards, and Trainer products in strict name tiers, requests a bounded identity-only payload, and reloads full data only after stable-ID confirmation.
- Identity search carries cancellation from browser to route, resolver, and Pokémon fetch under an 18-second server budget inside the 20-second route cap. Identical requests coalesce per server instance, successful identities use hashed 15-minute cache entries with a six-hour stale fallback, and provider deadlines return an explicit temporary-unavailable result. The stale fallback only helps a warm key: a card never searched has nothing to fall back to, so warming the demo set before a session is the cheapest outage mitigation.
- A 2026-07-17 five-card live check measured One Piece resolution at 16–50 ms, uncached Pokémon at 7.427 s, cached repeat at 20 ms. (Deferred group mounting was replaced on 2026-08-11 by deferred painting; see WS-UX.) Client request generations abort stale identity/comparison work. Native Next.js 16 history entries restore search, confirmation, and result snapshots without placing buyer or listing facts in the URL.
- A catalog-outage lookup returns an explicit empty/unavailable result instead of the bundled demo identities: while pokemontcg.io was 500ing, `umbreon` resolved to the two Umbreon VMAX fixtures rather than the catalog's 42 prints. Single-word names walk the relaxed wildcard ladder.
- A 2026-07-30 production check reproduced `Suicune` unavailable after 13.76 s: the catalog's first attempt can consume its full 8 s timeout, and the former 10 s shared deadline cancelled the retry. Regression coverage preserves a 10.5 s recovery; after deployment `Suicune` returned 27 candidates in 5.65 s.
- `484483a`: a One Piece number with exactly one catalogued print is now proven by number + card name, matching the Pokémon standard for a print-unique number. 1,628 of 2,634 numbers (61.8%) were unprovable by construction — `buildMarkerOwners` keeps only markers owned by fewer than every sibling, unsatisfiable with one witness — so every plain title fell to `unknown`. `ST01-001` went 50 found / 0 eligible to 40 proven / 7 eligible / Buy. Artwork-class and treatment vetoes still run first; multi-print numbers still need positive evidence.
- `612701d` + `c797e96`: name-only coverage was truncated twice — `searchPokemonCards` clamped to 50, then the call site asked for only 100 — and since the query is ordered `-set.releaseDate` both losses were the oldest prints. "Pikachu" (177 prints) returned 97 candidates / 37 sets / nothing before 2017; Base Set was unselectable because it was never fetched. At the API maximum of 250: 172 candidates / 87 sets / 1999-2026. `289d334`: raising that timeout to a flat 15s silently killed the retry ladder — the budget compared *elapsed* time against 14s, so one attempt exhausted it, and every existing retry test still passed because they reject instantly and never spend time. Attempt timeouts now escalate (4s/5s/9s) and the budget is checked against what the next attempt could still cost. Instant 5xx bursts still get all three attempts; simulated against the measured failure profile, "try again" falls 45% to 29%. The four constants now have invariant tests, since none looks wrong alone.
- `17c0085`: the eBay item-detail budget is now `EBAY_DETAIL_BUDGET`, default unchanged at 12 of 50.

### What went wrong

- Earlier matching treated name, collector number, or broad alternate-art labels as sufficient and could substitute a cheaper sibling artwork.
- TCGplayer group/product fallback could select an arbitrary parallel. Special suffixes such as _p2 are not universally manga; suffix semantics cannot be guessed.
- Live diagnostics on 2026-07-12 reproduced cross-facet false positives for Nami `OP01-016_p4`, Nami `EB03-053_p2`, Robin `EB03-055_p2`, and Zoro siblings. Later market-floor hardening rejects implausibly cheap rows but does not repair the underlying artwork-facet proof gap.
- The demo-fixture identity fallback survived because every outage test used a name no fixture matched, so the leak only ever fired for Umbreon; outage tests now assert an empty candidate list for a name the fixtures *do* match. Separately, `exclusionPatterns` required the literal `extended art case`, so a bare `... 215/203 Extended Art` ranked as an eligible raw single — neither game has that print class, and the phrase only names aftermarket product.
- Three defects on 2026-08-11 shared one shape: a bound that looked locally reasonable and silently discarded data. A 50-row clamp, a 100-card page, and a 14s retry budget each capped what the layer above had already asked for, without erroring. Two were found only by measuring production; the third was introduced while fixing the second. `printMatch === "exact"` is never returned by `print-fidelity.ts`; the strongest positive is `compatible`. The value exists in the type and schema but is unreachable, so any metric written against it scores zero.

### Current evidence and remaining gate

- Automated: all 39 historical unrelated-product fixtures remain ineligible at the complete v5 boundary; sibling matrices and six-family sealed holdout remain the identity substitution gates. The provisional corpus is pending human review and is no longer allowed to label correct Manga/SP identity as a mismatch merely because a row is graded or non-English.
- Performance: classifier p99 0.0917 ms; hermetic full-comparison p95 changed +2.33%, within the 10% gate. Official eBay Browse checks passed for Bubble Mew, Base Alakazam, Nami/Robin/Zoro, manga, anniversary, tournament, Winner, and graded/custom exclusions. Genuine evidence gaps still abstain.
- Remaining: complete a human-adjudicated 30-listing production sample before claiming population accuracy; monitor live recall and the 12-item enrichment window. Gold/silver and broader market families retain automated coverage but still need periodic live sampling.
- Review the seven-day production identity timeout and "try again" rate after the 2026-08-11 retry repair. If more than 5% of uncached Pokémon searches still hit the 18-second deadline, promote the lightweight local Pokémon identity index from a parked option to a separately evaluated workstream. pokemontcg.io was measurably unhealthy on 2026-08-11 (0/5 then 3/6 on `/v2/sets?pageSize=1`; successful full-page fetches averaged 6-10s), so the sample must span a healthy window before the rate means anything.
- Exact-print recall baseline is 21/30 (70.0%) — Pokémon 18/18, One Piece 3/12. Reproduce with `npm run measure:print-recall`; card set in `src/lib/testing/print-recall-cards.ts`, evidence in `docs/print-recall-baseline-2026-08-10.md`. The remaining 9 misses are all One Piece multi-print base prints blocked by print proof, not retrieval.
- The D-OP-BASE-PROOF sampler exists and is unrun against live eBay: `npm run sample:base-proof` writes a Markdown adjudication sheet plus JSON sidecar, `-- --score <sheet>` reads the filled verdicts back and applies the decision's own >=90% ship / <80% kill rule per card and pooled. It only reads reports; running it adopts nothing. `scripts/lib/compare-probe.mjs` now owns the request shape and retry rules shared with `measure-print-recall.mjs`, so a sample cannot describe rows a different buyer context produced.

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

- Reproducible generator and weekly review-PR workflow cover 2,040 bundled English print records. Current audit: 1,579 verified, 225 conflicting, 236 unresolved, 784 manual-review candidates, and runtime publication blocked.
- Publication fails closed on weak confidence, conflicts, shared mappings, unknown provenance, missing hashes, insufficient global image margin, missing human approval, or an empty ledger. The generator retains unresolved/conflicting rows and refuses to overwrite output when candidate discovery is empty.
- Runtime imports no research ledger or audit artifact. Card-version investigations now follow `docs/card-identity-research-policy.md`: official evidence first, structured/specialist cross-checks second, and Reddit/forums/community reports as discovery or corroboration only. Promotion still requires explicit human approval and sibling-negative tests.

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

- Card search now has explicit identity and comparison phases: name-only searches show the identity gallery, exact catalog matches proceed with a fixed confirmed-card anchor, and same-number sibling prints remain confirmation-gated. The comparison loader keeps one fixed confirmed-card anchor (reduced-motion users get it static); exact version image selection immediately submits the canonical print; results distinguish best_buy / inspect_first / next_moves and never use demo or low-confidence inventory as real recommendations.
- `POST /api/agent/card-identity` resolves catalog identity without marketplace fan-out, ranking, or market-anchor work; the comparison route remains backward-compatible. The result-page Edit button follows the newly typed query: set-only One Piece searches such as `luffy op01` say Browse card versions and return to identity confirmation instead of implying listing comparison.
- Result listings show only the seller/listing image; the selected print remains explicit in the separate text identity block, avoiding an unsupported implication that TCGlens visually compared it with the catalog reference. Minimum condition remains editable. Supporting listings now read as one hairline ledger; generic exact-print evidence collapses to a keyboard-focusable `✓ print` / `✓ 版本` tag while special-print reasons retain the full evidence block.
- eBay results preserve up to 24 official seller-photo URLs and open them in a lazy-mounted in-page gallery with thumbnails, keyboard navigation, focus restoration, and zoom. Copy explicitly says TCGlens has not verified condition or authenticity from the photos. Single identity candidates are centered, the recommendation explainer is compressed, and the landing marquee excludes SAMPLE-watermarked One Piece hosts while filling from curated clean card art.
- Immutable public-by-link `/r/{id}` receipts preserve the exact card, one pick plus one second look, evidence/unknowns, timestamp, stable sharing, OG/Twitter metadata, and a fresh re-check. New result journey URLs restore the newest card/condition receipt without re-running providers; EN/中文 desktop and 390px mobile are verified.
- Non-NM searches now show an item-price read again. `deriveMarketRead` in `ranking.ts` reports the delta plus a `conditionMatched` flag: NM↔NM keeps the existing badge, everything else renders neutral as "under/above NM reference" with the condition-blind caveat and stays out of `priceScore`. No condition multiplier is invented.
- Decision block de-genericised (`2ac0c6c`, live). Every buy result used to carry one constant sentence; the action note is now the next step and varies with the listing ("Open the 11 photos and confirm the print before you commit"). `pricePosition` ranks the pick among the copies found ("2nd cheapest of 5 comparable copies") and needs no market anchor, covering the cards TCGCSV misses. "Why not the cheapest" stopped arguing against a listing the Cheapest lens recommends and became a neutral ladder. Risk verdicts now name the seller numbers that set the label instead of saying "risk signals". No action note in either language may imply future supply — a test enforces it.
- AI-written Action note is built but shipped off (`AI_VERDICT_NOTE=0` server, `AI_VERDICT_NOTE_UI_ENABLED=false` client). `verdict-copy.ts` keeps buy/wait/pass, the label, and every number; the model only rewrites the sentence under the label from a numbered fact sheet, and `checkVerdictNote` discards notes with unsupported money/percent/count values, unsupported-claim wording, over 3 sentences or 300 characters, unknown fact ids, or the wrong language — every rejection falls back silently. With its own budget (30s at `low` effort, not `buildNarrative`'s 12s cap) it scored 21/21 accepted with zero fallbacks across `gpt-5.4` and `gpt-5.6-luna`, versus 15-16/21 before; a read-through found zero wrong facts and the checker has never rejected a note. Evidence `docs/verdict-note-review-2026-08-09.md`, regenerate with `npm run verdict:review`; flag-off behaviour verified in EN + 中文.
- Known gap before enabling: notes reliably repeat price/photos/returns and omit the case-defining caveat (buyer-entered facts, Japanese-language listing, unverified seller, unstated condition). Nothing false is said and the deterministic "What to know" line still carries those, but the prompt should require the caveat fact when present.
- The configured gateway dropped `gpt-5.6-luna` for ~10 minutes on 2026-08-10 (`model_not_found` on plain curl, `gpt-5.4` unaffected) and restored it. Model availability there is not guaranteed; the deterministic fallback is what makes that a non-event.
- Version picker reworked on 2026-08-11 (`22ccb64`). Set groups arrive open instead of collapsed — a click per set revealed, most often, a single card, identified only by a set name. Groups sort newest-set-first from catalog release dates, and the set filter reads "Evolving Skies (2021)"; the filter value stays the bare set name so faceting is unchanged. Release order is used because score order cannot be: on a name-only query every exact-name match earns the identical score, so the tie-break fell through to the catalog API's own ordering. Affordable because paint is deferred to the browser (`content-visibility: auto` plus a reserved intrinsic size) rather than by leaving cards unmounted: no observer, no virtualisation, no dependency, every card findable by browser search, and only 7 of 187 images loaded on a 186-card picker. Expansion is capped by a 60-card budget (`IDENTITY_EXPANDED_CARD_BUDGET`) — "Vinsmoke Reiju" (20 cards/8 sets), "Shanks" (54/28) and "Nami" (89/53) open in full, while "Monkey.D.Luffy" (186/74) would otherwise render 49,024px (~68 screens) and is now 16,834px with 13 groups open. One Piece set options stay unlabelled: the bundled catalog has no dates and set codes would mis-order the promo, anniversary, and reprint lines.

### Not finished or not verified

- The no-trustworthy-listing state and Next Moves avoid false certainty, but no user study proves which action preserves momentum.
- Market-anchor calibration (`docs/market-anchor-calibration-2026-08-10.md`, rerun with `npm run measure:market-anchor`): the anchor is fresh and unbiased, but same-day asks for one card spread 33-36 points so the 15% wait threshold fires on ~1 in 5 listings from ordinary seller variance; 5 of 8 sampled cards had no anchor at all; the Mewtwo & Mew-GX 222/236 anchor looks crosswalked to the wrong printing. The new `pricePosition` read covers the gap; the threshold itself is not yet retuned.
- The landing rail's cold-start pool remains eight hardcoded Pokémon cards. Replace it with a verified, freshness-bounded catalog source before adding One Piece entries or making any "newest" or "chase right now" claim; the current UI makes neither claim.
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
- eBay is the only live concrete-listing source. Manual links and pasted listings are clearly separate. Cross-marketplace discovery is desirable but scraping or unlicensed server-side fetching is outside current boundaries.
- Subscription and advertising are hypotheses, not implemented models. Marketplace expansion, paid acquisition, and monetization are deferred until WS-IDENTITY and WS-PILOT gates pass.
- Open launch question: marketplace/data terms and any required partner agreements need review before a public commercial launch.
- Firecrawl `/scrape` JSON mode failed the 2026-07-31 six-platform frontier tracer: 3/6 reviewable pages, 56.25% raw factual precision, 0/6 cost-comparable, 14.768-second median latency, and 72 total credits. Yahoo Auctions JP and SNKRDUNK returned high-confidence schema-shaped example payloads; Mercari JP was region-blocked after a JP tunnel failure. The deterministic frontier harness discards placeholder payloads, unsupported zero defaults, `N/A` sentinels, and generic seller boilerplate. It is isolated from product routes, `PlatformAgent`, caches, analytics, and ranking. The 30-page expansion was stopped by its predefined kill criteria; evidence and retest conditions are in `docs/frontier-firecrawl-pilot.md`.
- Retrieval-agent Phase 0 is complete and it argues against Phase 1. `docs/plan-retrieval-agent-2026-08-10.md` assumed the product abstains because one search per platform returns the wrong prints. Measured: every failing card returned a full first page of 50 live listings, and 0 of 500 candidates across the ten failures were print-provable. The agent's own stop condition is `eligible >= 1`, which no query could reach for those cards, so it would spend its full step budget and move recall 0 points — under the plan's own 5-point kill criterion. The blocker was a deterministic ranking rule; half of it was fixed in `484483a` for 0 model calls. Phase 1 stays not started. Baseline harness (`npm run measure:print-recall`) is kept for whatever replaces it. Also corrected by Phase 0: the plan's premise that the failures abstain with `next_moves`. They return `inspect_first`, so the buyer does get a listing to inspect. Real problem, lower severity than written.
<!-- progress:end -->

<!-- progress:section id="DECISIONS" -->
## DECISIONS

The user must decide these; agents must not infer them:

1. D-METADATA-COHORT: which special-print cohort receives human approval first.
2. D-SPEND: which purchase band to target; the current “mostly above $50” belief needs research.
3. D-NEXT-MOVES: which useful action should lead when no trustworthy buy exists.
4. D-MONETIZATION: subscription, advertising, or neither; defer implementation until repeat demand is measured.
5. D-NAMING: whether public copy and internal package/module naming should converge on TCGlens or TCGpal; do not change either without owner direction.
6. D-DETAIL-BUDGET: how many eBay rows get the item-detail call. Default is still 12 of 50. Measured over 483 paired listings (each its own control, three arms at budget 0/12/50 seconds apart, inner-joined on item id): 57.3% of rows state no condition on the search summary, the detail call resolves 69.0% of those, and 67.5% of the flips are Near Mint — 109 eligible listings at 12 versus 158 at 50, +45% comparable supply, growing on 6 of 10 cards and shrinking on none. Cost is ~3.9x the Browse calls (13 to 51 per comparison), so the answer depends on the daily Browse quota, which is unknown here. A flat 50 also overspends: cards that already had 20-38 eligible gained the most. An adaptive rule (enrich 12, spend more only when eligible is below ~10) is inferable from the per-card table but untested. Evidence: `docs/ebay-detail-budget-review-2026-08-10.md`, `npm run review:detail-budget`.
7. ~~D-OP-BASE-PROOF~~ **RESOLVED 2026-08-14: KILL at 52.6%.** The sample was collected against live eBay with `EBAY_DETAIL_BUDGET=50` (so the condition-budget confound named below could not hide it) and adjudicated by opening all 19 rows: 10 base, 9 sibling, 0 unclear. Per card: Nami OP01-016 60%, Zoro OP06-118 80%, Shanks OP09-001 33%. The absence of a sibling marker does not prove the base print, and the failures were not marginal — six of the nine siblings were promotional runs absent from the bundled catalog ($124-$175 PSA Magazine Promo and 2nd Anniversary Shanks against a ~$2 base), and one was a $37 listing whose title AND eBay Set aspect both read "Emperors in the New World Regular" while the photo was the manga alt art. Evidence: `docs/base-print-precision-sample-2026-08-14.md`. Do not reopen without new evidence; the guardrail stays.
8. D-OP-IMAGE-PROOF (new, open): whether print identity should compare the listing photo against the official card image. Raised by the 2026-08-14 buy-accuracy run, which ended at 9/13 correct (69.2%) with **all four** remaining misses invisible to text: an OP01-016_p3 artwork whose title and Set aspect say only "Romance Dawn"; a $79.99 Nor Con foil parallel of ST01-001 whose set, power, and number all read correct; an SP OP02-013_p3 sold as the P1 alt art; and a Japanese OP04-119 whose seller declares "Language: English, Country of Origin: USA". Every text-side gate that could be added has now been added, so this is the next real lever — and also the first one that would fetch images server-side, which is a source-boundary question for AGENTS.md, not just an engineering one. Needs its own falsifiable test before any build.
<!-- progress:end -->

<!-- progress:section id="LOCAL-STATE" -->
## LOCAL-STATE

Observed on 2026-08-11 in the primary checkout `/Users/chenjunhsu/Desktop/projects/TCGpal`:

- `main` is at `289d334` and exactly level with `origin/main` (0 ahead, 0 behind). Everything this session shipped is pushed; Vercel deploys from `main`.
- The D-OP-BASE-PROOF sampler is committed and pushed: `scripts/sample-base-print-precision.mjs`, `scripts/lib/base-print-sample.mjs`, `scripts/lib/compare-probe.mjs`, their two `.test.mjs` files, one added `package.json` script, and the `measure-print-recall.mjs` refactor that adopts the shared probe.
- Still dirty afterwards: six generated Graphify files and `package-lock.json`. `package-lock.json` was already dirty before the 2026-08-11 identity/picker session and no install was run, so it is not ours; neither was staged.
- Untracked and deliberately not committed: `.workbuddy-ai/`, `REVIEW-2026-07-31.md`, six `docs/` briefs and mockups, and every `output/` artifact directory. None were authored this session.
- Graphify regenerates via a commit hook, so `graphify-out/` churns on every commit. Do not stage it opportunistically.
- Preserve all dirty Graphify, research, screenshot, review, and design artifacts as local work-in-progress; do not clean or prune them without an explicit scoped task.

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

Current verified product commit: `289d334` on 2026-08-11.

- 2026-08-11 D-OP-BASE-PROOF sampler (no product code touched): lint, typecheck, `npm run test` green at 77 files / 1178 tests (up from 75 / 1138 — 40 new), and a production build passed. The collect → sheet → adjudicate → score loop was exercised end to end against a local stub report, including per-card attribution, reviewer notes round-tripping, the detail-budget caveat firing, and a mixed base/sibling/unclear verdict set producing 50.0% strict / KILL with the weakest card named. The refactored `measure-print-recall.mjs` was replayed against the same stub and produced its original output format and aggregation.
- 2026-08-11 identity/picker release `240b5c2..289d334` (7 commits, all pushed to `main`): lint, typecheck, 75 files / 1138 tests, and a Next.js 16.2.6 production build passed before each push. Built-in-browser QA on the version picker covered EN and 中文 desktop plus 375px mobile with no horizontal overflow, and the One Piece single-print Buy result was verified end to end in all three. Live production check after deploy: "Pikachu" returns 172 candidates across 87 sets spanning 1999-2026 with groups ordered newest-first and years in the set filter. Two build failures during that session were `fonts.gstatic.com` connection errors during `next/font` subsetting, not code — the same tree built green on retry. `npm run build` is not deterministic offline; retry once before investigating.
- 2026-08-09 landing/Chinese release `e82e4fc`: lint, typecheck, 67 files / 896 tests, and a production build passed; EN/中文 desktop and 390px mobile QA clean, no legacy terminology hits. 2026-08-03 catalog-outage/market-read fix: lint, typecheck, 62 files / 858 tests, and a production build passed; a live re-check during a ~60% pokemontcg.io outage returned 42 real `umbreon` prints across 25 sets on three consecutive runs. `vitest.config.ts` excludes `.claude/worktrees/**`, which had been running other branches' copies of every test.
- 2026-08-09 receipt release: artifact-excluded lint passed; typecheck passed; 67 files / 886 tests passed; Next.js 16.2.6 production build passed with dynamic `/r/[id]` and OG routes. Built-in-browser QA covered EN/中文 desktop, 390px mobile with no horizontal overflow, stable URL copying, latest-receipt replay with no second provider POST, and five sequential live searches across Pokémon/One Piece using both Edit and New Search. It retained the seller-photo gallery, 44px listing actions, keyboard order, and reduced-motion behavior with empty browser error logs; seller photos stay display-only (no condition/authenticity inference, no ranking integration, extra images mount only after the gallery opens). Full unfiltered lint/test remain red only because preserved untracked `output/exact-print-eval` research contains four lint errors and 115 explicitly expected failures.

Still not verified:

- Population-level live eBay recall and precision remain unproven until the 30-listing human-adjudicated sample; the known cross-facet sibling reproductions are fixed in v4 and covered by zero-substitution regressions.
- Human-adjudicated 30-listing quality gate.
- Ten-buyer demand/usability pilot.
- Monetization, distribution economics, and public-launch legal/provider readiness.
- Dirty local experiments in LOCAL-STATE.
- The set-filter year label is unit-tested but never seen in a browser: only Pokémon carries release dates and pokemontcg.io was unhealthy during the QA window.
- The eBay detail budget is measured but unshipped (default still 12); D-DETAIL-BUDGET needs the Browse daily quota.
- The 2026-08-11 retry improvement (45% to 29% "try again") is a simulation over the measured failure profile, not an observed production rate.
- The D-OP-BASE-PROOF sampler has only ever seen a stub report. It has not touched live eBay, so the adjudicable denominator, the sheet's behaviour on real titles, and the precision itself are all unmeasured.
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
