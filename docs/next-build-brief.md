# Next Build Brief — Receipts First

Date: 2026-08-09
Status: agreed direction from strategy session; open decisions marked OPEN.
Read first (per PROGRESS.md FIRST-READ): AGENTS.md, PROGRESS.md BOOTSTRAP + TASK-INDEX, WS-UX, `features/comparison/ComparisonApp.tsx`, REVIEW-2026-07-31.md.

## Context (why this work)

TCGlens's differentiation vs eBay is a reproducible, evidence-backed verdict — eBay retrieves listings over dirty seller-entered metadata and structurally cannot say "pass." Our verdicts are currently ephemeral: deep links re-run the 20–25s pipeline, nothing is shareable, nothing is indexable. Three independent strategy paths (trust building, Reddit price-check distribution, future watchlist alerts) all require the same first build: **persistent receipt pages**. This brief covers that build plus the trust-surface fixes from REVIEW-2026-07-31.

## Non-negotiable invariants (do not touch)

1. Deterministic core only in the money path: eligibility, landed cost, condition compatibility, ranking, lens selection, verdict. No AI/model calls added to any of these. AI stays where it is: query/identity interpretation, pasted-page extraction, grounded explanation (`buildNarrative` fallback pattern preserved).
2. Ranking invariants from docs/validation-plan.md stay green: Cheapest = min complete comparable total; Safest = max safety score; Documented = max evidence score; Best Value never crosses requested condition boundary; unknown shipping never becomes free; TCGCSV/web-discovery rows never enter listing ranking.
3. Abstention discipline: out-of-scope inputs (Japanese-only prints, graded slabs, unrecognized cards) must abstain with a clear "can't judge this" state — never a guessed verdict. Add regression tests if missing.
4. No new marketplace scraping. eBay licensed API + exact user-supplied links only.
5. Analytics: no listing text, URLs, seller names, or images in events (per validation plan).

## Work packages, in order

### WP1 — Persistent receipts (core of this brief)

Every completed comparison is saved as an immutable snapshot with a stable short ID, served at `lenstcg.com/r/{id}`.

- Snapshot contains: card identity (set code, number, print), requested condition, timestamp, listing comparison rows (as displayed), reference value used, chosen pick per lens, verdict + action text, source counts, exclusion reasons summary.
- Receipt page loads instantly from the snapshot (no pipeline re-run). Header shows "Checked {date, time}" plus a "Re-check now" button that runs a fresh comparison and produces a NEW receipt (old ones never mutate).
- Deep links with `?step=result` resolve to the newest matching receipt instead of re-running (fixes REVIEW-2026-07-31 P0 #3, including the wrong "Reading your listing" loading copy on replay).
- Share affordances: copy-link button; OpenGraph/Twitter meta per receipt (card name, landed cost, verdict, timestamp) so links unfurl in Reddit/Discord; optional PNG share image can be a follow-up, not this WP.
- Storage: choose the simplest durable option consistent with current deployment (Vercel). Include retention/size reasoning in the PR description.
- Privacy: receipts are public-by-link; they contain listing data already public on eBay. No user identifiers stored on the receipt.
- Events: `receipt_created`, `receipt_viewed` (with referrer class: direct/reddit/discord/other), `receipt_recheck_clicked`, `receipt_link_copied`. Property allowlist only.

Acceptance: opening a receipt URL cold renders the full result in under 1s server-rendered; re-running the same query creates a new receipt; original receipt unchanged; OG preview renders card name + verdict + timestamp.

### WP2 — Real /method page

Footer links (Method, Data sources, What we don't do) and nav "Method" currently dead-end at `/#method` (REVIEW P0 #2). Ship an actual `/method` route with anchor sections:

- Where listings come from (eBay Browse API; exact user-supplied links), and what we deliberately do not fetch.
- What "reference" means and exactly how landed cost is computed (item + shipping + tax assumptions; when tax is estimated).
- Why listings get excluded (mirror the real exclusion reasons in code).
- What we don't do: no grading opinions, no authentication/counterfeit detection, no price predictions, no marketplaces we can't access legally.
- Bilingual EN/中文 like the rest of the site.

Acceptance: all existing method/data-source links resolve; page indexed (no robots block); copy reviewed against actual pipeline behavior (no overclaiming).

### WP3 — Image reliability in the version picker

REVIEW P0 #4: thumbnails frequently blank. Proxy and cache card images (own route or CDN), explicit aspect-ratio boxes to prevent layout shift, and a text fallback tile (set symbol/code + number + rarity) when an image fails. Acceptance: version picker remains usable with image host fully offline.

### WP4 — Honest progress + perceived latency

REVIEW P0 #5: the four-step progress panel spins all steps simultaneously. Wire steps to actual pipeline stages, or stream the top pick as soon as ranking completes and backfill the rest. Target: first meaningful verdict content < 10s perceived. Do not remove the panel; make it truthful.

### WP5 — Funnel completeness

Verify the validation-plan funnel events all fire in the current flow (`comparison_started` → `card_identity_confirmed` → `comparison_completed` → `choice_opened` → `decision_feedback_submitted` → `second_comparison_started`), add the WP1 receipt events, and add `abstained` with reason category. No new properties outside the allowlist.

### WP6 — Card market-position page (flagged, after WP1–5)

`lenstcg.com/card/{setCode}-{number}`: newest receipt data for that print aggregated into: cheapest eligible landed cost, reference, live eligible copy count, and a one-line market position ("all N copies within X% of reference" / "cheapest is Y% under reference"). Descriptive only — no predictions. Behind a feature flag; SEO metadata included. This page is derived from receipts; no new pipeline work.

## Explicitly out of scope (do not build now)

- Watchlist/alerts ("sniper") — pending a 2-week shadow test, separate brief.
- OCR/screenshot listing intake.
- Any additional marketplace integration.
- Grading-EV, slab-arbitrage, or condition-estimation features.
- Homepage copy reframe (OPEN decision D2 below) — copy changes only after the founder decides.

## Open decisions (founder, not agent)

- D1: Lock receipt-first sequencing (this brief) vs sniper-first. Brief assumes receipt-first.
- D2: Homepage promise reframed from speed to judgment ("know when to walk away"). Copy draft exists in session notes; not for agent.
- D3: Replace TCGCSV-derived reference with own eBay-derived Lens reference (legal posture). Until decided, keep current reference but ensure /method labels its source honestly.
- D4: Launch path: 5-user concierge round before any public Reddit post (recommended) vs straight to Reddit.
- D5: North-star metric formally becomes repeat-check rate (`second_comparison_started` within 30 days), demoting decision-change rate to guardrail.
- D6: Archive product-principles.md into docs/archive/ and rewrite PRODUCT.md around the second-opinion/receipt framing.

## Definition of done

Lint, typecheck, full test suite, and production build green; new tests for receipt immutability, deep-link resolution, abstention on out-of-scope input, and invariant regressions; EN/中文 + mobile (375px) verified for receipt and method pages; PROGRESS.md updated per its UPDATE-PROTOCOL; no changes to ranking math or AI boundary.
