# Listing trust repair — November 3, 2026

Observed production receipts admitted `Giratina V 186/196 Rug` as an eligible raw single, and recommended a $799.99 Charizard with 18 feedback records and no returns against an October 15 inline market reference. These are observed failures, not estimates of marketplace fraud prevalence.

## Recommendation boundary

The founder's instinct is to protect buyers from a convincing price outrunning the evidence. A minimum evidence gate makes the recommendation consistent with that promise. Two objections matter: feedback counts and price thresholds do not estimate fraud probability, and a no-returns policy alone neither proves an unsafe seller nor describes all marketplace protections. Photo counts also do not verify photo content or physical condition.

Decision: trial a conservative, deterministic review gate for real offers with at least $500 in known pre-tax charges. Require at least 100 feedback records, 99% positive feedback, seller score 60, at least four seller photos and evidence score 50 before a recommendation. These are explicit product policy thresholds, not learned fraud probabilities. Below the gate retain the facts for inspection, withhold every buy lens and positive buy wording, and state the missing evidence. No-returns alone does not disqualify a listing. Unknown seller data remains unverified.

Smallest falsifiable test: replay the two reported receipts and anonymized boundary cases, including an established no-returns seller, genuine low-priced singles and incomplete-cost offers. Success: zero merchandise winners; zero gated high-value winners or buy wording; dated stale/unknown references never produce a bargain delta, price score or market floor. Kill criteria: genuine singles excluded by packing language, unknown fees becoming zero, any mismatch promoted or an unsupported safety claim. Owner: TCGlens maintainer. Review: November 10, 2026, using held-out real observations before relaxing any threshold.

## Freshness and old reports

Apply the existing 48-hour policy to every market source, including inline catalog fallback. Keep the old amount and its date as historical reference, but do not score, show a discount, or claim exact-market comparisons from stale, unknown or future-dated prices. Version the comparison contract and invalidate old report reuse; historical recommendations made under the broken rules must not reappear through receipts or cache.

## Presentation

Retain compact A. Condition-mismatched offers belong in a collapsed, neutral group. Source failures remain visible. Explain selection and exclusions using the actual report's counts, not claims about all eBay inventory. Keep official catalog art, including any source watermark; it is not seller-condition photography. Marketing suggestions do not authorize posting to communities.

## Base Set edition gap

Read-only source inspection on November 3: `https://tcgcsv.com/tcgplayer/3/groups` distinguishes Base Set (604) and Base Set (Shadowless) (1663); `https://tcgcsv.com/tcgplayer/3/604/products` includes ordinary Charizard (42382) and Black Dot Error (657516), both 004/102. The production receipt's `base1-4` identity contains no edition selection and no reviewed product id. The current crosswalk correctly abstains on the ambiguous products; falling back to an undifferentiated price does not repair that gap.

Conservative repair: Base catalog ids stay inspect-only with an explicit edition warning and no market comparison, even if a seller title names an edition. This does not curate or infer a new edition mapping. A future reviewed catalog expansion must expose the buyer's exact edition and separately validate its product mapping before these cards can win again. Generic Pokémon compact tags now say name/number match rather than implying full print authentication.

## Actual cross-market critical path

Production logs on November 3 show a 2,064 ms eBay request followed by cross requests of 2,944–4,082 ms; Whatnot occupied 2,891–3,915 ms and Mercari stopped at its existing pilot allowance. A separate AI explanation took 8,637 ms. These server durations do not include browser rendering or network transit and are not an overall p95 claim.

The frontend was serializing primary acquisition before cross acquisition. Start the already-authorized cross request first, letting the existing server fan-out overlap all providers, then obtain the independent single-market view via its existing eBay source cache. Do not merge report cache scopes or add a paid retry. Retain completed cross evidence if the single-view transport fails; do not reacquire eBay automatically when cross already reported its failure.

Strongest case: removes the extra primary acquisition from the cross critical path. Objections: a failed eBay source no longer prevents an authorized cross provider from starting, and a missing source-cache write can require an extra free eBay read for the separate view. The former is consistent with isolated parallel providers; the latter is bounded by the existing adapter. Falsifiable test: first comparison request is cross, exactly one cross request even on HTTP failure, single-view request follows completion, language/view changes trigger no acquisition. Owner/review date are the same as above.

## Verification

Release gate: lint, TypeScript, metadata audit, webpack production build and 1,990 tests pass (five optional live checks skipped). The six-card UI test has a 15-second test-runner budget under parallel suite load; this is not a product timeout change.

Offline replay of both actual 50-row receipts excludes the Giratina rug and retains other eligible Giratina lens choices; the Charizard receipt has no buy lenses, no usable anchor and cannot promote the 18-feedback offer. Raw receipts remain ignored local QA evidence. Replay also caught a score-range regression from review-only prices entering an eligible-only price interval; a failing boundary test now covers it and review rows stay outside that calculation.

The Windows environment has neither the documented Graphify executable nor the plugin-creator validator script (including a search of installed skill/plugin roots). No graph refresh or plugin-validator success is claimed. MCP capability/projection tests cover comparison contract v6; the plugin guidance is aligned with that contract.

Built-in browser QA used the real development UI and then the production build through the visibly labeled synthetic-provider harness. Five sequential searches completed in one session: Giratina cross, Luffy via Edit plus artwork confirmation, Charizard via New Search plus name-only gallery and 4/102 filter, Zoro via Edit plus artwork confirmation, and Pikachu 25/165 via New Search. English/Chinese desktop and 390px mobile views passed; photo enlargement/close worked, no broken images or console errors were observed. The cross request preceded the separate single view, with one cross acquisition; language and view toggles did not acquire listings. Screenshots remain local under `output/qa/trust-repair-2026-11-03/` and are synthetic evidence, not live inventory.

## Production verification

- `07e08f5` is READY in `dpl_343321KoUc8z88ZtzQf8qJxV44Be`, aliased to `lenstcg.com`. Public capabilities report comparison contract v6. The old reported Giratina receipt returns an explicit 404 explaining the older rules and requesting a fresh search.
- Fresh Giratina Any-condition cross: 56 source rows, 36 excluded and 16 review-only; the rug remains in the source evidence but `eligible=false` and never appears as an offer. The separate 50-row eBay receipt retains four supported lenses.
- Cross server duration 4,935 ms; eBay 2,274 ms overlapped Whatnot 4,751 ms (Actor 4,588 ms), Stomping Grounds 775 ms and Mercari 141 ms. The subsequent independent single view took 110 ms with eBay cache reuse at 22 ms. No duplicate paid request or second eBay acquisition occurred. Browser/cold-start/network time is additional; this is one observed run, not p95 or a universal speed guarantee.
- Mercari stopped at the existing pilot-allowance gate, before an Actor start. No quota, credential scope or provider access was expanded.
- Fresh Charizard 4/102 NM shows 50 found / 47 excluded / three review-only, the original $799.99 and 18-feedback offer as an inspect lead, an explicit unresolved-edition warning, no buy lens, and no October 15 discount. The historical date remains labeled not used for comparison.
- High-value Charizard follow-up returned the deterministic inspect-first explanation in 149 ms, with no provider model name or contradictory buy recommendation. Production English/Chinese desktop and 390px mobile screenshots passed; no broken listing images, horizontal overflow or browser console errors were observed.
- The live share-image request exposed a missing explicit flex layout in the new count row. A regression reproduced the exact renderer error, then passed by rendering real PNG bytes after the fix. The follow-up passes lint, typecheck, 1,991 tests (five optional skips), metadata audit and production build. Follow-up 3b5cfc9 is READY in dpl_GaZX7t3D4MyJWiKMT5dxbYQqc5bx and aliased to lenstcg.com; the built-in browser renders the actual Charizard 1200×630 PNG with 50 checked / 47 excluded, Inspect first, and No comparable buy.
