# Plan — One Piece print taxonomy, and the alignments that ride on it (2026-09-05)

Written after `9cde099`/`794e385` landed the base-print proof and the catalog-wide
alignment audit, and before any consolidation code changes, so the target is falsifiable
rather than retrofitted. The last section is the prompt to hand a fresh coding agent; the
sections before it are the evidence that prompt rests on.

## One sentence

Move One Piece print knowledge out of a dozen drifting regex lists into one data-driven
taxonomy with a completeness test, keep the classifier engine that is now at zero
substitutions across 4,571 prints, and only then build the market-anchor, label, and
ceiling work that all want that taxonomy.

## What already exists and is green

- **The engine.** `src/lib/comparison/print-fidelity.ts` decides exact-print identity for
  One Piece by building a witness set per collector number, owning release markers by
  containment, running vetoes (class word, treatment, release no sibling owns, printed
  cost/power conflict), intersecting evidence, and — since `9cde099` — reading a title that
  names nothing but the card as the ordinary retail print. It is not the thing to rewrite.
- **The instrument.** `src/lib/testing/one-piece-alignment.ts` walks every print of every
  family against the seller-visible description of itself and of each sibling, with the
  production classifier. `src/lib/comparison/one-piece-alignment.test.ts` enforces two
  invariants over all 4,571 prints (no print accepts a sibling's own listing; no print
  rejects its own) and two stronger ones over the 746 EB01–EB04 / PRB / promo / flagship
  prints (every retail base print accepted; every print with a family-unique marker
  accepted). `npm run review:one-piece-alignment` writes the abstention ledger
  (`docs/one-piece-alignment-audit-2026-09-05.md`).
- **The numbers.** Target families 746 prints: 656 accept their own listing, 90 honest
  abstentions, 0 self-rejections, 0 substitutions (was 547 / 186 / 13 / 13). Whole catalog:
  0 substitutions, 0 self-rejections, 590 abstentions (561 text-indistinguishable twins,
  23 "alt art beside a manga/SP sibling", 6 plain promo titles).
- **The plain-title spec.** `src/lib/comparison/one-piece-base-print.test.ts` holds the
  real adjudicated titles from `docs/one-piece-buy-accuracy-2026-08-14.md` and every rule
  added since, each as a failing-first test.
- **Per-print facts.** `src/lib/external/one-piece-print-metadata.ts` holds ~100 reviewed
  seeds (class, treatment, aliases, exact markers, TCGplayer product + group id, evidence).
  `output/one-piece-exact-print-metadata.json` is the research ledger: 2,040 records, image-
  compared against TCGplayer, **0 human-approved**. `docs/one-piece-tcgplayer-mapping-
  review-2026-09-04.md` lists the 214 machine-clean rows for the target families that could
  be promoted by a reviewer. Nothing in `output/` reaches runtime.

## The diagnosis

Two kinds of knowledge are being treated as one.

**Per-print facts** — this `_p2` is manga, its TCGplayer product is 587966, checked against
the official image on this date — live in the seeds, are human-reviewed per
`docs/card-identity-research-policy.md`, and should grow forever. The review sheet is that
process working. Adding those is sustainable.

**Per-class rules** — what "SP" means, what sellers call a parallel, that "TR" is a rarity,
that "Winner Pack" is a tournament channel — are finite (roughly forty seller phrases and a
dozen release kinds; Bandai publishes the set) and today live in four files, in roughly a
dozen functions, each a regex or string list, each drifted a little:

| file | functions carrying class/vocabulary knowledge |
|---|---|
| `src/lib/comparison/print-fidelity.ts` | `printClass`, `witnessClass`, `detectResearchedPrintFacet`, `genericAltPattern`, `isGenericMarker`, `releaseAliases`, `releaseClaimPatterns` |
| `src/lib/comparison/ranking.ts` | `deriveVariantIntent` (a copy of `printClass`), `specificVariantMarkers`, `variantIntentLabel` |
| `src/lib/external/ebay.ts` | `VARIANT_QUERY_TOKENS`, `researchedPrintQueryToken`, `printClassQueryToken` |
| `src/lib/external/one-piece-print-metadata.ts` | `deriveOnePieceCatalogPrintEnrichment` (release name → semantic aliases), `deriveOnePieceReleaseMetadata` (release name → channel, by keyword) |

The Treasure Rare substitution fixed in `794e385` was the signature of this. Treasure Rare
already existed in `printClass`, `deriveVariantIntent`, and `VARIANT_QUERY_TOKENS`, and was
absent from `detectResearchedPrintFacet` — so a "Treasure Rare" listing read as a plain
title and the silence rule handed it to the base print. That is a synchronization bug
between copies of the same knowledge, not a missing tag. Every new rarity, treatment, or
release kind Bandai ships has to be added in four files, and only the drift that produces a
substitution is caught by the audit.

## What the catalog actually is (census, 2026-09-05)

Computed from `src/lib/external/one-piece-catalog.generated.json` during the audit work and
not yet pinned anywhere — Phase 0 pins it.

- 4,571 prints, one row per print, keyed by `card_image_id` (`OP01-016`, `OP01-016_p1`,
  `OP01-016_r1`). `_pN` is a parallel/alternate print; `_rN` is a reprint (the ledger labels
  them "Reprint"; some carry new art, some do not — unverified per print).
- Prefixes: OP01–OP16 (boosters), EB01–EB04 (extra boosters), PRB01–PRB02 (premium
  boosters, "One Piece Card The Best"), ST01–ST30 (starter decks), P (225 promos).
- **`set_id` is the original set, not the release.** `OP01-016_p3` from The Three Captains
  still says `OP-01`. Only `set_name` names the release a print came from. A set-code alias
  cannot be derived from `set_id`.
- Rarities seen: C, UC, R, SR, SEC, L, SP CARD, TR, P. "SP CARD" is both a rarity and an
  artwork class. Variant labels are strings: "Alternate Art (P1)", "Special Art (P4)",
  "Secret Rare Alt (P1)", "Treasure Rare (P1)", "Manga Art" (only when seeded).
- 11 Treasure Rare prints in 11 families (OP16 onward).
- 629 prints in 247 families are text-indistinguishable twins: same release, same class
  label, different print id (`EB01-009_p1`/`_r1`, `OP05-119_p4`/`_r1`/`_r2`,
  `P-001_p1`/`_p2`). They are 561 of the 590 catalog-wide abstentions.
- 499 prints are in event-style releases (tournament, winner, finalist, champion,
  participation, anniversary, treasure cup, pre-release, release event, sealed battle,
  event pack, pirates party, celebration, premium card collection, gift collection, binder,
  playmat, dash pack, expo, magazine, store). 634 are in a "One Piece Card The Best" release.
- 6 multi-print starter-deck families whose base release name overlaps the card name
  (`ST09-012` Yamato / Yamato, `ST13-019` The Three Brothers' Bond / The Three Brothers,
  `ST22-001`, `ST30-001`, `ST15-002`, `ST26-005`). 1 print catalogued under a bare set code
  (`ST14-010_r1`, release "ST-14").
- Reviewed seeds cover ~100 prints; the derived enrichment covers alternate-art prints whose
  release name matches a special-release regex; every other print has no aliases or markers
  beyond its release name.

## The alignment gaps that remain, with evidence

1. **PRB and promo prints have no market anchor.** Proven hermetically by calling
   `selectExactTcgplayerProduct` with the real TCGplayer group names from the ledger.
   TCGplayer files every promo under the group "One Piece Promotion Cards" and every The
   Best print under "Premium Booster -The Best-" / "… Vol. 2"; `releaseMatches` in
   `src/lib/comparison/crosswalk.ts` cannot pair either with the catalog's release names, so
   without a reviewed product id no PRB print and no promo, event, anniversary, or
   tournament print gets an anchor (~1,100 prints, and it is the chase inventory). Probe
   results: `OP01-016` base → mapped (new since `9cde099`; the "Exact TCGplayer mapping
   unavailable" a reviewer hit is gone); `EB01-006` / `_p1` → mapped ("Extra Booster:
   Memorial Collection" suffix-matches); `PRB02-006` / `_p1`, `P-001` / `_p3`,
   `EB01-015_p1` / `_p2`, `OP01-016_p3` → **no anchor**; `EB01-006_r1` → mapped only because
   it carries a reviewed id. Consequence: `marketFloorApplies` is skipped when
   `marketPrice` is null, so the exact-print floor is off for exactly these prints and a $5
   novelty can rank as Cheapest for a $200 promo. Two fixes: approve rows from the review
   sheet (per-print, policy-compliant), or a group-alias matcher that treats those two
   TCGplayer groups as candidates for the matching channels and lets the classifier pick
   exactly one credible product from the product name's parenthetical ("(The Three
   Captains)", "(Winner Pack 2025 Vol. 2)", "(Alternate Art)", "(SP)", "(Manga)",
   "(Reprint)"). The second is deterministic and hermetically testable with the ledger's
   real names, but it changes ranking inputs and must be validated live with
   `npm run measure:market-anchor` before merge. Note the naming drift the matcher must
   tolerate: catalog "Tournament Kit 2025 Vol.2" is TCGplayer "Tournament Pack 2025 Vol. 2".
2. **No above-market ceiling.** The floor is one-directional. The silence rule's accepted
   trade-off (an alt art listed without saying so ranks as the base) relies on price making
   it lose; Best Value penalizes it, Cheapest never picks it, but Safest and Best-documented
   ignore price, so a mislabeled alt with good photos could win those lenses on a base
   search. A ceiling (far above the exact-print anchor → review) is small and deterministic
   and depends on item 1 for the anchor.
3. **Twins.** Whether the 629 same-release same-class prints are catalog duplicates or
   genuinely different artworks is checkable by pairwise comparison of the official images
   (`officialImageUrl` in the ledger; `scripts/research-one-piece-exact-prints.mjs` already
   fetches them). Network; founder-run. If most are duplicates, merging clears most
   abstentions. If they are different arts, they need a seller-visible marker that does not
   exist and stay honest abstentions.
4. **Picker labels are internal ids.** "Alternate Art (P1)" / "(P3)" is what the live-site
   reviewer complained about. Release-derived labels ("Romance Dawn Alt Art", "The Three
   Captains Promo", "Gift Collection 2023 Promo") are already computable from the aliases.
   UI + i18n (EN and 中文), no ranking impact.
5. **Two rule-scope decisions that belong to the founder, not the agent.** (a) The 23
   catalog-wide "alt art beside a manga/SP sibling" abstentions: relaxing the corroboration
   guard trusts sellers not to write "alt art" for an SP. (b) The 5 promo base prints on
   silent titles: promos are excluded from the silence rule because `P-001` has seven promos
   and none is ordinary; a narrower rule could take two-print promo families.
6. **Known gaps that need the photo or live data.** A Japanese `OP04-119` declared
   "Language: English" is image-only. The printed cost/power stat gate — the strongest text
   check — runs only on the 12 of 50 rows that get an eBay item-detail call
   (`EBAY_DETAIL_BUDGET`). Whether eBay's own catalog distinguishes One Piece prints, which
   decides if the ePID search rung helps or hurts alt-art searches, needs one live probe.

Stale instruments: recall 21/30 and buy accuracy 9/13 both predate `9cde099` and should be
re-measured with credentials before either is quoted.

## Phases

### Phase 0 — familiarity, as artifacts (no behavior change)

Not reading wikis. The repo holds more ground truth than a wiki, and the research policy
already says primary sources win. Produce:

1. **Catalog census**: `docs/one-piece-catalog-census.md` plus a test that pins every
   number in the census section above, computed from the generated catalog, so a snapshot
   refresh that changes them fails loudly.
2. **Taxonomy doc**: `docs/one-piece-print-taxonomy.md`, ~150 lines, read-first for any
   agent touching One Piece identity. Three orthogonal axes — artwork class, treatment,
   release channel with competition tier — plus the id conventions and the `set_id` trap.
   It must answer, concretely: what `_pN` and `_rN` mean; which rarities exist and which
   double as classes; how a release name maps to a channel; which prefixes are retail and
   which are promo; where the seams are (SP CARD, `_r` with new art, "Secret Rare Alt").
3. **Two vocabularies as data**: the seller lexicon, mined from
   `src/lib/comparison/one-piece-unsafe-corpus.json` and the adjudication sheets rather
   than guessed; and the TCGplayer lexicon, mined from the ledger's `tcgplayerGroupName` and
   the parentheticals in `tcgplayerProductName`. Each phrase tagged with the class,
   treatment, or channel it names.
4. **Failure taxonomy**: the historical failure shapes from `PROGRESS.md` WS-IDENTITY "What
   went wrong", one paragraph each, so "wrong" is recognizable before it recurs.

Acceptance: census test green; the taxonomy doc answers the listed questions without
opening source; both lexicons have a test that every phrase appears in at least one real
title or product name in the repo's corpora.

### Phase 1 — completeness test (no behavior change)

Every distinct rarity, every variant-label stem (label with `(P1)`/`(R1)` stripped), and
every release-name pattern in the catalog must map to a known class, treatment, and channel,
or the test fails and names the unmapped value. Wire it so a synthetic new rarity ("IR")
fails it. This is the test that would have caught Treasure Rare before the audit did, and it
is the cheapest 80% of this plan's value.

### Phase 2 — consolidate the knowledge, keep the engine

One taxonomy module (`src/lib/external/one-piece-taxonomy.ts`, data-first) that owns: the
enumerated classes, treatments, channels, and tiers; the single derivation from catalog
fields (rarity, variant, release name) to those; the seller lexicon; the TCGplayer lexicon.
Move each consumer in the table above onto it one at a time, running the alignment audit
after each move, and delete the duplicate. The classifier's logic does not change; only
where it reads its vocabulary from.

Success: alignment audit at or above 656 / 90 / 0 / 0 on the target families and 0 / 0
catalog-wide after every move; zero class-word regexes outside the taxonomy module
(grep-checkable); adding a hypothetical class touches one file and the completeness test
says what is missing. Kill: any audit number moves the wrong way and cannot be explained as
a corrected defect, or the phase runs past two sessions — stop, keep Phase 1, leave the
consumers where they are.

### Phase 3 — the alignments that ride on the taxonomy

In this order, each behind the audit and the full gate:

1. **Anchor group-alias matcher** in `crosswalk.ts`: TCGplayer group ↔ catalog channel from
   the taxonomy; the classifier picks the single credible product from the parenthetical;
   abstain on zero or several. Hermetic tests use the ledger's real group and product names.
   Do not merge without a live `npm run measure:market-anchor` run showing the PRB and promo
   anchors appearing and no booster anchor changing.
2. **Picker labels** from the taxonomy's release-derived display label. EN and 中文 desktop
   plus a mobile viewport, captured.
3. **Above-market ceiling** as a review (not exclude) disposition, only where an
   exact-print anchor exists.

### Phase 4 — live checks and founder decisions

With credentials, run and report, do not guess: `npm run measure:buy-accuracy`,
`npm run measure:market-anchor`, the twin image comparison, one ePID probe on an alt-art
family. Put the two rule-scope decisions and the twin-merge question to the founder with the
evidence; do not decide them in code.

## Constraints for whoever implements it

- Deterministic TypeScript owns identity, eligibility, anchors, and ranking (`AGENTS.md`).
  Model output never enters this work.
- Never invent a TCGplayer product id, group id, or release fact. Product ids enter runtime
  only through the seeds after a human approves the exact claim
  (`docs/card-identity-research-policy.md`). `output/` stays disconnected from runtime.
- The silence rule's scope is fixed: retail numbers only (`OP`, `ST`, `EB`, `PRB`), after
  every veto, proves the base and never an alt, proves nothing among promos. Widening it is
  a founder decision.
- TDD. Every behavior change starts as a failing test from a real title or product name.
  Regenerate the abstention ledger (`npm run review:one-piece-alignment`) whenever the
  classifier changes, and commit it.
- Hermetic tests only: injected fetchers, no credentials, no network. Live measurement is a
  separate, reported step.
- Full gate before handoff: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run build`. UI changes: EN and 中文 desktop plus mobile captures.
- `PROGRESS.md` stays under 300 lines; update WS-IDENTITY and the TASK-INDEX row with
  commit hashes, and correct any figure this work makes stale.

## Risks

- Over-modeling. The taxonomy is not perfectly orthogonal ("SP CARD" is rarity and class;
  some `_r` reprints carry new art). Let the completeness test surface those as "unknown"
  rather than forcing a fit; that is information.
- Regression for no visible gain. The engine is at 0/0 today. The audit is the defense: run
  it after every consumer move, and the kill criterion is explicit.
- Scope creep into image proof. The four surviving buy-accuracy misses are text that is
  correct or actively lying; no taxonomy work moves them. Do not let this plan absorb
  D-OP-IMAGE-PROOF.

## Handoff prompt

> You are working in the TCGlens repository (`TCGpal`) on the One Piece exact-print track.
> Read, in order: `AGENTS.md`; `docs/card-identity-research-policy.md`; `PROGRESS.md`
> sections BOOTSTRAP, TASK-INDEX, and WS-IDENTITY; this plan
> (`docs/plan-one-piece-taxonomy-2026-09-05.md`) in full; then
> `src/lib/comparison/print-fidelity.ts`, `src/lib/comparison/one-piece-base-print.test.ts`,
> `src/lib/testing/one-piece-alignment.ts`, `src/lib/comparison/one-piece-alignment.test.ts`,
> `src/lib/external/one-piece-print-metadata.ts`, `src/lib/external/one-piece-catalog.ts`,
> `src/lib/comparison/crosswalk.ts`, and `docs/one-piece-alignment-audit-2026-09-05.md`.
>
> The state you inherit: the exact-print classifier is at 0 substitutions and 0
> self-rejections across all 4,571 One Piece prints, enforced by
> `npm run test` (`one-piece-alignment.test.ts`); 656 of the 746 EB01–EB04 / PRB / promo /
> flagship prints accept their own careful listing; 90 abstain honestly. Do not rewrite the
> classifier. The problem is that its vocabulary — what "SP", "alt", "TR", "Winner Pack",
> "the best" mean — is duplicated across four files (table in this plan) and drifts; the
> Treasure Rare substitution in `794e385` was exactly that drift.
>
> Your goal, in phases, each phase green on the full gate (`npm run lint`, `npm run
> typecheck`, `npm run test`, `npm run build`) before the next begins:
>
> **Phase 0.** Produce the familiarity artifacts, no behavior change: a catalog census
> (`docs/one-piece-catalog-census.md` + a test pinning its numbers from the generated
> catalog); a ~150-line taxonomy doc (`docs/one-piece-print-taxonomy.md`) that answers the
> questions listed in this plan; the seller and TCGplayer lexicons as data, mined from
> `src/lib/comparison/one-piece-unsafe-corpus.json`, the adjudication sheets, and
> `output/one-piece-exact-print-metadata.json`, each phrase tagged with what it names and
> tested to appear in a real corpus; a failure-taxonomy section from WS-IDENTITY.
>
> **Phase 1.** A completeness test: every distinct rarity, variant-label stem, and
> release-name pattern in the catalog maps to a known artwork class, treatment, and release
> channel, or the test fails naming the value. Prove a synthetic new rarity fails it.
>
> **Phase 2.** One data-first module `src/lib/external/one-piece-taxonomy.ts` owning the
> enumerations, the single catalog-field → class/treatment/channel derivation, and both
> lexicons. Move each consumer in the plan's table onto it one at a time, run the alignment
> audit after each move, delete the duplicate. Success: audit at or above 656 / 90 / 0 / 0
> on the target families and 0 / 0 catalog-wide after every move; no class-word regex
> outside the module. Kill: any audit number moves the wrong way unexplained, or two
> sessions elapse — stop, keep Phase 1, leave the rest.
>
> **Phase 3.** Only after Phase 2: (1) a group-alias matcher in `crosswalk.ts` so PRB and
> promo prints can anchor — TCGplayer files them under "Premium Booster -The Best-" and "One
> Piece Promotion Cards"; the classifier must pick exactly one credible product from the
> product-name parenthetical and abstain otherwise; hermetic tests with the ledger's real
> names; not merged without a live `npm run measure:market-anchor` run; (2) picker labels
> derived from the taxonomy instead of "Alternate Art (P1)", with EN/中文 desktop and mobile
> captures; (3) an above-market ceiling as a review disposition where an anchor exists.
>
> **Phase 4.** With credentials, run and report: `npm run measure:buy-accuracy`,
> `npm run measure:market-anchor`, a pairwise official-image comparison of the 629 twin
> prints, and one ePID probe. Put the founder decisions in this plan to the founder with
> evidence; do not decide them in code.
>
> Constraints you may not relax: deterministic TypeScript owns identity and ranking; never
> invent a TCGplayer id or release fact — product ids reach runtime only through the seeds
> after human approval; the silence rule stays retail-only, post-veto, base-only; TDD from
> real titles; hermetic tests, no network; regenerate and commit the abstention ledger
> whenever the classifier changes; keep `PROGRESS.md` under 300 lines and correct any figure
> you make stale, with commit hashes. Report what you could not verify, and why, rather than
> guessing.
