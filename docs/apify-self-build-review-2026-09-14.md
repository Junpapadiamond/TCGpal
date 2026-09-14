# Apify contracts and self-built acquisition review

Reviewed 2026-09-14. Engineering owner: Codex; source-access owner: founder. Review date: 2026-09-21.

The founder conditionally permits carefully understood Apify use and still prefers self-built acquisition. This supersedes the earlier absolute rejection, without authorizing unattended runs or spending the entire balance. After the founder completed login, Console confirmed the Free plan and $5 remaining. **One capped Whatnot test returned three records; its event charges total $0.00905.** No other Actor was run, no API token was extracted, and no paid production source was activated.

## First real Whatnot test

Run `Oky80exLUgdZMNkwL`, build `0.2.30`, September 14 at 22:38 UTC: one `Pikachu 58/102` query; both result limits set to three; URL inputs/filters cleared; listing-only output; proxy disabled in input; no cookies. Console confirmed 30 seconds, 256 MB and a $0.03 run cap. It reported success in approximately three seconds. The billing breakdown showed one $0.00005 startup event and three item events totaling $0.009, with platform usage included. A later Billing check displayed $0.01 used and $4.99 remaining (rounded). This is actual provider output, not independent page verification or proof of a permitted production channel.

All three rows were `listing`, `ACTIVE`, `BUY_IT_NOW`, quantity one. They described a gold-metal anniversary version, a Damaged Base Set card and a Shadowless/red-cheeks version. Shipping and buyer fees were absent. `amountSafe` equaled `amount` in every row: 16600, 100 and 13900. The [official Money.amount documentation](https://developers.whatnot.com/docs/types/Money) specifies minor units, supporting a cents hypothesis, but covers the Seller API rather than independently proving this web Actor's `amountSafe` mapping. Do not select the production unit from price magnitude or README examples; listing-page confirmation remains outstanding.

An offline replay through the existing parser and deterministic ranking, under both possible monetary scales, produced zero eligible NM/Base recommendations: product exclusion, condition mismatch or insufficient exact-print evidence, plus missing checkout costs. The replay made no acquisition calls. It exposed the retained parser's unsupported zero buyer fee; a failing regression test was added before changing that field to unknown. Paid registry entries remain inactive.

Minimum observations and the replay remain ignored in `output/frontier-research/direct-metadata/2026-09-14-whatnot-apify-pilot.json` and `2026-09-14-whatnot-pilot-replay.json`. No seller identifiers, signed dataset links, cookies or raw captures are committed. The result changes the next action: evaluate verified units, complete costs and exact-print coverage; acquisition through this Actor is now demonstrated for one query. This small run does not establish reliability, production rights or three live marketplaces.

Validation: regression red-to-green; lint, typecheck, metadata audit, 1,509 tests and production build pass (107 test files passed, five skipped). The first sandboxed build could not fetch existing Google Fonts; the same build passed with network access. No UI flow or provider registry changed. A fresh [production capabilities read](https://lenstcg.com/api/agent/capabilities) still lists only eBay as live.

## Can direct GraphQL replace the Whatnot Actor?

The useful instinct is to obtain structured listing facts without paying a general scraper per row. GraphQL can support that design, but it is a query protocol, not evidence of anonymous access or a cross-seller inventory license. The strongest case is the successful three-row Actor run and its author's web-GraphQL description. The two unresolved objections are concrete: our direct request was blocked before returning GraphQL JSON, and the successful Actor rows still lacked verified monetary units and checkout costs.

**Observed connectivity:** at 22:58:14 UTC on September 14, one anonymous POST to `https://api.whatnot.com/graphql/` with `query TCGlensConnectivity { __typename }` returned HTTP 403 in 125 ms, content type HTML and a challenge-page title. No GraphQL `data` or `errors` envelope was returned. The preceding host robots read returned 404; that is not a permission grant. The request used a transparent research user agent, no credentials or proxy, and no retry. Acquisition stopped at the block. The cause is not established, and this does not show that the API block and the founder's account restriction have the same cause. Minimal evidence is ignored at `output/frontier-research/direct-metadata/whatnot-graphql/connectivity-probe.json`; raw challenge content is not retained there.

There are two different GraphQL surfaces:

| Surface | Verified scope and evidence | Consequence |
| --- | --- | --- |
| Official `/seller-api/graphql` | [Seller API introduction](https://developers.whatnot.com/docs/getting-started/introduction): authenticated seller-store management, developer preview, currently not accepting new applicants. [listings](https://developers.whatnot.com/docs/queries/listings) requires `read:inventory`. | Not a documented global buyer-search API. A seller integration would cover that authorized seller, not all marketplace inventory. |
| Web `/graphql/` | The public [wxllow wrapper](https://github.com/wxllow/whatnot) references this endpoint; its README reports broken authorized actions and lack of maintenance. Its inspected queries cover users/livestreams rather than a current concrete-listing search. Our direct probe returned 403. | The endpoint is evidenced; a working current listing-search operation and an allowed deployment channel remain unverified. |

Another [public implementation](https://github.com/TSavo/arbitrage-scout/blob/5457c711328f531774efdc719c3043ef61c8e701/src/sources/whatnot.ts) contains a `searchProducts` query selecting only product id/name/slug/image/tags. That query supplies no listing price, shipping or availability. Its known-query path assigns zero price then filters out non-positive prices, returning no rows before any price enrichment. Its transport also describes challenge bypass and session-token replay. The source was read, not executed or adopted. It does not establish a usable TCGlens listing adapter or prove that all web searches require login.

**Proposed adapter flow, not implemented or verified:** exact-card query → current web listing-search operation → at most three listing details → explicit money/status/condition normalization → existing exact-print and complete-cost gates. Search and detail operation documents must come from current permitted observations or provider documentation; do not invent field names from Seller API examples. Preserve field provenance and partial failures. Unknown shipping and buyer fees remain unknown. The official [ShippingProfile](https://developers.whatnot.com/docs/types/ShippingProfile) exposes id/name/weight/unit, not a buyer shipping quote; its existence does not solve checkout cost. Any quote capability must be independently evidenced and must not mutate a cart or use private order data.

**Decision and next falsifiable test:** keep direct GraphQL as the preferred self-built research design, with access unresolved. Once a permitted access channel and a current operation are available, run one exact-card query, at most three detail reads, within 30 seconds and with no paid dependency. Success requires at least one demonstrably active exact-print listing, price-unit agreement with an independently observed listing, and a correct known/unknown cost classification. Complete-cost ranking additionally requires verified shipping and buyer fees. Stop on another access block, session-extraction/evasion requirement, or unresolvable identity/money mapping; do not promote a parser-only success. Codex owns the operation/field evaluation; the founder owns account/platform access resolution; review September 21. Only a successful bounded test advances to the existing repeatability and production gates. This GraphQL investigation made no additional Apify runs or paid calls.

## What the four exact Actors establish

The public Actor and build APIs exposed pricing, README and input schemas, not implementation source. The mechanisms below are author descriptions; only Whatnot has now had the bounded output test described above.

| Actor | Acquisition and output described by its author | Fit for TCGlens |
| --- | --- | --- |
| [Whatnot: epicscrapers](https://apify.com/epicscrapers/whatnot-scraper), `omgr8VWKxGZrtwQKJ`, build `0.2.30` | Native web GraphQL, cursor pagination; mixed listings, products, streams and profiles. Claims anonymous access; supports proxies and optional cookies. | Three listing records returned in the pilot. Monetary scale, complete costs and exact print remain unverified. No query implementation was disclosed; direct account access remains unresolved. |
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

Apify's [Run Actor API](https://docs.apify.com/api/v2/actors-runs-post) documents `maxTotalChargeUsd` as the run cost cap. Platform-level `maxItems` applies only to pay-per-result billing and does not guarantee output count; Actor input fields with similar names are separate controls. [Store billing documentation](https://docs.apify.com/actors/running/actors-in-store) also warns that some Actors charge platform usage separately and that post-run dataset access incurs standard usage charges. The Whatnot Console pricing confirmed included platform usage before the first test. Recheck plan, current pricing, platform billing responsibility, explicit input limits, timeout and run cap before further paid tests. No scheduler or unattended paid command was created.

## Decision: own the small adapter; prove access before expanding it

The strongest case for self-building is concrete: TCGlens needs far fewer fields and modes than these general-purpose Actors. We already own the Mercari DOM reader, validation, bounded browser adapter and deterministic ranking integration. Avoiding a per-record vendor fee also gives us direct control over freshness and evidence handling.

Two objections materially change the effort estimate. First, local browser readability did not survive deployment: the actual Vercel Mercari probe returned HTTP 403 and zero rows. Second, metadata is not automatically trustworthy inventory: a visibly sold Mercari page retained stale InStock JSON-LD, and several observed results failed the requested print/raw/language intent. Parsing complexity and acquisition reliability are separate.

**Recommendation:** retain the self-built Mercari candidate and separate research harness; use these documents as contract references. Do not activate paid production adapters or build four generalized scrapers from these examples. The linked Japan and aggregate sources are not substitutes for the requested eBay + Mercari US + Whatnot comparison.

The one-query Whatnot acquisition probe is complete, while Mercari's self-built server channel remains blocked. Next require independent monetary-unit confirmation and an exact-print listing with verifiable checkout costs before buying a larger sample. Retain the three-detail/30-second boundary for a new permitted channel; stop on an access restriction, unsupported monetary/status claim or an evasion requirement. Codex owns evaluation; the founder owns account/source-access resolution; review September 21. Only then run the existing 20-card/two-run evaluation and production promotion gates. Do not use the shared public app to consume this small personal test balance.

Existing code, test results and the failed live server probe are recorded in [the cross-market handoff](cross-market-pilot.md). Mercari is still a preview candidate; production remains eBay-only.
