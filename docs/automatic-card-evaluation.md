# Automatic card evaluation

The founder requested automatic execution on October 19, 2026. This extends the existing evaluation harness, not the public application or the paid marketplace pilot.

## Schedule and boundaries

- **GitHub CI:** on every main push, pull request and manual workflow dispatch, run evaluation boundary tests and replay the 87 frozen real observations. No provider keys, live searches or model calls. Upload the compact report for 14 days and include it in the job summary.
- **Daily local heartbeat:** at 09:00 local time in this Codex chat, run `node scripts/run-card-evaluation.mjs --live --ai` from the existing project. This is a Codex desktop automation: it depends on the local computer/app being available; it is not a 24/7 server job. Missed days are not backfilled with extra searches.
- **Per UTC day:** at most two comparison requests, one Pokémon and one One Piece, rotating all twelve cards in six days. Fixed target `https://lenstcg.com`, fixed single/eBay scope, 31 seconds between requests, 60 seconds per request and no automatic retries. Each request may use the existing bounded ten-summary recall probe. No Apify allowance is used.
- **AI:** at most one existing-provider review, at most six observations per tuning card, prioritizing returned lens winners. Held-out observations are stored but never sent to the optimization model. The child process has a 75-second total limit; a failed call is not retried. Existing strong-model routing is reused. Optional `CARD_EVAL_MODELS` or `--models` supplies up to three compatible strong models; default uses the configured provider model. Haiku/mini/nano/luna remain rejected. Availability/schema validity does not measure judgment quality.
- **Reporting:** retain observations, source failures, missing costs, model hypotheses and source timestamps locally. Notify the founder only about new actionable findings, regressions, meaningful recoveries or execution failures. Repeated unchanged findings should stay quiet. AI findings never become gold labels or automatically executed code.

## Decision

The strongest case is catching regressions and recurring wrong-print/price misses before a buyer reports them. The two main objections are spending/duplicated requests and self-grading or training against held-out answers. A third is mistaking a provider outage for an accuracy regression. The small falsifiable experiment is one six-day rotation with separate offline regressions, live-source status and provisional AI suggestions.

Owner: Codex executes and records the bounded runs; the founder owns final artwork/gold adjudication. Review: October 26, 2026. Success: each available daily batch respects its cap, both games are covered, frozen passing cases never silently regress, and at least one useful new finding is traceable to source evidence. Stop the affected live run on lock/corrupt state, unknown cohort, invalid labels, new offline regression, deadline, or source failure; record partial evidence rather than silently retry. Any request outside the fixed scope or any held-out model exposure invalidates the experiment and requires repair before resuming. No demonstrated coverage gain is claimed just from running on a schedule.

## Durable allowance and baseline

`output/accuracy-eval/automation/daily/YYYY-MM-DD/reservation.json` reserves the complete two-search/one-model allowance before acquisition. A second invocation that day skips acquisition, even if the first failed. `running.lock` excludes concurrent runs across midnight; an abandoned lock requires checking that no worker remains before removing only that lock. Never delete or refund daily reservation directories. This is a single-host local allowance, not a distributed budget; do not install a second live scheduler on another machine.

`src/lib/evaluation/automation-baseline.json` freezes the post-fix case hashes, row ids and outputs. It records the Base Set 2 defect as a known failure, not a pass. Changed labels/cohorts require explicit baseline review; the runner never refreshes its own answer key. A previously passing row failing, or a known failure changing its failing identity/eligibility outcome, fails CI. Recoveries are separately reported. Six unreviewed Ace cases remain pending.

The report lives at `output/accuracy-eval/automation/latest.md` and `.json`; actual daily runs also retain their own copy. Duplicate wakeups do not overwrite the day's findings. Raw observations stay ignored and are not uploaded to GitHub. CI artifacts contain only compact regression metrics and case ids.

## Commands

```powershell
# Offline, no provider calls; this is also the CI entrypoint
node scripts/run-card-evaluation.mjs

# The same bounded command used by the daily heartbeat
node scripts/run-card-evaluation.mjs --live --ai

# Optional same-provider strong model pool; use models supported by that gateway
node scripts/run-card-evaluation.mjs --live --ai --models claude-opus-4-8
```

`npm run eval:auto` is the package alias. The old one-shot collector remains available for explicitly requested experiments; the recurring job must always use this guarded wrapper. The heartbeat can inspect reports and propose a minimal test/fix; it must not reset allowances, relabel cases, expand sources, send marketplace messages, or publish an untested change.

## Verification

The Codex heartbeat `tcglens` was created ACTIVE for 09:00 daily and read back through the app. The first bounded live run at 22:54 UTC on October 19 completed two searches: Giratina and Nami, 50 primary candidates each. Both bounded recall checks found no cheaper comparable row. Frozen replay retained 79/80 plus 1/1 agreement, six pending rows and the known Base Set 2 defect. The one Opus 4.8 review returned `unavailable`, so overall live evaluation was honestly marked `inconclusive`; no additional model attempt was made. The model's failure does not erase successful acquisition or turn pending observations into passes.

An overlapping invocation returned `blocked_lock`; an invocation after completion returned `already_reserved`, preserving the original report and making no additional requests. Seven focused guard tests and the full 1,900-test suite passed (five optional skips), along with lint, typecheck, metadata audit and production webpack build. The existing Graphify graph was consulted; its CLI is unavailable on this Windows host, so no refresh is claimed. No product UI or ranking change is part of this automation release. GitHub workflow activation is checked after pushing the reviewed files to main.
