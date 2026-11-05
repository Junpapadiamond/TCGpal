# One Piece search reliability repair

November 4, 2026, New York. The founder reported that manual searches found the correct card while automatic comparisons did not, using Gift Collection Chopper as an example, and requested broader reliability rather than a one-card patch.

## Reproduction and shared fixes

The supplied receipt selected the correct `ST01-006_p3` (Gift Collection 2023), but all 44 eBay rows were ineligible. Three NM listings explicitly named that release. The matching code interpreted eBay's generic `Set: Promo Cards` category as a conflicting release. A one-field frozen replay isolated that cause; the unrelated convention field was not the cause.

Generic promotion categories no longer veto a promotional print when its full selected release is explicitly present. They do not establish identity. Specific sibling releases, treatments, language, printed stats, cost and product exclusions still apply. A property test checks all catalogued promotional families against their own and sibling evidence, including the added generic category.

Additional shared repairs:

- One Piece OP/ST/EB/PRB/P prefixes belong to one numbering scheme: a different prefix is a conflicting card, not an unrelated number to ignore.
- Exact name tokens rank above name prefixes, so Chopper does not lose to Chopperman.
- Gift Collection release phrases and years survive query parsing and identity filtering. A nonexistent requested year returns no match rather than another release.
- Explicit `4x`, `x4`, `4 x` and `10×` lots cannot enter single-card recommendations or inspect leads. A fresh 13-card production sample exposed this omission on Ace.
- Identity/report cache revisions change, and receipts now carry the matching-rules revision. Old-rule receipts return an explicit unavailable/re-search state rather than replaying the wrong result.

Frozen replay of the original 44 rows changes eligible count **0 → 3**, without fetching new inventory: pre-tax totals $240, $305.49 and $363.78 at the original observation time. This is regression evidence, not a claim about current availability or artwork authenticity. The market anchor and cost gates were not relaxed.

## Market choices and account safety

The buyer can select All first or individual markets. The server validates and normalizes the selection, filters the actual provider fan-out, skips eBay Catalog when eBay is deselected, and isolates report/latest-snapshot cache scopes. Single-market remains eBay-only. View/language changes do not acquire data. Results offer Change markets, with a separate explicit Search action and Cancel.

Fanatics Collect, Cardmarket and CardTrader are visible as pending choices/manual destinations. No new scraping adapter or automatic offer source is activated. CardTrader registration and its official marketplace API application were completed; approval is pending. See [source review](marketplace-expansion-review-2026-11-04.md) for official access, Actor ratings/tariffs, the Apify cancellation repair and actual configuration evidence.

## Decision and limits

The strongest case for broader matching is recovering real supply already returned by the official source. Two objections are false sibling matches from a broad category and treating a successful response as proof of correct artwork. The chosen repair removes the observed category contradiction only with selected-release evidence and retains adversarial family tests. Codex owns implementation and verification; founder review date is November 11, 2026. Kill on any newly accepted sibling or cost/exclusion bypass.

The full catalog audit covers 4,742 prints and retains its existing unknowns. It is not proof that every listing photo matches. The fresh 13-card run produced 11 Best Buy, one Inspect First and one abstention before this release; those are outcome counts, **not accuracy**. Direct page review found an Ace listing whose title and specifics say OP07-119 (cost 10/power 10000) while its photo visibly shows a different card (cost 5/power 6000). No static item denylist was added. The separate [photo-identity research](one-piece-photo-identity-research-2026-11-04.md) records the bounded experiment and promotion criteria. Neither One Piece nor Pokémon has a population accuracy guarantee.

## Verification

Behavior regressions were observed failing before implementation. The full release suite passed 2,147 tests with five optional live checks skipped; lint, typecheck, catalog check and production build passed. Two receipt test fixtures were subsequently updated for the new revision field; their focused suite passed and the build/typecheck passed again. Final UI and deployment evidence is recorded in PROGRESS.

Local synthetic browser checks must not be reported as live acquisition. The new market selection and account-pool tests make no paid provider calls. No ledger, ceiling, token pool or production credential was reset or expanded. Graphify CLI is unavailable in this Windows workspace; the existing AST graph was used for navigation, and no regenerated graph is claimed.
