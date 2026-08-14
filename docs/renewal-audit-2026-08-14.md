# Renewal audit — everything that is supposed to renew itself (2026-08-14)

Question asked: *is the auto-renew working well?* There are four independent renewing
things in this system. Two were fine, one was broken in a way that produced a visible
wrong answer during the One Piece accuracy run, and one does not renew at all by design
and is now measurably behind.

Verified against the code and, where noted, against live providers from a local dev
server with production credentials.

---

## 1. eBay application token — was renewing, but only for the happy path

`src/lib/external/ebay.ts`. Client-credentials token cached in module memory until 60
seconds before eBay's stated expiry (default 7200s).

**What was right:** the timer itself. The 60-second margin is sound — it is longer than
any single request's 9-second budget, so a token cannot expire mid-flight; and
`Math.max(ttl - margin, 0)` cannot produce a negative expiry.

**Two failures found, both fixed:**

| Failure | Effect before the fix |
|---|---|
| A rejected token was never retried | The cache assumes the token stays valid until its stated expiry. It does not always: a credential rotation, scope change, or revoked application key invalidates it early. eBay then answers `401`, the code threw, and **every** eBay call from that server instance failed the same way until the cached TTL ran out — up to the full two hours. Nothing in the process could recover on its own. |
| Concurrent requests stampeded the token endpoint | `getEbayToken` had no in-flight dedupe. Three simultaneous comparisons on a cold instance made three token requests; a traffic burst made one per request. The token endpoint is rate limited, so the moment that most needs a token was the moment most likely to be refused one. |

Both now have regression tests in `ebay.test.ts` ("eBay application token renewal"). A
`401` drops that specific cached token and retries once with a fresh one — and only if
the token actually changed, so a concurrent refresh cannot start a retry loop. All
authenticated calls (search, item lookup, item detail, catalog product search) share the
one `fetchEbayAuthed` path, so none of them can regress independently.

## 2. TCGCSV market anchor — renewing correctly

`src/lib/external/tcgcsv.ts` fetches through Next.js ISR: 30 minutes for the
`last-updated` stamp, 24 hours for groups, products, and prices. That matches TCGCSV's
own daily dump cadence, and `TCGCSV_STALE_AFTER_MS` (48 h) labels the anchor stale rather
than hiding it when a day is missed. No action.

## 3. Comparison report cache — was freezing failures, now fixed

`src/lib/comparison/report-cache.ts`. 15-minute TTL on completed pure card searches.

The TTL worked. The guard on *what* to cache did not match its own comment ("failed runs
should re-attempt the live sources on the next request"): it only excluded demo and
needs-confirmation reports. **A report where the live eBay search failed was cached like
any other.**

Observed live, not hypothesised: during the 2026-08-14 baseline, one eBay search for
Shanks OP09-001 timed out at 10 s. The empty "no live rows" report it produced was
written to the cache, and for the next fifteen minutes that card returned zero listings.
A cold re-run of the same query returned 50. One transient provider blip became a quarter
hour of wrong answers for everyone searching that card.

Fixed: a report is no longer cached when any *configured* platform reports `fallback`.
A source that answered honestly with nothing still caches (that is a real result), and an
unconfigured adapter never tried, so neither forces a re-run.

## 4. Bundled One Piece catalog — does not renew, and is behind

By design: Pokémon English rides a live API, One Piece rides a committed snapshot
(`one-piece-catalog.generated.json`) rebuilt by hand. `npm run catalog:freshness` exists
precisely to measure the drift, and today it reports:

> Summary: 9 covered, 6 partial, 0 missing, 3 unreleased, 10 unreachable.
> **Identity is behind the market anchor.**

The concrete gap is starter decks **ST-32 through ST-36** (released 2026-07-31), each
resolving only 4–6 of its 9–11 numbers — the leaders are missing. A buyer searching one of
those cards gets an unavailable result while the market anchor already knows the price.

This is not a bug in a renewal mechanism; it is the absence of one. It needs either a
scheduled catalog rebuild or an owner who runs `npm run metadata:refresh` on each set
release. Worth noting that the accuracy work in this session leans on catalog completeness
in a new way — the stated-stat gate reads `card_cost` and `card_power` from this file, so a
missing print means a missing gate, not just a missing search result.

---

## Summary

| Renews | Mechanism | Verdict |
|---|---|---|
| eBay OAuth token | module memory, 60 s early | **Was fragile — fixed.** No 401 recovery, no concurrency dedupe. |
| TCGCSV anchor | Next ISR 30 min / 24 h | Healthy. |
| Report cache | 15 min TTL | **Was wrong — fixed.** Cached provider failures. |
| Receipt snapshots | 30-day TTL via Redis `EX` | Healthy; TTL is set on write and enforced by Redis. |
| One Piece catalog | none, by design | **Behind.** ST-32…ST-36 partial since 2026-07-31. Needs an owner or a schedule. |
