# Soldgraph acquisition evaluation — October 3, 2026

**Free acquisition evaluation passed for a bounded asking-price display; deployment verification is pending.** The founder completed the Free signup and explicitly approved creating a TCGlens key, testing both marketplaces and storing it as a Production-only Vercel server secret. Five completed test requests consumed five free credits. No paid plan, payment card, automatic overage or Apify extension was enabled.

## Decision and falsifiable test

The founder's underlying goal is automatic, useful Whatnot and Mercari offers. Building a collector gives control of cost and code. Two serious objections are hosted access restrictions and the lack of evidence that a transport may be used publicly. The self-built Whatnot robots request stopped on HTTP 403; Mercari yielded an ordinary local browser observation but the fresh hosted preview produced no rows. Neither method has passed promotion.

Soldgraph documents one intended customer API covering both marketplaces, explicit USD asks, collection timestamps, and a free allowance. The strongest case is that it can replace two failed acquisition paths with one bounded integration. The objections are limited free capacity and incomplete listing evidence, plus uncertain underlying marketplace permissions. Actual responses now establish acquisition for two queries per marketplace, and two Mercari item prices agree with independent public-page observations. Broader recall, exact-art authenticity and production reliability remain unproven. API output permission does not establish marketplace endorsement.

Decision: activate a bounded provider-reported asking-price display after the full implementation gate. Blastoise produced useful offers on both sources; the second-game negative sample proved slabs/custom cards must be removed and does not establish One Piece coverage. This is a deliberate output-use, source-policy, privacy and operational review under the founder's free integration authorization. The remaining third-party-policy uncertainty limits the claim to provider-reported review material; it does not establish a marketplace license or independent availability verification. Owner: implementation agent; founder owns credentials and any spending decision. Review date: October 3, after the first deployed comparison, and again before increasing capacity or expanding source scope.

Success: both responses finish with current canonical active raw USD candidate facts; field claims and deterministic card checks are consistent; no credential, seller identifier or raw page capture is retained; unknown costs remain null. Then evaluate a second card/game and a repeat of the same query to measure coverage, exact-print filtering, provider cache behavior, latency and cost before activation. This is bounded evaluation, not exhaustive marketplace recall.

Kill criteria: access/auth restriction, CAPTCHA, rate limit, disclosed transport circumvention, wrong currency/URL/print entering display, stale observations, or persistent jobs past the deadline. An empty or fully rejected page is an honest no-match, not proof that the marketplace has no inventory. Stop expansion if useful coverage is inadequate or the policy review gains adverse evidence. No retry through another transport, new account, paid fallback or allowance reset.

## Primary contract and access review

Reviewed October 3 in the ordinary browser: [Whatnot listings](https://soldgraph.com/docs/api/whatnot-listings), [Mercari listings](https://soldgraph.com/docs/api/mercari-listings), [job contract](https://soldgraph.com/docs/api/overview#search-jobs), [usage](https://soldgraph.com/docs/api/usage), [rate limits](https://soldgraph.com/docs/api/rate-limits), [OpenAPI](https://soldgraph.com/openapi.json), and [terms](https://soldgraph.com/terms). The web-text connector could not retrieve these pages; browser-rendered documentation supplied the evidence.

- Whatnot endpoint returns active US/USD Buy It Now source rows. Auction/sold data is unsupported. Seller attributes include condition, grade, set, number and language. These are claims, not authenticity verification. Unequal variant price ranges have a null ask.
- Mercari exposes active asks and generic merchandise condition. Like New does not establish trading-card Near Mint.
- Neither endpoint supplies shipping or mandatory buyer fees. Do not substitute policy percentages, estimate free shipping, or rank these rows as complete-cost winners.
- Completed cached or empty searches consume one credit. Pending/failed jobs and polling consume none. Free allows 100 completed searches per rolling 30 days with no automatic overage; the account is shared across keys and marketplaces.
- September 30 terms allow customer-product use of output and prohibit key resale, plan-limit evasion and reverse engineering. They describe independent public-page collection, disclaim marketplace affiliation, and leave applicable third-party terms to customers. They are not a marketplace collection license.
- Reviewed public docs do not establish the provider's underlying collection mechanism. No authentication, CAPTCHA, proxy or anti-detection bypass is added to TCGlens. Marketplace restrictions remain material to the production review.

## Approved bounded application boundary

The default-off adapter is separate from the frontier client. `SOLDGRAPH_ENABLED=1` plus `SOLDGRAPH_API_KEY` selects it for both stable marketplace IDs, with explicit Soldgraph attribution. It uses only `https://api.soldgraph.com`: one GET search, page one, three rows, US, best match, no redirects or pagination. One validated same-job `wait=20` long poll may follow after Retry-After, returning immediately when complete. The overall 20-second deadline includes initial request, delay and body parsing; the 1 MB stream limit stops oversized acquisition. No transport messages or bodies enter error output.

A separate atomic Redis sorted-set allowance permits at most 80 initial application searches per rolling 30 days, leaving 20 for evaluation. It conservatively reserves failures as well as successes and never refunds ambiguous reservations. Missing storage fails closed. This does not reset or extend the old Apify counter. A shared allowance is not evidence of provider-account usage elsewhere; the provider's own free cap remains authoritative.

Only sanitized listing seeds are cached, no longer than the original collection timestamp plus 15 minutes. Credentials, seller names/profiles and search thumbnails are discarded. Conflicting card/language claims survive into deterministic gates. Raw/graded exclusions, null shipping/fees, unknown seller history and unverified condition photography remain explicit. Source failures isolate to their own platform and never become cached empty inventory. Report cache keys distinguish Soldgraph from Apify even though both use third-party source mode.

Evaluation evidence and source/policy/privacy review are recorded here; AGENTS.md now names this bounded boundary. The full application gate and end-to-end production observation remain required before calling the feature working. Credentials alone never establish success. The first key was rotated after an accidental browser snapshot exposure; its revocation and the replacement Production Secret update were visibly confirmed. Neither credential was written to a local file or committed artifact.

## Live results

The [minimal observations](soldgraph-observations-2026-10-03.json) retain listing facts and provider collection claims, with no seller identifiers, image URLs, credentials, cursors or raw page captures. They are research artifacts and are never runtime inventory fixtures.

| Query/source | Collection time UTC | Response evidence | Deterministic disposition |
|---|---|---|---|
| Blastoise ex 200/165 / Whatnot | 13:39:56.936773 | Three USD asks: $140/$135/$145; source claims NM and quantity 1 | Three review-only rows; no comparable-cost winner |
| Blastoise ex 200/165 / Mercari | 13:44:04.129652 | Three USD asks: $135/$138.89/$45; generic Like New | Three review-only rows; explicit title NM applies only to the $138.89 row; no comparable-cost winner |
| Monkey D Luffy OP05-119 / Mercari | 13:51:00.332837 | $10/$15.43/$10.61; two explicit custom cards | Both custom rows excluded, remaining title lacks sufficient exact-card evidence; no displayed matching offer |
| Monkey D Luffy OP05-119 / Whatnot | 13:51:37.899445 | $650/$100/$150; PSA/AGS/CGC slabs | All three excluded as graded; no displayed raw offer |
| Blastoise repeat / Whatnot | Original 13:39:56.936773 retained | Complete, cached=true, 241 ms, one additional credit | Same three asks; no fresh observation invented |

Mercari's $135 listing matched the independent 13:01 public-page observation; the $45 listing's title and asking price matched a separate public-page observation during evaluation. The latter page also showed free shipping and a $1.62 buyer fee, but these research-only facts are not injected into production. Its authenticity, condition and exact print remain unverified. Whatnot detail verification remains unavailable through the restricted direct path; no retry or bypass was attempted.

The negative sample exposed a missing AGS grade-title pattern. TDD reproduced it and added AGS to the shared deterministic graded-listing guard. Offline review of the recorded provider pages using the application parser and normalizer produced zero winners; custom products and slab rows do not enter the price panel. This two-query sample proves useful Pokémon acquisition and safe abstention on the One Piece sample, not comprehensive marketplace recall or independent exact-print precision.
