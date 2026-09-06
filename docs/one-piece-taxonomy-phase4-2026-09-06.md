# One Piece taxonomy — Phase 4 results and founder review

Implementation Phases 0–3 are shipped through `a147d00`. Vercel production deployment
`dpl_HE1875DXYz4jKCgrpqJAVReg1Dhd` was observed READY for that exact commit before the
live comparison run. Phase 4 collected evidence; it did not approve mappings, merge twins,
widen proof rules, or add production image proof.

The taxonomy work passes its implementation gates. The live sample does **not** establish
the product's accuracy target: the provisional agent review is 8/13 matching links (61.5%),
with two clear misses and three unresolved release/finish cases. Human adjudication remains
pending. This is not directly comparable to the earlier founder-reviewed 9/13 sample.

## Implementation and invariant evidence

| Phase | Shipped evidence |
|---|---|
| 0 — census, taxonomy, mined lexicons | `aeacba9`; 4,571 prints, 53 prefixes, 629 text twins in 258 groups/247 families; [census corrections](one-piece-catalog-census.md) |
| 1 — completeness alone | `2e4e3ee`; unknown rarity/variant/release values fail by name; six explicit unknown releases, no catch-all |
| 2 — shared vocabulary | `c72ccf9`; four consumers migrated behind unchanged audits; classifier engine retained |
| 3a — anchor aliases | `d4269fd`; two PRB and four promo anchors gained in the live sample; six booster controls unchanged before merge |
| 3b — picker labels | `8d8874b`; all 4,571 labels in EN/中文 without P/R ordinals; desktop/mobile captures and five sequential searches |
| 3c — exact-anchor price review | `a147d00`; strict >5× reference and ≥$20 item-price gap, One Piece NM only; all buy lenses abstain on those rows |

The Phase 3c full gate passed: lint, typecheck, 1,426 tests in 93 files (5 live reviews
skipped), and production build. [UI captures and decision rationale](one-piece-taxonomy-execution-2026-09-05.md#phase-3c-exact-anchor-price-review)
include the modeled historical-price fixture; it was removed before the build.

The [fresh alignment ledger](one-piece-alignment-audit-2026-09-06.md) remains
656 accepted / 90 unknown / 0 rejected / 0 substitutions in 746 target prints, and
3,977 / 594 / 0 / 0 across 4,571 prints. This measures careful catalog-derived evidence,
not whether a seller's title tells the truth. The original plan's 590 total abstentions
was stale even on the pre-migration source. The [whole-catalog reason projection](one-piece-rule-scope-2026-09-06.json)
now pins 566 ambiguous-sibling, 23 corroboration-guard and 5 plain-promo abstentions.
The original plan's separate reference to 6 plain promos was also stale.

## Live market anchors

`npm run measure:market-anchor -- --taxonomy` used public TCGCSV feeds through the bounded
adapter. All 14 sampled product/group resolutions match the prior accepted run, including
P-001_p3's deliberate null. Prices changed with the daily feed; they are not a same-time
before/after price comparison. [Current results and source timestamps](one-piece-taxonomy-anchors-2026-09-06.json),
[prior accepted results](one-piece-taxonomy-anchors-after-2026-09-05.json).

| Print | Current product | Item reference USD |
|---|---:|---:|
| PRB02-006 | 653430 | 4.87 |
| PRB02-006_p1 | 653431 | 33.46 |
| P-001 | 450299 | 44.23 |
| P-001_p3 | none | unavailable |
| EB01-015_p1 | 622592 | 0.27 |
| EB01-015_p2 | 622597 | 3.96 |
| OP01-016_p3 | 527619 | 5.68 |

The ordinary `npm run measure:market-anchor` command also completed against production:
eight cards across both games, 56 eligible rows, median item-price delta +7.4%, 59% above
the reference, 38% above +15%. The three One Piece medians were Luffy OP05-119 +65.4%,
Zoro OP06-118 +11.3%, Nami OP01-016 +26.7%. [Measurement output](one-piece-taxonomy-market-deviation-2026-09-06.txt).
These are asks, not sold transactions. The instrument includes eligible price-review rows;
eligibility does not imply that a row may win a buy lens. No thresholds were recalibrated
from this small, selected sample.

## Live comparison and page review

`npm run measure:buy-accuracy` completed 13/13 requests against `https://lenstcg.com`,
with 31-second pacing between requests: 12 Best Buy, 1 Inspect First, no request errors or automatic abstentions.
[API result sidecar](one-piece-buy-accuracy-2026-09-06.json) and
[human review queue](one-piece-buy-accuracy-2026-09-06.md). All human verdict cells remain blank.
Tracking query parameters were removed from persisted URLs; the Chopper variation was retained.

Codex opened every returned link in the built-in browser and compared the relevant images
with official references. Automatic checking-browser screens redirected without interaction;
no access control was bypassed. Only minimal observations, direct URLs and timestamps were
retained, not page archives or seller identities. This work is `frontier-research` and cannot
be promoted as production identity evidence without the research-policy gate.

[Field observations](one-piece-buy-observations-2026-09-06.json) and
[provisional agent sheet](one-piece-buy-accuracy-agent-2026-09-06.md) record eight matching,
two wrong-print/product and three unclear results. Running the existing scorer on the
**agent** sheet gives 61.5%, below its 80% target; its generic word “adjudicated” means filled
cells here, not human approval. Matching stock artwork does not authenticate a physical copy,
and NM remains a seller claim. Browser delivery used 07307, while the API experiment used
10001; browser shipping values did not replace the API comparison costs.

| Case | Observed evidence | Disposition for this report |
|---|---|---|
| Nami OP01-016 | [Listing](https://www.ebay.com/itm/306680357872) shows base artwork but says LD-01 / Learn Together Deck Set, versus confirmed Romance Dawn | Unclear release/finish equivalence; needs review |
| Zoro OP06-118 | [Listing](https://www.ebay.com/itm/318386233254) says Non Foil and Learn together / Reprint / Regular | Unclear release/finish; do not call exact-print accuracy |
| Luffy ST01-001 | [Listing](https://www.ebay.com/itm/407186231869) claims ERRATA / Revised holo at $29.99; catalog has one print | Artwork matches, revision/finish distinction unresolved; no new anchor invented |
| Ace OP02-013_p1 | [Listing](https://www.ebay.com/itm/227465362031) says Alt Art / Paramount War, but its ornate gold/cloud artwork differs from selected flames artwork | Clear artwork miss; price-review prevented a buy recommendation |
| Chopper EB01-006 | [Selected BGS variation](https://www.ebay.com/itm/157767198624?var=459197281290) sells extended slab artwork; displayed example explicitly excludes the card | Clear non-card product miss despite Best Buy; separate exclusion follow-up |

The other eight observations matched their requested artwork and stated identity. The
full per-row notes preserve stock-image limitations and contradictory seller fields.
The four old misses were not silently declared fixed; inventory changed, and these are new
observations. In particular, taxonomy consolidation cannot solve a seller showing another
artwork while naming the selected print. No production photo-proof work was added.

## ePID probe and a live ceiling trigger

`node scripts/measure-one-piece-epid.mjs` probed the fixed Ace OP02-013_p1 case through the
production API. [Result](one-piece-epid-2026-09-06.json): selected ID preserved, TCGplayer
486333 resolved at $55.59, eBay used the keyword template and returned no ePID.
The public trace does not distinguish lack of a unique Catalog match from unavailable
Catalog access. Therefore this is **inconclusive about eBay Catalog's ability to distinguish
alternate arts**, not proof that it can or cannot. Local eBay credentials are absent;
no provider secrets were retrieved to manufacture a more specific conclusion.

The same report proves the ceiling runs in production: the $299 Ace item (>5× $55.59 and
>$20 above it) carries `price_far_above_exact_market`, disposition `review`, and is Inspect
First despite `compatible` text identity. Shipping is $9.45 and did not activate the rule.
The price guard caught an extreme ask; the observed artwork mismatch still exists.

## All official text-twin images

`node scripts/measure-one-piece-twin-images.mjs` fetched all 629 exact catalog image URLs
from the official English site, after robots.txt returned 404. Three workers, a 15-second
timeout, 5 MiB response limit, fixed host/path allowlist and zero retries bounded the run;
HTTP 401/403/429 would have stopped new requests. [Complete pairwise evidence](one-piece-twin-images-2026-09-06.json).

| Measurement | Result |
|---|---:|
| Images observed / requested | 629 / 629 |
| Text-twin groups / families | 258 / 247 |
| Within-group pairs compared / possible | 513 / 513 |
| Byte-identical pairs | 0 |
| Native decoded-pixel-identical pairs, with equal dimensions | 0 |
| Median 32×45 RGB RMSE, 0–255 scale | 49.661074 |
| Closest pair RMSE | 0.457954 |

The five closest pairs are OP05-115_p2/r1, OP03-057_p2/r1, OP02-089_p2/r1,
OP05-057_p2/r1 and OP04-056_p2/r1 (all below RMSE 2; this is descriptive, not a merge
threshold). The closest pair was also opened visually: broadly the same illustration,
with no confidently adjudicated physical-print distinction from those reference images.
Compression, color processing, sample watermarks, foil and errata can complicate inference.
Zero identical assets does not prove every pair is a different physical print, and a small
distance does not prove equivalence. No twin was merged.

## Founder decisions — review-ready, not executed

The common instinct is to recover listings the catalog knows without admitting a sibling.
Keep that objective distinct from widening generic title proof or collapsing catalog IDs.
The following decisions remain owned by the founder; next review date is 2026-09-07.

| Decision | Strongest case for changing it | Two serious objections | Recommendation and smallest falsifiable test |
|---|---|---|---|
| Alt beside SP/manga guard | Recover 23 catalog-wide self-abstentions; exact IDs are in the rule-scope artifact | Today's Ace listing uses an alt-art title for another artwork; generic class words remain non-unique even with good seller metrics | Retain the guard. Founder may authorize a research-only comparison of current versus relaxed logic on independently adjudicated real titles for those families. Success: greater correct acceptance with zero added substitutions; kill at the first added substitution |
| Promo silence scope | Four of the five plain-promo cases have two catalog prints, potentially allowing a smaller experiment | “Base” is an internal ordering among promos, not a market default; unmodeled releases and reused art can make a two-print snapshot falsely appear complete | Retain retail-only silence. Review P-044, P-096, P-115 and P-135 and their siblings first; P-063 has three total prints. Success requires observed seller-visible release proof, not silence alone; kill if uniqueness depends on a missing sibling |
| Twin merging | A few official reference pairs are visually very close; redundant choices may cause abstentions | None of 513 pairs is pixel-identical; image similarity cannot establish finish/errata/distribution equivalence | No bulk merge. Human-review the five closest pairs against primary release/finish evidence and structured product records. Approve individually only with no contradictory identity fact; kill on any distinct treatment, release or unresolved conflict |
| Mapping rows | Exact approved mappings could recover still-unanchored prints and their price gates | Machine-clean rows are not human-reviewed claims; same-name products can be the wrong sibling or an ambiguous group member | Keep the 214-row queue pending. Founder chooses a small unanchored cohort and approves atomic ID/release claims with sources; require positive and sibling-negative tests before promotion |

These are recommendations, not approval requests needed to finish the taxonomy implementation.
The plan explicitly assigns rule scope, merging and mapping approval to the founder.
The Chopper exclusion and unmodeled release/finish observations deserve their own bounded
follow-up; this report records them rather than folding them into the taxonomy or image-proof
decision. Human buy-accuracy adjudication and a discriminating Catalog/ePID result remain
unverified, with the reasons above.

## Final handoff verification

The final Phase 4 tree passed lint (zero errors; one unused destructured-vector warning
in the measured image exporter), typecheck, all 1,430 tests in 94 files (5 opt-in live
reviews skipped), and the production build. The image helper's four hermetic tests cover
cohort boundaries, failed fetches, pixel/dimension comparisons and conservative robots
handling. JSON artifacts parse, local report links resolve, and `git diff --check` passes.
`PROGRESS.md` is 299 lines. The image artifact's source hash matches the exact Windows
working-copy bytes used for measurement. Graphify is unavailable on this host; the graph
was not regenerated. No live finding or research image record enters runtime behavior.
