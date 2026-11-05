# Fanatics Collect: prepared two-search test

This is a founder-triggered `frontier-research` evaluation, not production inventory. The founder explicitly approved the separate $0.24 test below, and both starts are complete. The existing Whatnot/Mercari allowance was not used or changed.

Selected candidate: [Jungle Synthesizer Fanatics Collect](https://apify.com/jungle_synthesizer/fanaticscollect-weekly-auction-scraper), rated 5.0 from one review, 90 users when checked November 5 UTC. Pin build **0.1.38**. The strongest fit is explicit fixed-price, live and ungraded filters. Two objections are its automatic keyword broadening and unestablished marketplace/output permission. Ratings are not evidence of precision or rights.

## Concrete request

Two sequential starts, **$0.12 maximum per start / $0.24 cumulative**, paid from existing authorized credits, no top-up or subscription. First query: `Nami OP01-016 Romance Dawn English`. Second query: `Umbreon VMAX 215/203 English`. Run the second only if the first completes without access, accounting or transport errors. Empty or wrong-card output is evidence, not a reason for an automatic retry.

Fixed endpoint: `POST https://api.apify.com/v2/acts/jungle_synthesizer~fanaticscollect-weekly-auction-scraper/run-sync-get-dataset-items`.

Fixed query parameters: `build=0.1.38&memory=512&timeout=60&maxItems=3&maxTotalChargeUsd=0.12&restartOnError=false&clean=true`.

First input (the second changes only keyword and subcategory):

```json
{
  "mode": "fixed_price",
  "status": "Live",
  "marketplace": "buynow",
  "categories": ["Trading Card Games"],
  "subcategories": ["One Piece"],
  "graders": ["Ungraded"],
  "keyword": "Nami OP01-016 Romance Dawn English",
  "maxItems": 3
}
```

Second subcategory: `Pokemon`. No cursor, pagination, sold query, alternate provider or broader follow-up query. Bound the complete HTTP exchange including body parsing to 65 seconds / 1 MB. Store only sanitized experimental facts under ignored `output/frontier-research/fanatics-collect/`. Never copy observations into product caches.

## Accounting and evidence

Public Actor metadata selected by **effective date**, checked November 5: current startup $0.10, live row $0.002, premium row $0.004; worst case three premium rows totals $0.112. A future November 16 tariff is not current pricing. Recheck immediately before starting; unknown events or a tariff above the cap stop execution. Check the official account allowance before reserving each start. Use the existing authorized pool rules: advance only for insufficient allowance, never access/auth/rate/ambiguous failures. Keep a separate permanent two-start experiment reservation; do not change or reset application pilot counters. Retain uncertain charges.

Keep exact original query and any `matched_keyword` broadening. Independently check name, number, language, print, raw state, active status, fixed-price semantics and original USD. Never reinterpret an auction bid as a buy-now price. Unknown shipping, buyer fees, condition or availability stay unknown. Open at most one strongest returned public card page per query for manual comparison, subject to normal access controls; do not bypass a block.

Success: two completed bounded searches with useful exact raw-single output and supported asking-price semantics; then perform the separate source-rights/policy/privacy review before considering a production adapter. Kill: restrictions, schema ambiguity, hidden keyword substitution, no exact raw-single supply, unbounded cost, or unusable fixed-price semantics. Zero useful rows is a valid negative result. Owner: Codex; review immediately after the two tests. No recurring job.

## Observed result

The approved experiment ran through the already signed-in Apify Console rather than extracting a production Sensitive credential. Both runs used the verified build, 512 MB memory, 60-second timeout, maximum $0.12 charge and three-result input. Console usage was $0.33/$5 before the first start and $0.44/$5 before the second; there was no need to change accounts. Two immutable local reservation records retain the whole $0.24 authorization even though displayed charges were lower. No application allowance or account ledger was reset, and no token was printed or moved into the product. API-side HTTP/body bounds in the prepared recipe were not exercised by these Console runs; both returned zero records.

| Query | Run | Result | Console-reported charge / duration |
| --- | --- | --- | --- |
| Nami OP01-016 Romance Dawn English | `nTUB1COHieSDUaeja` | SUCCEEDED, zero records | $0.100 / 10 seconds |
| Umbreon VMAX 215/203 English | `wqqIwyahsNltLnIGz` | SUCCEEDED, zero records | $0.100 / 6 seconds |

Both logs reported that exact and internally relaxed queries found nothing with the live/ungraded/fixed-price filters. The active crawler reported `JsonApiCrawler`; service bootstrap also listed other unused transport modules, which is not proof those transports ran. No error-triggered retry, broader follow-up search, cursor or provider/account fallback was attempted. The request to share all past/future runs with the developer was dismissed. Total displayed Actor charges: **$0.20**, within $0.24 authorized. Both test slots are consumed; the unused cap is not permission for a third run.

This candidate fails the useful raw-single supply test. Do not wire it as a verified automatic Fanatics source on this evidence. It may have graded supply, but graded comparison is outside the current product. The ignored screenshots and sanitized result/reservation files are under `output/frontier-research/fanatics-collect/`.
