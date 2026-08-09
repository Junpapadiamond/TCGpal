# Market anchor calibration — 2026-08-10

Why the price read changed. Reproduce with `npm run measure:market-anchor`
(defaults to production; set `TARGET=http://localhost:3000` for local).

## Question

The result screen shows `item N% above/below reference`, and `buildAction` turns
`>15%` into **Consider waiting**. Both assume the TCGCSV/TCGplayer anchor is a
trustworthy estimate of what the card costs on the marketplace we actually
search. Two ways that could fail: the anchor is stale, or eBay asks sit
structurally above TCGplayer market so the badge's zero point is wrong.

## Method

Ran the live comparison for 8 cards (5 Pokémon, 3 One Piece), then compared each
eligible listing's **item price** against `confirmedCard.marketMid` — the same
inputs the badge uses. 24 eligible listings across the 3 cards that had an
anchor.

## Results

| Card | Anchor | n | Median | Min | Max | Anchor age |
|---|---|---:|---:|---:|---:|---:|
| Umbreon VMAX 215/203 | $2,327.51 | 9 | −1.2% | −22.7% | +13.9% | 2.7h |
| Giratina V 186/196 | $833.71 | 10 | −2.1% | −16.0% | +16.9% | 2.7h |
| Mewtwo & Mew-GX 222/236 | $180.61 | 5 | +21.8% | +4.1% | +77.2% | 2.7h |

Pooled: median **+3.6%**, **54%** of listings above the anchor, **21%** past the
+15% wait threshold.

## Findings

1. **Neither hypothesis held.** The anchor was 2.7h old on every card, and at
   54% above / 46% below it is close to unbiased. Staleness and cross-marketplace
   bias are not the problem.
2. **Same-day dispersion is the problem.** Asks for one card on one day span
   33–36 points. The 15% wait threshold sits *inside* that ordinary spread, so
   "Consider waiting" fires on ~1 in 5 listings as a function of seller variance
   rather than anything about the market.
3. **Coverage is the bigger gap.** 5 of 8 cards had **no anchor at all** — both
   Base Set cards and all three One Piece cards. The badge correctly renders
   nothing rather than guessing, but the price signal is simply absent for much
   of the catalogue, including a whole live game.
4. **One anchor looks wrong.** Mewtwo & Mew-GX 222/236: every one of 5 listings
   is above a $180.61 anchor, median +21.8%. When no seller is near the anchor,
   the anchor is the likelier error — probably a crosswalk match to a cheaper
   printing sharing the collector number. Not yet investigated.

## What changed because of this

`buildVerdictCopy` now returns `pricePosition` — "2nd cheapest of 5 comparable
copies" — rendered under the market badge. It needs no external anchor, so it
covers the cards TCGCSV misses; it cannot be miscalibrated, because there is no
external reference to be stale or crosswalked wrong; and it answers the buyer's
actual question without explaining what "reference" means.

The market badge stays as a secondary read where an anchor exists. The 15%
threshold was **not** retuned — 24 listings across 3 cards is enough to show the
spread swamps it, not enough to pick a better number.

## Not done

- Retune or replace `ACTION_ABOVE_MARKET_RATIO` using a larger sample (~30 cards
  across price tiers) — or drop the market-relative wait entirely in favour of
  "every copy in this comparison is expensive", which is a present-tense claim.
- Investigate the Mewtwo & Mew-GX crosswalk.
- Anchor coverage for Base Set and One Piece.
