# TCGpal v1 Product Spec

## Product thesis

TCGpal finds safer ways to buy an exact Pokémon card by comparing landed cost, seller signals, and condition evidence. It compresses a workflow buyers already perform across eBay, TCGplayer, PriceCharting, social groups, and local sellers.

The product does not compete on scanning or a single magic price. It competes on evidence reconciliation and source honesty.

## Primary user

U.S. Pokémon collectors buying raw singles online, especially purchases where exact version, condition, seller credibility, shipping, and tax can materially change the decision.

One Piece is the next candidate category, but only after Pokémon validation.

## Core journey

1. User pastes an eBay URL or enters a listing manually.
2. TCGpal identifies possible card versions.
3. Ambiguous identities require user confirmation.
4. TCGpal gathers supported active listings and reference data.
5. Deterministic rules remove ineligible products and calculate totals.
6. TCGpal returns up to three distinct choices:
   - Lowest estimated landed cost
   - Safest listing
   - Best condition evidence
7. The user can inspect sources, missing evidence, and the validation trace.

## Ranking definitions

Eligible candidates must be active raw singles in USD with a high-confidence or user-confirmed exact match. Slabs, lots, sealed products, proxies, custom cards, digital products, and wrong versions are excluded.

`preTaxTotal = price + shipping`

When the user supplies a rate:

`estimatedTax = price × taxRate`

`estimatedLandedCost = preTaxTotal + estimatedTax`

Without a rate, the UI must say “pre-tax total.”

Seller trust uses explicit score bands for feedback percentage, feedback volume, returns, top-rated status, and buyer protection.

Evidence completeness uses item-specific photo count, explicit front/back views, corner/edge closeups, surface evidence, exact identity details, and substantive defect notes.

Safety is:

`0.6 × sellerTrust + 0.4 × evidenceCompleteness`

“Best condition evidence” never means “best condition” or a likely grade.

## Non-goals

- Card scanning or image upload
- NM/LP/grade prediction from photos
- Automated marketplace scraping
- Sold-history claims without an approved provider
- Auth, payments, journals, collections, planning, or recommendation feeds
- Investment, profit, or guaranteed-condition advice

## Pilot success

With 10 target buyers and 30 real listings:

- 60% complete a comparison within 90 seconds.
- 30% say the evidence changed their next action.
- 40% return with another listing within 14 days.
- Fewer than 10% correct the confirmed card/version.
- At least three users voluntarily share a result or request saved history.
