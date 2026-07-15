# Exact-print identity contract v4

## Purpose

Contract v4 makes exact-print identity a deterministic, positive-proof decision. A listing may rank only when its evidence proves the confirmed catalog print; a low price, seller reputation, or generic alternate-art wording never supplies identity evidence.

## Shared collector-number rules

`src/lib/comparison/collector-number.ts` is the only collector-number parser and comparator used by eBay matching, print fidelity, pasted/manual listings, identity confirmation, TCGCSV matching, and the canonical crosswalk.

- Pokémon fraction numbers ignore legal numeric zero padding: `1/91 = 001/091` and `232/91 = 232/091`.
- Different numerators or denominators conflict, and boundary-aware patterns prevent substring matches.
- One Piece and promo codes normalize case, separators, and numeric zero padding.
- Runtime `_pN` / `_rN` suffixes are catalog implementation IDs, not seller-visible artwork proof.

If a complete collector number establishes a high-confidence eBay match, the final identity layer consumes the same comparison rule and cannot reject it as a missing full number.

## One Piece witness-set proof

The selected print is evaluated against every bundled sibling with the same collector number. Each catalog sibling contributes a witness set of reviewed release aliases, exact markers, artwork class, and treatment.

1. Explicit collector-number, language, sibling-release, artwork-class, or treatment conflicts veto acceptance.
2. Evidence sets are intersected across the complete sibling family.
3. `compatible/high` is returned only when the intersection uniquely contains the confirmed print and required language/corroboration evidence is present.
4. Shared family names, bare `P1/P2/R1`, and fully qualified `_pN/_rN` IDs cannot prove artwork by themselves.
5. Unknown siblings and insufficient evidence lead to abstention, not a guessed match.

eBay search uses seller-facing class and release terms, followed by a broad name/number fallback. Search recall never bypasses the same final identity gate. The research ledger remains research-only.

## Raw-single safety

`src/lib/comparison/graded-listing.ts` is shared by eBay enrichment, normalized raw status, pasted/manual listings, web discovery, and ranking exclusions. It recognizes PSA, BGS, CGC, SGC, ACE, and TAG grades, including descriptor forms such as `CGC Pristine 10`, `BGS Black Label 10`, and `TAG Gem Mint 10`, plus generic graded/slab wording.

Identity and purchase suitability remain separate. A proven print can still be excluded for a slab, incompatible condition, incomplete shipping, implausible price, weak seller record, returns policy, or insufficient photos.

## MCP projection

TCGlens plugin `1.0.1` publishes comparison contract v4:

- `identityConfirmation` records successful canonical-ID reload with high confidence.
- `listing.identity` exposes `printMatch`, confidence, reason codes, price guard, and whether identity is proven.
- `listing.purchaseReview` separately exposes eligibility, seller risk, trust/evidence scores, and seller/photo cautions.

A canonical-ID reload does not inherit low free-text query confidence, and a strong identity match does not erase purchase cautions.

## Evaluation recorded 2026-07-14

- Hermetic suite: Bubble Mew accepts `232/091` for canonical `232/91`; wrong numbers are high-confidence mismatches. Enrichment inside/outside the first 12, missing item specifics, shipping, condition, slabs, and custom products are covered.
- One Piece matrices: 271 unsafe fixtures and all cross-sibling combinations in nine curated families produced zero accepted sibling substitutions.
- Sealed holdout: six families, 37 exact examples, 33 accepted; precision `1.0000`, recall `0.8919`, abstention `0.1081`, sibling substitutions `0`.
- Existing 664-row pending-human-review title corpus: 24 accepted, all 24 labeled exact; precision `1.0000`, recall `0.06916`, substitutions/unrelated/uncertain accepted `0`, abstention `0.96386`. These provisional labels are conservative rejection evidence, not a claim of population accuracy.
- Classifier benchmark: 34,628 ops/s, mean `0.0289 ms`, p99 `0.0522 ms` on the final checked-in benchmark; this is well below the `5 ms` p95 gate.
- Hermetic full comparison benchmark: p95 changed from `0.6961 ms` to `0.7123 ms` (`+2.33%`), within the 10% regression gate.
- Official eBay Browse checks: Bubble Mew, Base Set Alakazam, Nami SP, Nico Robin SP, Zoro anniversary, manga, tournament, and Winner families completed through the bounded API path. Bubble Mew produced high-confidence compatible raw rows; wrong numbers and all observed graded/custom products were excluded. True low-evidence cases continued to abstain.

The live checks measure current source behavior, not a permanent precision guarantee. Human-adjudicated production sampling remains required before broad launch claims.
