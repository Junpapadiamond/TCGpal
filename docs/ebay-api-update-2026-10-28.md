# eBay API compatibility and opportunity audit — October 28, 2026

## Outcome

TCGlens already uses the supported REST Browse integration. The modernization announcement does not require a Browse-to-GraphQL rewrite. The current published Browse specification is **v1.20.4**, served at `/buy/browse/v1`; the Catalog specification is **v1_beta.5.3**, served at `/commerce/catalog/v1_beta`. These specification versions are not replacement URL versions. [Browse specification](https://www.developer.ebay.com/develop/api/spec/browse_api.json), [Catalog specification](https://www.developer.ebay.com/develop/api/spec/catalog_api.json).

The audit found one existing access problem: our application token cannot call Catalog, and the configured keyset cannot mint a Catalog read-only application token. Browse works. The new Feedback read-only application scope works and is the strongest candidate for a separate seller-evidence experiment. No runtime, ranking, environment, credential, or provider-registry changes were made in this audit.

## Compatibility inventory

Reviewed source: `src/lib/external/ebay.ts` at `9d0b1c5` on current `origin/main`; also inspected `scripts/check-ebay.mjs` and the source/architecture contracts. The older dirty primary checkout was not used as the implementation baseline.

| Integration | Current implementation | Finding |
|---|---|---|
| Authentication | Client credentials at `/identity/v1/oauth2/token`, public-data scope, cached expiry, coalesced refresh, one 401 retry | Matches Browse's current contract; live token succeeds |
| Card-first discovery and recall probe | `/buy/browse/v1/item_summary/search`; encoded parameters, USD/fixed-price filters; separate bounded recall request | Supported; main search still defaults to Best Match |
| Detail enrichment | `/buy/browse/v1/item/{item_id}` | Supported; sampled response still carries structured condition descriptors |
| Pasted eBay listing | `/buy/browse/v1/item/get_item_by_legacy_id` | Present in current specification; this path was inspected, not separately live-tested |
| Optional ePID resolution | `/commerce/catalog/v1_beta/product_summary/search` using the public-data token | Live 403/error 1100; Catalog read-only application grant rejected with `invalid_scope` |
| Legacy Finding/Shopping/Trading integrations | No production caller found in source scan | No legacy caller to migrate |

eBay's [modern migration guide](https://www.developer.ebay.com/develop/guides/sell/modern-apis-migration-guide) directs buyer-side legacy GetItem and shipping lookups to Browse. Its [deprecation table](https://www.developer.ebay.com/develop/get-started/api-deprecation-status) lists Finding and Shopping as replaced by Browse. No reviewed notice requires replacing our Browse routes. Browse's current release notes include stricter malformed-URL errors and additive fields; the adapter already uses `URLSearchParams`/encoded item IDs and permissive Zod objects. [Browse release notes](https://developer.ebay.com/api-docs/buy/browse/static/release-notes.html).

## Bounded live evidence

Observed October 28, 2026, starting at approximately 13:07 America/New_York (17:07 UTC), using the existing local production keyset. Six initial HTTP requests plus one Catalog-scope diagnostic; no retries, purchase, seller contact, account changes, pagination, or persistent acquisition. The one-result search used `Charizard 4/102`; this was an API compatibility check, not a recommendation or exact-print evaluation.

| Check | Result | Observed duration |
|---|---|---:|
| Public-data OAuth grant | 200 | 320 ms |
| Browse search, limit 1 | 200; one summary | 651 ms |
| Detail for that summary | 200; condition descriptors present | 508 ms |
| Feedback read-only OAuth grant | 200 | 305 ms |
| Feedback summary, `ratingType:DSR_ITEM_AS_DESCRIBED` | 200; `feedbackRatingSummary` container returned | 306 ms |
| Catalog search with current public-data token | 403; error 1100 | 395 ms |
| Catalog read-only application grant | 400; `invalid_scope` | Not recorded |

These are single observations, not latency percentiles, availability guarantees, or proof of feedback coverage. Feedback metric values/counts were not retained or evaluated. Tokens, seller identifiers, listing IDs and raw responses are not committed. The local keyset was tested; Vercel's deployed keyset was not independently compared.

### Catalog follow-up

`resolveEbayProductForCard` currently returns null on a non-success HTTP response, leaving keyword discovery available. Do not call the denied Catalog path working merely because a comparison succeeds.

There is a documentation inconsistency: the [older Catalog method page](https://developer.ebay.com/api-docs/commerce/catalog/methods/product_summary/search) describes client credentials with `commerce.catalog.readonly` for buying integrations, while the new OpenAPI document declares authorization-code flows for its scopes. The live `invalid_scope` response settles only that this keyset cannot use the attempted application grant; it does not establish an API-wide removal or its date.

Owner: founder/eBay application administrator. Verify Catalog grants on the Application Keys page and, if unavailable, ask eBay developer support whether this buying application can receive the documented read-only access. Do not add seller-write scopes, buyer login, or broaden Browse's token scope as a workaround. Once access is granted, make Catalog token acquisition/cache independent of Browse, prove the scoped call succeeds, and keep exact-print checks plus graceful failure. No portal setting or support message was changed/sent here.

## Opportunities, ranked by fit

| Capability | Value for TCGlens | Recommendation |
|---|---|---|
| New Feedback API | Item-as-described, communication, shipping and delivery metrics; filtered feedback can support inspectable seller evidence | **Test first.** Read-only application access was verified. Evaluate coverage and meaning before adding a seller explanation or changing Safest |
| Official eBay MCP | API/spec discovery and read-only API calls from development assistants | Useful development tooling; optional installation. Keep provider credentials server-side and retain TCGlens's deterministic decision functions |
| Bulk Browse `getItems` | Potentially reduces requests for lightweight price/availability refresh | Existing capability, limited to selected partners and a separate `buy.item.bulk` scope. Its documented field subset omits the condition descriptors/aspects needed by our detail enrichment; not a drop-in replacement |
| New Watch List, Offer, Purchase Quote, Auction and order APIs | Account-linked saving, negotiation and transaction workflows | Park for this product phase; a separate product/auth/transaction design is required |

The [Feedback specification](https://www.developer.ebay.com/develop/api/spec/feedback_api.json) declares a client-credentials flow for `https://api.ebay.com/oauth/api_scope/commerce.feedback.readonly`. Its `getFeedback` and `getFeedbackRatingSummary` reads support that scope. The API offers rating categories including `DSR_ITEM_AS_DESCRIBED`, `DSR_COMMUNICATION`, `DSR_SHIPPING_CHARGES`, and `ON_TIME_DELIVERY`. Keep sample counts, periods, missing values, and attribution; a feedback metric is not proof of a specific card's condition or seller misconduct. [Buy communication guide](https://www.developer.ebay.com/develop/guides/buy/buy-communication-guide).

eBay's [official MCP README](https://github.com/eBay/npm-public-api-mcp/blob/main/README.md) describes REST GET/GraphQL query-only production access, Node 22+, and no officially supported sandbox. It is not a replacement for our validated adapters. The [new Buy release notes](https://developer.ebay.com/develop/api/buy/release_notes) date several account and transaction API launches to October 26, 2026; their launch does not make them necessary dependencies for card comparison. No reviewed material establishes new unrestricted sold-comp access.

## Decision and smallest next test

**Verdict: Test first.** Retain Browse and evaluate Feedback separately. Confidence is high on route compatibility and successful Feedback access, low on its incremental decision value.

Underlying instinct: stay compatible and use newly available evidence to improve buyer decisions. A wholesale API migration is unnecessary; the strongest case for new work is more specific seller evidence than a lifetime feedback percentage.

Advisor synthesis (board inference, not advice from the named individuals): the Fiona Fung lens emphasizes verification bottlenecks and reviewed trust boundaries (`FF-S1`, `FF-S2`); the Cat Wu lens favors a small observable test over a broad rewrite (`CW-S1`, `CW-S2`). Both challenge migration for its own sake. The tension is whether a useful-looking new signal deserves production influence before its coverage and interpretation have been measured. Attribution comes from the installed advisor skill's source registry and complete Fiona/Cat dossiers; the inference here concerns TCGlens only.

Serious objections: (1) extra seller calls add quota/latency and another failure mode; (2) sparse or differently defined feedback periods may create false confidence or penalize missing data; (3) public API access alone does not authorize changing production source/ranking contracts. Unknowns include coverage, daily quota, period semantics, retention requirements and whether buyers find the information useful.

The completed probe establishes access only. Proposed next evaluation, not started or scheduled: at most 10 distinct sellers from a fixed Pokémon/One Piece sample, two read-only summary categories per seller, no pagination/retries, identifiers kept only in memory, aggregate coverage and latency recorded. No production ranking changes. Success: at least 8/10 sellers have usable item-as-described metrics with counts/periods, zero semantic/schema failures, and an added two-call critical-path p95 under one second. Kill or redesign if access fails, coverage is below the threshold, semantics cannot be reconciled, or missing feedback must be treated as negative evidence to seem useful.

Owner: founder for source/ranking promotion, implementation agent for the bounded evaluation. Proposed review: October 30, 2026; no automation created. Production promotion requires an approved bounded adapter, Zod validation, independent scoped token cache, failure isolation, privacy rules, tests and an explicit AGENTS.md boundary update. Prefer an inspectable evidence display before any Safest scoring change.

## Verification scope

Documentation-only outcome. Validate Markdown whitespace, local paths, external source URLs and paired progress section markers. No runtime edits, dependency installation, application gate, UI screenshots or Graphify regeneration are required for this audit. The live evidence above is compatibility/access evidence only, not an end-to-end product test.
