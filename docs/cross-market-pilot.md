# Cross-market acquisition: build our own metadata collector

Decision/evidence date: **2026-09-14**. Engineering owner: Codex. Promotion/source-access owner: founder. Review date: **2026-09-21**.

## Current decision

The founder rejected Apify runtime acquisition and asked us to inspect its scraper contracts and build an automated alternative. This supersedes the paid-pilot activation plan. Whatnot and Mercari remain required targets alongside eBay; manual links and aggregate references do not fulfill the three-marketplace goal.

The underlying instinct is sound: TCGlens needs a small subset of public listing metadata. Owning acquisition removes per-result actor charges and gives us control of validation. Two serious objections remain: a browser that works locally does not prove reliable server access, and page metadata can contradict actual availability or omit destination-specific costs. Public visibility alone does not establish production source rights.

**Decision:** retire paid adapters from the production registry; build a separate, founder-triggered browser research collector. The first falsifiable test is two queries across Pokémon and One Piece, with at most three observed details per query. It must produce real page evidence without paid providers, record price/status conflicts, and preserve unknown costs and exact-print uncertainty. Stop on access restrictions; no stealth, session extraction, proxy rotation or CAPTCHA bypass. No background crawler or scheduler.

Before promotion, test 20 exact cards on two runs. Require 100% inspected monetary-unit/currency/status accuracy, at least 98% exact-print precision, monetary provenance, no unsupported complete-cost winner, useful additional coverage over eBay, and p95 latency below 30 seconds. Measure actual compute/browser/agent cost: zero Apify calls is not zero operating cost. Kill on a price-unit error, access requiring evasion, unsupported inventory or no useful incremental coverage. These larger gates have **not** been measured.

## What the public scraper material establishes

| Source | Described mechanism | Evidence limits |
| --- | --- | --- |
| [Epic Scrapers Whatnot](https://apify.com/epicscrapers/whatnot-scraper) | Author describes direct web GraphQL queries and cursor pagination without required login. Fields include title, amountSafe, currency, transaction type, public status, images and timestamps. | Author claims, not an independently verified query. The official Seller API is a separate account-scoped interface. |
| [getascraper Mercari](https://apify.com/getascraper/mercari-us-scraper) and [author repository](https://github.com/getascraper/how-to-scrape-mercari-us) | Author describes reading native browser network payloads instead of hardcoded GraphQL hashes. Documents item price, status, shipping, condition, images and seller aggregates. | The indexed README is readable, but the current repository and GitHub contents API returned 404. It is not available implementation source to copy. |
| Public actor version endpoints | Whatnot v0.2, Mercari v0.3 and devcake Whatnot v0.0 returned source-type/version metadata. | No source files, archive or Git URL was exposed. No actor was started and no paid dataset was purchased. |

Do not infer Whatnot price units from magnitude. Catalog products and livestreams are not active listings; a sample catalog lastSalePrice is not a verified transaction ledger.

## Actual observations

Reviewed [Whatnot robots](https://www.whatnot.com/robots.txt) and [Mercari robots](https://www.mercari.com/robots.txt) on the evidence date. The tested public search/canonical item paths are not excluded. Mercari tracking ref URLs are excluded; the collector opens observed canonical item paths without tracking parameters.

- Direct transparent HTTP requests to both search pages returned 403 verification pages. This describes that transport, not every acquisition method.
- The ordinary in-app browser initially rendered Whatnot search results, then navigated to an account-restriction page. No detail page was verified; access stopped. Do not infer the restriction's cause or treat initial search cards as confirmed inventory.
- Mercari search and details were readable in the ordinary browser. Public Product JSON-LD plus DOM fields expose current price, condition, shipping and Buyer Protection fee; this observed surface did not require network interception.
- Five Mercari details across two queries were inspected: four had enabled Buy now controls; one had a disabled Item sold control. The One Piece search-to-two-details run executed automatically. Those two details took 2.43s and 2.33s locally; this is not p95 or a reliability estimate.
- One Pokémon item displayed $3.10 item price, $0.49 shipping and $0.12 fee. Another displayed $13.99 current price versus $35.00 crossed out, $5.66 discounted shipping and $0.70 fee. These are listing-page facts, not checkout quotes.
- The sold control contradicted JSON-LD still saying InStock. The reader now records that conflict and retains sold status. Its displayed price is not asserted to be the completed transaction price.
- One One Piece candidate was Japanese, graded and alternate-art; another title was only “One piece card.” Search relevance is not exact-print proof. Neither entered ranking.

Minimal local evidence: output/frontier-research/direct-metadata/2026-09-14-observations.json (ignored by Git). Each field has URL, time, method, supporting evidence and confidence. No seller profiles, cookies or raw page captures are stored; no production cache, analytics or receipt is written.

## Repeatable harness

### Alternatives checked in the browser

| Option | What the primary documentation supports | Decision for TCGlens |
| --- | --- | --- |
| [Playwright](https://playwright.dev/docs/network) + our own parser | Browser DOM access and observation of normal page HTTP/fetch responses. No paid actor is required. | Preferred small implementation for the existing Node stack. The current tracer uses the supported browser tool; a standalone worker is not deployed or verified. |
| [Crawlee](https://crawlee.dev/) | Free open-source JavaScript/Python crawler library with request limits, browser integration and local output. [Deployment docs](https://crawlee.dev/python/docs/next/deployment/apify-platform) explicitly allow local/other-cloud execution. | Maintained by Apify, but using the library does not require buying Apify actors. Useful if we need queues and concurrency; not necessary for this small tracer. |
| [Crawl4AI self-hosting](https://docs.crawl4ai.com/core/self-hosting/) | Docker/local execution and structured CSS extraction without a required LLM; operating resources remain our responsibility. | Possible Python alternative. The current guide mixes v0.9 notices with v0.8 examples, so verify the migration/version before deployment. Not tested against Whatnot. |
| [Whatnot Seller API](https://developers.whatnot.com/) | Account-scoped seller inventory management; currently not accepting new applicants. | Not a public cross-seller buyer-search replacement. |

These are capability comparisons, not a claim that any tool defeats a Whatnot access restriction. The [official restriction guidance](https://help.whatnot.com/hc/en-us/articles/44133015373837-If-your-account-is-suspended-or-banned) directs restricted users to Account Health and eligible appeals; changing accounts to evade enforcement is prohibited. The [Trust & Safety Appeal form](https://help.whatnot.com/hc/en-us/requests/new?ticket_form_id=34398664460301) was verified in the browser. Restoring access is an operator/platform step, separate from proving production data access. No support message or appeal was sent.

- scripts/frontier-research/direct-metadata/mercari-dom.mjs: read-only DOM/JSON-LD extraction with title/URL binding, conflict handling and explicit unknowns.
- scripts/frontier-research/direct-metadata/collect.mjs: takes a supported-browser tab, one card query and today's robots-review date; opens one search and up to three observed canonical details. Stops on access blocks. No pagination, retries, proxy or HTTP fallback.
- Colocated hermetic tests cover prices, discounts, missing fees, stale InStock, access-page remnants, unrelated products, privacy minimization and bounded discovery.

Invoke `collectMercariResearch(tab, query, { founderTriggered: true, robotsReviewedAt: "YYYY-MM-DD", maxDetails: 2 })` inside the supported browser REPL after normal browser selection and a current robots review. This is agent-run research, **not a standalone production service**. Keep observations in the ignored research directory; never import the collector into product routes or the production registry.

## Production and remaining work

The production registry uses eBay Browse and unconfigured Whatnot/Mercari entries. Old Apify environment variables cannot activate paid acquisition. Historical provider parsers remain unused by the registry for reference tests; no credentials are requested.

The shipped collector-number fix, market-only anchor and deterministic incomplete-cost verdict remain. Listed midPrice/mid do not substitute for market prices. Generic merchandise “Like new” is not card NM; seller prose is a claim, not grading evidence.

Outstanding: permitted Whatnot access, a repeatable deployment acquisition method independent of this desktop session, larger exact-print/field evaluation, and all Frontier Research promotion gates in AGENTS.md. Three live production marketplaces are **not complete**. Apify activation/token placement is no longer a next step.
