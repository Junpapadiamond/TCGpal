# Crawlora Mercari evaluation harness

Research only. This client is not a production provider and is not imported by the app. It makes one documented first-page request per explicitly founder-triggered invocation, with a 20-second total deadline, a 1 MB streaming body limit and no retry, pagination, marketplace fetch or transport fallback. It retains at most three minimal observations and no seller identifiers or raw response captures.

`queryMercariResearch({ founderTriggered: true, apiKey, query }, { fetcher })` supports an injected fetcher for hermetic tests. Supply a real key through an approved server-only secret mechanism; never paste it into a command line, commit it, or print input/raw errors. Importing the module never makes requests. There is intentionally no default live CLI or automatic batch runner.

The documented integer `price_cents` is preserved without assuming its currency. Neither activity nor upstream acquisition time is documented, so neither is inferred. `condition_code` is explicitly best-effort in the provider documentation and cannot establish Near Mint. The response receipt time is labeled as such. Every observed field retains its provider endpoint, listing URL, observation time, source field and confidence. These records cannot enter ranking or production caches.

Run offline verification:

```sh
node node_modules/vitest/vitest.mjs run scripts/frontier-research/crawlora/client.test.mjs
```

The fixtures are synthetic. No live test has been performed. See [the decision and approval boundary](../../../docs/frontier-research/free-recovery-2026-10-11.md).
