# TCGlens v1 Product Spec

## Product thesis

TCGlens is a source-backed card-decision engine available through the website and external agent interfaces. It is the fastest trustworthy way to compare condition-compatible raw copies and know when the data is insufficient to recommend one. It compresses the manual workflow buyers already perform: confirm the exact print, check the TCGplayer reference, inspect eBay photos and seller history, calculate checkout cost, and decide whether the evidence is good enough.

The honest launch promise is: compare concrete eBay listings against a clearly labeled TCGplayer market reference, plus exact listings the buyer supplies. TCGCSV aggregate rows and web-discovered links are never presented as seller inventory.

TCGlens remains the deterministic decision engine. ChatGPT, Codex Work, the website, and future clients are interfaces: they may interpret natural language or images into possible identity fields, ask clarifying questions, choose a tool, and explain results. They may not override catalog truth, eligibility, checkout math, ranking, or abstention. TCGlens does not accept image input in v1 and never grades images or predicts condition.

## Interface contracts

- The website provides the visual identity gallery and listing evidence view.
- REST exposes versioned identity, discovery, comparison, explanation, and capabilities contracts.
- The remote Streamable HTTP MCP endpoint at `/mcp` exposes the same engine through five bounded tools.
- Deep links reuse the website handoff contract and contain only non-sensitive search/identity state.

MCP does not introduce a second ranking path. It maps tool inputs into the same `resolveCardIdentity()`, `discoverCards()`, `runListingComparison()`, and `buildAgentSearchUrl()` functions used by existing interfaces.

### Proven, Better, New

- Proven: high-intent buyers already compare TCGplayer price context with eBay listing photos, seller records, and shipping.
- Better: TCGlens keeps exact version, minimum condition, complete comparable cost, seller trust, and evidence in one transparent receipt.
- New: a grounded per-listing decision assistant explains the deterministic result without overriding it.

## Primary user

U.S. Pokémon and One Piece raw-single buyers, beginning with higher-consideration purchases where exact version, condition, seller credibility, shipping, and tax materially change the decision.

## Core journey

1. The buyer enters a card name, ideally with collector number, and chooses a minimum seller-stated condition.
2. TCGlens auto-confirms explicit identities or pauses for one-tap version confirmation.
3. The official eBay adapter resolves an ePID when Catalog coverage exists, then returns concrete active Browse listings; TCGCSV resolves a separate aggregate market reference.
4. Deterministic rules remove incompatible, incomplete, and ineligible rows.
5. TCGlens returns one recommendation with four independently computed lenses:
   - Best Value
   - Cheapest complete comparable cost
   - Safest seller-and-evidence profile
   - Best documented / most reviewable evidence
6. One listing may win multiple lenses. If no row has compatible condition and known shipping, TCGlens abstains.
7. Every listing can open a listing-and-lens-specific explanation. Sources, assumptions, skipped rows, and the technical trace remain inspectable.

## Ranking definitions

Eligible candidates must be concrete active raw singles in USD with a high-confidence or user-confirmed exact match, compatible seller-stated condition, and known shipping. Aggregate references and discovered links cannot rank. Slabs, lots, sealed products, proxies, custom cards, digital products, and wrong versions are excluded.

`preTaxTotal = price + shipping`

When shipping is known and the user supplies or TCGlens estimates a rate:

`estimatedTax = preTaxTotal × taxRate`

`estimatedLandedCost = preTaxTotal + estimatedTax`

Without a rate, the UI says “pre-tax total.” Without shipping, the UI says “before shipping” and the row cannot win a recommendation.

Seller trust uses explicit score bands for feedback percentage, feedback volume, returns, top-rated status, buyer protection, and nullable structured eBay seller sub-ratings when the allowed adapter response provides them. Missing sub-ratings stay unknown/neutral.

Evidence completeness uses item-specific photo count, explicit front/back views, corner/edge closeups, surface evidence, exact identity details, and substantive defect notes.

Safety is:

`0.6 × sellerTrust + 0.4 × evidenceCompleteness`

“Best condition evidence” never means “best condition” or a likely grade.

Best Value uses independent components:

`0.40 × price + 0.25 × conditionCompatibility + 0.20 × sellerTrust + 0.15 × evidenceCompleteness`

Each lens ranks the full eligible set independently; uniqueness is never forced.

Every ranked choice states its position against the market reference when one exists. If every comparable listing is above market, the cheapest lens must say supply is thin rather than implying a bargain.

## Non-goals

- Card scanning or image upload
- NM/LP/grade prediction from photos
- Automated marketplace scraping
- Sold-history claims without an approved provider
- Auth, payments, monitoring, saved collections, journals, planning, or recommendation feeds
- Investment, profit, or guaranteed-condition advice
- Embedded Apps SDK UI in the first MCP release; deep links are the visual continuation
- Public-scale unauthenticated quotas; OAuth or per-user keys are a later distribution gate

## Pilot success

Before each release candidate, the automated standard comparison flow must pass: at least five sequential card-first searches in one session, both Pokémon and One Piece included, with edit-search and new-search transitions between results. New Search clears stale card/listing facts while preserving buyer context.

Before self-serve launch, pass a human-adjudicated corpus of at least 30 real listings covering NM/LP/MP/HP/damaged, unknown shipping, wrong versions, novelty items, and multiple price bands:

- Every lens satisfies its mathematical invariant.
- No incompatible or incomplete-cost row becomes the recommendation.
- Aggregate references and web discoveries never appear as active listings.
- Expert agreement on buy/pass reaches at least 90%, with every disagreement reviewed.

Then, with 10 target buyers:

- 80% complete a comparison within 60 seconds.
- 30% say the evidence changed or confirmed their next action.
- 40% return with another card within 14 days.
- Fewer than 10% correct the confirmed card/version.
- At least three users voluntarily share a comparison receipt.
