<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project uses Next.js 16. Read the relevant guide in `node_modules/next/dist/docs/` before framework-level changes and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TCGpal Agent Guide

## Product

TCGpal is an evidence-backed listing comparison tool for U.S. Pokémon raw-single buyers.

The primary flow is intentionally narrow and **card-first** (the buyer already knows the card; we find and rank the listings):

1. Enter the Pokémon card you want — name, optionally collector number. Pasting a specific eBay URL is an optional secondary path.
2. Confirm the exact card/version (one-tap when the name is ambiguous; auto-confirmed when name + number are explicit).
3. The agent searches eBay and ranks eligible listings against the card's market price.
4. Return **one recommended buy** (default: the safest verified listing) with a lens toggle to **Cheapest / Safest / Best-documented**. Each shows landed cost vs the TCGplayer market anchor and a one-tap link to the live listing.

TCGpal is not a price predictor, grading app, investment advisor, marketplace scraper, or generic collecting dashboard. It accelerates a decision the buyer has already made; it does not make the choice for them.

## Current Status

- The app opens directly to the card-search form; there is no login or onboarding gate.
- Pokémon raw singles in USD are the only supported product category.
- eBay is the only automated buying source. A **production Browse API keyset is configured** (`EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`/`EBAY_MARKETPLACE_ID` in `.env.local`); live `item_summary/search` is the listing source. Validate creds with `node scripts/check-ebay.mjs`.
- Card identity, images, and the **TCGplayer market price** come from the Pokémon TCG API (`api.pokemontcg.io`, works keyless; `POKEMON_TCG_API_KEY` set for higher limits). The TCGplayer market price is the primary fair-price anchor and also powers the below-market eligibility filter.
- PriceCharting is optional secondary reference behind `PRICECHARTING_API_TOKEN`, not a transaction price.
- TCGplayer, Facebook, Reddit, Mercari, Whatnot, local shops, and other sources are user-supplied candidates.
- Missing eBay credentials fall back to labeled fixtures with `demoMode:true`. Demo listings never show the per-listing vs-market read.
- OpenAI is optional. Without it, the deterministic evidence summary remains usable.
- The configured/default OpenAI model is `gpt-5.5-2026-04-23`.
- The technical trace stays collapsed for normal users.

## Product Guardrails

- Never invent sold transactions, live inventory, shipping, taxes, seller history, or source access.
- Never call a seller a scam from listing signals. Describe specific missing evidence or risk signals.
- Never predict NM/LP/grade from photos in v1. Marketplace condition is a seller claim.
- “Best condition evidence” means the listing provides stronger review material; it is not a grade prediction.
- Do not use “must buy,” guaranteed-profit language, or unsupported certainty.
- When tax is absent, say “pre-tax total,” not “all-in” or “landed cost.”
- Every result must show sources, timestamps, assumptions, missing information, and confidence.

## Data Boundaries

Allowed:

- Official eBay Browse API for active listings and item details.
- Pokémon TCG API for catalog identity, card images, and the inline TCGplayer market price (used as the fair-price anchor; surfaced as the primary reference).
- PriceCharting API behind `PRICECHARTING_API_TOKEN` (optional secondary reference).
- User-entered facts from other marketplaces.
- Manual eBay sold-search links.

Not allowed:

- Marketplace scraping or browser automation inside product routes.
- Arbitrary server-side URL fetching.
- Automated TCGplayer, Facebook, Mercari, Reddit, or Whatnot access without an approved/licensed provider.
- Claims that manual search links were fetched or analyzed.
- Client-side API secrets.

Only allowlisted marketplace adapters may fetch external URLs. Unsupported URLs remain user-supplied text and must never be fetched.

## Agent and Rules Boundary

The AI layer may:

- Reconcile ambiguous structured evidence.
- Explain why deterministic rankings differ.
- Produce cautious, schema-shaped summaries.

Deterministic TypeScript must own:

- Eligibility and product exclusions. eBay search is full of cheap novelty items that carry the exact card name + number (gold-metal cards, stickers, DIY/"extended art", for-display replicas). Two deterministic defenses in `ranking.ts`: (1) `exclusionPatterns` title filters; (2) a **market-floor gate** that rejects listings priced below `MARKET_FLOOR_RATIO` (0.25) × TCGplayer market as likely replicas/mislabeled. eBay search uses Best Match (not price-asc) so the cheapest junk does not dominate.
- Exact-match validation gates.
- Price, shipping, optional-tax calculations.
- Seller-trust and evidence-completeness scoring.
- Winner selection and tie-breaking.
- The final unsupported-claim critic.

AI failure must fall back to deterministic behavior. Model output must never override source truth or ranking math.

## Architecture

- `src/features/comparison/ComparisonApp.tsx`: the card-first comparison experience — search → confirm version → one recommended buy (`RecommendationCard`) with a lens toggle; verdict-led plain-language tags with the numeric scores de-emphasized; market-anchor chip and per-listing vs-market read.
- `src/lib/comparison/*`: fixtures, scoring, landed-cost math, and deterministic ranking (incl. `exclusionPatterns` and the `MARKET_FLOOR_RATIO` below-market gate).
- `src/lib/external/*`: bounded eBay, Pokémon (incl. inline TCGplayer pricing), and PriceCharting adapters.
- `src/lib/ai/listing-compare.ts`: comparison orchestration, identity + TCGplayer-price extraction, synthesis, fallback, and trace.
- `src/app/api/agent/listing-compare`: the public comparison route.
- `src/lib/schemas.ts`: Zod request, normalized listing, ranking, and response contracts (`CardIdentityCandidate` carries `marketLow/marketMid/marketHigh/marketUrl`).
- `src/lib/analytics.ts`: explicit PostHog events and privacy allowlist.
- `scripts/check-ebay.mjs`: dev utility to validate eBay creds (OAuth token + Browse search access).

Keep server/API secrets outside Client Components. Route handlers are dynamic and provider fetches use fresh data.

## Analytics Privacy

PostHog uses explicit custom events only:

- `comparison_started`
- `source_detected`
- `card_identity_confirmed`
- `manual_candidate_added`
- `comparison_completed`
- `comparison_failed`
- `choice_opened`
- `decision_feedback_submitted`
- `second_comparison_started`

Autocapture, session replay, pageview capture, and person profiles stay disabled. Never transmit URLs, listing text, seller identifiers, or images.

## Scope

Do not add One Piece, scanning, image upload, vision grading, payments, auth, saved collections, recommendation feeds, journals, cooldowns, or planning until the Pokémon comparison pilot passes its validation gates.

Retained `listing-risk` and `raw-vs-slab` modules are reusable deterministic utilities, not current navigation surfaces.

## Engineering Rules

- Use Zod at every public API boundary.
- Use React Hook Form for form state.
- Preserve the current cream/teal/gold TCGpal visual system.
- Use real card images from allowed sources.
- Never commit API keys; `.env.example` contains placeholders only.
- Keep demo fixtures unmistakably labeled.
- Prefer parallel provider work and partial results over failing the whole report.
- Preserve accessibility: labels, keyboard navigation, visible focus, semantic headings, and reduced-motion support.

## Verification

Run:

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

Then run `npm run dev` and verify:

- First open goes directly to the card-search form.
- Searching a card resolves real catalog identities and the TCGplayer market anchor; name-only pauses for one-tap confirmation, name + number auto-confirms.
- With eBay creds, a card search returns live listings; novelty/replica titles and items priced below the market floor are excluded; the recommended buy defaults to Safest with a working Cheapest / Best-documented toggle and a real listing link.
- The labeled demo (no eBay creds) still reaches distinct ranked choices and hides the per-listing vs-market read.
- A manual Facebook/local listing is never fetched server-side.
- Tax-known and tax-unknown totals use the correct language.
- Missing provider credentials remain clearly labeled (`demoMode:true`).
- Technical trace is collapsed.
- No grade prediction or automated sold-history claim appears.
- Desktop and mobile layouts remain usable.
