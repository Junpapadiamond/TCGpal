<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project uses Next.js 16. Read the relevant guide in `node_modules/next/dist/docs/` before framework-level changes and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TCGpal Agent Guide

## Product

TCGpal is an evidence-backed listing comparison tool for U.S. trading-card raw-single buyers. Pokémon and One Piece are live; more TCGs are planned.

The primary flow is intentionally narrow and **card-first** (the buyer already knows the card; we find and rank the listings):

1. Enter the card you want — name, optionally collector number/card id and game. Pasting a specific listing URL is an optional secondary path.
2. Confirm the exact card/version (one-tap when the name is ambiguous; auto-confirmed when name + number are explicit).
3. The agent fans out over configured concrete-listing platform agents (eBay Browse today), ranks condition-compatible listings with complete comparable cost, and shows source failures instead of hiding them. TCGplayer/TCGCSV remains a separate aggregate market reference.
4. Return **one recommended buy** (default: Best Value: complete cost, condition fit, seller trust, and evidence combined) with a lens toggle to **Cheapest / Safest / Best-documented**. Lenses are independent and may select the same listing; the product abstains when no listing is comparable.

TCGpal is not a price predictor, grading app, investment advisor, marketplace scraper, or generic collecting dashboard. It accelerates a decision the buyer has already made; it does not make the choice for them.

## Current Status

- The app opens directly to the card-search form; there is no login or onboarding gate.
- Raw singles in USD are the supported product category, across multiple TCGs. Pokémon (Pokémon TCG API) and One Piece (OPTCG adapter + bundled catalog) are wired end-to-end; the game toggle selects which. More games are planned.
- **One live concrete-listing source plus one aggregate reference today.** eBay Browse `item_summary/search` supplies active seller listings (production keyset: `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`/`EBAY_MARKETPLACE_ID` in `.env.local`; validate with `node scripts/check-ebay.mjs`). TCGplayer via the keyless TCGCSV daily dump supplies the crosswalk and market reference only; it never becomes a seller listing or ranking candidate.
- A **canonical card crosswalk** (`src/lib/comparison/crosswalk.ts`, 6h in-memory cache) maps the confirmed catalog card id → TCGplayer product id + eBay query template. TCGCSV category is inferred from the confirmed card: Pokémon uses category `3`; One Piece uses category `68`. A missing crosswalk match degrades the market reference visibly — never a hard failure.
- The **market anchor** is the TCGplayer daily feed ("prices as of" freshness shown; >48h stale warns visibly) when the crosswalk resolves, else the inline pokemontcg.io TCGplayer price (`marketSource: "tcgcsv" | "pokemontcg"` on the confirmed card). It powers the vs-market read and the below-market eligibility filter.
- **Paste-a-URL** (`src/lib/external/universal-listing.ts`): a listing URL from any marketplace is fetched once — user-initiated, exactly that page, robots.txt honored, https/public hosts only, size/time bounded — extracted deterministically (JSON-LD/meta first) with optional LLM gap-filling, identity-checked against the confirmed card (mismatch → excluded from the recommendation with a warning), and labeled "user-added". Extraction failure falls back to the user's typed facts.
- **Risk calibration: unknown ≠ risky.** Missing seller data yields a neutral `unverified` risk label plus a platform-baseline trust prior (`getPlatformTrustPrior` in `ranking.ts`, documented in per-listing `trustNotes`) — never "higher risk". Known signals earn their points; unknown signals earn at the platform's prior rate. The risk label tracks seller track record only; evidence thinness has its own verdict.
- Catalog lookups retry 3x with exponential backoff (cold-start mitigation); a failed comparison shows a one-tap Retry that reuses the exact request.
- Pure card searches (no user-supplied listing facts) are cached 15 minutes keyed by card + condition + delivery context (`src/lib/comparison/report-cache.ts`).
- Ranked choices state above-market context explicitly ("+N% over the market reference"); when everything is above market the cheapest lens says supply is thin.
- PriceCharting is optional secondary reference behind `PRICECHARTING_API_TOKEN`, not a transaction price.
- Japan reference searches (Yahoo Auctions JP, Mercari JP, SNKRDUNK, and game-specific shop links) are shown as one-click outbound manual checks. They are not fetched, parsed, ranked, or counted as live source rows until an approved provider/API is connected.
- Facebook, Reddit, Mercari, Whatnot, Japan marketplaces, local shops, and other connector-less sources join via paste-a-URL or the manual ledger until an approved provider/API is connected. Roadmap platform agents remain visible as skipped/not connected.
- Tavily/Exa are optional test infrastructure behind `TAVILY_API_KEY` and `EXA_API_KEY`. Their approved slots are: (1) the conversational assistant (`/api/agent/listing-compare/explain`) for cited web context on source-legitimacy, translation, manual-reference, and identity-help questions; (2) experimental web marketplace discovery that returns possible links only. Tavily/Exa citations and discovered links must stay separate from listing evidence and must never feed the ranking core.
- When no live source returns a single listing, labeled fixtures load with `demoMode:true`. Demo listings never show the per-listing vs-market read.
- OpenAI is optional. Without it, the deterministic evidence summary remains usable.
- The configured/default OpenAI-compatible model is `gpt-5.5`; `gpt-5.4` is the review/cheap fallback. The dated slug `gpt-5.5-2026-04-23` is not available on the current zjapi channel.
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
- TCGCSV daily TCGplayer catalog/price dumps (`tcgcsv.com`) for the crosswalk and aggregate market anchor with explicit freshness. They are reference data, not TCGplayer source rows. Pokémon uses category `3`; One Piece uses category `68`. (Open legal question tracked in the PRD: whether a public app needs its own TCGplayer partner agreement — build unblocked, launch review pending.)
- **One user-initiated fetch of exactly the listing URL the user pasted** (https, public hosts, robots.txt honored, size/time bounded). This is the paste-a-URL boundary: per-URL, on explicit user action — never crawling, never scheduled, never link-following.
- PriceCharting API behind `PRICECHARTING_API_TOKEN` (optional secondary reference).
- Tavily Search/Extract and Exa Search/Contents behind `TAVILY_API_KEY` / `EXA_API_KEY` for testing only in bounded contexts:
  - `/explain` may use Tavily Search when the buyer asks for outside context such as "is this Japanese source legit?", "what does this JP title mean?", "where else can I verify this card?", or ambiguous Japanese promo/set identity help.
  - Paste-a-URL extraction may test Tavily Extract only against the exact user-pasted public HTTPS URL, after the normal boundary checks, as a fallback when JSON-LD/meta extraction is insufficient.
  - Japan/manual-reference discovery may use Tavily Search to surface pages to open manually (Card Rush, Yuyutei, SNKRDUNK, Yahoo Auctions, official/trusted references), but the result must be labeled as context/reference discovery, not fetched inventory or analyzed prices.
  - Experimental marketplace URL discovery may use Exa/Tavily Search across Mercari, Facebook, Reddit, Whatnot, eBay, Yahoo Auctions JP, Mercari JP, SNKRDUNK, Card Rush, and Yuyutei to surface possible links. These links are "web-discovered" manual checks only: no page fetch, no extraction, no price parsing, no seller parsing, no eligibility, no ranking.
- User-entered facts from other marketplaces.
- Manual eBay sold-search links.

Not allowed:

- Marketplace scraping, crawling, or browser automation inside product routes.
- Server-side fetching of URLs the user did not explicitly paste.
- Automated search/browse of Facebook, Mercari, Reddit, Whatnot, Yahoo Auctions JP, SNKRDUNK, Japanese shop pages, or other marketplaces without an approved/licensed provider (paste-a-URL covers single user-provided listings where robots allows it).
- Tavily/Exa Crawl in product routes, scheduled jobs, or ranking paths.
- Tavily/Exa Search/Extract/Contents as a proxy for price scraping, seller-history scraping, sold-comps claims, or ranking Mercari/Facebook/Reddit/Whatnot/eBay/Japan marketplace listings.
- Claims that manual search links were fetched or analyzed.
- Client-side API secrets.

Only the bounded adapters in `src/lib/external/*` may fetch external URLs. Anything they refuse (robots-blocked, non-https, private hosts, non-USD) remains user-supplied text.

## Agent and Rules Boundary

The AI layer may:

- Reconcile ambiguous structured evidence.
- Explain why deterministic rankings differ.
- Produce cautious, schema-shaped summaries.
- Use Tavily/Exa citations for bounded assistant web context, translation, manual reference suggestions, identity help, and experimental URL discovery when explicitly routed through the web-context/discovery paths.

Deterministic TypeScript must own:

- Eligibility and product exclusions. eBay search is full of cheap novelty items that carry the exact card name + number (gold-metal cards, stickers, DIY/"extended art", for-display replicas). Two deterministic defenses in `ranking.ts`: (1) `exclusionPatterns` title filters; (2) a **market-floor gate** that rejects listings priced below `MARKET_FLOOR_RATIO` (0.25) × TCGplayer market as likely replicas/mislabeled. eBay search uses Best Match (not price-asc) so the cheapest junk does not dominate.
- Exact-match validation gates.
- Price, shipping, optional-tax calculations.
- Seller-trust and evidence-completeness scoring.
- Winner selection and tie-breaking.
- The final unsupported-claim critic.

AI failure must fall back to deterministic behavior. Model output must never override source truth or ranking math.

## Architecture

- `src/features/comparison/ComparisonApp.tsx`: the card-first comparison experience — search → confirm version → one recommended buy (`RecommendationBody` inside the verdict hero) with a lens toggle; verdict-led plain-language tags with the numeric scores de-emphasized; market-anchor chip and per-listing vs-market read.
- `src/lib/comparison/*`: fixtures, scoring, landed-cost math, deterministic ranking (incl. `exclusionPatterns` and the `MARKET_FLOOR_RATIO` below-market gate), and the cross-platform **platform-agent registry + fan-out** (`platforms.ts`).
- `src/lib/comparison/platforms.ts`: each concrete-listing marketplace is a `PlatformAgent` that self-gates on its own API credentials (`isConfigured()`). `runPlatformFanout` searches every configured agent in parallel with per-agent failure isolation. eBay is live today; TCGplayer/TCGCSV stays outside this registry as reference data; roadmap agents remain skipped/manual-ledger until an approved API/provider is connected.
- `src/lib/external/*`: bounded eBay, Pokémon (incl. inline TCGplayer pricing), One Piece catalog, TCGCSV/TCGplayer, paste-a-URL universal listing, and PriceCharting adapters.
- `src/lib/external/tavily.ts`: bounded Tavily Search/Extract helper for cited assistant context and exact-URL extraction experiments. No crawl support; no ranking-core integration.
- `src/lib/external/web-marketplace-discovery.ts`: experimental Exa/Tavily Search helper for possible marketplace/reference links. It returns only title/URL/provider metadata for manual checks; discovered links are never fetched, parsed for price/seller facts, normalized as candidates, or ranked.
- `src/lib/ai/agent/harness.ts`: provider-agnostic `runAgent` loop (model decides tools, deterministic execute, budget hard-stop).
- `src/lib/ai/agent/market-agent.ts`: retained experimental allocator harness. It is not called by the production comparison route; keep it disabled until an offline evaluation proves better exact-match recall/precision without unacceptable latency or deterministic-coverage regressions.
- `src/lib/comparison/japan-references.ts`: one-click Japan price/buy reference links. These are manual outbound checks only; they must never be counted as fetched inventory or analyzed prices.
- `src/lib/ai/listing-compare.ts`: comparison orchestration — identity + TCGplayer-reference extraction, deterministic platform fan-out, deterministic evidence summary, and trace. Model allocation/narrative is not on the initial comparison path.
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
- `lens_selected`
- `comparison_receipt_copied`
- `decision_feedback_submitted`
- `second_comparison_started`

Autocapture, session replay, pageview capture, and person profiles stay disabled. Never transmit URLs, listing text, seller identifiers, or images.

## Scope

Multi-TCG is the direction: Pokémon and One Piece are live, and adding further TCGs (via their own catalog adapters behind the game toggle) is in scope. Do not add scanning, image upload, vision grading, payments, auth, saved collections, recommendation feeds, journals, cooldowns, or planning until the core comparison pilot passes its validation gates.

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
- With eBay creds, a card search returns live listings; novelty/replica titles and items priced below the market floor are excluded; the recommended buy defaults to Best Value with working Cheapest / Safest / Best-documented toggles and a real listing link.
- One Piece cards resolve through the bundled/OPTCG catalog, use TCGCSV category `68` for TCGplayer crosswalk/prices when available, and degrade visibly when no TCGCSV product match exists.
- Japan price checks appear as outbound manual reference buttons, open the relevant Japanese search pages, and remain labeled as not fetched/analyzed.
- The labeled demo (no live or user-supplied rows) still reaches the independent lenses and hides the per-listing vs-market read.
- A manual Facebook/local listing is never fetched server-side.
- Tax-known and tax-unknown totals use the correct language.
- Missing provider credentials remain clearly labeled (`demoMode:true`).
- Technical trace is collapsed.
- No grade prediction or automated sold-history claim appears.
- Desktop and mobile layouts remain usable.

For any UI-affecting change, always verify visually before handing off: run the dev server, drive the changed flow in a real browser (Playwright with the preinstalled Chromium in remote sessions), capture screenshots of the affected screens in both English and 中文 plus a mobile viewport, and share those screenshots with the user.

When the work is finished — gate green and visually verified — push it to `main` (fast-forward from the working branch) so Vercel deploys it. Don't leave finished work sitting on a side branch waiting to be asked.
