# Cross-market acquisition latency: November 2, 2026

## Diagnosis from existing production jobs

Read-only Vercel request logs and the existing Apify Console runs were inspected on November 2 Eastern (November 3 UTC). No new Actor was started for diagnosis.

| Observation | Measured time | Meaning |
| --- | --- | --- |
| Law cross-market API request | 56,748 ms | Returned eBay 39, Whatnot 3, Mercari 3 and merchant 4 candidates |
| Recent Whatnot jobs | 1–6 seconds | Already fast relative to Mercari; sources already run in parallel |
| Recent successful Mercari jobs | 18, 26, 33, 41, 45 and 56 seconds | Provider execution dominates successful comparisons |
| Mercari failures | 35 seconds with zero rows; multiple 90-second timeouts | Reliability is also a provider acquisition problem |

The Law request ran from `2026-11-03T00:25:50.663Z` to `00:26:47.398Z`. The Mercari job began at `00:25:51` and completed at `00:26:47`, accounting for nearly the entire request. Request reference: `84152121-83f7-4cf6-9fdb-0dae580559f0`; [existing provider run](https://console.apify.com/actors/gmvBZggymwn3svUtH/runs/8W9FJjhF1cfIDgQ8c).

The provider log shows container startup, two HTTP 403 retries, then first-page fallback and scrolling. Approximate phases: two seconds startup, 29 seconds navigation/retries, 20 seconds fallback waiting/scrolling, two seconds shutdown, with small gaps between phases. This is upstream browser acquisition, not evidence of app CPU saturation. No access-control bypass or modified proxy/retry behavior was attempted.

The gap between the earlier eBay report and the cross request included user interaction time. It must not be reported as 30 seconds of server overhead. The search-form cross flow still obtains the primary report before making its single cross request, to avoid duplicate eBay acquisition and paid retries after primary transport failure. That adds the primary request duration; it does not explain the measured 56-second cross API request itself.

## Implemented reduction in actual server waiting

Previously every marketplace waited for catalog crosswalk resolution, although only eBay uses the resolved ePID. Whatnot, Mercari and the merchant now start from the same confirmed-card query while mapping runs. eBay still waits for its native search plan, and final ranking still waits for the market anchor. A cold mapping delay therefore overlaps acquisition instead of being added before it. This is an actual scheduling change, separate from the earlier early-eBay presentation change. Its production speedup is not yet quantified; warm mapping may make it small.

Operational logs now separate catalog mapping, provider-cache lookup, pricing preflight, account allowance, pilot reservation, Actor HTTP wait and response decoding. They contain only fixed stage labels, status and durations, without search text, credentials, seller data or raw provider errors. Pricing and allowance checks remain ordered before each capped paid start. Provider versions, queries, result limits, timeouts, access boundaries, freshness and ranking gates are unchanged.

## Remaining provider boundary

The [documented Mercari inputs](https://apify.com/getascraper/mercari-us-scraper) expose no first-page-only fast mode or control over the observed internal waits. Public metadata advertises build 0.3.4, whereas the approved runtime is pinned to 0.3.3; neither the [changelog](https://apify.com/getascraper/mercari-us-scraper/changelog) nor existing observations establishes a latency improvement. No speculative upgrade was made. [Apify's synchronous endpoint](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post) waits for execution; changing only our timeout would discard slow results rather than speed acquisition.

Console history shows one Console run and nine API runs since the October 19 approval, consistent with all nine approved application starts having been used. The durable Redis ledger was not read in this diagnostic, so this is not an independently verified remaining-balance claim. The original counters and ceilings remain authoritative and unchanged. A new test cannot assume additional Mercari allowance.

The largest remaining improvement needs a provider-supported fast acquisition path or a separately reviewed source. A useful provider experiment would return three first-page rows without the observed post-fallback scroll wait, retain all required field provenance, and demonstrate success below 15 seconds on the same small cohort. It requires available approved allowance and a concrete provider capability; changing servers, reducing timeouts or blindly trying a newer build is not that experiment. No provider message or issue was sent.

## Decision and verification

The founder's instinct is correct: completed cross-market acquisition should become faster, not only appear faster. The strongest case for the scheduling change is an unnecessary dependency with an exact equivalent query. Two serious objections are starting with an unresolved card and introducing duplicate paid work. Confirmed identity remains a prerequisite; only the existing explicitly opted-in fan-out starts, once. eBay retains its resolved plan, and all original reservations and complete-cost gates remain in place.

Decision: release the bounded scheduling repair and stage timings; do not claim the dominant Mercari delay is fixed. Owner: repository maintainer/Codex. Review: November 2 release checks and the next founder search session. Smallest falsifiable test: hold catalog mapping unresolved, require Whatnot acquisition to start exactly once, then release mapping and require eBay to use its resolved query. Success: same outputs and query/cost boundaries, with overlapping acquisition. Kill criteria: identity changes, duplicate starts, weakened budget gates, stale evidence or hidden source failures.

TDD reproduced the dependency and absent timing telemetry before implementation. Regression coverage also checks separate preflight/Actor durations on HTTP failure, no raw query/credential/error logging, and no retry. Release checks and deployed evidence follow below.

Full gate: lint, typecheck, metadata audit and webpack production build passed; 1,968 tests passed and five optional live tests skipped. An initial run alongside lint/typecheck exceeded two existing UI tests' five-second deadlines; the unchanged tests and full suite passed with four workers. Local development uses webpack because Turbopack rejects this isolated worktree's external node_modules junction.

Graphify is unavailable on this Windows host, including the documented macOS executable path; source navigation was used and no graph regeneration is claimed. Changes are isolated from the original dirty checkout.

## Deployed evidence

Runtime `1284f55` fast-forwarded to main and pushed; Vercel `dpl_GeJv2dAVeEHsQoTbqGuXq4KJCuVh` reached READY and is aliased to `lenstcg.com`.

One bounded production Pikachu 58/102 cross check completed in **4,399 ms** at `2026-11-03T01:25:20Z`, request `1f530340-ad8e-42ed-ac70-46f43543a8ba`. This is not a before/after successful-Mercari benchmark: Mercari stopped at the existing pilot allowance gate in 146 ms and no Mercari Actor was started. The page retained its unavailable state. Whatnot returned three raw candidates in 4,264 ms (4,113 ms Actor wait; 19 ms cache, 57 ms pricing, 59 ms account allowance, 5 ms pilot reservation, 3 ms decode); all three were excluded from the matching-offer display by the existing gates. Merchant returned seven candidates in 723 ms; eBay reused 50 candidates in 20 ms. One Whatnot start used the existing capped authorization, with no automatic retry or allowance increase.

Catalog mapping took 504 ms in the primary request and only 2 ms in the subsequent warm cross request. The new overlap is therefore meaningful for cold mapping dependencies, but cannot explain a large speedup in this warm check. The dominant historical Mercari delay remains unresolved.

Built-in browser captures verified English and Chinese desktop plus 390 px Chinese mobile, without horizontal overflow; source unavailability and unknown charges remain visible. Local captures are in `output/qa/cross-market-latency-2026-11-02/live-cross-{en,zh,mobile-zh}.png` and are not committed. The local fixture harness also exercised Pikachu cross results and Luffy exact-version confirmation; its proxy caused a navigation reload later, so it is not evidence of a completed five-search session.

The deployed built-in browser completed five sequential searches in one session: Pikachu 58/102 (the sole cross acquisition) → Edit Luffy OP01-024/base → New Charizard 4/102 → Edit Zoro OP01-001/base → New Umbreon VMAX 215/203. Later searches were eBay-only, both One Piece choices retained their selected artwork, and browser warning/error logs were empty. Development servers were stopped after verification.
