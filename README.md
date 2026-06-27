# TCGpal

TCGpal helps U.S. Pokémon collectors compare a specific raw-card listing against supported alternatives. It separates three questions that ordinary price apps collapse:

- What is the lowest estimated cost?
- Which listing has the strongest seller and return signals?
- Which listing provides the best condition evidence?

The app shows its sources and does not predict grades or invent sold transactions.

## Current v1

- Direct listing-first flow with no login
- Official eBay active-listing adapter
- Manual candidates from TCGplayer, Facebook, Reddit, Mercari, Whatnot, shops, and shows
- Optional Pokémon TCG catalog matching
- Optional PriceCharting reference pricing
- Deterministic landed-cost, seller-trust, evidence, eligibility, and ranking rules
- Optional OpenAI evidence synthesis with deterministic fallback
- Labeled demo inventory when eBay credentials are absent
- Privacy-restricted PostHog custom events

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The demo works without credentials. Add eBay credentials for live active listings and optional provider keys for richer evidence.

## Environment

```bash
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_MARKETPLACE_ID=EBAY_US

POKEMON_TCG_API_KEY=
PRICECHARTING_API_TOKEN=

AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5-2026-04-23

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

## Product boundaries

No scraping, sold-history claims, image grading, auth, payments, or investment promises. Seller condition labels remain claims; TCGpal scores the evidence available to review them.
