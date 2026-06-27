# Architecture and Data Sources

## Validation loop

1. **Source ingestion:** fetch only allowlisted eBay URLs; accept all other sources as manual facts.
2. **Identity:** reconcile title, set, collector number, and Pokémon catalog candidates.
3. **Confirmation gate:** stop when the exact version is ambiguous.
4. **Evidence gathering:** query official eBay active listings and optional PriceCharting references.
5. **Normalization:** convert every candidate into one schema with source timestamp and confidence.
6. **Rules:** calculate cost, seller trust, evidence completeness, eligibility, and rankings.
7. **Synthesis:** use the configured model to explain differences without changing the winners.
8. **Critic:** reject invented comps, scam certainty, or grading language.

Every AI failure falls back to deterministic behavior.

## Source matrix

| Source | v1 use | Automated | Notes |
|---|---|---:|---|
| eBay Browse API | Active listings, shipping, seller and return signals, images | Yes | Requires server credentials |
| Pokémon TCG API | Catalog identity and card images | Yes | Optional key |
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

- URL fetching is host-allowlisted and HTTPS-only.
- Unsupported URLs are never fetched.
- API keys remain server-side.
- Provider requests use timeouts and fresh fetches.
- Missing eBay credentials load labeled fixtures.
- Missing reference data produces a warning, not a fabricated value.
- Existing localStorage keys from the previous product are ignored but not deleted.

## Analytics

PostHog receives explicit funnel events only. Autocapture, session replay, pageview capture, and person profiles are disabled.

Allowed properties are limited to marketplace, response status, demo mode, candidate count, choice role, confidence, duration bucket, and decision-change feedback.

URLs, listing text, seller identifiers, and images are prohibited.
