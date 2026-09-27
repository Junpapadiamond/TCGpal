# Comparison trust fixes — September 26, 2026

## Observed production behavior

- The query parser already has optional AI assistance for ambiguous free text. Structured card queries and short names usually take the deterministic path. Seller condition normalization is deterministic; the model does not decide eligibility, costs or winners.
- The production AI health check reported provider `openai`, with primary and cheap roles configured as `gpt-5.6-luna`; both probes succeeded. Vercel has a custom `OPENAI_BASE_URL` secret. This proves an OpenAI-compatible configuration, not the upstream model vendor or exact gateway URL. The separate allocator configuration is not used by the current comparison fan-out; its `gpt-5.4` fallback probe failed with model unavailable.
- One real `Charizard 4/102`, NM, Base Set comparison returned 50 eBay rows and no eligible listing. Thirty-nine rows had the price-floor issue (reasons overlap). Seven claimed NM; none passed all gates. Three higher-price rows ($498, $499 and $600) lacked condition evidence. Two titles containing `120 HP` were incorrectly read as Heavily Played.
- Whatnot returned `Cross-market pilot budget reached; this source is paused.` This is an exhausted allowance, not proof of a provider outage. The original shared 20-start counter remains unchanged.
- Mercari remains off after the September 23 authorized test returned HTTP 403 and no rows. Having a production credential does not establish working access. No new paid test or allowance reset was performed.
- ZIP tax was working in the founder's existing Giratina report: $745 item/free shipping + $49.62 estimated tax = $794.62. Estimates use a state average; incomplete cost inputs and unrecognized ZIPs can still yield pre-tax totals.

## Decision and bounded test

The founder's underlying goal is useful coverage and explanations that deserve trust. The strongest case for LLM seller parsing is recovering clear claims written in unusual language. Two objections: a model can turn sales language into an unsupported condition claim, and parsing cannot repair inaccessible sources or missing evidence. A zero-winner search alone does not establish a parser recall problem.

Decision: fix demonstrated deterministic parsing errors, prioritize useful detail lookups within the existing budget, and improve the existing report-grounded question panel. Preserve the exclusion floor, print proof, complete-cost requirements and all paid acquisition limits.

- **Smallest test:** regressions for `120 HP`, condition ranges, explicit played/damaged claims and negation; a bounded shortlist test where unknown-condition candidates precede already excluded rows; a same-card production comparison after deployment.
- **Success:** no weakened eligibility gate; unknown fields stay unknown; all summaries remain in the report; the detail budget is unchanged; Q&A has useful prompts and truthful attribution; source pauses are explicit. A live winner is not required for success.
- **Kill criteria:** known mismatch/novelty/incomplete-cost candidate becomes a winner, a condition claim is invented, or paid acquisition exceeds the existing authorization.
- **Owner:** Codex for implementation and checks; founder for source access and any additional paid allowance. Review: September 27, 2026, using the recorded before/after sample. Population-level recall and exact-print accuracy still need human adjudication.

## Changes

- eBay condition parsing separates structured condition from title text. Bare title `120 HP` stays Unknown; structured `HP` and explicit `(HP)` remain Heavily Played. Ranges retain the worse stated condition, and explicit damage is not upgraded to NM.
- Detail lookup priority now favors candidates with recoverable missing evidence over known condition, language, product and price conflicts. All fetched summaries still reach final deterministic ranking. The default remains 12 detail lookups.
- The question panel offers three report questions, labels model-backed answers with the configured model, and labels local answers as rule based. Suggested report questions clear a previously targeted listing. Exclusions and missing evidence remain answerable without AI; Chinese prompts carry the requested language to the server.
- The model receives sanitized report evidence, including seller/evidence fields and an exclusion summary over all candidates. It cannot author its own attribution metadata. Existing unsupported-claim rejection and deterministic fallback remain in force.
- Source status copy distinguishes an exhausted pilot allowance, a configuration pause, a temporary failure and a manual-only source. No raw provider error is added to buyer copy.
- Current product copy, metadata, receipts and the logo use TCGlens. Legacy paths and historical artifacts keep their names.
- The tax field explains ZIP-based state-average estimates and pre-tax fallback. Tax rates and calculation rules were not changed.

## Verification

- Test-first regressions exercised parsing, detail prioritization, question content, attribution and source-pause copy. The Bubble Mew regression still spans enriched and unenriched listings and checks independent shipping, condition and collector-number exclusions.
- Built-in browser: English and Chinese desktop, Chinese 390px mobile; Q&A prompts and local answers; $100 item + $10 shipping + $9.37 ZIP tax = $119.37.
- Five sequential fixture searches in one session: Pikachu 58/102 → Edit Charizard 4/102 → New Mew ex 232/091 → Edit Luffy ST01-001 → New Nami ST01-007, selecting Nami's Base artwork from six versions. The fixture's One Piece titles lack character names and correctly remain inspect-only. These are visibly synthetic facts, not live acquisition evidence.
- Local screenshots are in the Codex visualization directory for September 26. Raw live report and local logs remain uncommitted under `output/trust-fixes/`.
- Graphify's CLI is absent on this Windows checkout. Existing graph/source navigation was used; graph regeneration is not claimed.
- Release gate and deployment evidence are indexed in `PROGRESS.md` → `VERIFICATION`.

## First production verification

`f016616` reached READY on [lenstcg.com](https://lenstcg.com) in 82 seconds (`dpl_6HrcUg5gtG1k1STQVraxutKtMgDS`). The scoped warning/error/fatal log scan was empty at verification time.

The same Charizard request completed in 3.69 seconds: 50 eBay rows, one eligible, 38 price-floor issues, Whatnot still paused and Mercari still manual only. Forty-seven candidate IDs overlapped with the earlier sample. The sole eligible row was newly returned, so the winner does not establish a causal recall improvement. Its seller-stated NM, $1,200 item + $8.15 shipping + $102.93 estimated tax = $1,311.08 were present; the UI still said **Consider waiting**, with item price 27% above the $944.53 reference.

The new detail priority established Lightly Played on the previously unknown $499 and $600 rows; both correctly stayed excluded from the NM request. Correcting `120 HP` to Unknown by itself never makes a listing eligible.

The production Q&A returned an accurate rule-based exclusion answer, with the fallback visibly labeled. Its 12,085 ms request duration matched the model deadline despite successful model health probes. Follow-up hypothesis: low reasoning effort can fit a short evidence explanation into the unchanged 12-second deadline. A failing-then-passing request test verifies the setting; no timeout, model, source, price or ranking boundary was expanded. One follow-up live question will test model-backed completion; a timeout still returns deterministic evidence. Review owner: Codex, September 26.
