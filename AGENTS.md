<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project uses Next.js 16. Read the relevant guide in `node_modules/next/dist/docs/` before framework-level changes and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TCGpal Agent Guide

## Product

TCGpal is an evidence-backed listing comparison tool for U.S. Pokémon raw-single buyers.

The primary flow is intentionally narrow and **card-first** (the buyer already knows the card; we find and rank the listings):

1. Enter the Pokémon card you want — name, optionally collector number. Pasting a specific listing URL (eBay or any other marketplace) is an optional secondary path.
2. Confirm the exact card/version (one-tap when the name is ambiguous; auto-confirmed when name + number are explicit).
3. The agent fans out over platform adapters in parallel (eBay live listings + the TCGplayer daily price feed) and ranks eligible listings against the card's market price. Per-source status chips show what was checked, what failed, and what found nothing.
4. Return **one recommended buy** (default: the safest verified listing) with a lens toggle to **Cheapest / Safest / Best-documented**. Each shows landed cost vs the TCGplayer market anchor and a one-tap link to the live listing.

TCGpal is not a price predictor, grading app, investment advisor, marketplace scraper, or generic collecting dashboard. It accelerates a decision the buyer has already made; it does not make the choice for them.

## Current Status

- The app opens directly to the card-search form; there is no login or onboarding gate.
- Pokémon raw singles in USD are the only supported product category.
- **Live sources per comparison.** eBay Browse `item_summary/search` (production keyset: `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`/`EBAY_MARKETPLACE_ID` in `.env.local`; validate with `node scripts/check-ebay.mjs`) plus the **TCGplayer daily price feed via TCGCSV** (`tcgcsv.com`, keyless). Best-effort public search adapters for Mercari, Whatnot, Reddit, and Facebook may fetch one public search-results page per user action when robots.txt allows it. Sources run in parallel through the platform-adapter interface (`src/lib/external/adapter.ts`) with per-source timeouts; a failed or blocked source becomes a status chip, never a blank comparison.
- A **canonical card crosswalk** (`src/lib/comparison/crosswalk.ts`) maps the confirmed pokemontcg.io card id → TCGplayer product id + eBay query template. A card missing from the crosswalk degrades TCGplayer to a visible "no match" chip — never a hard failure.
- Card identity and images come from the Pokémon TCG API (`api.pokemontcg.io`, works keyless; `POKEMON_TCG_API_KEY` set for higher limits). Catalog lookups auto-retry 3x with exponential backoff (cold-start mitigation), and a failed comparison shows a one-tap Retry.
- The **market anchor** is the TCGplayer daily feed ("prices as of" freshness shown; >48h stale warns visibly) when the crosswalk resolves, else the inline pokemontcg.io TCGplayer price. It powers the vs-market read and the below-market eligibility filter.
- **Paste-a-URL**: a listing URL from any marketplace is fetched once (user-initiated, exactly that page, robots.txt honored, https/public hosts only, size/time bounded), extracted deterministically (JSON-LD/meta first) with optional LLM gap-filling, identity-checked against the confirmed card, and joins the pipeline labeled "user-added". Extraction failure falls back to the user's typed facts.
- **Risk calibration: unknown ≠ risky.** Missing seller data yields a neutral `unverified` label plus a platform-baseline trust prior (documented in per-listing trust notes) — never "higher risk". Known signals earn their points; unknown signals earn at the platform's prior rate.
- Pure card searches are cached for 15 minutes keyed by card + condition + delivery context (`src/lib/comparison/report-cache.ts`).
- PriceCharting is optional secondary reference behind `PRICECHARTING_API_TOKEN`, not a transaction price.
- Facebook, Reddit, Mercari, and Whatnot join through best-effort public search when available, paste-a-URL, or manual facts. Local shops and other connector-less sources join via manual reference links, paste-a-URL, or manual facts.
- When no live source returns a single listing, labeled fixtures load with `demoMode:true`. Demo listings never show the per-listing vs-market read.
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
- Pokémon TCG API for catalog identity, card images, and the inline TCGplayer market price (fallback fair-price anchor).
- TCGCSV daily TCGplayer catalog/price dumps (`tcgcsv.com`) for the crosswalk, the second live source, and the market anchor with explicit freshness. (Open legal question tracked in the PRD: whether a public app needs its own TCGplayer partner agreement — build unblocked, launch review pending.)
- **User-initiated public search of listed platforms** (Mercari, Whatnot, Reddit, Facebook Marketplace) is allowed as a temporary pilot: fetch at most one HTTPS public search-results page per platform per comparison, honor robots.txt, do not log in, do not bypass access controls/CAPTCHAs/paywalls, do not follow result links server-side, and degrade to a visible blocked/failed/empty status plus manual links.
- **One user-initiated fetch of exactly the listing URL the user pasted** (https, public hosts, robots.txt honored, size/time bounded). This is the paste-a-URL boundary: per-URL, on explicit user action — never crawling, never scheduled, never link-following.
- PriceCharting API behind `PRICECHARTING_API_TOKEN` (optional secondary reference).
- User-entered facts from other marketplaces.
- Manual eBay sold-search links.

Not allowed:

- Unbounded marketplace scraping, crawling, or browser automation inside product routes.
- Server-side fetching of URLs the user did not explicitly paste, except for the temporary one-page public-search pilot for the listed platforms.
- Automated search/browse of platforms outside the listed public-search pilot without an approved/licensed provider.
- Following marketplace search results server-side, fetching private groups/listings, logging in, bypassing robots.txt/CAPTCHA/paywalls, or simulating a browser to evade platform controls.
- Claims that manual search links were fetched or analyzed.
- Client-side API secrets.

Only the bounded adapters in `src/lib/external/*` may fetch external URLs. Anything they refuse (robots-blocked, non-https, private hosts, non-USD) remains user-supplied text.

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

- `src/features/comparison/ComparisonApp.tsx`: the card-first comparison experience — search → confirm version → one recommended buy (`RecommendationCard`) with a lens toggle; verdict-led plain-language tags with the numeric scores de-emphasized; market-anchor chip with freshness, per-listing vs-market read, per-source status chips (`SourcesStrip`), and one-tap Retry on failure.
- `src/lib/comparison/*`: fixtures, scoring, landed-cost math, deterministic ranking (incl. `exclusionPatterns`, the `MARKET_FLOOR_RATIO` below-market gate, platform trust priors, risk labels, and above-market honesty notes), the card crosswalk, and the 15-minute report cache.
- `src/lib/external/*`: the `PlatformAdapter` contract + parallel fan-out runner (`adapter.ts`), bounded eBay, Pokémon (with catalog retry), TCGCSV/TCGplayer, best-effort public marketplace search, paste-a-URL universal listing, and PriceCharting adapters.
- `src/lib/ai/listing-compare.ts`: comparison orchestration — ingestion (incl. paste-a-URL + identity critic), crosswalk, fan-out, market anchor selection, synthesis, fallback, and trace.
- `src/app/api/agent/listing-compare`: the public comparison route.
- `src/lib/schemas.ts`: Zod request, normalized listing (`riskLabel`, `trustNotes`, `userSupplied`), ranking, source status, and response contracts (`CardIdentityCandidate` carries `marketLow/marketMid/marketHigh/marketUrl/marketSource/marketAsOf/tcgplayerProductId`); `ListingSeed` is the shape every adapter produces.
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
- The sources strip shows all attempted sources ("eBay · N found · TCGplayer · N found · Mercari · N found"); blocked/empty public sources stay visible, a crosswalk miss shows "TCGplayer · no match", and available results still render.
- The market anchor shows "prices as of <date>" when fed by the daily feed.
- TCGplayer aggregate rows and other seller-data-less listings show the neutral "Unverified" label, never "Higher risk"; eBay listings with real feedback show the ratings line.
- A failed comparison shows a Retry button that reuses the same request.
- A manual Facebook/local listing without a URL is never fetched server-side; a pasted marketplace URL triggers exactly one fetch of that page (check the technical trace).
- Tax-known and tax-unknown totals use the correct language.
- Missing provider credentials remain clearly labeled (`demoMode:true`).
- Technical trace is collapsed.
- No grade prediction or automated sold-history claim appears.
- Desktop and mobile layouts remain usable.
