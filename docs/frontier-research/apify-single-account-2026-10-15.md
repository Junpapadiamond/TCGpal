# Single-account Apify verification — October 15, 2026

Status: **one authorized account authenticated; one Whatnot test succeeded; its token is saved as a Vercel Production Secret. Production provider activation is pending a fresh read of the original shared counter.** This is acquisition evidence, not a complete-cost recommendation or a source-rights finding.

## Decision and boundary

The founder requested usable marketplace fields, authorized using the supplied Apify credentials and credit, and then selected a single account, allowing Codex to choose and sign in. Only the first selected account was used. Account cycling, a credential pool, quota resets and automatic provider fallback were not implemented. Browser login is unnecessary for API calls: the documented bearer token authenticated successfully. Optional token rotation was canceled; no password or provider token was changed.

The strongest case for this approach is a working, already integrated Actor with more listing evidence than the exhausted alternative. Two material objections remain: credit does not establish field completeness or collection rights, and one successful query does not establish repeatable coverage. Production also has an independent application allowance, which a new credential must not reset.

Decision: use a fixed account and the existing bounded Whatnot adapter. The smallest test was one three-row run, pinned build, no agent retry, capped at $0.03. Success required matching account authentication, an affordable current tariff, returned records and preserved unknown charges. Authentication/access failures, an over-cap tariff or missing budget evidence stop further activation. Codex owns implementation and verification; the founder owns provider/source authorization. Review date: October 15, 2026. No scheduled work was created.

After a fresh counter read, the proposed rollout is at most 20 additional Whatnot starts ($0.60 maximum), using the original counter plus an explicit cumulative ceiling and expiry, within the authorized account credit. This rollout has **not** been configured or started. Mercari's failed access path has not been retried or expanded.

## Observed API result

- Account API authentication succeeded and matched the single browser-selected account. Free plan was enabled, with $5 monthly credit and a $5 maximum monthly usage limit. No paid plan or top-up was added.
- Current public tariff preflight estimated $0.00905 for three Whatnot rows at 256 MB, below the $0.03 cap.
- Actor: `epicscrapers~whatnot-scraper`; pinned build `0.2.30`; query `Giratina V 186/196`; maximum three records; 25-second Actor timeout; no proxy or cookies; no agent retry.
- Run `EkAA6VnXCtVOKaF6C` succeeded from `2026-10-15T04:02:12.865Z` to `2026-10-15T04:02:19.738Z`. It returned three records; two passed the existing normalization filters. This does not mean two ranking-eligible listings.
- The normalized observations had USD asking prices, listing images, seller feedback counts and seller-stated condition. All three raw records lacked shipping and buyer-fee fields. Both normalized observations kept those charges null; neither was cost-comparable. Availability is provider-reported and was not independently confirmed.
- The immediate invoice was unsettled. A read-only check at `2026-10-15T04:07:24.692Z` reported **$0.00905** for the run (one startup event, three item events); account monthly usage was approximately $0.0090544 including API/storage traffic.

No email addresses, credentials, seller identifiers or raw page captures are committed. Local ignored evidence lives in `output/frontier-research/direct-metadata/2026-10-15-whatnot-single-account-result.json` and `2026-10-15-whatnot-settlement.json`. The harness includes an exclusive one-start marker; do not remove it to repeat the paid test. The temporary token file was removed immediately after loading it.

## Application configuration and remaining gate

`WHATNOT_APIFY_TOKEN` was updated as a write-only **Production Secret** on the `tcgpal` project and verified through both the dashboard success state and connector metadata. Saving the Secret does not switch the active provider or update an existing deployment. `WHATNOT_LISTING_PROVIDER`, the renewal ceiling/expiry and Mercari activation were not changed; the original Redis counter was not touched.

Vercel's Redis Browser requires passkey reauthentication before reading the original key. The authenticated environment-variable connector returned metadata without secret values, so it could not provide the alternative read-only Redis connection. Device authentication is pending; no reset, guessed counter value or alternate key was used. The last documented count of 180 is historical, not a current reading.

Resume by completing Vercel's passkey prompt, reading the original counter, setting the bounded cumulative Whatnot allowance and expiry, explicitly selecting Apify, then deploying and verifying an actual website comparison. Do not mark the website restored from the standalone Actor result. Preserve null charges and exact-print gates, and capture English/Chinese desktop plus mobile evidence of the resulting display.

## Verification

On application commit `25ca644b98e52ebaed4a879625d1bf34947dd57d`: lint, typecheck, metadata audit, 1,830 tests (129 files; five tests/files skipped), and the production webpack build passed. No application code, UI or ranking behavior changed in this work. Documentation changes require only their own diff/path checks. The prior live deployment matched that commit; no new-source website verification is claimed.

Official API references: [authentication](https://docs.apify.com/api/v2/getting-started), [API integration](https://docs.apify.com/integrations/api). Historical source boundaries and the original counter are documented in [the pilot record](../cross-market-pilot.md) and [the October 11 recovery](free-recovery-2026-10-11.md).
