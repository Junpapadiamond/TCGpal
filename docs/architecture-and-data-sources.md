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

## Source matrix

| Source | v1 use | Automated | Notes |
|---|---|---:|---|
| eBay Browse API | Active listings, shipping, seller and return signals, images | Yes | Requires server credentials |
| eBay Catalog API | Product identity metadata/ePID and localized aspects for confirmed cards | Yes | Not seller inventory; only guides Browse ePID search |
| Pokémon TCG API | Catalog identity and card images | Yes | Optional key |
| One Piece catalog | Catalog identity and card images | Yes | Bundled catalog + adapter |
| TCGCSV | TCGplayer product crosswalk and aggregate market reference | Yes | Keyless; never ranked as seller inventory |
| PriceCharting | Reference price context | Yes | Optional token; not a guaranteed sale price |
| eBay sold search | Manual verification link | No | TCGpal does not fetch the result |
| TCGplayer | User-supplied candidate | No | New API access is not assumed |
| Facebook / Reddit | User-supplied candidate | No | Trust signals must be entered by the user |
| Mercari / Whatnot | User-supplied candidate | No | No automated v1 adapter |
| Local shop / show | User-supplied candidate | No | Tax, shipping, and protection can differ |

## API

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

## Security and failure behavior

- URL fetching is public-HTTPS-only, robots-aware, size/time bounded, and limited to the exact user-pasted page.
- Search-discovered and unsupported URLs are never fetched or ranked.
- API keys remain server-side.
- Provider requests use timeouts and fresh fetches.
- Missing eBay credentials load labeled fixtures only when no user-supplied row exists.
- Missing reference data produces a warning, not a fabricated value.
- Existing localStorage keys from the previous product are ignored but not deleted.

## Operations

- `src/lib/ops/*` owns request IDs, rate limiting, shared JSON cache, structured operational events, and Sentry capture.
- Upstash Redis is optional. When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are absent or fail, rate limiting and report caching fall back to bounded in-process memory.
- Cache and rate-limit keys hash buyer/card context before backend storage; raw ZIPs, card names, URLs, listing text, seller identifiers, and images are not operational keys or log fields.
- Sentry initializes only when a DSN is configured; source maps upload only when `SENTRY_AUTH_TOKEN` is present.
- The comparison and explain routes emit `x-request-id` and rate-limit headers so production failures can be correlated without logging request bodies.

## Analytics

PostHog receives explicit funnel events only. Autocapture, session replay, pageview capture, and person profiles are disabled.

Allowed properties are limited to marketplace, response status, demo mode, candidate count, choice role, confidence, duration bucket, and decision-change feedback.

URLs, listing text, seller identifiers, and images are prohibited.
