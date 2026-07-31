# Architecture and Data Sources

## Validation loop

1. **Source ingestion:** use official eBay Browse APIs for active-listing search; fetch exactly one user-pasted public HTTPS listing when the bounded adapter permits it; accept manual facts otherwise.
2. **Identity:** reconcile title, set, collector number, and Pokémon or One Piece catalog candidates; use official eBay Catalog metadata only to resolve an ePID for the confirmed card.
3. **Confirmation gate:** stop when the exact version is ambiguous.
4. **Evidence gathering:** query official eBay active listings and optional PriceCharting references.
5. **Normalization:** convert every candidate into one schema with source timestamp and confidence.
6. **Rules:** enforce condition compatibility and complete comparable cost, then calculate seller trust, evidence completeness, eligibility, and independent lens rankings.
7. **Synthesis:** build the initial summary deterministically.
8. **Assistant:** optionally explain one listing and lens from sanitized report facts; reject invented comps, seller accusations, or grading language.

Every AI failure falls back to deterministic behavior.

## Interface architecture

```text
Website ────────┐
REST routes ────┼── shared domain functions ── bounded provider adapters
MCP tools ──────┘
```

`GET /api/agent/capabilities` publishes the versioned support matrix. `POST /mcp` uses Streamable HTTP through Vercel `mcp-handler`. MCP tool handlers validate public input with Zod, call the existing domain functions, and return bounded human-readable content plus machine-readable `structuredContent`. Comparison contract v5 separates canonical identity confirmation and print proof from typed product, condition, cost, price, language, availability, seller, and photo review. The MCP projection intentionally omits the full technical trace.

Deep links call `buildAgentSearchUrl()` and reopen the existing website identity/gallery or exact-card flow. No credentials, seller identifiers, listing URLs, ZIP codes, private notes, or request bodies are placed in handoff URLs.

## Source matrix

| Source | v1 use | Automated | Notes |
|---|---|---:|---|
| eBay Browse API | Active listings, shipping, seller and return signals, images | Yes | Requires server credentials |
| eBay Catalog API | Product identity metadata/ePID and localized aspects for confirmed cards | Yes | Not seller inventory; only guides Browse ePID search |
| Pokémon TCG API | Catalog identity and card images | Yes | Optional key |
| One Piece catalog | Catalog identity and card images | Yes | Bundled catalog + adapter |
| TCGCSV | TCGplayer product crosswalk and aggregate market reference | Yes | Keyless; never ranked as seller inventory |
| PriceCharting | Reference price context | Yes | Optional token; not a guaranteed sale price |
| eBay sold search | Manual verification link | No | TCGlens does not fetch the result |
| TCGplayer | User-supplied candidate | No | New API access is not assumed |
| Facebook / Reddit | User-supplied candidate | No | Trust signals must be entered by the user |
| Mercari / Whatnot | User-supplied candidate | No | No automated v1 adapter |
| Local shop / show | User-supplied candidate | No | Tax, shipping, and protection can differ |

## Offline identity investigations

The source matrix above describes product runtime access. A scoped offline or human-in-the-loop card-version investigation may also consult official publisher pages, structured catalogs, specialist wikis/guides, forums, Reddit, and concrete marketplace examples. These sources help reconstruct release history, learn seller-facing aliases, and find repeatable mislisting patterns; they do not become fetched inventory or ranking evidence.

Investigation findings follow `docs/card-identity-research-policy.md`. Community posts are leads or corroboration, never the sole deciding source for a runtime print rule. Every promoted claim requires recorded provenance, conflict review, human approval, and sibling-negative regression tests. Product routes must not reuse the investigation process as a general web crawler.

## Frontier marketplace research

Founder-triggered marketplace experiments run outside the interface architecture above. `src/lib/frontier-research/*`, `scripts/frontier-research/*`, and `output/frontier-research/*` are the isolated harness, evaluator, and sanitized artifact namespaces. They may observe public pages only under the Frontier Research Mode contract in `AGENTS.md`; they never register a `PlatformAgent`, write report cache entries, emit product analytics, or feed production ranking.

Firecrawl `/scrape` JSON mode was evaluated on 2026-07-31 and failed the six-platform tracer gate. It remains research infrastructure only. See `docs/frontier-firecrawl-pilot.md` for the evidence, failure modes, and retest boundary.

## API

`GET /api/agent/capabilities`

Returns contract versions, supported games/languages/product type/currency, live platforms, unsupported features, and separate live/reference/manual source tiers.

`POST /api/agent/listing-compare`

The request contains a source listing, U.S. buyer context, optional card hints, and an optional confirmed card ID.

The response includes:

- `status`: `needs_confirmation`, `complete`, or `partial`
- identity candidates and confirmed card
- normalized listings
- deterministic ranked choices
- reference evidence
- cautious narrative
- warnings, source timestamps, trace, and `demoMode`

`POST /api/comparison-snapshots` creates an opaque receipt only when the supplied request, confirmed card ID, and generation timestamp resolve to a pure-search report already present in the server report cache. `GET /api/comparison-snapshots?id=…` returns that immutable snapshot until its 30-day expiry; it never reruns marketplace providers.

## Security and failure behavior

- URL fetching is public-HTTPS-only, robots-aware, size/time bounded, and limited to the exact user-pasted page.
- Search-discovered and unsupported URLs are never fetched or ranked.
- API keys remain server-side.
- Provider requests use timeouts and fresh fetches. Card-identity cancellation propagates from the browser through the route and resolver to the Pokémon adapter.
- Missing eBay credentials produce a visible unavailable/skipped source and an honest empty result unless the user supplied a concrete listing. Demo fixtures remain test-only.
- Missing reference data produces a warning, not a fabricated value.
- Existing localStorage keys from the previous product are ignored but not deleted.

## Operations

- `src/lib/ops/*` owns request IDs, rate limiting, shared JSON cache, structured operational events, and Sentry capture.
- Pure card searches cache successful live reports for 15 minutes by card, condition, and delivery context. Demo, confirmation-required, and incompatible contract-version reports are not cached.
- A completed pure-search report may be copied into a 30-day receipt snapshot. Snapshot creation is verified against the server report cache, strips the buyer ZIP, and refuses pasted or manually entered listing facts. Only Redis-backed snapshots are exposed as stable share URLs; process-memory snapshots are a local fallback and the UI says “Copy result.”
- Card-identity resolution has one 18-second server budget. Within it, a Pokémon query-tier timeout or 400/404/500 response advances to the next safer deterministic query; provider-wide 429/502/503/504 responses exit the ladder so the bounded outer retry can handle them. Cancellation or deadline expiry still stops retries and backoff before Vercel's route limit. The browser does not retry silently, but a temporary-unavailable result offers a one-tap retry that preserves the exact search.
- Identical in-flight identity requests coalesce within one server instance. Successful identity responses use hashed 15-minute cache entries and a six-hour stale fallback through the shared JSON cache; a failed refresh may serve a schema-validated stale success with an explicit warning. Deadlines without a safe stale value return a temporary-unavailable response, never a false no-match.
- Full comparison catalog lookups retain bounded per-attempt retries because comparison has different partial-result behavior; provider failures remain isolated and visible.
- Upstash Redis is optional. When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are absent or fail, rate limiting and report caching fall back to bounded in-process memory.
- Cache and rate-limit keys hash buyer/card context before backend storage; raw ZIPs, card names, URLs, listing text, seller identifiers, and images are not operational keys or log fields.
- Sentry initializes only when a DSN is configured; source maps upload only when `SENTRY_AUTH_TOKEN` is present.
- The comparison and explain routes emit `x-request-id` and rate-limit headers so production failures can be correlated without logging request bodies.
- MCP adds its own request-ID and per-tool rate-limit boundary before tool execution. Browse, discovery, and comparison retain the existing identity/discovery/comparison quotas; discovery remains capped at five live comparisons. Provider timeouts and partial-failure isolation stay inside the shared comparison engine.
- Operational events never include raw ZIPs, full queries, request bodies, listing URLs, seller identifiers, images, or secrets.

## MCP and plugin distribution

- Production endpoint: `https://tcgpal.vercel.app/mcp`.
- Transport: Streamable HTTP; the legacy SSE transport is disabled.
- Pilot authentication: public/no-login with bounded execution and rate limiting.
- Scale gate: add OAuth, API keys, or another per-user quota before unrestricted distribution.
- Plugin: `plugins/tcglens`; repo marketplace: `.agents/plugins/marketplace.json`.
- Current plugin version: `1.0.2`; comparison report contract: v5, with card-identity v1 and v4 identity fields retained for compatibility.
- v1 visual continuation: deep links. An inline MCP Apps / Apps SDK UI is a documented later phase.

## Analytics

PostHog receives explicit funnel events only. Autocapture, session replay, pageview capture, and person profiles are disabled.

Allowed properties are limited to marketplace, response status, demo mode, candidate count, choice role, confidence, duration bucket, and decision-change feedback.

URLs, listing text, seller identifiers, and images are prohibited.
