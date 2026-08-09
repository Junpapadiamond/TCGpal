# Plan: exact-print retrieval agent

Status: **not started.** Written 2026-08-10. Owner: founder. Review date: one week
after Phase 0 lands.

## One sentence

A retrieval agent that re-queries the marketplaces when the deterministic ranker
rejects everything, using its structured rejection reasons as the feedback
signal, scored by exact-print recall across a fixed card set.

## Why this, and why now

The comparison currently does one search per platform and accepts whatever comes
back. When that search returns the wrong prints, the run is over — the product
abstains with `next_moves`. Measured against production on 2026-08-10:

| Card | Found | Excluded as sibling print | Eligible |
|---|---:|---:|---:|
| Nami OP01-016 | 50 | 38 | **0** |
| Roronoa Zoro OP06-118 | — | — | **0** |
| Monkey.D.Luffy OP05-119 | — | — | **0** |

Three of three One Piece cards on the landing rail returned zero eligible
listings. The supply exists — 50 live listings for Nami — but it is dominated by
the alternate art, and a single-shot query has no way to notice and adapt. The
deterministic `buildAbstention` already spots the specific sibling-print case and
suggests `OP01-016_p1`, which proves the signal is there; nothing generalises it
into another attempt.

This is the highest-value agent-shaped problem in the codebase because the
feedback signal is computed by our own code, not by a model judge:
`printMatch === "exact" && eligible` is a hard label. That makes the objective
measurable, the eval cheap, and the agent's success non-negotiable.

## The seam

**The agent chooses what to search for. It never decides what qualifies.**

`AGENTS.md` requires deterministic TypeScript to own eligibility, exclusions,
scoring, winner selection, and abstention. This plan respects that exactly: the
agent's only lever is query strategy. Every listing it retrieves goes through the
same `normalizeListing` + `rankListings` gates as today. If the agent returns
junk, the gates reject it and nothing reaches the buyer.

The deterministic fan-out keeps running as the guaranteed floor
(`runMarketSearch` already races the agent against it). The agent can only add
supply, never remove or override it.

## What already exists

- `src/lib/ai/agent/harness.ts` — `runAgent({ model, tools, goal, maxSteps })`,
  a real tool loop with step budget, tool results, and stop reasons.
- `src/lib/ai/agent/market-agent.ts` — `buildPlatformTools()` exposes each
  `PlatformAgent` as `search_<id>` with an optional refined `query` argument;
  `runMarketSearch()` races the agent against the deterministic fan-out;
  `isComparisonAgentEnabled()` reads `COMPARISON_AGENT` (off by default).
- `src/lib/comparison/ranking.ts` — `normalizeListing`, `rankListings`,
  `deriveVariantIntent`, and the `eligibilityIssues` / `exclusionReasons` /
  `printMatch` fields that will become the feedback signal.

## The gap

Two specific defects, both in `runAgentFanout` (`market-agent.ts`):

1. **`maxSteps: 1`.** The goal string already instructs the model to "re-query
   once with a tighter query if a tool sample looks thin, wrong-language, or
   off-version" — an instruction it cannot follow, because one step means one
   decision turn. The loop exits after the first tool batch.
2. **The agent is blind to the ranker.** `search_*` tools return raw seeds
   (`count`, `sample`) captured *before* normalisation. The agent never learns
   that 38 of 50 rows were rejected as the wrong print, so more steps alone would
   just produce more identical queries.

## Objective and metric

**Primary:** exact-print recall — the share of cards in the eval set whose report
ends with `outcome === "best_buy"` (at least one eligible exact-print listing).

**Secondary, all must not regress materially:**

- median eligible listings per card,
- added wall-clock latency per comparison (budget: +4s p50, +10s p95),
- added marketplace API calls per comparison (budget: ≤3× the deterministic run),
- zero change to the exclusion rate of *ineligible* rows — the agent must not
  make the gates leakier.

## Phases

### Phase 0 — baseline first, no agent changes

Build `scripts/measure-print-recall.mjs` (model it on the existing
`scripts/measure-market-anchor.mjs`) plus a committed card set of **30 cards**:
both games, a mix of base prints and alternate-art/special prints, vintage and
modern, including every case that returned zero eligible on 2026-08-10.

Run it against the current deterministic pipeline and commit the numbers to
`docs/print-recall-baseline-<date>.md`. **Do not touch the agent until this
number exists.** Without it there is no way to tell whether the agent helped.

### Phase 1 — close the loop

1. Add an `evaluate_candidates` tool to `buildPlatformTools` (or a sibling
   builder) that runs the *existing* `normalizeListing` + `rankListings` over the
   seeds collected so far and returns a compact structured verdict:
   eligible count, and rejection reasons grouped by category with counts
   (`variant_mismatch: 38`, `language: 4`, `graded: 6`, `price_floor: 2`).
   It must reuse the production functions — never a reimplementation.
2. Raise `maxSteps` to a small budget (start at 4) behind the existing
   `COMPARISON_AGENT` flag, plus a new `COMPARISON_AGENT_MAX_STEPS` env with a
   default that preserves today's behaviour.
3. Rewrite the goal to describe the loop explicitly: search → evaluate → if zero
   eligible, read the dominant rejection reason and re-query accordingly —
   stopping as soon as eligible ≥ 1, or the budget is spent.
4. Enforce a hard deadline across the whole agent run, not per tool call, and
   make expiry fall back to the deterministic result silently.

### Phase 2 — measure and decide

Re-run Phase 0's script with the agent enabled. Compare recall and every
secondary metric. Commit the results next to the baseline.

**Ship criteria:** recall improves by ≥10 percentage points with no secondary
metric outside budget.
**Kill criteria:** recall improves <5 points, or latency/API budgets are
exceeded, or any ineligible row reaches a recommendation. On kill, revert to
`maxSteps: 1`, keep the eval harness, and write down why.

## Constraints for whoever implements it

- The flag stays **off by default**. Production behaviour must be unchanged with
  `COMPARISON_AGENT=0`.
- No new external data sources. The agent may only call the `PlatformAgent`s that
  are already configured.
- Never let the agent write to `eligibilityIssues`, scores, `rankedChoices`, or
  abstention. It proposes queries; deterministic code judges results.
- Tests stay hermetic: injected fetchers, no live network, no API keys. The
  standard multi-card flow in `src/lib/testing/standard-comparison-flow.ts` must
  still pass with the flag both on and off.
- Every agent run must add a `ComparisonTrace` entry so its behaviour is
  inspectable in the technical trace.

## Risks

- **Latency.** Each extra step is a model call plus a marketplace call. Mitigated
  by the whole-run deadline and the deterministic floor.
- **Cost.** Up to 4× the API calls on cards that need iteration. Measure it;
  consider only engaging the agent when the first deterministic pass yields zero
  eligible, which confines the cost to the cases that are currently failing.
- **Prompt-shaped overfitting.** The agent may learn to satisfy the eval set
  rather than the task. Mitigated by holding out 10 of the 30 cards and never
  showing them during iteration.

---

## Handoff prompt

Paste everything below to a coding agent working in this repository.

```
You are working in the TCGpal/TCGlens repository (Next.js 16, TypeScript, vitest).
Read AGENTS.md first — its boundaries are binding — then docs/plan-retrieval-agent-2026-08-10.md,
which is the plan you are implementing. Implement Phase 0 only, then stop and report.

CONTEXT

TCGlens compares live eBay listings for a specific trading card and returns one
recommended buy, or abstains. Identity, eligibility, exclusions, scoring, and
winner selection are deterministic TypeScript in src/lib/comparison/ranking.ts.
The AI layer may never own those decisions.

There is an existing, disabled agent: src/lib/ai/agent/harness.ts provides
runAgent({ model, tools, goal, maxSteps }); src/lib/ai/agent/market-agent.ts
exposes each marketplace as a search_<id> tool and races the agent against the
deterministic fan-out. It is gated by the COMPARISON_AGENT env var and currently
runs with maxSteps: 1, so it cannot iterate.

THE PROBLEM

A single search per platform cannot recover when the results are the wrong print.
Measured against production on 2026-08-10: Nami OP01-016 returned 50 live
listings, 38 were excluded as sibling prints, and 0 were eligible. All three One
Piece cards on the landing rail returned 0 eligible listings.

YOUR TASK — PHASE 0 ONLY. DO NOT MODIFY THE AGENT.

Build the measurement that will later tell us whether an agent helps.

1. Create a committed eval card set of 30 cards. Requirements:
   - both games (Pokemon and One Piece),
   - a mix of base prints and alternate-art / special prints,
   - vintage (Base Set) and modern,
   - include Nami OP01-016, Roronoa Zoro OP06-118, and Monkey.D.Luffy OP05-119,
     which currently return zero eligible listings,
   - mark 10 of the 30 as a held-out set that must not be used while tuning.
   Put it in a TypeScript module so tests can import it, not inline in a script.

2. Create scripts/measure-print-recall.mjs, modelled on the existing
   scripts/measure-market-anchor.mjs (same style: plain node, no new deps, POSTs
   to /api/agent/listing-compare, paces requests, prints a table then a summary).
   Add an npm script "measure:print-recall".
   For each card it must report: outcome, candidates found, eligible count, and
   the count of exclusions grouped by eligibilityIssues category.
   The summary must report exact-print recall = share of cards with
   outcome === "best_buy", plus median eligible count, and total wall-clock time.
   It must accept TARGET (default https://lenstcg.com) so it can run locally.

3. Run it against production and commit the results to
   docs/print-recall-baseline-2026-08-10.md (use the real run date), including
   the per-card table, the headline recall number, and any card that errored.

4. Add a hermetic vitest test that imports the card set and asserts its shape:
   30 entries, unique ids, both games present, held-out set is exactly 10, and
   every entry has the fields the script needs. No network in tests.

CONSTRAINTS

- Do not change src/lib/ai/agent/*, ranking.ts, or any product behaviour.
- No new dependencies.
- Follow the repo's verification gate before you report: npm run lint,
  npm run typecheck, npm run test, npm run build.
- Do not commit or push unless explicitly asked.

REPORT WHEN DONE

State the baseline recall number, which cards returned zero eligible, and
anything in the eval design you think is wrong or under-powered. Do not start
Phase 1.
```
