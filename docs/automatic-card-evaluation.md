# Automatic card evaluation

The founder requested daily sampling and AI review on October 19, 2026, then explicitly requested cloud execution without a running local computer.

## Cloud execution

`.github/workflows/card-accuracy-cloud.yml` schedules 09:00 America/New_York daily and supports manual dispatch. GitHub holds only `CARD_EVAL_CRON_SECRET`; the authenticated `/api/internal/card-evaluation` Vercel function owns execution. Existing provider and Redis credentials remain on Vercel. The local Codex heartbeat `tcglens` is paused to prevent duplicate acquisition.

The first fresh cloud day is October 20 UTC. October 19 already consumed the local daily allowance. A manually dispatched `verify` run separately reserves one model call per UTC day on frozen real tuning observations, with zero live acquisition; this is deployment verification, never a fresh search result.

1. Atomically reserve the whole daily allowance in Redis before acquisition. Duplicates return the completed report or an incomplete-reservation status. Storage unavailable means no work.
2. Replay 87 frozen real observations against the immutable baseline. Stop on new regressions or changed dataset/labels. The known Base Set 2 failure remains a failure.
3. Search two fixed cohort cards, one Pokemon and one One Piece, rotating all twelve in six days. Inject only the existing eBay agent and structured confirmed identities, with no query-model round trip, buyer ZIP, paid fan-out, or production report-cache reuse/publication. Separate requests by 31 seconds, pass a 60-second source deadline, retain the existing bounded recall probe. No retries.
4. Review at most six tuning observations per card, prioritizing lens winners, in at most one existing-provider strong-model call. Held-out observations never enter this prompt. New observations remain pending; AI suggestions never become gold labels or automatically executed code.
5. Save privacy-reduced observations and reports privately in Redis for 30 days. Save only compact metrics, case ids, failure categories and AI hypotheses in the GitHub artifact for 14 days. No seller ids, images, buyer ZIP or source URLs enter that artifact or model prompt.

The function lifetime is 300 seconds; the global Redis owner lease is 600 seconds and released only by its owner. Permanent daily reservation keys have no expiry and are never deleted/refunded. A crash consumes that day's slot; an expired global lease permits a later day's work, never a second run of the reserved day. Do not run the retired local live wrapper alongside this scheduler.

The separate `card-accuracy.yml` workflow still runs offline tests and frozen replay on main pushes, PRs and manual dispatch, with no provider credentials. GitHub schedules run from the default branch and can be delayed; they are not an exact-time SLA. See [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Model routing and failure diagnosis

Default selection uses the existing configured provider. Optional server-only `CARD_EVAL_MODELS` supplies up to three compatible strong models; Haiku/mini/nano/luna are rejected. Availability/schema-validity history is shared in Redis. This measures availability, not truthfulness. No probing loop, silent account switch or automatic retry.

The October 19 22:55:04 UTC failure was matched in the logged-in Intenext usage log: TCGpal / `claude-opus-4-8`, HTTP 500, two seconds, zero charge, gateway description “空回不计费，本次已自动免费”. Request id: `202610192255020068283658268d9d6wCH7ZM8F`; upstream request id: `202610192255024141218688268d9d6bbKFjfbG`. This establishes an empty-response failure reported by the gateway; the dashboard does not expose the vendor's deeper internal cause.

The application discarded that error and reported only `unavailable`. Evaluation now retains safe categories and HTTP status, never arbitrary provider bodies. A separate reproduced defect cleared the timeout after headers; the provider now bounds the complete body read, caps it at 1 MiB, and detects token-limit truncation. The same saved twelve-row review input succeeded three consecutive times (19:09:12, 19:11:35 and 19:11:51 Eastern). These establish current connectivity, not permanent upstream reliability or independent attestation of model identity.

## Decision and review

The goal is unattended evidence collection and actionable wrong-print/price-miss hypotheses. The strongest case is continuity without the founder's laptop. Serious objections are duplicated spending across runners, AI self-labeling, and confusing outages with accuracy regressions. Decision: one bounded six-day rotation with shared reservations, held-out isolation and separate source/model/regression statuses.

Owner: the deployed job executes and records evidence; the founder owns final artwork/gold adjudication. Review: October 26, 2026. Success: both games sampled within caps, no silent frozen regressions, and a useful finding traceable to evidence. Stop on storage/lock failure, invalid data, regression or deadline; retain partial source results without retries. Any paid-source expansion or held-out model exposure invalidates the experiment. Scheduling alone does not demonstrate improved retrieval or population accuracy.

## Operations and verification

- Offline command: `node scripts/run-card-evaluation.mjs`.
- Cloud history and dispatch: [Daily real card evaluation](https://github.com/Junpapadiamond/TCGpal/actions/workflows/card-accuracy-cloud.yml).
- Manual `verify` uses frozen observations; `daily` consumes the day's real-search allowance.
- Reports appear in the workflow summary and `daily-card-evaluation` artifact. Failed/inconclusive execution fails the job visibly; unchanged known defects do not masquerade as new regressions.
- Local historical evidence stays in ignored `output/accuracy-eval/automation/daily/2026-10-19`: Giratina/Nami, 50 primary candidates each, no cheaper comparable probe result, inconclusive Opus review. Reservations were never refunded.
- Baseline remains 79/80 plus 1/1 provisional agreement, six pending Ace observations, zero human gold. This is not artwork accuracy or exhaustive recall.

Tests cover authentication, oversized/scope-expanded input, reservations, storage failure, migration-day spending, held-out isolation, per-game review limits, eBay-only acquisition, owner release and full-body timeout. Runtime gate and actual cloud verification evidence are recorded in `PROGRESS.md`. Graphify CLI is unavailable on this Windows host; no graph regeneration is claimed.
