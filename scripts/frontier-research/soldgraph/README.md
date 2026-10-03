# Soldgraph free source evaluation

**Status: prepared, not live-tested. `frontier-research` only.** No production imports, cache writes, ranking, automatic artifacts, account setup, or source activation. Reviewed primary docs October 3, 2026.

## Proposed free test and setup

Soldgraph documents both [Mercari active listings](https://soldgraph.com/docs/api/mercari-listings) and [Whatnot active listings](https://soldgraph.com/docs/api/whatnot-listings) on one account and API key. The [free plan](https://soldgraph.com/docs/api/usage) includes 100 completed searches per rolling 30 days across marketplaces. A completed empty or cached search costs one request; failed searches and job polls do not. There are no automatic overage charges. Paid plans start at $19/month for 5,000 searches, but none is needed or approved for this test.

The user must choose to [create a free account](https://soldgraph.com/signup), accept the provider's terms, and create a project API key. No payment card is required according to the signup page. This prepared client neither creates an account nor accepts terms. Store the key securely as `SOLDGRAPH_KEY` in the local execution environment; never paste it into chat, command arguments, committed files, or test artifacts.

After explicit approval of this free test and the account setup, run **one** command per approved marketplace:

```text
node scripts/frontier-research/soldgraph/run.mjs --founder-triggered mercari "Blastoise ex 200/165"
node scripts/frontier-research/soldgraph/run.mjs --founder-triggered whatnot "Blastoise ex 200/165"
```

Do not run this block automatically. Two completed searches use at most two free requests; verify the account remains on Free and has no purchased extras before testing. A pending result may complete at the provider after this client exits and consume its one reserved request. It is inconclusive, not an empty result or permission to retry.

Success means a valid current provider response with at least one exact raw USD candidate that can subsequently be independently reviewed within permitted access boundaries. Provider-reported rows alone do not prove identity, condition, inventory, price accuracy, or production rights. Stop on auth, access restriction, throttling, schema error, deadline, or insufficient source evidence. No subscription or paid renewal is authorized by this experiment.

## Bounds and contract

`researchListings` requires `founderTriggered: true`, a key, one supported marketplace, and one query of at most 200 characters. Its fixed HTTPS API host receives one `GET /v1/{marketplace}/listings` with `page=1`, `count=3`, `country=us`, and `sort=best_match`. Redirects are errors. No marketplace is fetched directly.

A pending response may trigger exactly one validated same-host `/v1/jobs/{id}?wait=20` check after the advertised delay (at least two seconds). The documented long poll returns as soon as the job finishes; the overall 20-second deadline still includes the initial search, delay and response bodies. Delays over five seconds end the experiment as pending. There is no pagination, recursive polling, search retry, or switch to another transport. Each JSON body is limited to 1 MB. HTTP errors stop without exposing provider bodies. The [rate-limit contract](https://soldgraph.com/docs/api/rate-limits) permits 60 calls/minute per account, shared across keys; this client uses at most two calls and never retries a 429.

The [OpenAPI contract](https://soldgraph.com/openapi.json) uses schema version 2 and a 15-minute provider cache. The client validates the marketplace, US country, original query, first page, row count, USD amounts, canonical listing URLs, and collection time (up to 16 minutes old, including one minute of clock tolerance). It strips seller identifiers, image URLs, and unrelated fields. The timestamp is **the provider's collection claim**, not independent observation time.

| Source | Available documented facts | Material omissions and limits |
| --- | --- | --- |
| Mercari | Asking amount/currency, title/link, generic merchandise condition, collection time | No shipping or buyer fees. Generic Like New does not mean card NM. No exact card number, language, raw/graded proof, or independent availability verification. |
| Whatnot | US Buy It Now ask, title/link, quantity and seller-supplied condition, grade, set, number and language | No shipping or checkout charges. A variant range has a null amount and stays unknown. Seller attributes are unverified; no live auctions, sold search, or final transaction prices. |

Every projected field carries its listing URL, provider endpoint, collection time, acquisition method, supporting schema field and confidence. Output remains `provider-reported`, `identityChecked: false`, and `verifiedForRanking: false`. Missing costs stay null. Raw status and exact print remain unchecked; these rows are not eligibility-approved offers.

## Source review still required

[Soldgraph's terms](https://soldgraph.com/terms), dated September 30, 2026, permit use of API output in customers' products, but describe independent collection from public marketplace pages and disclaim affiliation. They place applicable third-party-terms responsibility on the customer. This is not evidence that Mercari or Whatnot authorized collection or redistribution.

The reviewed API, pricing and terms pages do not disclose a CAPTCHA, authentication, proxy-rotation or technical-block circumvention mechanism. That absence does not establish how collection works. Do not add such mechanisms to this client or treat provider access as permission to bypass a marketplace restriction. No production promotion occurs until the separate acquisition-rights and evidence gates are satisfied.

## Hermetic verification

```text
node node_modules/vitest/vitest.mjs run scripts/frontier-research/soldgraph/client.test.mjs
```

All tests use injected fetchers and test-only keys. Importing the client performs no network or filesystem work.
