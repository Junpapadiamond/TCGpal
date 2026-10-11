# Whatnot and Mercari free-capacity recovery — October 11, 2026

Status: investigation and local code preparation; neither production source has been restored by this work. Owner: Codex for implementation/evaluation, founder for new account terms and budget authorization. Review: October 11 before any acquisition or source promotion. No scheduled harvesting or monitoring.

## Requested outcome and observed failure

The founder requires **both Whatnot and Mercari, still queried automatically by the website**, and rejected additional payment and substitution with other stores/manual imports.

The deployed Charizard ex 199/165 comparison returned `Soldgraph free allowance reached.` for both configured Soldgraph agents. eBay returned 50 candidates and Stomping Grounds three. Soldgraph's authenticated dashboard showed Free, 85/100 account-wide requests in the rolling window. The application's separate atomic allowance is 80 starts per rolling 30 days, shared by both markets. This is an application budget pause; it is not evidence that either marketplace has no offers. The approximately 15 remaining provider requests cannot provide lasting recovery for two sources.

The existing Apify dashboard showed Free, $0.01/$5.00 monthly usage and no running jobs. That visibility does not authorize more starts. The last verified historical Redis count was 180 on October 3; a current read is still required. Never reset/refund that counter or substitute a new key.

## Decision challenge and smallest test

The underlying instinct is to preserve automatic cross-market coverage without additional cash cost. The proposed mechanism is to use existing monthly Apify credits for Whatnot and evaluate Crawlora's monthly free Mercari endpoint.

Strongest case: the existing Whatnot adapter has historical successful acquisitions and known price-unit mapping; Crawlora documents a much larger recurring free allowance than Soldgraph and an API suited to a server-side search. Serious objections: Crawlora's documented schema does **not** establish USD or active/unsold status, and neither this provider's terms nor its API existence establishes marketplace permission. Free allowances also remain finite, and historical Whatnot success does not prove the pinned build still works.

Recommended next action is an isolated, bounded test, not immediate production activation. Pending request to founder: accept Crawlora account terms/basic Google or GitHub profile sharing and a server-only API key; use at most 20 requests/60 free credits to evaluate Mercari. Separately requested: at most 100 additional Whatnot starts, $0.03 maximum per start drawn only from existing free credit, expiring 2026-11-01T00:00:00Z. No card, paid upgrade or overage. These requests are **not yet approved**.

Evaluate five exact-card queries spanning Pokémon and One Piece, including Charizard ex 199/165, in two rounds. Start with one query and stop early when a kill criterion is demonstrated. Success requires useful repeatable matches, source-supported currency/activity and acquisition freshness, no exact-number/print conflicts in the admitted sample, bounded latency, and a successful deployed-environment test. Unknown charges remain null and cannot produce ranking winners. Kill on access denial/challenge, unsupported currency/activity/freshness, schema drift, hidden monetary expenditure, or unsupported identity/condition claims. No automatic retry via another transport after access denial.

Account creation alone does not promote the source. All five production promotion gates in AGENTS.md still apply. If the test cannot establish active USD asking prices, report the gap and keep Crawlora out of production.

## Provider evidence (accessed October 11)

- [Crawlora Mercari search documentation](https://fe.tonywang.io/docs/mercari/mercari-search): documented `GET https://api.crawlora.net/api/v1/mercari/search?query=...`, server header `x-api-key`, first-page results. Three credits per successful request. No documented count/page/status/currency parameters. `price_cents` is an integer; condition/like codes are explicitly best-effort decoding. Item creation/update timestamps are not collection times. Neither search nor the reviewed item example establishes active/unsold status. This is documentation, not a live acquisition.
- [Crawlora pricing](https://fe.tonywang.io/pricing) and signup: Free advertises 2,000 monthly credits, 500 daily credits, five requests/minute, no overage, no payment card. At three credits/search, the arithmetic ceiling is 666 monthly searches before other usage or safeguards; it is not verified application capacity. Live calls require an authenticated account/API key; the public Playground only shows examples without one.
- [Crawlora terms](https://fe.tonywang.io/terms) and [privacy policy](https://fe.tonywang.io/privacy): customers retain responsibility for third-party rights and platform rules; no marketplace license is granted. Account profile, queries, request metadata, responses/caches and operational logs may be processed. Retention periods and subprocessors are not fully specified, and the page does not identify a registered legal entity/address. Only public card query text is proposed upstream; buyer ZIP, seller identities, account sessions and raw captures must not be propagated or committed. Do not use CAPTCHA/access-control bypass features.
- [Apify pricing](https://apify.com/pricing): Free advertises $5 monthly credit. The actual authenticated account remains Free with $4.99 available at observation. [Whatnot actor metadata](https://api.apify.com/v2/acts/epicscrapers~whatnot-scraper) currently lists Free `item` pricing $0.003 plus a $0.00005 start event at the adapter's memory tier. Three results fit the existing $0.03 cap; runtime tariff preflight remains mandatory. The app remains pinned to build 0.2.30 pending a fresh approved test.
- [Whatnot developer portal](https://developers.whatnot.com/): seller-oriented API, no new applications at review. It does not offer a ready buyer-wide search replacement.
- [ScrapeAtlas](https://scrapeatlas.com/) offers a 100-credit initial trial rather than an established recurring free replacement for both sources. It does not resolve this requirement.

Existing direct collectors have recorded access failures. This investigation did not retry blocked marketplace pages, reuse restricted sessions, create extra trial accounts, or reset quotas. Mercari's failed Apify proxy path remains disabled.

## Local preparation

- `WHATNOT_LISTING_PROVIDER` and `MERCARI_LISTING_PROVIDER` allow independent explicit selection of existing approved `soldgraph`, `apify`, or `disabled` sources. Unset/blank retains previous selection. Invalid values fail closed for that marketplace. Missing credentials or runtime failure never selects another transport. Existing flags, tariff checks and original counters still apply. No production environment changes made.
- An isolated [research client](../../scripts/frontier-research/crawlora/README.md) enforces one API request, 20 seconds, 1 MB, three retained observations and safe error handling. It deliberately records currency, activity and card condition as unknown; no app integration or production candidate conversion exists.
- TDD observed the five new provider-selection failures before implementation and the missing research module before implementing its contract. Full local release gate passed: 1,829 tests (five optional live tests skipped), metadata audit, ESLint, TypeScript and webpack production build. Live acquisition verification remains pending. Graphify CLI and its documented macOS path are unavailable on this Windows host; the existing graph was inspected but regeneration is not claimed.
