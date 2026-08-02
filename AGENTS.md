<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project uses Next.js 16. Read the relevant guide in `node_modules/next/dist/docs/` before framework-level changes and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TCGlens Agent Guide

## Product

TCGlens is an evidence-backed listing comparison tool for U.S. trading-card raw-single buyers. Pokémon and One Piece are live; more TCGs are planned. `TCGpal` remains the repository and legacy path name; use `TCGlens` for current product-facing copy and do not mechanically rename paths or historical artifacts.

The primary flow is intentionally narrow and **card-first** (the buyer already knows the card; we find and rank the listings):

1. Enter the card you want — name, optionally collector number/card id and game. Pasting a specific listing URL is an optional secondary path.
2. Confirm the exact card/version (one-tap when the name is ambiguous; auto-confirmed when name + number are explicit).
3. The agent fans out over configured concrete-listing platform agents (eBay Browse today), ranks condition-compatible listings with complete comparable cost, and shows source failures instead of hiding them. TCGplayer/TCGCSV remains a separate aggregate market reference.
4. Return **one recommended buy** (default: Best Value: complete cost, condition fit, seller trust, and evidence combined) with a lens toggle to **Cheapest / Safest / Best-documented**. Lenses are independent and may select the same listing; the product abstains when no listing is comparable.

TCGlens is not a price predictor, grading app, investment advisor, marketplace scraper, or generic collecting dashboard. It accelerates a decision the buyer has already made; it does not make the choice for them.

## Stable Runtime Contract

- The app opens directly to card search with no login. Raw USD singles are supported for Pokémon and One Piece; more catalog adapters may join behind the game selector.
- eBay Browse is the only live concrete-listing source. eBay Catalog may resolve confirmed-card identity/ePID but is never inventory. TCGCSV/TCGplayer and PriceCharting are references, never ranking candidates.
- The canonical crosswalk and market anchor may degrade visibly when a provider match is missing; they must not turn a partial source failure into a fabricated value or a hard failure for otherwise usable results.
- The aggregate market anchor is item-only. Item-price position compares item price to that reference; shipping and optional tax remain separate checkout-cost facts used for landed-cost ranking.
- The aggregate market anchor is also condition-blind — TCGCSV has no condition-level SKUs, so it reads as Near Mint. Only an NM request paired with an NM claim is a like-for-like read that may score. Other conditions still show the delta, labelled against the NM reference and visually neutral, and never feed `priceScore`. Do not invent a condition multiplier to make it comparable.
- Completed pure card searches may create 30-day receipt snapshots from the server-verified 15-minute report cache. Snapshot storage strips the buyer ZIP and only publishes a stable URL when shared Redis is available; pasted and manual listing facts are never published this way.
- A user-pasted listing URL may be fetched once through the bounded adapter. Other connector-less sources remain user-entered facts or outbound manual checks.
- Missing seller data is `unverified`, not risky. Seller track record and evidence completeness remain separate signals.
- No trustworthy live row means `next_moves`. Demo fixtures are test-only and never become fallback inventory, identity candidates, or recommendations — a failed catalog lookup returns an explicit unavailable result, never a fixture that happens to match the query by name.
- OpenAI, Tavily, and Exa are optional. Deterministic identity, eligibility, pricing, ranking, abstention, and summaries must remain usable without them; web context and discovered links never enter ranking evidence.
- REST, MCP, and the Work plugin reuse the same domain functions and source boundaries. They may narrow or project responses but may not weaken validation or receive provider credentials.
- One Piece research ledgers are review queues, not runtime overlays. Only explicitly reviewed entries in `src/lib/external/one-piece-print-metadata.ts` may affect identity or market anchors.
- Card-version investigations may use official card lists and announcements, structured catalogs, specialist guides, forums, and Reddit. Community material is discovery/corroboration evidence only: record the URL and access date, resolve conflicts against stronger sources, and require human-reviewed curation plus tests before changing runtime identity behavior. Follow `docs/card-identity-research-policy.md`.

Mutable release state, open decisions, verification evidence, and exact versions belong in sectioned `PROGRESS.md`, not this always-loaded guide. Detailed provider and interface behavior belongs in `docs/architecture-and-data-sources.md`.

## Product Guardrails

- Never invent sold transactions, live inventory, shipping, taxes, seller history, or source access.
- Never call a seller a scam from listing signals. Describe specific missing evidence or risk signals.
- Never predict NM/LP/grade from photos in v1. Marketplace condition is a seller claim.
- “Best condition evidence” means the listing provides stronger review material; it is not a grade prediction.
- Do not use “must buy,” guaranteed-profit language, or unsupported certainty.
- When tax is absent, say “pre-tax total,” not “all-in” or “landed cost.”
- Every result must show sources, timestamps, assumptions, missing information, and confidence.

## Founder Decision Challenge

For consequential product, source-access, ranking, or agent-boundary decisions, do not silently agree with the founder's proposed implementation. Before making the change:

1. Separate the underlying instinct from the proposed mechanism.
2. State the strongest case for the proposal and at least two serious objections.
3. Identify observed evidence, assumptions, and claims that are being treated as known without evidence.
4. Recommend one decision, the smallest falsifiable test, success criteria, kill criteria, an owner, and a review date.

Use the `advisor` skill when it is available or explicitly invoked. Debate is for improving the decision, not for blocking reversible experiments. Once the test boundary is explicit, execute decisively inside it.

## Production Data Boundaries

These boundaries govern the public application, product routes, scheduled jobs, production ranking, and any output presented as TCGlens-verified. They do not prohibit the separately defined Frontier Research Mode below.

Allowed:

- Official eBay Browse API for active listings and item details.
- Official eBay Catalog API for confirmed-card product identity metadata only (`product_summary/search` ePID + localized aspects). It may guide the Browse search by ePID, but it is never seller inventory and never a ranking candidate.
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

Only the bounded adapters in `src/lib/external/*` may fetch external URLs for the production application. Anything they refuse (robots-blocked, non-https, private hosts, non-USD) remains user-supplied text in production.

## Frontier Research Mode

TCGlens may run founder-triggered, non-production experiments to test whether current models and agents can achieve trustworthy cross-platform, cross-market listing search beyond official APIs. This mode exists to discover capability and failure boundaries; it is not a quiet backdoor into production ranking.

Frontier Research Mode may:

- Use search providers and interactive browser agents to find and open public marketplace search results and listing pages that the founder did not paste individually.
- Search across regions, languages, currencies, marketplaces, community-sale venues, and specialist shops.
- Extract experimental listing facts from pages the agent actually observed, including title, price, shipping, stated condition, seller signals, availability hints, and card identity evidence.
- Use model judgment to reconcile ambiguous page structure, translation, and candidate identity, provided uncertainty and conflicting evidence are retained.
- Produce an experimental comparison or recommendation when every winning fact is traceable and the output is unmistakably labeled `frontier-research`, not production truth.

Frontier Research Mode must:

- Run only after an explicit founder/user research request. No scheduled crawling, background monitoring, or autonomous inventory harvesting.
- Use a visibly separate harness and artifact namespace from product routes, caches, analytics, and the `PlatformAgent` production registry.
- Record field-level provenance: source URL, observation time, acquisition method, extracted value, supporting page evidence, and confidence. A search snippet is discovery evidence, not proof of a listing fact.
- Preserve evidence states instead of flattening them: `link-only` → `page-observed` → `identity-checked` → `cost-comparable`. Unknown shipping, tax, availability, seller history, or condition stays unknown.
- Keep exact-print identity checks, novelty/replica exclusions, comparable-cost math, and unsupported-claim criticism deterministic wherever the required inputs exist. The model may propose; it may not silently manufacture missing inputs.
- Respect access boundaries. Do not bypass authentication, CAPTCHAs, paywalls, rate limits, robots exclusions applicable to automated access, or technical blocks; do not use stealth, credential extraction, or anti-detection techniques.
- Never purchase, bid, message a seller, create an account, post, or mutate marketplace state without a separate explicit user instruction.
- Keep credentials, session material, personal data, seller identifiers, and raw page captures out of committed artifacts. Store only the minimum evidence needed for the experiment.
- Surface source failures and abstain when the exact card, current availability, or comparable cost cannot be supported.

Frontier findings may enter production only through a deliberate promotion gate:

1. A repeatable evaluation demonstrates useful coverage and acceptable exact-print precision, factual precision, completeness, latency, and cost.
2. The acquisition method receives an explicit source-rights, platform-policy, privacy, and operational review appropriate to the intended deployment.
3. The source becomes a bounded adapter with Zod contracts, rate limits, failure isolation, observability, and tests.
4. Deterministic ranking consumes only facts that meet the production evidence contract.
5. AGENTS.md is updated again to name the newly approved production boundary.

Until all five gates pass, frontier outputs remain research evidence and may not be presented to normal users as verified live inventory, market prices, sold comps, or ranked production candidates.

## Agent and Rules Boundary

The AI layer may:

- Reconcile ambiguous structured evidence.
- Explain why deterministic rankings differ.
- Produce cautious, schema-shaped summaries.
- Use Tavily/Exa citations for bounded assistant web context, translation, manual reference suggestions, identity help, and experimental URL discovery when explicitly routed through the web-context/discovery paths.

Deterministic TypeScript must own:

- Eligibility and product exclusions. eBay search is full of cheap novelty items that carry the exact card name + number (gold-metal cards, stickers, DIY/"extended art", for-display replicas). Two deterministic defenses in `ranking.ts`: (1) `exclusionPatterns` title filters; (2) a **market-floor gate** aligned to the exact-print exclusion band (`MARKET_FLOOR_RATIO` = 0.45) × TCGplayer market for NM/LP requests. Exact-print evidence proves identity, not commercial plausibility, so it never bypasses this gate. eBay search uses Best Match (not price-asc) so the cheapest junk does not dominate.
- Exact-match validation gates.
- Price, shipping, optional-tax calculations.
- Seller-trust and evidence-completeness scoring.
- Winner selection and tie-breaking.
- The final unsupported-claim critic.

AI failure must fall back to deterministic behavior. Model output must never override source truth or ranking math.

## Contract Ownership

- `src/lib/schemas.ts`: authoritative public, cached, and shared payload contracts.
- `src/lib/comparison/ranking.ts` and exact-print helpers: eligibility, exclusions, complete-cost math, scoring, print proof, and lens selection.
- `src/lib/comparison/report-cache.ts` and `report-snapshot.ts`: short-lived live report reuse and server-verified, privacy-reduced receipt persistence.
- `src/lib/comparison/platforms.ts`: concrete-listing provider interface and isolated parallel fan-out. New live sources implement `PlatformAgent`.
- `src/lib/ai/listing-compare.ts`: comparison orchestration; `src/lib/external/*` contains the only bounded external fetchers.
- `src/features/comparison/ComparisonApp.tsx`: card-first UI; `src/lib/testing/standard-comparison-flow.ts` is its reusable behavior contract.
- `src/app/api/agent/*` and `src/lib/mcp/*`: public REST/MCP validation and projections, not ranking ownership.
- `src/lib/ops/*` and `src/lib/analytics.ts`: operational boundaries and privacy allowlists.
- One Piece research scripts generate evidence and audits; reviewed runtime curation remains separate.

Use `docs/architecture-and-data-sources.md` for the detailed interface/source matrix. Keep server/API secrets outside Client Components.

## Analytics Privacy

`src/lib/analytics.ts` is the event and property allowlist. PostHog uses explicit custom events only; autocapture, session replay, pageview capture, and person profiles stay disabled. Never transmit URLs, listing text, seller identifiers, or images.

## Scope

Multi-TCG is the direction: Pokémon and One Piece are live, and adding further TCGs (via their own catalog adapters behind the game toggle) is in scope. Do not add scanning, image upload, vision grading, payments, auth, saved collections, recommendation feeds, journals, cooldowns, or planning until the core comparison pilot passes its validation gates.

Retained `listing-risk` and `raw-vs-slab` modules are reusable deterministic utilities, not current navigation surfaces.

## Engineering Rules

- Use Zod at every public API boundary.
- Use React Hook Form for form state.
- Preserve the current cream/teal/gold TCGlens visual system.
- Use real card images from allowed sources.
- Never commit API keys; `.env.example` contains placeholders only.
- Keep demo fixtures unmistakably labeled.
- Prefer parallel provider work and partial results over failing the whole report.
- Preserve accessibility: labels, keyboard navigation, visible focus, semantic headings, and reduced-motion support.
- Keep the technical trace collapsed for normal users while preserving inspectability.

## Verification

Match verification cost to the change:

- Documentation-only changes: run `git diff --check`, verify changed links/paths and section markers, and inspect the rendered Markdown when layout matters. Do not run the application gate or visual QA unless the docs change executable examples or release instructions.
- Focused implementation: run the narrowest relevant tests during iteration. Behavior changes use TDD. TypeScript changes also run lint and typecheck before handoff.
- Full product/runtime gate before merging or deploying: `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`.
- Run `npm install` only when dependencies changed or the workspace is missing them.
- Validate `plugins/tcglens` only when plugin files or their exposed contracts change: `python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/tcglens`.
- Run provider credential/live checks only when the affected provider, identity, ranking, or source behavior changed and credentials are available. Never make hermetic tests depend on live services.

The automated product-flow standard is part of `npm run test`: `src/lib/testing/standard-comparison-flow.ts` must cover at least five sequential card-first searches in one session, include both Pokémon and One Piece, and exercise both edit-search and new-search transitions. Keep it hermetic: injected fetchers only, no API secrets, no browser automation against marketplaces, and no unmocked external network.

For UI or comparison-flow changes, run the dev server and verify the changed flow in the built-in browser. Capture and share English and 中文 desktop views plus a mobile viewport. Run the sequential multi-card manual smoke only when search, confirmation, comparison, Edit, or New Search behavior changed. Use standalone Playwright only when explicitly requested or when the built-in browser is unavailable, and say why.

When the applicable gate is green, fast-forward finished work to `main` and push so Vercel deploys it. Do not require product visual QA for documentation-only work.

## Agent Navigation Interfaces

Design the codebase so Codex can inspect it through stable, explicit interfaces before opening many raw files:

- **Project map:** `AGENTS.md` is the highest-level product, boundary, and verification contract. Keep it current when source access, ranking ownership, provider policy, or launch gates change.
- **Current handoff:** `PROGRESS.md` is the section-addressable status and decision index for new threads. Read `BOOTSTRAP` and `TASK-INDEX`, then only the relevant `WS-*` section. Invoke `/progress` or `$progress` to refresh git state and task evidence without loading the full history.
- **Knowledge graph:** Graphify is installed for Codex. Use it as the first broad-navigation interface when the task is architectural, cross-file, or asks "where/how does this work?"
- **Runtime contracts:** `src/lib/schemas.ts` is the public request/response contract. Zod schemas must stay authoritative for API boundaries and cached/shared payloads.
- **Provider contracts:** `src/lib/comparison/platforms.ts` is the marketplace-agent interface. New live sources should join by implementing `PlatformAgent`, not by branching comparison orchestration.
- **Decision contracts:** `src/lib/comparison/ranking.ts` owns eligibility, exclusions, scoring, and lens selection. AI may explain decisions but must not own ranking math.
- **Ops contracts:** `src/lib/ops/*` owns rate limiting, cache, Sentry capture, and operational events. Add durable backends behind these interfaces instead of importing vendors through product code.
- **Behavior contracts:** Tests live next to source and should describe observable behavior. Always use TDD for behavior changes: write or update a failing test first, make it pass, then refactor. `src/lib/testing/standard-comparison-flow.ts` is the reusable multi-card product-flow contract; update it whenever the comparison journey changes.

## Graphify

The installed CLI is `/Users/chenjunhsu/.codex/tools/graphify/bin/graphify`; the AST graph is `graphify-out/graph.json`.

When the user types `/graphify`, use Graphify before doing anything else.

For broad or unfamiliar cross-file work, use `graphify query`, `graphify path`, or `graphify explain` before opening many files. Use the wiki for broad navigation and `GRAPH_REPORT.md` only when focused commands are insufficient. `EXTRACTED` edges are stronger than `INFERRED`; verify `AMBIGUOUS` and decision-critical edges in source. If the graph is absent, fall back to `rg` and source files.

Run `graphify update .` only after structural code changes that alter symbols, imports, or relationships, and before committing those structural changes. Skip regeneration for documentation, copy, styles, images, data-only updates, and test-fixture changes that do not alter navigable structure. Use deep extraction only when the task explicitly needs a semantic graph refresh and credentials are configured.
