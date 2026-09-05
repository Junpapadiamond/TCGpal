# One Piece exact-print alignment audit — 2026-09-05

Every print in EB01–EB04, PRB01–PRB02, the P- promo pool, and the flagship chase numbers,
checked with the production classifier against the seller-visible description of itself and of
each sibling. Hard invariants (no substitutions, no self-rejections, every retail base print
accepted, every marked print accepted) are enforced in `one-piece-alignment.test.ts`.

| prints | self accepted | honest abstentions | self-rejected | substitutions |
|---:|---:|---:|---:|---:|
| 746 | 656 | 90 | 0 | 0 |

## Whole catalog

| prints | self accepted | honest abstentions | self-rejected | substitutions |
|---:|---:|---:|---:|---:|
| 4571 | 3977 | 594 | 0 | 0 |

## Honest abstentions

A print here is one whose own careful listing the classifier returns `unknown` for: nothing a
seller writes separates it from at least one sibling. That is the correct runtime answer — the
buyer is sent to inspect, never to a sibling — but each is a candidate for a reviewed marker in
`src/lib/external/one-piece-print-metadata.ts` if a seller-visible distinguishing phrase exists.

### Retail families (36)

#### `one_piece_evidence_not_unique_across_siblings` (23)

| print | base? | variant | release | siblings |
|---|---|---|---|---:|
| `EB01-009_p1` |  | Alternate Art (P1) | One Piece Card The Best Vol.2 | 2 |
| `EB01-009_r1` |  | Alternate Art (R1) | One Piece Card The Best Vol.2 | 2 |
| `EB01-015_p5` |  | Alternate Art (P5) | One Piece Card The Best Vol.2 | 6 |
| `EB01-015_r1` |  | Alternate Art (R1) | One Piece Card The Best Vol.2 | 6 |
| `EB01-018_p1` |  | Alternate Art (P1) | One Piece Card The Best Vol.2 | 2 |
| `EB01-018_r1` |  | Alternate Art (R1) | One Piece Card The Best Vol.2 | 2 |
| `EB01-038_p1` |  | Alternate Art (P1) | One Piece Card The Best Vol.2 | 2 |
| `EB01-038_r1` |  | Alternate Art (R1) | One Piece Card The Best Vol.2 | 2 |
| `EB01-051_p1` |  | Alternate Art (P1) | One Piece Card The Best Vol.2 | 2 |
| `EB01-051_r1` |  | Alternate Art (R1) | One Piece Card The Best Vol.2 | 2 |
| `EB01-060_p1` |  | Alternate Art (P1) | One Piece Card The Best Vol.2 | 2 |
| `EB01-060_r1` |  | Alternate Art (R1) | One Piece Card The Best Vol.2 | 2 |
| `OP01-120_p5` |  | Secret Rare Alt (P5) | One Piece Card The Best | 5 |
| `OP01-120_r1` |  | Secret Rare Alt (R1) | One Piece Card The Best | 5 |
| `OP03-123_p4` |  | Secret Rare Alt (P4) | One Piece Card The Best | 4 |
| `OP03-123_r1` |  | Secret Rare Alt (R1) | One Piece Card The Best | 4 |
| `OP05-119_p4` |  | Secret Rare Alt (P4) | One Piece Card The Best | 8 |
| `OP05-119_r1` |  | Secret Rare Alt (R1) | One Piece Card The Best | 8 |
| `OP09-027_p1` |  | Alternate Art (P1) | One Piece Card The Best Vol.2 | 4 |
| `OP09-027_r1` |  | Alternate Art (R1) | One Piece Card The Best Vol.2 | 4 |
| `OP13-118_p2` |  | Super Alternate Art | Carrying On His Will | 4 |
| `ST01-012_p2` |  | Alternate Art (P2) | Awakening Of The New Era | 6 |
| `ST01-012_p3` |  | Alternate Art (P3) | Awakening Of The New Era | 6 |

#### `one_piece_class_evidence_requires_corroboration` (13)

| print | base? | variant | release | siblings |
|---|---|---|---|---:|
| `EB03-003_p1` |  | Alternate Art (P1) | One Piece Heroines Edition | 2 |
| `EB03-018_p1` |  | Alternate Art (P1) | One Piece Heroines Edition | 2 |
| `EB03-024_p1` |  | Alternate Art (P1) | One Piece Heroines Edition | 2 |
| `EB03-026_p1` |  | Alternate Art (P1) | One Piece Heroines Edition | 2 |
| `EB03-031_p1` |  | Alternate Art (P1) | One Piece Heroines Edition | 2 |
| `EB03-042_p1` |  | Alternate Art (P1) | One Piece Heroines Edition | 2 |
| `EB03-045_p1` |  | Alternate Art (P1) | One Piece Heroines Edition | 2 |
| `EB03-053_p1` |  | Alternate Art (P1) | One Piece Heroines Edition | 2 |
| `EB03-055_p1` |  | Alternate Art (P1) | One Piece Heroines Edition | 2 |
| `EB03-061_p1` |  | Secret Rare Alt (P1) | One Piece Heroines Edition | 2 |
| `EB04-044_p1` |  | Alternate Art (P1) | Adventure On Kami's Island | 2 |
| `OP11-118_p1` |  | Secret Rare Alt (P1) | A Fist Of Divine Speed | 2 |
| `OP13-118_p1` |  | Alternate Art | Carrying On His Will | 4 |

### Promo families (54)

Promo numbers have no ordinary print, so a plain "promo" title proves none of them by design.

#### `one_piece_evidence_not_unique_across_siblings` (49)

| print | variant | release | siblings |
|---|---|---|---:|
| `P-001_p1` | Alternate Art (P1) | Super Pre-release | 6 |
| `P-001_p2` | Alternate Art (P2) | Super Pre-release | 6 |
| `P-014_p2` | Alternate Art (P2) | One Piece Card The Best | 3 |
| `P-014_p3` | Alternate Art (P3) | One Piece Card The Best | 3 |
| `P-014_r1` | Alternate Art (R1) | One Piece Card The Best | 3 |
| `P-029_p3` | Alternate Art (P3) | One Piece Card The Best | 4 |
| `P-029_p4` | Alternate Art (P4) | One Piece Card The Best | 4 |
| `P-029_r2` | Alternate Art (R2) | One Piece Card The Best | 4 |
| `P-053_p2` | Alternate Art (P2) | One Piece Card The Best | 4 |
| `P-053_p3` | Alternate Art (P3) | One Piece Card The Best | 4 |
| `P-053_r1` | Alternate Art (R1) | One Piece Card The Best | 4 |
| `P-055_p2` | Alternate Art (P2) | One Piece Card The Best | 4 |
| `P-055_p3` | Alternate Art (P3) | One Piece Card The Best | 4 |
| `P-055_r1` | Alternate Art (R1) | One Piece Card The Best | 4 |
| `P-063_p1` | Alternate Art (P1) | One Piece Card The Best Vol.2 | 2 |
| `P-063_r1` | Alternate Art (R1) | One Piece Card The Best Vol.2 | 2 |
| `P-065_p1` | Alternate Art (P1) | Cs 25-26 Event Pack | 2 |
| `P-068_p1` | Alternate Art (P1) | One Piece Card The Best Vol.2 | 2 |
| `P-068_r1` | Alternate Art (R1) | One Piece Card The Best Vol.2 | 2 |
| `P-069_p1` | Alternate Art (P1) | Cs 25-26 Event Pack | 7 |
| `P-069_p3` | Alternate Art (P3) | One Piece Card The Best Vol.2 | 7 |
| `P-069_r1` | Alternate Art (R1) | One Piece Card The Best Vol.2 | 7 |
| `P-070_p1` | Alternate Art (P1) | Cs 25-26 Event Pack | 4 |
| `P-070_p3` | Alternate Art (P3) | One Piece Card The Best Vol.2 | 4 |
| `P-070_r1` | Alternate Art (R1) | One Piece Card The Best Vol.2 | 4 |
| `P-073` |  | One Piece Card The Best Vol.2 | 2 |
| `P-074` |  | One Piece Card The Best Vol.2 | 2 |
| `P-075` |  | One Piece Card The Best Vol.2 | 2 |
| `P-077_p1` | Alternate Art (P1) | Cs 25-26 Event Pack | 2 |
| `P-078_p6` | Alternate Art (P6) | One Piece Card The Best Vol.2 | 7 |
| `P-078_r1` | Alternate Art (R1) | One Piece Card The Best Vol.2 | 7 |
| `P-079_p1` | Alternate Art (P1) | Cs 25-26 Event Pack | 4 |
| `P-079_p3` | Alternate Art (P3) | One Piece Card The Best Vol.2 | 4 |
| `P-079_r1` | Alternate Art (R1) | One Piece Card The Best Vol.2 | 4 |
| `P-081` |  | Op-11 Release Event | 3 |
| `P-081_p2` | Alternate Art (P2) | One Piece Card The Best Vol.2 | 3 |
| `P-081_r1` | Alternate Art (R1) | One Piece Card The Best Vol.2 | 3 |
| `P-082` |  | Store 2-on-2 Battle | 3 |
| `P-082_p2` | Alternate Art (P2) | One Piece Card The Best Vol.2 | 3 |
| `P-082_r1` | Alternate Art (R1) | One Piece Card The Best Vol.2 | 3 |
| `P-083_p1` | Alternate Art (P1) | Cs 25-26 Event Pack | 4 |
| `P-083_p3` | Alternate Art (P3) | One Piece Card The Best Vol.2 | 4 |
| `P-083_r1` | Alternate Art (R1) | One Piece Card The Best Vol.2 | 4 |
| `P-085_p3` | Alternate Art (P3) | One Piece Card The Best Vol.2 | 4 |
| `P-085_r1` | Alternate Art (R1) | One Piece Card The Best Vol.2 | 4 |
| `P-088_p3` | Alternate Art (P3) | One Piece Card The Best Vol.2 | 2 |
| `P-088_r1` | Alternate Art (R1) | One Piece Card The Best Vol.2 | 2 |
| `P-092_p1` | Alternate Art (P1) | Op-12 Release Event | 2 |
| `P-092_p2` | Alternate Art (P2) | Op-12 Release Event | 2 |

#### `plain_family_listing_does_not_identify_print` (5)

| print | variant | release | siblings |
|---|---|---|---:|
| `P-044` |  | One Piece Card The Best Vol.2 | 1 |
| `P-063` |  | One Piece Card The Best Vol.2 | 2 |
| `P-096` |  | Op14-eb04 Release Event | 1 |
| `P-115` |  | Op15-eb04 Release Event | 1 |
| `P-135` |  | Op-16 Release Event | 1 |

