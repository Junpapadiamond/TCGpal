# Exact-print recall baseline — 2026-08-10

Phase 0 of `docs/plan-retrieval-agent-2026-08-10.md`. Reproduce with
`npm run measure:print-recall` (defaults to production; set
`TARGET=http://localhost:3000` for local). Card set:
`src/lib/testing/print-recall-cards.ts`.

## Question

Before building a retrieval agent, how often does the comparison already end with
a recommendation? Exact-print recall is the share of the eval set whose report
ends with `outcome === "best_buy"`. Phase 2 re-runs this identically, and the
difference is the agent's entire case.

## Method

30 committed cards — 18 Pokémon, 12 One Piece; 20 tuning, 10 held out; base and
alternate prints; Base Set through Scarlet & Violet. Each ran through
`POST /api/agent/listing-compare` with a fixed buyer context (US, 10001, Near
Mint), paced at 31s to stay under the route's 20-requests-per-10-minutes limit.
Where a collector number carries sibling prints, the eval pins the exact print by
`confirmedCardId`, so this measures retrieval and not which identity row sorted
first. 16m 16s wall clock, 2.5s median per card, no errors.

## Headline

**20 of 30 — 66.7%.** Pokémon **18/18 (100%)**. One Piece **2/12 (16.7%)**.

Every one of the 10 misses is a One Piece **base** print. Both One Piece
successes are alternate-art requests. There is no third pattern.

| | recall |
|---|---|
| tuning | 13/20 (65.0%) |
| held out | 7/10 (70.0%) |
| pokemon | 18/18 (100%) |
| onePiece | 2/12 (16.7%) |
| base print | 8/18 (44.4%) |
| alternate print | 12/12 (100%) |

Median eligible per card 3.5, median print-proven 43.5, median found 50 (the
eBay Browse page size, so "found 50" means the first page was full).

## Results

"Proven" is candidates whose `printMatch` is `exact` or `compatible`.

| Card | Split | Print | Outcome | Found | Proven | Eligible | Top exclusions |
|---|---|---|---|---:|---:|---:|---|
| Nami OP01-016 | tuning | base | inspect_first | 50 | 0 | 0 | identity 50, condition 30, language 14 |
| Roronoa Zoro OP06-118 | tuning | base | inspect_first | 50 | 0 | 0 | identity 50, condition 33, product 19 |
| Monkey.D.Luffy OP05-119 | tuning | base | inspect_first | 50 | 0 | 0 | identity 50, condition 32, product 19 |
| Monkey.D.Luffy ST01-001 | tuning | base | inspect_first | 50 | 0 | 0 | identity 50, condition 31, product 16 |
| Roronoa Zoro OP01-001 | tuning | base | inspect_first | 50 | 0 | 0 | identity 50, condition 35, product 24 |
| Portgas.D.Ace OP02-013 (Alt Art P1) | tuning | alternate | best_buy | 33 | 24 | 1 | condition 18, language 13, product 10 |
| Trafalgar Law OP05-069 | tuning | base | inspect_first | 50 | 0 | 0 | identity 50, condition 27, product 11 |
| Shanks OP09-001 | tuning | base | inspect_first | 50 | 0 | 0 | identity 50, condition 34, product 19 |
| Donquixote Rosinante OP04-119 | held out | base | inspect_first | 50 | 0 | 0 | identity 50, condition 30, language 12 |
| Portgas.D.Ace OP07-119 (Secret Rare Alt P1) | held out | alternate | best_buy | 39 | 22 | 2 | condition 24, language 19, identity 17 |
| Tony Tony.Chopper EB01-006 | held out | base | inspect_first | 50 | 0 | 0 | identity 50, condition 31, language 18 |
| Charlotte Linlin OP03-114 | held out | base | inspect_first | 50 | 0 | 0 | identity 50, condition 27, product 9 |
| Charizard 4/102 | tuning | base | best_buy | 50 | 48 | 5 | condition 44, product 7, identity 2 |
| Pikachu 58/102 | tuning | base | best_buy | 50 | 48 | 5 | condition 45, identity 2, language 2 |
| Machamp 8/102 | tuning | base | best_buy | 50 | 49 | 3 | condition 47, product 5, language 2 |
| Venusaur 15/102 | tuning | base | best_buy | 50 | 49 | 2 | condition 48, identity 1 |
| Blastoise 2/102 | held out | base | best_buy | 50 | 42 | 4 | condition 44, identity 8, product 2 |
| Alakazam 1/102 | held out | base | best_buy | 50 | 47 | 2 | condition 47, identity 3, language 1 |
| Umbreon VMAX 215/203 | tuning | alternate | best_buy | 50 | 45 | 7 | condition 35, product 23, identity 5 |
| Rayquaza VMAX 218/203 | tuning | alternate | best_buy | 50 | 48 | 14 | condition 34, product 20, price 8 |
| Giratina V 186/196 | tuning | alternate | best_buy | 50 | 47 | 10 | condition 34, product 17, price 8 |
| Giratina V 130/196 | tuning | base | best_buy | 50 | 50 | 38 | condition 12 |
| Charizard V 154/172 | tuning | alternate | best_buy | 50 | 50 | 15 | condition 34, product 9, price 1 |
| Mewtwo & Mew-GX 222/236 | tuning | alternate | best_buy | 50 | 18 | 5 | condition 40, identity 32, price 10 |
| Charizard ex 223/197 | tuning | alternate | best_buy | 50 | 49 | 13 | condition 36, product 2, identity 1 |
| Charizard ex 006/165 | tuning | base | best_buy | 50 | 41 | 24 | condition 19, identity 9, language 5 |
| Lugia V 186/195 | held out | alternate | best_buy | 50 | 49 | 8 | condition 39, product 10, price 5 |
| Mew ex 205/165 | held out | alternate | best_buy | 50 | 50 | 10 | condition 33, product 16, language 3 |
| Gardevoir ex 245/198 | held out | alternate | best_buy | 50 | 50 | 20 | condition 28, product 5 |
| Pikachu 173/165 | held out | alternate | best_buy | 50 | 50 | 11 | condition 26, language 20, price 16 |

No card errored, and no card failed identity resolution.

Pooled across 1,472 candidates: `compatible` 876, `unknown` 300, `mismatch` 296.
Pooled exclusion codes: `condition_unstated` 753, `identity_unverified` 300,
`identity_sibling_mismatch` 296, `excluded_product_type` 286, `not_raw_single`
238, `condition_below_requested` 232, `language_conflict` 171,
`title_condition_below_requested` 125, `price_far_below_market` 69,
`identity_low_confidence` 64, `identity_price_guard` 13, `shipping_unknown` 3.

## Findings

1. **Supply is not the problem.** Every failing card returned a full first page
   of 50 live listings. Nothing abstained for lack of inventory.

2. **A One Piece base print is unprovable from a plain listing title, by
   construction.** Across the 10 failing cards, **0 of 500 candidates** reached
   `compatible`. `classifyOnePiecePrintIdentity` in
   `src/lib/comparison/print-fidelity.ts` requires text that *uniquely singles
   out* the selected print among its siblings — because `OP01-016` is shared by
   eight prints, the number proves nothing on its own. A base print has no
   marker to name, so the absence of alt-art language yields `unknown`
   (`plain_family_listing_does_not_identify_print`), which
   `identity_unverified` then excludes. The Pokémon path
   (`classifyPokemonPrintIdentity`) has no such requirement, because `215/203`
   *is* print-unique: number + name is proof. Hence 100% versus 16.7%.

3. **`Monkey.D.Luffy ST01-001` isolates the mechanism.** That number has exactly
   one print in the catalog — no sibling to be confused with — and it still
   scored 50 found, 0 proven, 0 eligible. With one witness, the marker filter
   `owners.size < siblings.length` is `< 1`, which nothing can satisfy, so
   `evidenceSets` is empty and every row returns `unknown`. This is not
   ambiguity being handled conservatively; it is a card with no ambiguity
   failing anyway.

4. **`printMatch === "exact"` never occurs.** `print-fidelity.ts` emits only
   `compatible`, `unknown`, and `mismatch` — `exact` appears in the type and the
   schema but is never returned. The plan's proposed hard label
   `printMatch === "exact" && eligible` would therefore score zero on every card
   in every run. `outcome === "best_buy"` is the usable metric, and it is what
   this baseline reports.

5. **The dominant exclusion overall is condition, not identity.**
   `condition_unstated` (753) outranks every identity code. Even on the Pokémon
   cards, which all succeed, condition removes 12–48 of the 50 rows (44–48 on
   every vintage card). That is a separate ceiling on *how many* comparable
   listings a buyer sees, and nothing in this plan touches it.

6. **One Piece base prints have no market anchor.** All 10 failing cards
   returned `marketMid: null`, while both succeeding alternate prints had one
   ($60.57, $18.99). The crosswalk gap noted in
   `docs/market-anchor-calibration-2026-08-10.md` lines up exactly with the
   recall gap — worth checking whether one causes the other.

## What this means for the plan

Phase 1 proposes an agent that re-queries when the ranker rejects everything,
stopping when `eligible >= 1`. On the 10 cards that currently fail, **no query
can reach that stop condition**: every listing it could retrieve fails the same
print-proof rule regardless of which query found it. The agent would burn its
full step budget on all 10 and change recall by 0 points — below the plan's own
5-point kill threshold.

The measured blocker is a deterministic ranking rule, not a retrieval strategy.
The cheap falsifiable test is to try accepting *negative* evidence for One Piece:
exact collector number + card name + no sibling marker present ⇒ `compatible`
for the base print (and, separately, treat a single-witness number as proven).
That is a change in `print-fidelity.ts` with the same eval already built, and it
is testable in an afternoon against this baseline.

Two honest objections to running that test first:

- It weakens a guardrail that exists for a reason. Today's rule guarantees a
  recommendation never points at the wrong artwork; accepting silence as proof
  trades some of that certainty for coverage. It needs its own precision check
  (sample the newly-eligible rows and confirm the artwork by hand), not just a
  recall number.
- Retrieval may still matter *after* the rule is fixed. `Portgas.D.Ace
  OP02-013` returned only 33 rows and 1 eligible; that thinness is the shape of
  problem an agent could genuinely help with. The right order is to fix the
  proof rule, re-run this baseline, and see whether a retrieval gap remains.

## What changed because of this

Half of the recommended test shipped the same day: **single-witness numbers**.
When a One Piece collector number has exactly one catalogued print, the exact
number plus the card name is now proof, which is the standard the Pokémon path
already applies to a print-unique number. The artwork-class and treatment vetoes
still run first, so a listing claiming an alternate art, manga rare, or gold
treatment the number does not have is still a `mismatch`; only the requirement to
*name a distinguishing marker* is dropped, and only where there is nothing to
distinguish from.

This is the low-risk half. The harder half — accepting the *absence* of a sibling
marker as evidence of the base print on multi-print numbers — is unchanged and
still needs the manual precision sample described above.

Measured on a local server with the same eval:

| | before | after |
|---|---|---|
| `Monkey.D.Luffy ST01-001` | 0 proven, 0 eligible, `inspect_first` | 40 proven, 7 eligible, **`best_buy`** |
| One Piece recall | 2/12 (16.7%) | 3/12 (25.0%) |
| Overall recall | 20/30 (66.7%) | **21/30 (70.0%)** |

The other nine failing One Piece cards are unchanged at 0 proven — all of them
have siblings, so the new rule correctly does not reach them. Pokémon is
unchanged at 18/18; the edited branch is unreachable for Pokémon cards.

**70.0% understates the catalogue-wide effect.** 1,628 of 2,634 One Piece
collector numbers (61.8%) carry exactly one print, and the eval contains exactly
one of them — it over-sampled multi-print chase cards. Widening the One Piece
half with single-print commons is the next thing this eval needs.

Two caveats on the after-run, both checked rather than assumed:

- It ran on a dev server whose `.env.local` sets `COMPARISON_AGENT=1`. The
  allocator never appears in any `marketplace_search` trace across four sampled
  cards, and every search is attributed to the deterministic eBay Browse
  adapter — it is attempted, misses its deadline, and degrades silently, which is
  its designed behaviour. A fully clean re-measure would set `COMPARISON_AGENT=0`.
- Live eBay supply drifts between runs. `Charizard 4/102` read 48 proven on
  production and 17 in the after-run; an immediate A/B (unpatched production vs
  patched local, seconds apart) returned byte-identical results, confirming
  drift rather than regression.

Phase 1 is not started. This document is the artifact Phase 0 owed.

## Weaknesses in this eval

- **It cannot distinguish retrieval from ranking.** Recall moves when either
  changes. Phase 2 must read the `proven` and `found` columns alongside the
  headline, or a ranking fix will be credited to the agent.
- **Upstream identity flakiness is worth ~10 points.** The first run of this
  script scored 17/30 because the Pokémon TCG API returned 5xx for three cards,
  which never reached a marketplace search. The script now retries once and
  reports unresolved cards outside the recall denominator; without that, run
  variance is wider than the plan's ship threshold. The 66.7% above is from a
  run with zero unresolved cards.
- **A 15-minute comparison cache sits in front of this.** Re-running inside that
  window re-reads the same reports. Fine for reproducibility, misleading if
  treated as an independent sample.
- **12 One Piece cards is thin**, and 10 of them fail for one reason. Once the
  proof rule changes, that half of the set collapses to a single test case and
  should be widened.
- **Not measured:** marketplace API calls per comparison, which Phase 2 needs
  for its ≤3× budget. The script records per-card latency but has no visibility
  into calls made server-side.
