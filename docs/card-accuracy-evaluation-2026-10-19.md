# Card accuracy evaluation and AI diagnosis — October 19, 2026

## Decision and scope

The founder wants working AI explanations, an agent to evaluate card-search accuracy, and clarification of the already integrated Apify source. Keep the existing model gateway, as explicitly confirmed on October 19. No provider, credential, model, allowance or source-routing changes are part of this work.

The strongest case for an evaluation agent is a repeatable feedback loop: collect failures, replay fixed examples, separate wrong-print acceptance from conservative abstention, and propose small regression tests. Two objections govern the implementation: a model that creates and grades its own answers cannot establish accuracy, and more recommendations can mask more wrong-print recommendations. Search coverage, listing identity, eligibility and actual buy-link accuracy are different measurements.

Decision: add a bounded offline evaluation assistant to the established TypeScript/AI stack. It replays production normalization and exact-print gates, reports disagreements against explicit labels, and optionally makes one existing-provider call to propose failure hypotheses. It cannot edit labels, change production rules, browse marketplaces, spend Apify credits, or automatically publish changes. Human-reviewed labels require a reviewer, review time, rationale and observed source evidence; pending and synthetic examples remain separate.

Smallest test: 32 fixed synthetic examples across four card families, with whole families isolated into tuning and held-out splits, plus import of a real comparison report as an unscored review queue. Success: repeatable results, no network during default replay, no false identity accepts or unsafe eligibility in the seed set, visible failures, and no AI influence on scores. Kill criteria: cross-split family leakage, changing gold to agree with the implementation, pending examples counted as accurate, hidden provider failure, or incomplete-cost recommendations. Codex owns the harness; the founder owns human gold adjudication. Review date: October 26, 2026; this is a recorded date, not a scheduled automation.

## What the live checks established

On October 19 around 20:53 UTC, the existing production `/api/ai/health` reported:

- Primary and critic: `gpt-5.6-luna`, HTTP 500, `do_request_failed` from the existing OpenAI-compatible gateway.
- Allocator: `gpt-5.5`, HTTP 503, service unavailable; its first fallback `gpt-5.4` reported HTTP 503 / `model_not_found` for the configured group.
- An actual `/api/agent/listing-compare/explain` call returned HTTP 200 with `usedAi=false`. The UI-to-route-to-provider path exists; model failure falls back to the deterministic answer. HTTP 200 on this route does not prove a model answered.
- The local environment uses a different Anthropic-compatible configuration. A bounded request returned HTTP 200 with empty text and zero output tokens. This is a separate upstream problem, not evidence of the production cause.

No credential values or raw provider bodies are committed. The fix adds a fixed `fallbackReason` category and safe operational events; it also keeps model/fallback attribution server-owned. Anthropic health now rejects an empty HTTP-200 response instead of reporting it healthy. These changes diagnose the outage; they do not repair the external gateway. The gateway operator must restore a working channel for the configured models. A real explanation with `usedAi=true` remains the recovery criterion.

One explicit production Giratina V 186/196 Cross Market request returned eBay 50, **Whatnot via Apify two**, Stomping Grounds three, and Mercari zero with `Soldgraph free allowance reached`. Whatnot remains review-only when shipping and buyer fees are missing. The latest application intentionally defaults to `marketScope=single`; a normal eBay-only search does not call Apify. The cross-market opt-in is already wired. Current account-pool authorization and controls are recorded in [the October 15 rollout](market-views-account-pool-2026-10-15.md). No counter read/reset or renewed allowance is claimed by this check.

## Run the evaluation assistant

```sh
# Offline tuning split; no credentials or provider calls.
npm run eval:cards

# Explicit sealed-family evaluation. Do not tune against this output.
npm run eval:cards -- --split held_out

# Full baseline, then compare the exact same dataset and split after a change.
npm run eval:cards -- --split all
npm run eval:cards -- --split all --baseline output/accuracy-eval/<run>/result.json

# Import a previously saved, server-validated non-demo comparison report.
# This does NOT make a new marketplace search. Every label starts pending.
npm run eval:cards -- --import-report <local-report.json>

# Replay an adjudicated or pending local dataset; optional single AI triage call.
npm run eval:cards -- --dataset output/accuracy-eval/<run>/pending-dataset.json --ai
```

Without npm on PATH, the equivalent entrypoint is `node scripts/evaluate-card-accuracy.mjs`. Outputs are timestamped under ignored `output/accuracy-eval/`: `result.json`, `report.md`, and, for imports, `pending-dataset.json`. Results record commit, dataset hash, split, per-game counts, identity false accepts, false rejects/abstentions, unsafe eligibility, human-reviewed agreement, and every failed/pending case. Baseline comparisons refuse a different dataset or split. Exit 1 means a label disagreement, regression or empty selected split; an unavailable AI analyst does not overwrite deterministic results.

The checked-in seed is `src/lib/evaluation/card-accuracy-dataset.json`. Cases preserve explicit card identity, listing observations, buyer condition, market reference, provenance and label status. Imported observations strip buyer ZIP and listing image URLs; source URLs are retained locally for review. Do not commit live seller identifiers or raw reports. The optional AI call receives at most 12 cases, no URLs, images, seller ids, ZIP or credentials, and a 12-second request budget. Its hypotheses remain provisional, with unknown case ids rejected. It never supplies gold labels.

To promote a local case, inspect its source and exact catalog artwork, set `labelStatus` to `human_reviewed`, fill `expected.identity` (`accept`, `abstain`, `reject`) and `expected.eligible`, and add `review.reviewer`, `review.reviewedAt`, `review.rationale`. Keep unknown availability/charges unknown. Split siblings together. Build a new held-out cohort before another tuning cycle; the initial four-family seed is a regression starter, not a representative sample of buyer demand.

## Baseline and unresolved work

- Synthetic expectation agreement: **31/32** overall; tuning **15/16**, held-out **16/16**. Zero false identity accepts and zero unsafe eligible rows. These are test-case results, **not 96.9% live search accuracy**.
- One preserved discrepancy: selected Luffy `ST01-001` versus a title naming Luffy `OP01-003` returns `unknown` rather than `mismatch`. It is still excluded. The collector-number conflict helper only compares matching numbering schemes, so crossing ST/OP prefixes is conservative abstention. This is a classification-quality follow-up, not a wrong recommendation; no ranking change or relabeling was used to erase the failure.
- The real report yielded **55 pending observations** (two Whatnot included). Human-reviewed count is **zero** and its accuracy is `null`. Import does not independently verify stock, artwork or seller claims.
- Replaying the same full baseline returned no regressions or recoveries. One optional local AI triage call returned `unavailable`; the deterministic failure queue remained intact.
- Existing retrieval and buy-link instruments remain available: `measure:print-recall` and `measure:buy-accuracy`. The new harness evaluates observed listing facts; it does not measure omitted inventory, catalog resolution, current availability, or cheapest-market recall. Those require separately bounded live samples and human adjudication.

## Verification

Test-first coverage includes safe model-failure categories, actual model-answer attribution, empty-response health failure, family split isolation, duplicate ids, human-label evidence requirements, pending-label denominators, invalid report imports, and AI finding isolation. Full suite: 1,868 passed, five skipped. Lint, typecheck, metadata audit and production build passed. Application commit d76c209 reached READY as deployment dpl_ExX7LACgb853TDGadmVudGwY7rog, aliased to lenstcg.com. A deployed Why-not-this-listing call returned HTTP 200, usedAi=false and fallbackReason=provider_unavailable. The built-in browser also completed a normal single-market Giratina search and the top-pick Q&A click; its rule-fallback label remained visible. Gateway recovery is not claimed. No UI or ranking behavior changed, so visual layout QA and additional paid provider searches are unnecessary for this change. Graphify CLI is unavailable on this Windows host; the graph could not be regenerated.
