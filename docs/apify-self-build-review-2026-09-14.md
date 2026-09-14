# Apify contracts and self-built acquisition review

Reviewed 2026-09-14. Engineering owner: Codex; source-access owner: founder. Review date: 2026-09-21.

The founder now has an Apify account with a reported $5 available, conditionally permits carefully understood use, and still prefers self-built acquisition. This supersedes the earlier absolute rejection of Apify. It does not authorize unattended runs, spending the entire balance, or production activation. **This investigation started zero Actors and spent $0.** The inspected browser redirected to sign-in; account balance and plan were not independently verified.

## What the four exact Actors establish

The public Actor and build APIs exposed pricing, README and input schemas, not implementation source. The mechanisms below are author descriptions, not independently tested output.

| Actor | Acquisition and output described by its author | Fit for TCGlens |
| --- | --- | --- |
| [Whatnot: epicscrapers](https://apify.com/epicscrapers/whatnot-scraper), `omgr8VWKxGZrtwQKJ`, build `0.2.30` | Native web GraphQL, cursor pagination; mixed listings, products, streams and profiles. Claims anonymous access; supports proxies and optional cookies. | Potential listing facts, but only active buy-now listings could qualify. Shipping is unproven. No working query implementation was disclosed; our account restriction remains unresolved. |
| [TCGplayer: devcake](https://apify.com/devcake/tcgplayer-data-scraper), `LqXsN8Iz7a9RNz50T`, build `0.0.4` | Public web search API; explicitly advertises curl_cffi Chrome impersonation. Product records contain nested seller listings with condition, printing, language, price, shipping and quantity. | Relevant contract, but access depends on more than parsing. Do not implement fingerprint evasion. Listed median is not a sales-based market anchor; the documented sold-data enrichment is unverified. |
| [Mercari: piotrv1001](https://apify.com/piotrv1001/mercari-listings-scraper), `0CUfsatHtZBfUO99R`, build `0.0.11` | Japanese keyword search plus optional item details; JPY prices, status, images, descriptions and seller ratings. | **Mercari Japan, not Mercari US.** A shipping-payer code is not a shipping quote. It does not solve the requested US adapter. |
| [SNKRDUNK: jungle_synthesizer](https://apify.com/jungle_synthesizer/snkrdunk-japan-sneaker-streetwear-resale-scraper), `gC9LxqcRXFPeGpoUW`, build `0.1.7` | Search pages and product details; CSS selectors, product identity, image and lowest asking price in JPY. | Product-level reference/discovery. The documented contract lacks individual seller inventory, condition and comparable destination cost. |

## Current prices and unsafe defaults

Read-only `GET /v2/acts/{id}` checks selected the latest effective `pricingInfos` entry, not a future price or the storefront's lowest discounted tier. All four are pay-per-event. FREE-tier event arithmetic follows; it is not a guaranteed total invoice or a verified account quote.

| Actor | Current record event | Startup event at default memory | Default input concern |
| --- | --- | --- | --- |
| [Whatnot pricing](https://api.apify.com/v2/acts/omgr8VWKxGZrtwQKJ) | $0.003/item | $0.00005 | Both URL and keyword examples are prefilled; result types include streams/products. `maxResultsPerQuery` defaults to 100 and overrides `maxResults`. |
| [TCGplayer pricing](https://api.apify.com/v2/acts/LqXsN8Iz7a9RNz50T) | $0.003/product record | $0.00005 | Three pages of 50 products per query; optional enrichment adds requests. One dataset row can contain multiple sellers. |
| [Mercari JP pricing](https://api.apify.com/v2/acts/0CUfsatHtZBfUO99R) | $0.004/search result plus $0.008/detail | $0.00005 | 100 results by default. README prices lag the effective September 9 configuration. |
| [SNKRDUNK pricing](https://api.apify.com/v2/acts/gC9LxqcRXFPeGpoUW) | $0.001/record | $0.10 | Startup dominates tiny tests; default run timeout is four hours. |

Apify's [Run Actor API](https://docs.apify.com/api/v2/actors-runs-post) documents `maxTotalChargeUsd` as the run cost cap. Platform-level `maxItems` applies only to pay-per-result billing and does not guarantee output count; Actor input fields with similar names are separate controls. [Store billing documentation](https://docs.apify.com/actors/running/actors-in-store) also warns that some Actors charge platform usage separately and that post-run dataset access incurs standard usage charges. Before any future paid test, verify the account plan, current pricing, platform billing responsibility, explicit input limits, timeout and run cap. No runnable paid command or scheduled task was created.

## Decision: own the small adapter; prove access before expanding it

The strongest case for self-building is concrete: TCGlens needs far fewer fields and modes than these general-purpose Actors. We already own the Mercari DOM reader, validation, bounded browser adapter and deterministic ranking integration. Avoiding a per-record vendor fee also gives us direct control over freshness and evidence handling.

Two objections materially change the effort estimate. First, local browser readability did not survive deployment: the actual Vercel Mercari probe returned HTTP 403 and zero rows. Second, metadata is not automatically trustworthy inventory: a visibly sold Mercari page retained stale InStock JSON-LD, and several observed results failed the requested print/raw/language intent. Parsing complexity and acquisition reliability are separate.

**Recommendation:** retain the self-built Mercari candidate and separate research harness; use these documents as contract references. Do not activate paid production adapters or build four generalized scrapers from these examples. The linked Japan and aggregate sources are not substitutes for the requested eBay + Mercari US + Whatnot comparison.

The smallest next falsifiable test requires new evidence of a permitted acquisition channel, rather than another attempt against the unchanged block: one exact card query, at most three details, executed in the intended server environment. Require observed active listings, exact-print evidence, explicit currency/units, field provenance and honest unknown charges within 30 seconds. Stop on an access restriction, unsupported monetary/status claim, or an evasion requirement. Codex owns the test; the founder owns account/source-access resolution; review September 21. Success only unlocks the existing 20-card/two-run evaluation and production promotion gates, not an immediate claim of three live marketplaces.

Existing code, test results and the failed live server probe are recorded in [the cross-market handoff](cross-market-pilot.md). Mercari is still a preview candidate; production remains eBay-only.
