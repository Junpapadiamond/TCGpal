# One Piece TCGplayer alignment review — September 7, 2026

TCGplayer has catalog products and prices for nearly all of this cohort. Missing
exact-print alignment must not be described as missing market data. This review
checked **608 separate prints** against the current TCGCSV reference catalog and
opened **20 TCGplayer product pages** directly. It did not inspect 608 web pages or
approve 608 artwork mappings.

The cohort is the previous audit's 607 unresolved catalog-derived descriptions,
plus the user's EB02-010_p1 example. It is not a corpus of 608 real seller titles.
All findings remain research-only; no runtime classifier, curated metadata,
market anchor, listing eligibility, or recommended buy changed.

## Census and provenance

| Check | Result | What it establishes |
|---|---:|---|
| Distinct canonical prints / collector-number families | 608 / 262 | Artwork IDs remain separate |
| Prints with a same-number/name catalog product | 608 | A reference product exists for the family, not necessarily for that exact print |
| Prints with a retained priced candidate | 605 | At least one candidate has a non-null aggregate market price |
| Historical candidate IDs still in the current catalog | 491 | Stable catalog identity; not new artwork verification |
| Those historical candidates with a current price | 488 | Prices exist for the retained historical candidate |
| Historical candidates with an unchanged official image hash | 491 | Publisher image matches the historical comparison input |
| Historical candidates without recorded historical conflicts | 404 | First review queue; human approval still pending |
| Fresh automated product-image checks unavailable | 608 | Image-CDN robots request returned HTTP 403; origin requests stopped |
| Direct product pages opened / showing an NM reference | 20 / 17 | Page-observed price evidence, retained separately from the daily feed |

The daily feed was as of **2026-09-06T20:05:30Z**, collected September 7. Direct
page observations span September 7–8 UTC (September 7 in the project timezone);
each has its own timestamp. Page values and the daily feed need not be identical.
The product scan covered 22 relevant groups and 4,528 product records. It is a
bounded cohort investigation, not a claim to have scanned every One Piece product.

- [Full 608-record evidence](one-piece-tcgplayer-alignment-2026-09-07.json): current candidates, product/group IDs, URLs, prices, timestamps, official image hashes, historical comparison evidence, and conflicts.
- [Readable per-print review queue](one-piece-tcgplayer-review-queue-2026-09-07.md): one row per artwork/treatment, with official-image and TCGplayer links.
- [20 direct page observations](one-piece-tcgplayer-page-checks-2026-09-07.json): visible headings and Near Mint comparison references, not seller inventories or page archives.

`pageReviewStatus: not_yet_opened` in the census describes the automated census
stage. The separate timestamped page-observation file records subsequent direct
checks; matching product IDs connects them without implying that a page proves
every canonical print which lists it as a candidate.

## Direct TCGplayer checks

These are USD **Near Mint Comparison Prices**, not featured seller prices,
checkout totals, or executable offers. The three trophy products show `N/A` in
that comparison and `-` for Market Price. Their chart's `$0.00` placeholder is not
a price and must never become an anchor.

| Product page | Observed NM reference | Observed at (UTC) |
|---|---|---|
| [Monkey.D.Luffy (P-055) (Full Art) - Premium Booster -The Best- (PRB-01)](https://www.tcgplayer.com/product/593573?Language=English) | Foil: $78.00 | 2026-09-07 16:54:33 |
| [Monkey.D.Luffy (P-055) (Jolly Roger Foil) - Premium Booster -The Best- (PRB-01)](https://www.tcgplayer.com/product/586480?Language=English) | Foil: $2.27 | 2026-09-07 16:55:12 |
| [Monkey.D.Luffy (P-055) (Reprint) - Premium Booster -The Best- (PRB-01)](https://www.tcgplayer.com/product/596376?Language=English) | Normal: $0.27 | 2026-09-07 16:56:05 |
| [Monkey.D.Luffy (010) (Alternate Art) - Extra Booster: Anime 25th Collection (EB-02)](https://www.tcgplayer.com/product/629101?Language=English) | Foil: $1,004.87 | 2026-09-07 16:59:12 |
| [Monkey.D.Luffy (079) (Super Leader Alternate Art) - The World's Strongest Warriors (OP17)](https://www.tcgplayer.com/product/712114/one-piece-card-game-the-worlds-strongest-warriors-monkeydluffy-079-super-leader-alternate-art?Language=English) | Foil: $1,966.52 | 2026-09-07 17:05:33 |
| [Roronoa Zoro (CS 25-26 3rd Place) - One Piece Promotion Cards (OP-PR)](https://www.tcgplayer.com/product/649626/one-piece-card-game-one-piece-promotion-cards-roronoa-zoro-cs-25-26-3rd-place?Language=all) | Normal: N/A | 2026-09-07 17:05:58 |
| [Roronoa Zoro (CS 25-26 2nd Place) - One Piece Promotion Cards (OP-PR)](https://www.tcgplayer.com/product/649627/one-piece-card-game-one-piece-promotion-cards-roronoa-zoro-cs-25-26-2nd-place?Language=all) | Normal: N/A | 2026-09-07 17:06:40 |
| [Roronoa Zoro (CS 25-26 1st Place) - One Piece Promotion Cards (OP-PR)](https://www.tcgplayer.com/product/649628/one-piece-card-game-one-piece-promotion-cards-roronoa-zoro-cs-25-26-1st-place?Language=all) | Normal: N/A | 2026-09-07 17:07:05 |
| [Nami (P-053) (Full Art) - Premium Booster -The Best- (PRB-01)](https://www.tcgplayer.com/product/593572/one-piece-card-game-premium-booster-the-best-nami-p-053-full-art?Language=English) | Foil: $49.37 | 2026-09-07 17:07:35 |
| [Nami (P-053) (Jolly Roger Foil) - Premium Booster -The Best- (PRB-01)](https://www.tcgplayer.com/product/586408/one-piece-card-game-premium-booster-the-best-nami-p-053-jolly-roger-foil?Language=English) | Foil: $1.98 | 2026-09-08 01:36:08 |
| [Nami (P-053) (Reprint) - Premium Booster -The Best- (PRB-01)](https://www.tcgplayer.com/product/596377/one-piece-card-game-premium-booster-the-best-nami-p-053-reprint?Language=English) | Normal: $0.33 | 2026-09-08 01:36:37 |
| [Koby (Full Art) - Premium Booster -The Best- (PRB-01)](https://www.tcgplayer.com/product/593571/one-piece-card-game-premium-booster-the-best-koby-full-art?Language=English) | Foil: $17.92 | 2026-09-08 01:37:27 |
| [Koby (Jolly Roger Foil) - Premium Booster -The Best- (PRB-01)](https://www.tcgplayer.com/product/586195/one-piece-card-game-premium-booster-the-best-koby-jolly-roger-foil?Language=English) | Foil: $0.51 | 2026-09-08 01:38:26 |
| [Koby (Reprint) - Premium Booster -The Best- (PRB-01)](https://www.tcgplayer.com/product/594236/one-piece-card-game-premium-booster-the-best-koby-reprint?Language=English) | Normal: $0.16 | 2026-09-08 01:39:36 |
| [Monkey.D.Luffy (079) (Alternate Art) - The World's Strongest Warriors (OP17)](https://www.tcgplayer.com/product/707124/one-piece-card-game-the-worlds-strongest-warriors-monkeydluffy-079-alternate-art?Language=English) | Foil: $61.95 | 2026-09-08 01:40:28 |
| [Monkey.D.Luffy (079) - The World's Strongest Warriors (OP17)](https://www.tcgplayer.com/product/707123/one-piece-card-game-the-worlds-strongest-warriors-monkeydluffy-079?Language=English) | Normal: $0.18 | 2026-09-08 01:40:47 |
| [Boa Hancock (Seven Warlords of the Sea Binder Set) - One Piece Promotion Cards (OP-PR)](https://www.tcgplayer.com/product/648100/one-piece-card-game-one-piece-promotion-cards-boa-hancock-seven-warlords-of-the-sea-binder-set?Language=English) | Foil: $102.19 | 2026-09-08 01:41:34 |
| [Boa Hancock (Seven Warlords of the Sea Binder Set) (Alternate Art) - One Piece Promotion Cards (OP-PR)](https://www.tcgplayer.com/product/648101/one-piece-card-game-one-piece-promotion-cards-boa-hancock-seven-warlords-of-the-sea-binder-set-alternate-art?Language=English) | Foil: $136.63 | 2026-09-08 01:42:18 |
| [Sanji - ST21-003 (Pirate Foil) - Premium Booster -The Best- Vol. 2 (PRB-02)](https://www.tcgplayer.com/product/656000/one-piece-card-game-premium-booster-the-best-vol-2-sanji-st21-003-pirate-foil?Language=English) | Foil: $1.07 | 2026-09-08 01:50:31 |
| [Narikabura Arrow (Textured Foil) - Premium Booster -The Best- (PRB-01)](https://www.tcgplayer.com/product/593904/one-piece-card-game-premium-booster-the-best-narikabura-arrow-textured-foil?Language=English) | Foil: $3.07 | 2026-09-08 01:51:09 |

## Broader specific-label experiment: 150 prints

The historical ledger often reduced a precise TCGplayer name to a generic marker
such as `foil`. Selecting only unchanged official images, retained historical
product candidates, and records without historical conflicts identifies this
bounded hypothesis cohort:

| Observed product label | Proposed family-scoped marker | Prints |
|---|---|---:|
| Pirate Foil | `pirate foil` | 67 |
| Full Art | `full art` | 49 |
| Jolly Roger Foil | `jolly roger` | 20 |
| Textured Foil | `textured foil` | 14 |

The [150 exact proposed claims](one-piece-specific-label-review-2026-09-07.md)
preserve official print IDs, image links, observed product IDs/names, group IDs,
and pending review status. An independent in-memory run of those markers moves
**4,135 accepted / 607 unresolved to 4,285 accepted / 457 unresolved**, with **zero
self-rejections and zero substitutions** across all 4,742 prints. All **677
catalog-title positive/sibling-negative probes pass**. The six-print proposal
below is a subset, not another six improvements to add to 150.

This explains a testable quarter of the catalog-description abstentions
(150/607 = 24.7%) without rewriting the classifier. It does not establish live
seller-title precision or approve the historical image mappings. Generic
`alternate art`, `reprint`, and `foil` were deliberately excluded from this
experiment. Human review, real seller-title regressions, and the existing
promotion gate still apply to each row.

[Full broader experiment](one-piece-broader-marker-probe-2026-09-07.json) contains
every title, source URL, before/after outcome, candidate claim, and cohort row.

## First concrete metadata proposal

The older research ledger already proposed separate Full Art and Jolly Roger
products for Luffy P-055, Nami P-053, and Koby P-014. Their official images are
unchanged, their candidate IDs remain current, their historical comparisons have
no recorded conflict, and all six TCGplayer pages now have direct observations.
Historical image evidence is dated July 11; the blocked CDN means it has not been
replaced by a fresh automated product-image comparison.

| Official print | Proposed display label / family-specific marker | TCGplayer product |
|---|---|---:|
| [P-055_p2](https://en.onepiece-cardgame.com/images/cardlist/card/P-055_p2.png) | Jolly Roger Foil / `jolly roger` | [586480](https://www.tcgplayer.com/product/586480) |
| [P-055_p3](https://en.onepiece-cardgame.com/images/cardlist/card/P-055_p3.png) | Full Art / `full art` | [593573](https://www.tcgplayer.com/product/593573) |
| [P-053_p2](https://en.onepiece-cardgame.com/images/cardlist/card/P-053_p2.png) | Jolly Roger Foil / `jolly roger` | [586408](https://www.tcgplayer.com/product/586408) |
| [P-053_p3](https://en.onepiece-cardgame.com/images/cardlist/card/P-053_p3.png) | Full Art / `full art` | [593572](https://www.tcgplayer.com/product/593572) |
| [P-014_p2](https://en.onepiece-cardgame.com/images/cardlist/card/P-014_p2.png) | Jolly Roger Foil / `jolly roger` | [586195](https://www.tcgplayer.com/product/586195) |
| [P-014_p3](https://en.onepiece-cardgame.com/images/cardlist/card/P-014_p3.png) | Full Art / `full art` | [593571](https://www.tcgplayer.com/product/593571) |

All six belong to TCGplayer group **23496**. Each is an atomic proposal with
`humanReviewStatus: pending`. The three normal Reprint products remain distinct
review references; bare `reprint` is not unique proof because this whole release
contains reprints. No finish twins are merged, and no global Full Art rule is added.

[Offline marker experiment](one-piece-promo-marker-probe-2026-09-07.json): adding
only those six exact markers in process memory moves accepted / unresolved
catalog descriptions from **4,135 / 607 to 4,141 / 601**. Both runs retain **zero
self-rejections and zero sibling substitutions across 4,742 prints**. All **29
positive/sibling-negative probes** pass, including the real P-055 Jolly Roger title
rejected against the Full Art selection. The other probe titles use observed
catalog labels with explicit number, release, and language; they are not claimed
as seller-title validation. The experiment does not change product IDs or display
labels, and it is not live buy-accuracy verification.

The strongest case is that narrow, source-backed marker ownership can remove
needless abstention without changing the classifier. Two objections remain:
sellers can misuse Full Art, and a stock product image does not authenticate a
seller's foil treatment. Price presence cannot resolve either objection.

Recommendation: founder reviews these six exact claims, then the implementation
agent adds the minimum curated metadata with real-title positive, sibling-negative,
language, and product-exclusion tests. Success is six corrected descriptions with
the 0/0 invariants intact and distinct anchors. Kill the proposal if ownership is
not unique, a stronger source contradicts it, or any sibling is admitted. Owner:
founder for curation; implementation agent for tests and promotion. Review at the
next founder response, no later than the next implementation session.

## Remaining work and limits

Of the 117 rows without a retained historical mapping, 96 are The Best releases,
13 are new OP17 prints, and eight are other releases. Among the 491 retained
historical candidates, 87 have recorded conflicts. These are explicit queues, not
permission to auto-approve the other 404.

OP17-079 has separate Base, Alternate Art, and Super Leader Alternate Art products.
The two Seven Warlords Boa Hancock products also have distinct product pages and
prices. These names provide promising vocabulary, but this run has not proved
their canonical `_pN` ownership. Preserve that uncertainty instead of matching by
price or collapsing all alternate art products. OP16/OP17 catalog coverage from
the preceding release remains intact.

The three ST21-015 trophy pages (649626/649627/649628) confirm genuine missing
market-price data at observation time. Conversely, EB02-010_p1 has a priced
Alternate Art product, but that cannot make a short generic Alt Art seller title
prove its release. Its existing release-qualified positive and conflicting
language/SP/unknown-shipping cases remain as documented in the
[original investigation](one-piece-ambiguity-review-2026-09-07.md).

No automated CDN request was retried through another host, header, or image URL.
Normal product-page inspection remained available. Fresh artwork verification
for the broad cohort is therefore unfinished; source unavailability is not evidence
that those cards are inherently unalignable. The earlier plan's image-proof and
founder decisions remain separate.

## Reproduction and verification

- `node scripts/review-unresolved-one-piece-tcgplayer.mjs` is explicit one-off network research, uses dated local caches and stops blocked origins. It writes a dated census and never mutates runtime curation. Do not run it as a scheduled job.
- `node scripts/review-one-piece-promo-markers.mjs` is hermetic: it reads the pinned census and catalog, simulates six markers in memory, and writes the before/after probe artifact.
- Add `--broader` to that command for the separately reported 150-print specific-label hypothesis. It still reads no network and writes no runtime file.
- Five hermetic research-state tests distinguish missing products, missing/partial image evidence, unresolved artwork, and a machine candidate still needing review. A partial image failure cannot establish uniqueness.
- Lint, typecheck, metadata check, build, and 1,447 hermetic tests passed. Both marker experiments passed their separate catalog audits and probes. No product UI changed, so product visual QA is not applicable.
- Graphify's configured macOS CLI is unavailable on this Windows workspace; source navigation used `rg`. No stale graph was regenerated or claimed current.

Production promotion still follows [the research policy](card-identity-research-policy.md#promotion-gate):
“a human reviewer approved the exact claim and provenance.” The research scripts
do not grant that approval.
