# TCGpal

TCGpal helps U.S. Pokémon and One Piece buyers compare condition-compatible raw singles without pretending incomplete data is comparable. It separates four questions ordinary price apps collapse:

- Which actionable listing has the best overall value?
- What is the lowest complete comparable cost?
- Which listing has the strongest seller and return signals?
- Which listing provides the most reviewable photo and condition evidence?

One listing may lead several lenses. The app can also abstain when condition or shipping data is insufficient.

## Current v1

- Card-first search and exact-version confirmation with no login
- Official eBay active-listing adapter
- TCGplayer/TCGCSV aggregate market reference with explicit freshness; it is not ranked as seller inventory
- Manual candidates from TCGplayer, Facebook, Reddit, Mercari, Whatnot, shops, and shows
- Pokémon and One Piece catalog matching
- Optional PriceCharting reference pricing
- Deterministic condition compatibility, complete-cost, seller-trust, evidence, eligibility, and ranking rules
- Optional grounded listing Q&A; the initial comparison does not wait for model allocation or narrative
- Labeled demo inventory only when no live or user-supplied listing exists
- Privacy-restricted PostHog custom events

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The labeled demo works without credentials. Add eBay credentials for live active listings; TCGCSV is keyless reference data.

## Environment

```bash
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_MARKETPLACE_ID=EBAY_US

POKEMON_TCG_API_KEY=
PRICECHARTING_API_TOKEN=

AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5

NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

All marketplace and AI keys stay server-side. The PostHog project key is public by design, but analytics payloads are restricted by an explicit property allowlist.

## Public API

`POST /api/agent/listing-compare`

The response is one of:

- `needs_confirmation`: the exact card/version must be confirmed.
- `complete`: ranked choices and evidence are available.
- `partial`: some evidence source is unavailable, but the report is still useful.

See [product spec](docs/product-spec.md), [architecture and data sources](docs/architecture-and-data-sources.md), and [validation plan](docs/validation-plan.md).

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

`npm run test` includes the standard multi-card product flow in `src/lib/testing/standard-comparison-flow.ts`: five sequential card searches across Pokémon and One Piece, exercising both Edit and New search transitions.

## Product boundaries

No marketplace crawling, sold-history claims, image grading, auth, payments, saved collections, monitoring, or investment promises. Seller condition labels remain claims; unknown shipping and unknown condition remain unknown.
