# Cross-market pilot: eBay, Whatnot and Mercari

Decision and evidence date: **2026-09-14**. Engineering owner: Codex. Source-access and rollout owner: founder. Review date: **2026-09-21**.

The founder explicitly requested cross-market product discovery, a TCGlens verdict, an investigation of cheaper acquisition, and fixes for listed-median pricing and collector-number search. This reopens D-WHATNOT-RELAND. It authorizes this implementation and bounded evaluation; it does not establish marketplace licensing or prove live field accuracy.

## Decision and falsifiable test

The underlying need is to locate the exact card across marketplaces and help decide which listing to inspect or buy. Apify is an acquisition option, not the product itself. Its strongest case is that it can supply concrete listing metadata through the existing provider interface quickly. Serious objections are undocumented field changes (including a possible 100× price-unit mismatch), incomplete checkout costs, platform access restrictions, and per-search costs/latency for an anonymous application.

Implement eBay + opt-in Whatnot/Mercari adapters and a deterministic conditional verdict. Preserve unknown shipping and buyer fees. The paid adapters remain off until the operator sets `CROSS_MARKET_APIFY_ENABLED=1`. Existing tokens alone cannot activate a new production source. The source mode is `third_party_provider`, never `official_api` or `licensed_provider`.

Before rollout, sample 20 distinct exact cards across both games on two separate runs. Require 100% correct currency, price units and buy-now/availability classification in inspected rows, at least 98% exact-print precision, field provenance for every surfaced monetary fact, no unsupported complete-cost winner, p95 provider latency below 30 seconds, and cost no greater than $0.30 per uncached two-provider search. Measure usable additional coverage against eBay alone. Stop on any price-unit error, access block requiring evasion, unsupported inventory claim, budget-counter failure, or no additional useful exact-print coverage. These are acceptance criteria, **not completed measurements**.

The founder owns the source-rights, platform-policy, privacy and operational review before public activation. No proxy rotation, authentication bypass, CAPTCHA solving, private endpoint credentials or session extraction is implemented. No scheduler or crawler is added.

## Observations, not assumptions

| Question | Observed evidence | Consequence |
| --- | --- | --- |
| Can direct fetching replace Apify today? | One transparent public search-page request to each marketplace on 2026-09-14 returned HTTP 403 and a verification page. The initial sandbox network failures were retried with network access before classifying this result. | No self-hosted acquisition success is claimed. Do not retry through stealth/proxies. |
| Does Whatnot expose a buyer search API? | Its [developer introduction](https://developers.whatnot.com/docs/getting-started/introduction) describes seller integrations, not a general buyer inventory feed. | The seller API is not a replacement for this comparison source. |
| Are the old Whatnot mappings reliable? | The [current actor documentation](https://apify.com/epicscrapers/whatnot-scraper) gives `amountSafe: 9.00`, `BUY_NOW`, `PUBLISHED` and `scrapedAt`; the old branch assumed cents, `BUY_IT_NOW` and `ACTIVE`. | Require a verified `WHATNOT_APIFY_PRICE_UNIT` setting. Accept the two documented/legacy fixed-price status spellings; reject auctions. A live sample is still required. |
| Is Mercari shipping always unavailable? | The [provider contract](https://apify.com/getascraper/mercari-us-scraper) documents `shipping_payer`, `shipping_fee`, observation time, and active status. | Preserve the shipping field rather than discard it. Status and monetary fields remain validated; merchandise `like_new` does not mean card NM. |
| Is item + shipping sufficient for Mercari? | [Mercari's fee page](https://www.mercari.com/us/help_center/article/169/) documents buyer fees and legacy exceptions. The provider does not expose the final checkout fee. | `buyerFee: null` prevents a complete-cost recommendation. Do not turn a fee-policy estimate into an observed checkout charge. |

Robots files were reviewed for the two public search paths. Robots permission alone does not establish source rights. Provider advertising is a contract to test, not proof of the fields in a current listing. No real paid actor run has been validated in this workspace: credentials were not present in the local environment when inspected.

## Acquisition cost and cheaper options

Public Apify actor metadata for [Whatnot](https://api.apify.com/v2/acts/omgr8VWKxGZrtwQKJ) and [Mercari](https://api.apify.com/v2/acts/getascraper~mercari-us-scraper) was read without starting a run. On the free tier, the currently effective Whatnot price is $0.003/result; Mercari is $0.00299/result, plus small start charges. Forty results per source is approximately **$0.24 per cold comparison**, before account-plan considerations. Mercari metadata also announces a 2026-09-16 change adding $0.04/search and lowering its result rate to $0.00275; that is a future price at the observation date.

The [Apify synchronous-run API](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post) supports `maxTotalChargeUsd`. Each adapter sets it to $0.15, limits requested results to 40, disables restart-on-error, and applies a 25-second actor timeout plus a bounded HTTP timeout. A shared counter permits at most 25 uncached attempts per provider per UTC day: a maximum configured charge allowance of $7.50/day for the two providers together. Exhausted or unavailable production counters fail closed. Actual billing and useful-field yield still require the live acceptance test.

Lower-cost work completed: identical concurrent searches coalesce within a process; sanitized successful results cache for 15 minutes; genuinely empty results cache for 60 seconds; failures never become cached empty inventory. Cached rows retain their observation timestamps; rows older than 15 minutes at cache read must refresh. No seller usernames, descriptions, provider tokens, or raw response captures enter that cache. Do not claim a cache hit rate or realized savings before measuring them.

A separate [Whatnot actor](https://apify.com/devcake/whatnot-data-scraper) advertises a lower starting price but exposes a different schema. Its quality, fixed-price classification and actual effective cost have not been evaluated. Switching based on headline price alone would recreate the field-contract problem. A self-hosted collector could remove actor charges, but direct access is currently blocked and the operational/source-access cost is unresolved.

## Result contract

- eBay's complete eligible listings can win the existing four lenses. Any future provider row must pass the same print, condition, exclusion, availability, cost and price-review gates.
- Whatnot supplies active fixed-price listing candidates; its unknown shipping remains `null`.
- Mercari retains known shipping and records unknown mandatory buyer fees as `null`. Neither `Unknown` card condition nor missing seller history is upgraded.
- `incompleteCostOpportunity` considers only listings whose remaining exclusion is missing shipping/fees. It compares their known subtotal with the cheapest eligible complete pre-tax total. A positive difference is the strict break-even budget for all missing charges; it is not a buy recommendation. When no benchmark exists, it abstains from a cheaper claim.
- The UI shows item price, shipping, fees, seller/evidence coverage, source method and observation time. API payloads keep the same monetary facts; deterministic TypeScript owns the verdict math.
- TCGCSV `midPrice` and inline TCGplayer `mid` never substitute for sales-based market price. Missing/zero/negative market values produce no anchor; the crosswalk and timestamp remain usable.
- An explicit Pokémon collector number is retained through identity resolution. If live search returns only broader names, the real catalog snapshot can recover an exact number; otherwise the search returns no matching number. Demo identities are not used as outage inventory.

## Configuration and verification

Set the two provider tokens server-side, shared Redis credentials, the verified Whatnot price unit (`dollars` or `cents`), then the explicit rollout switch. Never put credentials in client settings or URLs. Set the switch back to `0` to stop new paid calls.

`scripts/testing/cross-market-preview.mjs` is a local-only QA proxy for the real Next dev UI on port 3000. It replaces external API calls with synthetic fixtures, removes inherited external-service credentials and disables durable writes. Run it with Node and open `http://127.0.0.1:4317` in the built-in browser. The screen is visibly labeled as synthetic QA. It is never imported by product routes or deployed as an endpoint. This harness verifies the flow, not live marketplace coverage or provider accuracy.

Current verification and remaining rollout work are recorded in `PROGRESS.md` → `WS-SOURCES`.
