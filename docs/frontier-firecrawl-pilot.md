# Firecrawl Frontier Pilot — 2026-07-31

## Decision

Keep Firecrawl out of production and stop the planned 30-page run at the six-platform tracer stage. The tracer crossed the predeclared kill criteria for factual error and latency, so spending more credits would not change the decision boundary.

This is a result for Firecrawl `/scrape` JSON mode through the configured MCP on 2026-07-31. It is not a claim that Firecrawl can never work, or that other endpoints/configurations have the same behavior.

## Boundary

- Label: `frontier-research`
- Platforms: Mercari US, Whatnot, Yahoo Auctions JP, Mercari JP, SNKRDUNK, and Card Rush
- Endpoint: `/scrape` with schema-shaped JSON only
- Controls: basic proxy, `storeInCache:false`, `redactPII:true`, no actions, no login, no `/crawl`, no `/agent`, no stealth or enhanced proxy
- Ground truth: direct page review where the page was independently readable; Whatnot remained unlabeled because the independent reader rejected the encoded URL
- Production integration: none. No route, cache, analytics event, `PlatformAgent`, listing normalization, or ranking path imports this harness.

## Result

| Gate | Target | Observed | Result |
|---|---:|---:|---|
| Reviewable page content | ≥80% | 3/6 (50%) | Fail |
| Raw factual precision | ≥95% | 9/16 (56.25%) | Fail |
| Known sibling substitutions | 0 | 0 | Pass by abstention |
| Cost-comparable candidates | ≥60% | 0/6 | Fail |
| Median latency | ≤8 seconds | 14.768 seconds | Fail |
| Allocated experiment cost | ≤US$1 | 72 credits ≈ US$0.23 | Pass |

The cost estimate uses the public Hobby allocation of US$16 per 5,000 credits. It includes 18 search credits and 54 scrape credits. Actual marginal cost depends on the account plan. Firecrawl's current pricing page says advanced formats cost extra, while its 2026 scrape guide describes JSON as the base credit plus a four-credit surcharge. The MCP reported nine credits for every successful or region-blocked JSON scrape in this run. See [Firecrawl pricing](https://www.firecrawl.dev/pricing) and the [scrape guide](https://www.firecrawl.dev/blog/mastering-firecrawl-scrape-endpoint).

## Failure evidence

| Platform | Firecrawl outcome | Independent page evidence | Harness state |
|---|---|---|---|
| Mercari US | Correct title, US$4, US$0.74 shipping, sold | Page shows the same facts | `page-observed` |
| Whatnot | Core listing fields extracted; shipping and tax fabricated as zero | Independent page reader unavailable | `page-observed`; fabricated zeroes discarded |
| Yahoo Auctions JP | Returned `Example Product Title`, `12345`, US$19.99, and `in stock` | Actual page is a closed Nami OP01-016 auction at ¥39,000 | `link-only`; placeholder payload discarded |
| Mercari JP | JP egress tunnel failed; US egress returned a region restriction | Actual page is a sold Nami OP01-016 listing at ¥9,000, shipping included | `link-only` |
| SNKRDUNK | Returned the same example/US$19.99 placeholder family | Actual page is a Nami comic-parallel product with JPY offers | `link-only`; placeholder payload discarded |
| Card Rush | Correct title, ¥39,800, and 11 in stock; invented `N/A` and generic seller fields | Page confirms title, price, and stock, but not those invented fields | `page-observed`; sentinels/boilerplate discarded |

The independent review pages are the exact source URLs recorded in the manifest. Search snippets were used only to discover candidates, never as proof of listing facts.

## Deterministic safeguards added

`src/lib/frontier-research/firecrawl-harness.ts` now:

- validates manifests and observations with Zod;
- requires field-level URL, timestamp, acquisition method, evidence, and confidence;
- feeds identity text into the existing deterministic print-fidelity assessor;
- refuses cost comparability unless identity is high-confidence, availability is `available`, and item price, shipping, and currency are all known;
- converts model-defaulted shipping/tax zeroes back to unknown;
- discards schema-shaped `Example …` placeholder payloads;
- normalizes `N/A` and generic seller boilerplate back to unknown;
- scores raw extractor precision separately from post-critic evidence coverage;
- reports access failures, credits, allocated cost, latency, and every gate.

## Reproduce the report

```bash
npm run frontier:firecrawl:evaluate -- \
  output/frontier-research/firecrawl/2026-07-31-pilot/manifest.json \
  output/frontier-research/firecrawl/2026-07-31-pilot/observations.json \
  output/frontier-research/firecrawl/2026-07-31-pilot/report.json
```

The committed artifacts contain only sanitized structured fields and concise evidence. They exclude raw HTML, screenshots, seller identifiers, session material, credentials, and page captures.

## Revisit condition

Do not expand this JSON-mode test until at least one of these changes is available:

1. Firecrawl fixes or explains the schema-shaped placeholder responses and JP tunnel failures.
2. The MCP exposes a deterministic JSON extractor that can be evaluated without the current model-shaped failure mode.
3. A markdown-first observation test with local deterministic extraction beats this pilot on the same six URLs without using enhanced/stealth access.

Any retest starts with these same six fixtures. It expands to 30 only after all tracer gates pass.
