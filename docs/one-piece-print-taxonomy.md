# One Piece print taxonomy

Read this before changing One Piece identity vocabulary. The [plan](plan-one-piece-taxonomy-2026-09-05.md)
defines the migration; [the census](one-piece-catalog-census.md) pins its raw evidence.
This document separates catalog meaning from listing proof. Phase 0 changes no runtime behavior.

## Identity keys and the release trap

`card_set_id` is a collector number, for example `OP01-016`. All sibling prints share it.
`card_image_id` is the stable exact-print key, for example `OP01-016_p3`.
The bare key is the catalog's base row, not universally an ordinary retail product.
`_pN` identifies an alternate/parallel catalog row; N does not mean manga, SP or quality.
`_rN` identifies a catalog reprint row; it does not prove identical artwork or identical text.
The catalog can label an `_rN` row Alternate Art. Preserve both facts without forcing a choice.
Neither suffix is seller-visible print proof, and neither belongs in the buyer's display label.

`set_id` identifies the original collector-number set. It does not identify the print release.
`OP01-016_p3` has `set_id: OP-01` and `set_name: The Three Captains`.
Use `set_name` and reviewed per-print facts to derive release aliases.
Never turn the original `set_id` into a reprint's release-code claim.

## Three axes, plus competition tier

| Axis | Meaning | Example |
|---|---|---|
| Artwork class | How the print's artwork is categorized | base, alternate, special, manga, wanted_poster, super_alternate, treasure |
| Treatment | An explicitly supported physical/visual treatment | gold, silver, red; no known treatment is an empty list |
| Release channel | How the print was distributed | booster, premium_booster, starter_deck, premium_collection, anniversary, tournament, event, promo, unknown |
| Competition tier | Qualifier within a release | champion, finalist, participation, winner; no tier is null |

Axes describe evidence, not mutually exclusive marketing language. A manga print may be a
premium-booster release; a special print may have a gold treatment. An anniversary release
can also have a competition tier. Keep the full release name when a coarse channel loses detail.
The current public channel type lacks `starter_deck`; completing documentation must not
silently expand the public schema. Runtime migration needs explicit contract verification.

An unsupported value is `unknown`, not base. A completeness test must report a previously
unseen rarity, variant stem or release pattern before anyone chooses its interpretation.
An explicitly documented unresolved release is different from an unchecked catch-all.

## Rarity and artwork class

| Raw rarity | Meaning for classification |
|---|---|
| C, UC, R, SR, SEC, L | Rarity alone does not identify a sibling artwork |
| P | Promo rarity; does not distinguish prints within a promo family |
| SP CARD | Both rarity and special artwork class |
| TR | Both rarity and treasure artwork class |

Null variant means the raw row carries no alternate label. `Alternate Art` and
`Secret Rare Alt` both describe the alternate class. `Special Art` describes special;
`Treasure Rare` describes treasure. Strip `(P1)` / `(R1)` only as an ordinal, not as evidence.
Reviewed metadata adds manga, wanted poster, super alternate, and treatments that the raw
variant label cannot prove. Reviewed metadata remains authoritative for the specific print.
Do not reinterpret every Secret Rare Alt as manga or every SP as manga-adjacent artwork.

## Release channels and their seams

Retail collector-number prefixes are OP, EB, PRB and ST. The snapshot has 56 prefixes:
OP01–OP17, EB01–EB04, PRB01–PRB02, ST01–ST32, and P (ST31/ST32 are partial sibling coverage).
P- numbers are promos. A retail number can acquire event, promo and reprint siblings;
the number's prefix cannot establish the selected sibling's distribution channel.

| Observed release wording | Channel interpretation |
|---|---|
| Romance Dawn, Paramount War, other named OP sets | booster |
| Memorial Collection, Anime 25th Collection, Heroines Edition, Adventure On Kami's Island | booster (EB retail sets) |
| One Piece Card The Best / Vol.2 | premium_booster |
| Straw Hat Crew, Yamato, The Three Captains and other named ST decks | starter_deck as taxonomy meaning; preserve current runtime projection until migrated |
| Premium Card Collection, Gift Collection, binder/playmat bundles | premium_collection when supported by the actual release |
| Anniversary | anniversary unless a more specific reviewed distribution claim applies |
| Regional, championship, tournament, Treasure Cup, winner/finalist packs | tournament; retain year, season, volume and tier |
| Pre-release, release event, sealed battle, event packs | event |
| Magazine/promotion releases | promo |
| Unresolved named releases, bare ST-14 | explicitly unresolved; no invented release alias |

Order matters: Memorial Collection is an Extra Booster, not a premium collection.
The Three Captains is a starter deck, although a broad `captain` regex can call it booster.
Card colors in deck titles (Red Edward.Newgate) do not establish print treatments.
Champion is not interchangeable with championship; Winner and Participation are distinct tiers.
Nested names share markers: Event Pack is contained in Cs 25-26 Event Pack Finalist Ver.
Marker ownership belongs to every sibling whose wording contains the marker.
Yamato/Uta and other leader names shared with a deck cannot distinguish siblings of that card.
Bare years and original set codes cannot become unique release proof.

## Two vocabularies with evidence

[The lexicon artifact](../src/lib/testing/one-piece-lexicons.json) contains seller phrases and
TCGplayer phrases separately. Each entry has its axis, meaning, source file and exact observed
title/group/product name. The artifact test verifies the phrase and the original evidence.
Seller data comes from the unsafe corpus and the two August 14 adjudication tables.
TCGplayer data comes from group names and release-bearing product-name parentheticals in
the research ledger. Numeric/card-name parentheticals are not release vocabulary.

SP, Alt Art and Manga can coexist in one seller title. Their presence is not independent
corroboration. Foil/Holo alone does not prove a special treatment. Gold may occur on a DON!!
product, so vocabulary never overrides deterministic product exclusion or card identity.
The lexicons establish that a phrase is used; they do not approve the associated print claim.
Terms absent from these corpora are omitted, not supplied with synthetic supporting titles.

TCGplayer `Premium Booster -The Best-` and `Premium Booster -The Best- Vol. 2` are groups.
`One Piece Promotion Cards` pools many releases, including prints whose number starts OP/ST/EB.
Group membership makes a candidate discoverable, not exact. `(The Three Captains)`,
`(Winner Pack 2025 Vol. 2)`, `(Alternate Art)`, `(SP)`, `(Manga)` and `(Reprint)` have
different specificity. Preserve volumes and competition qualifiers through normalization.
Catalog Tournament Kit 2025 Vol.2 versus TCGplayer Tournament Pack 2025 Vol. 2 is naming drift;
any alias matcher must still yield exactly one credible product or abstain.

## Evidence and decisions that stay separate

Class detection, veto ordering, witness intersection, price arithmetic and winner selection
remain deterministic. The taxonomy owns vocabulary; the classifier still owns proof.
The silence rule remains post-veto, retail-only and base-only. Promo silence proves nothing.
The alt-beside-SP/manga corroboration guard remains unchanged without a founder decision.
Twin image comparison is research. Matching image bytes or pixels does not approve merging:
errata, finish, region and distribution can matter even when artwork is shared.
No mapping from the unapproved research ledger can enter runtime as a reviewed product ID.
Human approval remains governed by [the research policy](card-identity-research-policy.md).

## Failure taxonomy from WS-IDENTITY

**Sibling substitution.** Name, number and a generic alternate label were treated as exact
identity; suffix guesses and arbitrary provider-product fallbacks chose cheaper siblings.
Require unique evidence across the whole family and preserve contradictions.

**Vocabulary drift.** Treasure Rare existed in query/ranking vocabulary but not the observed
facet detector. A TR title looked silent and the base accepted it. Completeness and shared
vocabulary complement the sibling audit; neither alone establishes real-title accuracy.

**Missing positive proof.** Single-print numbers and ordinary retail titles lacked a usable
marker by construction. Tests built from artificial `base print` titles missed this.
Keep the real-title spec and positive self-acceptance checks beside rejection tests.

**False marker ownership.** Nested event names and leader-named decks vetoed their own
prints. Containment and unavoidable name/number filtering repair ownership, not seller truth.

**Fixture leakage and exclusions.** Catalog failures returned fixtures when the query happened
to match their names. Narrow novelty patterns missed bare Extended Art titles. Outage and
exclusion tests must use the actual adversarial name/title, not convenient unrelated examples.

**Hidden source failure.** A cached eBay timeout masqueraded as no supply for fifteen minutes.
Keep provider failure visible and avoid caching failed comparisons as successful inventory.

**Silent truncation.** A 50-row clamp, 100-card request and retry-budget mismatch discarded
requested coverage. Test elapsed time and full catalog coverage, not only immediate rejection.

**Wrong measurement.** Reaching a recommendation is recall, not exact-print accuracy.
The classifier's strongest reachable positive is `compatible`, not `exact`. Count real
outcomes and adjudicate winning links before claiming accuracy.

**Missing or lying facts.** Seller text can misstate language, artwork or release; unexpanded
rows lack cost/power specifics. Taxonomy cannot prove what the photo alone reveals. Keep
image proof outside this work and surface the remaining evidence gap.
