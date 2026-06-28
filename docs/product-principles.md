# TCGpal Product Principles

How the proven product-maker playbook maps onto TCGpal. Use this to decide what to build, what to kill, and what to measure. Grounded in the current codebase (`lib/comparison`, `lib/ai`, `lib/external`, `features/comparison/ComparisonApp.tsx`).

_Last updated: 2026-06-28._

## 1. Proven / Better / New (Mark Pincus)

Decompose every bet on three axes. Keep the Proven spine un-bumped, pour conviction into Better, and isolate New behind a fallback so it can fail safely.

**Proven** — the behavior that already works for the exact audience. US collectors already cross-check eBay sold prices, the TCGplayer market price, and "is this seller and condition legit" before buying a raw single. TCGpal's job is to nail that workflow, not reinvent it. The Recommended listing + market reference + manual sold-search link are the proven core. Never bury them.

**Better** — the improvements 10 out of 10 collectors agree on. Pincus's own examples are *price* and *removing a step*, which is exactly TCGpal's edge: type a card name and you're done; landed cost (price + shipping + optional tax) instead of sticker price; seller trust and photo evidence visible in one glance. This is the highest-confidence axis — invest here first.

**New** — the novel bet that will probably fail, per Pincus, so keep it non-load-bearing. TCGpal's New is the AI evidence synthesis, the three-lens framing (cheapest / safest / best-documented), and the critic that refuses grade predictions. The deterministic fallback in `buildNarrative` is the right instinct: an AI failure must never break the proven core.

## 2. Kill Hope Before Hope Kills You

Carry no feature on hope alone. Current hopes: the manual multi-marketplace fields (Facebook / Reddit / Mercari / Whatnot), broad catalog breadth, and cross-platform. Pre-commit a kill rule before building more — e.g. "if under X% of 4-week sessions use the non-eBay manual path, cut it." The PostHog events already emitted (`manual_candidate_added`, `choice_opened`, `source_detected`) are the instrument. "A B+ is the enemy of an A": the manual fields are a B+ that dilutes the eBay path that's an A. (Done: the optional listing, options, and evidence blocks are now collapsed out of the default view.)

## 3. Instinct (≈95% right) vs Ideas (≈75% wrong)

Trust the instinct — "collectors overpay because they can't see cost + trust + evidence together" — and stop relitigating it. Distrust the specific ideas built on top: the weights in `ranking.ts` (sellerTrust 0.6 / evidence 0.4, the score-bucket thresholds), the lens labels, and the narrative copy. Split the roadmap accordingly:

- **Instinct (fixed):** the deterministic landed-cost, trust, evidence, eligibility, and ranking math. It exists and is stable — leave it.
- **Ideas (in test):** scoring weights, lens labels, hero copy, form layout. A/B these; be willing to scrap.

## 4. Opinion vs Data — one metric that matters

Early and low-traffic means data is thin, so default to taste and conviction for the core experience and reserve data for tie-breaks — but build measurement now to earn data-based decisions later. The strongest signal is already wired: `decision_feedback_submitted` ("Did this change what you'd do?"). Make **decision-change rate the one metric that matters**; treat DAU and candidate counts as secondary.

## 5. AI-native now, cross-platform later

AI-native is the New axis — keep it behind the deterministic fallback so a model failure never touches the proven core. On cross-platform: don't abstract for it yet (YAGNI). The separation already in place *is* the only prep needed — `lib/comparison` (deterministic), `lib/ai`, `lib/external` adapters, and the `/api/agent/listing-compare` route are all UI-agnostic, so a future mobile shell reuses the API and schemas untouched. Inherit the architecture; defer the platform.

## Operating summary

| Layer | Treatment |
|---|---|
| Proven core (recommendation, references, landed cost) | Protect; never regress |
| Better (fewer inputs, one-glance trust) | Invest first; highest confidence |
| New (AI synthesis, lenses, critic) | Keep behind fallback; measure; kill cheaply |
| Hopes (multi-marketplace, breadth, cross-platform) | Pre-commit kill criteria |
| North-star metric | Decision-change rate |
