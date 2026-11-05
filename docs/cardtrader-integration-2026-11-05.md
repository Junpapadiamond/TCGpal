# CardTrader official adapter

Technical access works. The account registered with the founder's approved Google identity has authenticated access to official games, expansions, categories, blueprints and marketplace offers. The market-data application was submitted successfully; staff approval for public TCGlens output remains pending. These are different gates.

## Implemented path

`listing-compare` passes its existing exact TCGplayer crosswalk to the CardTrader `PlatformAgent`. Other marketplaces continue independently. `src/lib/external/cardtrader.ts` replaces the permanent placeholder and:

- Uses only `https://api.cardtrader.com/api/v2` GET requests with server-side bearer authentication and redirects rejected.
- Finds a matching expansion and at most three known One Piece promotional catalog families, then requires one TCGplayer product association with agreeing game, single-card category, name and collector number. A missing mapping is a visible source failure; a cheaper sibling is never a fallback.
- Accepts both documented arrays and the observed `{ "array": [...] }` catalog envelope, numeric or string TCGplayer IDs, and seller rows grouped by blueprint ID.
- Reads one offers response, retains at most 12 English raw USD quotes from U.S. sellers, and excludes graded, altered, signed, vacation, zero-stock, bundle, language/number/print conflicts, reverse-holo and first-edition rows outside this initial support boundary.
- Keeps catalog print terminology in structured evidence. CardTrader's official Nami “Foil Reprint” label is not a seller replica claim; seller-described replicas/lots still fail the normal product exclusions.
- Leaves shipping and buyer fees null. No CardTrader offer can win a complete-cost lens. The price is explicitly the account's USD quote; native seller currency, delivery and checkout charges are not inferred. Catalog pictures are not item-condition evidence, and seller history is unverified.
- Links to the selected blueprint's seller table. `/en/cards/244494` was opened in the browser and resolved to the expected Nami OP01-016 page. This is not a fabricated seller-specific deep link.

All three server settings are required: `CARDTRADER_ENABLED=1`, `CARDTRADER_MARKET_DATA_APPROVED=1`, `CARDTRADER_API_TOKEN`. The approval flag stays off until the submitted application is approved. Do not interpret registration or HTTP 200 as approval to publish a market-data service. See [official API](https://www.cardtrader.com/en-US/docs/api/full/reference) and [terms, Web Services / Applications / APIs](https://static.cardtrader.com/en/pages/terms-of-service.html).

The market selector now receives configuration-derived pending names from the server. Activation no longer requires editing a hard-coded client list. Credentials never cross into Client Components.

## Bounds and verification

Maximum six official requests on a cold search: expansions, up to four blueprint exports, one offers call. A 12-second adapter deadline covers fetch and body reading; 4 MB response bound; no retries, credential switching, carts, orders, shipping/cart simulation or mutations. Catalog cache is six hours; account-scoped sanitized offer cache is two minutes and retains observation time. Shared production request limits fail closed without Redis: 30 requests per ten seconds plus four offers calls per second.

Authenticated November 5 observations:

| Card | Exact catalog mapping | Official response | Adapter replay |
| --- | --- | --- | --- |
| Nami OP01-016, Romance Dawn | TCGplayer 454534 → blueprint 244494 | 27 offers returned, including U.S. sellers | Six U.S. English raw quotes survive; shipping/fees remain unknown |
| Umbreon VMAX 215/203, Evolving Skies | TCGplayer 246723 → blueprint 166453 | Nine offers returned, including U.S. sellers | Four U.S. English raw quotes survive; shipping/fees remain unknown |

These are private source-evaluation observations, not deployed public inventory or promises of current stock. The ignored API captures are under `output/accuracy-eval/one-piece-search/`; no credentials or raw seller records are committed. Additional catalog inspection covered Premium Bandai products. The downloaded authenticated Postman file contains a credential and must not be committed or printed.

35 adapter regressions cover activation, exact joins, conflicting fields, ordinary stock quantity vs bundles, condition preservation, null costs, official reprint terminology, auth/access/rate failures, response size, stalled body deadline, cancellation and cache reuse. Registry tests cover activation and independent fan-out; the selector test covers configuration-derived status.

Release verification: 2,187 tests passed / five optional live tests skipped; lint, typecheck, catalog audit and webpack build pass after correcting a test-only Testing Library option. Final deployed state and visual evidence belong in PROGRESS.md.

## Decision

The official API is the viable implementation. Its structured identifiers and seller properties are stronger than a scraper's free-text match. Two remaining limitations are public output permission and lack of comparable checkout charges. Keep the adapter wired but gated, and enable only after staff approval plus a fresh bounded repeatability check. Success requires both games' mappings and usable U.S. offers; stop on access denial, conflicts, unknown accounting or schema drift. Owner: Codex; review upon the staff response (no scheduled acquisition).

Local browser QA used a private recorded-response proxy, not a production receipt or fresh source acquisition. English, 中文 and 390px views verified null charges, no seller photos, the USD account-quote label, source offer/seller details and the View offers link. A mobile text-wrap issue was corrected. Screenshots remain in ignored `output/accuracy-eval/one-piece-search/cardtrader-replay-{en,zh,mobile}.jpg`. The bearer is stored as a Vercel production Secret, verified by metadata without reading its value. Both production activation flags are explicitly 0. Ignored `.env.cardtrader.local` also retains disabled local configuration. A fresh connected-email search found no CardTrader response at release time.

## Deployed verification

Product commit `43e16ae` is READY as `dpl_4XWRPXM8YviKnusQgr9owSqzEWCH`; lenstcg.com is an observed alias. Production capabilities returns HTTP 200 and omits CardTrader while its gates are off. The real Chopper receipt restored its three eligible offers. The deployed All-first selector shows CardTrader pending, preserves a CardTrader-only selection across English/中文 changes, and leaves acquisition behind the search button. Production screenshots are `cardtrader-release-live-chopper.jpg` and `cardtrader-release-markets-{en,zh}.jpg` under the ignored evidence directory. The new CardTrader offer rendering was verified only against the private recorded source responses described above.
