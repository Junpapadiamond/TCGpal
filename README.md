# TCGlens

TCGlens is a source-backed card-decision engine available through the website, REST, and a remote MCP server. It helps U.S. Pokémon and One Piece buyers compare condition-compatible raw singles without pretending incomplete data is comparable.

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
- Honest `next_moves` results when no live or user-supplied listing is available; demo inventory is test-only
- Privacy-restricted PostHog custom events

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app works without marketplace credentials and returns an honest empty/`next_moves` result. Add eBay credentials for live active listings; TCGCSV is keyless reference data.

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

## Agent interfaces

The website, REST routes, and MCP tools call the same identity, discovery, comparison, eligibility, and ranking functions:

| Interface | Purpose |
|---|---|
| `GET /api/agent/capabilities` | Versioned machine-readable support and source tiers |
| `POST /api/agent/card-identity` | Catalog identity resolution without live listing search |
| `POST /api/agent/card-discovery` | Bounded discovery under a hard USD checkout budget |
| `POST /api/agent/listing-compare` | Exact-card live listing comparison |
| `POST /api/agent/listing-compare/explain` | Grounded explanation of an existing report |
| `POST /mcp` | Remote Streamable HTTP MCP transport |

The MCP server exposes `tcglens_get_capabilities`, `tcglens_browse_cards`, `tcglens_discover_cards`, `tcglens_compare_card`, and `tcglens_build_deep_link`. Every tool returns concise text plus `structuredContent`. The website remains the visual evidence surface through deep links; there is no embedded Apps SDK UI in v1.

The public pilot uses hashed-IP, per-tool quotas over a 10-minute window: browse follows the 60-request identity limit, discovery follows the stricter 10-request limit, comparison follows the 20-request limit, and protocol/capability/deep-link calls use the 60-request MCP limit. Redis makes quotas shared across instances when configured; otherwise the bounded in-process fallback applies. Operational logs contain request IDs, tool/route status, counts, duration buckets, and safe error codes—not raw ZIPs, full queries, request bodies, listing URLs, seller identifiers, images, or API keys.

### Work plugin

The distributable plugin is under `plugins/tcglens`, with the repo marketplace at `.agents/plugins/marketplace.json`. It connects to `https://tcgpal.vercel.app/mcp`; it never contains provider credentials.

```bash
codex plugin marketplace add Junpapadiamond/TCGpal --ref main
```

Restart ChatGPT/Codex, open Plugins, choose **TCGlens Team**, install **TCGlens**, and start a new conversation. The pilot endpoint is public/no-login. Production-scale distribution will require OAuth, API keys, or another per-user quota mechanism.

Validate the bundle with the official plugin workflow:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/tcglens
```

## Public REST API

`POST /api/agent/listing-compare`

The response is one of:

- `needs_confirmation`: the exact card/version must be confirmed.
- `complete`: ranked choices and evidence are available.
- `partial`: some evidence source is unavailable, but the report is still useful.

See [product spec](docs/product-spec.md), [architecture and data sources](docs/architecture-and-data-sources.md), and [validation plan](docs/validation-plan.md).

### Agent screenshot handoff

An assistant that identifies a card from a screenshot can open the existing
search flow with a URL in this format:

```text
https://tcgpal.vercel.app/?agent=1&game=onePiece&q=P-096%20Monkey.D.Luffy&card=P-096
```

- `agent=1` marks the URL as an agent handoff.
- `game` is `pokemon` or `onePiece`.
- `q` is the normalized human-readable identity (name, card number, language,
  and variant when visible).
- `card` is optional. Include it only when the exact catalog ID is known; when
  omitted, TCGlens keeps its normal exact-version confirmation step.
- `auto=0` optionally fills the form without starting the search. By default the
  handoff searches immediately.

The link never bypasses catalog matching, exact-print validation, or the public
API schema. If screenshot evidence is ambiguous, omit `card` so the buyer can
confirm the correct print.

### Agent-only budget discovery pilot

`POST /api/agent/card-discovery` supports a bounded discovery-first request:

```json
{
  "query": "Pikachu",
  "game": "pokemon",
  "language": "English",
  "budget": { "min": 200, "max": 500, "currency": "USD", "basis": "checkout" },
  "desiredCondition": "Near Mint",
  "postalCode": "10001",
  "maxResults": 3,
  "includeLiveListings": true
}
```

The route considers at most five exact identities. It omits identities without
a usable market reference, uses the market anchor only to create the shortlist,
and recommends a live listing only when that listing is itself inside budget and
passes the normal raw-single, exact-print, condition, complete-cost, seller, and
evidence gates. It returns `complete`, `partial`, `no_matches`, or `unavailable`
and never substitutes a prediction or sold-history claim for missing evidence.

## Verification

`AGENTS.md` defines change-scoped verification. The full product/runtime release gate is:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

`npm run test` includes the standard multi-card product flow in `src/lib/testing/standard-comparison-flow.ts`: five sequential card searches across Pokémon and One Piece, exercising both Edit and New search transitions.

Documentation-only changes use document checks instead of the application gate. Validate `plugins/tcglens` separately when plugin files or exposed contracts change.

## Product boundaries

No marketplace crawling, sold-history claims, image grading, auth, payments, saved collections, monitoring, or investment promises. External models may interpret an image into possible identity fields, but TCGlens does not accept image input, grade images, or predict condition. Seller condition labels remain claims; unknown shipping and unknown condition remain unknown.
