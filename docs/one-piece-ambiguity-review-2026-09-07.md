# One Piece repeated artwork ambiguity — 2026-09-07

The repeated warning is partly a metadata defect. It does not establish that listing
text is inherently incapable of identifying the print. Runtime baseline: `e8f8202`.
This investigation and its in-memory candidate remain **research-only**, with no
runtime curation, product mappings, classifier changes, or human approval.

## Scope and evidence

The user supplied selected prints `P-055_p3` and `EB02-010_p1`, plus the short Luffy
leader title. Both were checked through the production comparison API on 2026-09-07.
The existing catalog audit was rerun with the production classifier. Its evidence is
constructed from catalog fields, not a corpus of real seller titles.

| Audit outcome | Prints |
|---|---:|
| Accepted catalog-derived description | 4,135 |
| Unresolved catalog-derived description | 607 |
| Non-unique sibling evidence | 579 of the 607 |
| Generic class needs corroboration | 23 of the 607 |
| No distinguishing evidence | 5 of the 607 |
| The Best / The Best Vol.2 unresolved | 307 / 218 |
| Self-rejections / sibling substitutions | 0 / 0 |

The Best releases account for 525/607 (86.5%) of unresolved descriptions. This is
the highest-priority catalog cohort, not a measured rate of user-facing warnings.
The older audit's wording that nothing a seller writes can distinguish these prints
was too strong: it only tested the vocabulary already represented in our metadata.
Twenty-eight unresolved prints also appear in the existing unapproved product-mapping
queue. Approving a product ID alone does not necessarily fix listing classification.

## P-055: distinct catalog products collapsed to one label

The bundle labels `P-055_p2`, `P-055_p3`, and `P-055_r1` as Alternate Art from The Best.
All three are present in [Bandai's English PRB-01 list](https://en.onepiece-cardgame.com/cardlist/?series=569301).
[Bandai's product announcement](https://en.onepiece-cardgame.com/products/boosters/prb01.php)
also distinguishes new full-art designs from other reprinted cards. The announcement
is general release evidence; it does not by itself map individual image IDs.

On 2026-09-07 the [TCGCSV PRB-01 product feed](https://tcgcsv.com/tcgplayer/68/23496/products)
returned these three distinct P-055 products. Official and catalog images were viewed
side by side in sequence through the built-in browser, without fetching seller photos.

| Print | Proposed display name | Official image | Catalog product / image | Observation |
|---|---|---|---|---|
| `P-055_p2` | Jolly Roger Foil | [Bandai](https://en.onepiece-cardgame.com/images/cardlist/card/P-055_p2.png) | [586480](https://www.tcgplayer.com/product/586480) / [image](https://tcgplayer-cdn.tcgplayer.com/product/586480_200w.jpg) | Patterned white border; catalog label names Jolly Roger Foil |
| `P-055_p3` | Full Art | [Bandai](https://en.onepiece-cardgame.com/images/cardlist/card/P-055_p3.png) | [593573](https://www.tcgplayer.com/product/593573) / [image](https://tcgplayer-cdn.tcgplayer.com/product/593573_200w.jpg) | Artwork extends through the text area; no broad white border |
| `P-055_r1` | Reprint | [Bandai](https://en.onepiece-cardgame.com/images/cardlist/card/P-055_r1.png) | [596376](https://www.tcgplayer.com/product/596376) / [image](https://tcgplayer-cdn.tcgplayer.com/product/596376_200w.jpg) | Plain white border; same underlying illustration does not make it the same finish |

Source independence: Bandai supplies official print images and set membership;
TCGCSV mirrors TCGplayer product naming and is not an independent second catalog.
The image comparison supports the proposed mapping, not physical foil authentication.
All claims are awaiting human review under the research policy.

The live report selected [this Jolly Roger listing](https://www.ebay.com/itm/137594104902)
as its Inspect First lead for the user's **Full Art** selection. Its title explicitly
names Jolly Roger Foil. This should become a sibling mismatch once that marker is
reviewed. [An English Full Art listing](https://www.ebay.com/itm/158123032548) carried
the appropriate wording but still had unknown shipping; fixing identity will not
make its cost comparable. Other listings had Japanese language or conflicting SP
item specifics. Those independent exclusions must remain.

## EB02-010: generic title versus release evidence

The family contains the original base, Anime 25th Collection alternate, Dodgers One
Piece Night alternate, and Official Playmat Limited Edition Vol.5 alternate.
`EB02-010 Monkey D Luffy Leader Alt Art Holo` remains ambiguous among alternate prints.
The user pasted `B02-010`; the probe restores the confirmed collector number and does
not claim this is an exact capture of a marketplace title.

The actual title `Monkey.D.Luffy (010) (Alt Art) EB02-010 Extra Booster: Anime 25th Collection`
from [this Browse result](https://www.ebay.com/itm/366563209233) passes the existing
classifier when assessed as title text. Its live item specifics also claimed SP,
contradicting the selected alternate class, and shipping was unknown. Several other
current matches explicitly claimed Japanese language. This is separate from P-055's
missing Full Art/Jolly Roger distinction and cannot be repaired by accepting every
title containing Alt Art.

## Candidate experiment and promotion boundary

The in-memory experiment adds `jolly roger` to P-055_p2 and `full art` to P-055_p3 as
family-scoped exact markers, retaining separate IDs and artwork class `alternate`.
It changes no saved runtime file, product ID, price, seller fact, or ranking rule.
The proposed first promotion is these **two** labels/markers plus their observed
product mappings in group 23496. The r1 row remains a review reference; generic
`reprint` must not be made unique proof because all three are from a reprint product.

| Probe | Before | Candidate |
|---|---|---|
| P-055_p3 with the catalog Full Art title | Unknown | Compatible |
| P-055_p3 with the real Jolly Roger title | Unknown | Mismatch |
| P-055_p2 or r1 with the Full Art title | Unknown | Mismatch |
| P-055_p2 with Jolly Roger Foil title | Unknown | Compatible |
| EB02-010_p1 short Alt Art title | Unknown | Unknown |
| EB02-010_p1 title naming Anime 25th Collection | Compatible | Compatible |
| Whole-catalog accepted / unresolved | 4,135 / 607 | 4,137 / 605 |
| Whole-catalog self-rejections / substitutions | 0 / 0 | 0 / 0 |

[Machine-readable results and unresolved print list](one-piece-ambiguity-review-2026-09-07.json)
retain all eight probe inputs, sources, reasons, and before/after outcomes. This is an
offline candidate test, not live buy-accuracy verification or an approval record.

The instinct is correct: distinct versions need distinct results. Correcting reviewed
labels and marker ownership is the strongest next step because it fixes both needless
abstention and wrong sibling inspection leads without changing the classifier.
Two serious objections prevent treating the simulation as sufficient: sellers can use
Full Art loosely, and stock catalog images cannot authenticate a seller's foil finish.
Expanding these aliases globally or merging same-illustration prints would introduce
new unsupported assumptions.

Recommendation: review the two P-055 mappings first, then expand through small PRB
cohorts with independently checked product/print ownership. Success requires matching
real positive titles, sibling negatives, unchanged language/condition/cost exclusions,
zero full-catalog self-rejections/substitutions, and a fresh live comparison. Kill the
change on a verified sibling acceptance or ambiguous mapping. Founder owns approval;
implementing agent owns regression and deployment checks. Review date: 2026-09-07.

Per [the research policy](card-identity-research-policy.md), runtime promotion requires
“a human reviewer approved the exact claim and provenance.” The first two table rows
are concrete candidates for that review; no blanket approval of the other 525 prints
is requested or implied.
