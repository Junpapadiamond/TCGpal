# One Piece catalog census

Snapshot inspected on 2026-09-05: [generated catalog](../src/lib/external/one-piece-catalog.generated.json).
This counts the raw snapshot, before reviewed seed enrichment. It measures catalog structure,
not listing availability, artwork equality, release-history accuracy, or human-approved mappings.

| Measurement | Pinned value | Definition |
|---|---:|---|
| Prints | 4,571 | One row per `card_image_id` |
| Collector-number families | 2,634 | Distinct `card_set_id` |
| Prefixes | 53 | OP01–OP16, EB01–EB04, PRB01–PRB02, ST01–ST30, P |
| Promo prints | 225 | Collector number starts with `P-` |
| Treasure Rares | 11 prints / 11 families | Rarity is `TR` |
| Text twins | 629 prints | Same number, release and variant stem, in groups of at least two |
| Twin groups / families | 258 / 247 | A family can contain several groups |
| Event-word cohort | 476 | Literal keyword union below; not an authoritative release channel |
| The Best prints | 634 | Release contains `One Piece Card The Best` |
| Leader-named deck families | 7 | Multi-print ST family; normalized base release and card name contain one another |
| Bare release code | 1 | `ST14-010_r1`, whose release is `ST-14` |

Rarities: **C, UC, R, SR, SEC, L, SP CARD, TR, P**. Raw variant stems are **base**
(null variant), **Alternate Art**, **Secret Rare Alt**, **Special Art**, **Treasure Rare**.
Remove only the trailing `(Pn)` / `(Rn)` print ordinal when grouping. Reviewed labels such
as Manga Art are not raw snapshot stems and must be tested separately.

The event-word cohort uses this case-insensitive union, stored in the census JSON:
`tournament|winner|finalist|champion|participation|anniversary|treasure cup|pre.?release|release event|sealed battle|event pack|pirates party|celebration|premium card collection|gift collection|binder|playmat|dash pack|expo|magazine|store`.
It deliberately does not claim that keyword absence makes a release retail.

The seven overlapping deck families are `ST09-012`, `ST11-001`, `ST13-019`,
`ST15-002`, `ST22-001`, `ST26-005`, `ST30-001`. In `ST15-002` and `ST26-005`
the release includes a color before the leader name; color is not a treatment claim.

The TR print IDs are `OP07-109_p2`, `OP08-052_p2`, `OP09-015_p1`, `OP10-063_p1`,
`OP11-058_p1`, `OP12-108_p2`, `OP13-037_p1`, `OP16-011_p1`, `ST01-007_p3`,
`ST10-010_p2`, `ST18-004_p1`. They do not begin at OP16.

`OP01-016_p3` demonstrates the original-set trap: `set_id` is `OP-01`, but
`set_name` is `The Three Captains`. Its print release cannot be inferred from `set_id`.

## Corrections to the planning evidence

The handoff summary's 48 prefixes is contradicted by the 53 explicit prefixes. The plan's
six leader-named families omitted `ST11-001` (Uta / Uta). Its claimed 499 event-style prints
does not reproduce from the listed keyword union: that union yields 476. Adding `regional`
yields 489; broadening `event pack` to `event` yields 479 (492 with `regional`). None yields
499. Keep the original estimate visible as unverified, and use the pinned, defined cohort.
The 629/247 twin numbers and 634 The Best numbers reproduce exactly. Twin grouping uses
raw variant stems; it is not a claim that reviewed class metadata or official images match.

## Reproduction and review

Run `node scripts/review-one-piece-taxonomy.mjs` to regenerate the census and lexicons.
Run `node node_modules/vitest/vitest.mjs run src/lib/testing/one-piece-taxonomy-artifacts.test.ts`
to compare the snapshot to [pinned values](../src/lib/testing/one-piece-catalog-census.json).
The test recomputes counts without invoking the generator. Review a changed snapshot and
its census diff before accepting new numbers; regeneration is not approval of catalog facts.

The classifier's inherited target audit is 656 accepted / 90 abstained / 0 rejected /
0 substitutions across 746 prints. The expanded whole-catalog instrument measures **594**
abstentions and 3,977 acceptances, with zero substitutions or self-rejections. Re-running the
pre-consolidation `2e4e3ee` classifier confirmed those same numbers; the plan's 590 and its
breakdown were not a verified baseline. These are classifier outcomes, not raw census counts.
Their instrument is [the alignment audit](one-piece-alignment-audit-2026-09-05.md).
