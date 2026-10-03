# Whatnot direct metadata research collector

This is our own collector and parser, isolated from production adapters, report caches, ranking and scheduled jobs. It requires an explicit founder research request for each live invocation. Importing it does not make requests.

```sh
node scripts/frontier-research/direct-metadata/whatnot-collect.mjs --founder-triggered "Giratina V 186/196"
```

The CLI prints a minimal JSON research record to stdout. It never persists raw HTML, cookies, account information or seller identities. Keep any saved result in a separate frontier-research artifact directory. The exported `collectWhatnotResearch(query, options)` accepts an injected fetcher for offline tests.

The collector checks fresh robots rules using the transparent `TCGlensFrontierResearch/1.0` user agent. It allows one public search, at most five link summaries and three same-host listing detail requests, each limited to eight seconds including body reading. HTML is capped at 1 MiB and robots at 128 KiB. Authentication, technical challenges, HTTP 403/429, redirects, missing robots evidence and unsupported crawl-delay requirements stop retrieval. There are no alternate hosts, retries, cookies, browser sessions, proxies, internal GraphQL calls or paid services.

The parser reads public anchors and Product/Offer JSON-LD only. It does not execute scripts or inspect hidden app state. An offer must match the current canonical listing URL and page title when present. Duplicate offers, unsupported currency, fractional-cent amounts and unrelated recommendation products cannot produce a price. Exact USD prices retain decimal strings and integer cents. Every field includes its URL, observation time, acquisition method, evidence description and confidence. Availability remains a claim; shipping, buyer fees, exact print, language and card condition remain unverified. No result is a production candidate or winner.

## Observed live result

On **2026-10-03 at 13:06:13.598 UTC**, the founder-triggered Giratina experiment requested only `https://www.whatnot.com/robots.txt`. Whatnot returned **HTTP 403** in **83 ms**. The collector recorded `robots-unavailable` with `robotsStatus.failure = http-403` and stopped. It made **zero search requests, zero detail requests and zero paid-provider calls**. No usable live Whatnot inventory was acquired. No further live request followed that block.

This fixture-tested implementation is a concrete prototype, not evidence that Whatnot has authorized access or that the current hosting environment can reach its public inventory. A live source still requires permitted access, repeatable acquisition and the separate production promotion review.

## Offline verification

```sh
npx vitest run scripts/frontier-research/direct-metadata/whatnot-metadata.test.mjs scripts/frontier-research/direct-metadata/whatnot-collect.test.mjs
```

All fixtures are synthetic. Tests require no credentials or external network.
