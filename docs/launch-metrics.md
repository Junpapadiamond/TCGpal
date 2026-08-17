# Launch metrics — definitions and PostHog setup

Instrumentation contract for the Reddit / RedNote launch. The event and property
allowlist in `src/lib/analytics.ts` is authoritative; this file defines what the
numbers *mean* and how to build them in PostHog.

## Unit of analysis

There is no login. `person_profiles: "never"` and `persistence: "localStorage"`
mean identity is a browser profile, not a person.

- Same person on phone + laptop counts twice.
- **RedNote arrives in an in-app webview.** Storage there is often isolated or
  ephemeral, so returning visitors can look new every time. **Do not report
  RedNote retention** — it is structurally understated.
- **RedNote also restricts clickable outbound links in notes.** Only the profile
  bio link can realistically carry `?s=`; the rest arrives with no referrer and
  no tag, and lands in `direct`.

**For month one the honest unit is the session, not the user.** Use user-level
numbers directionally only.

## Channel tagging

Tag every outbound link with `?s=<tag>`, one tag per post:

```
https://lenstcg.com/?s=reddit_pokemontcg_01
https://lenstcg.com/?s=rednote_bio
https://lenstcg.com/?s=internal        ← your own testing, filter this out
```

`classifyChannelTag` maps the tag by prefix to `reddit | rednote | discord |
internal | other`; `resolveChannel` falls back to the referrer host and persists
the **enum only** in `sessionStorage` (never the raw tag — it would be a URL in
the payload). Precedence: explicit tag → stored channel → referrer → `direct`.

Every event carries `channel`, so any funnel step can be split by source without
a person profile.

## Metric definitions

Two denominators. Mixing them is the most common analysis error:

- **`/ app_opened`** — end-to-end business funnel, includes bounces. Compare *channels*.
- **`/ comparison_completed`** — product quality given a working answer. Iterate on the *product*.

"Verdict click-through" is `choice_opened / comparison_completed(result_state=best_buy)`.
Divide by `app_opened` instead and a bad Reddit post reads as a bad product.

### Level 0 — Channel (manual spreadsheet, one row per post per day)

| Metric | Numerator | Denominator | Source |
|---|---|---|---|
| Post reach | — | — | Reddit post insights / RedNote 笔记数据 曝光量 |
| Engagement rate | upvotes + comments | impressions | platform |
| Landing CVR | `app_opened` where `channel = X` | impressions | joined by hand |

Expect 0.5–3% landing CVR. This is the only thing that separates "my post was
bad" from "my product is bad", and PostHog cannot tell you it alone.

### Level 1 — Activation

| # | Metric | Numerator | Denominator | Diagnoses |
|---|---|---|---|---|
| 1 | Search rate | sessions w/ `card_search_started` | sessions w/ `app_opened` | hero clarity |
| 2 | Confirm rate † | `card_identity_confirmed` | `card_search_started` | how often the query was ambiguous |
| 3 | Completion rate | `comparison_completed` | `comparison_started` | reliability |
| 4 | Answer rate | `comparison_completed` w/ `result_state ∈ {best_buy, inspect_first}` | all `comparison_completed` | abstention / supply coverage |
| 5 | **Activation ★** | sessions w/ `choice_opened` | sessions w/ `app_opened` | **North Star** |

† Confirm rate is a side metric, not a funnel step — auto-confirmed searches skip
`card_identity_confirmed` entirely. See Insight 1.

### Level 2 — Trust and comprehension

All over `comparison_completed`:

- **Fold-open rate** — `alternatives_expanded`. High folds + low `choice_opened`
  = the verdict was not trusted and the buyer redid the work by hand.
- **Method-open rate** — `method_opened`. Sustained high = the verdict is not
  self-explanatory.
- **Lens-switch rate** — `lens_selected`. Near-zero is ambiguous: right default,
  or undiscovered toggle. Disambiguate against activation.
- **Verdict-flip rate** — `decision_feedback_submitted{changed_decision=true}` /
  all feedback. The only direct claim of value delivered.
- **Outbound reference rate** — `other_marketplace_clicked` / completed. Was
  called "leak rate", which decided the analysis before any data arrived: a leak
  is something you lose, and we lose nothing — there is no affiliate deal, no
  checkout, no cut of an eBay sale. The product promises to find the best listing
  for a card, so a buyer who opens Whatnot because that is where the card is has
  been served, not lost. **This number is not directional on its own.** Read it
  only against whether the buyer came back: an outbound click followed by
  `second_comparison_started` is the product working; one with no return is the
  case worth worrying about. Today's event cannot tell those apart, so treat the
  rate as a prompt to go look, never as a score to push down.
- **Decision latency** — `choice_opened` split by `time_to_open_bucket`.
  `under_10s` = trusted on sight. `over_60s` = re-verified by hand, which means
  the evidence presentation is not carrying its weight.

### Level 3 — Retention and loop

- **In-session repeat** — `second_comparison_started` / sessions w/
  `comparison_completed`. Most trustworthy retention signal at launch: it does
  not depend on storage surviving.
- **D1 / D7 return** — distinct_ids with `app_opened` on day N+1 / cohort day N.
  Reddit only.
- **Receipt loop** — K ≈ (`receipt_created`/`comparison_completed`) ×
  (`receipt_viewed`/`receipt_created`) × (searches per receipt viewer). Measure
  the factors separately; you can only fix one at a time.

### PAU

**PAU = distinct_ids with ≥1 `comparison_completed` in the window.** Not
`app_opened` — that counts bounces as users. Report DAU/WAU/MAU as raw counts.
Skip stickiness ratios below a few hundred users; the ratio is noise.

## PostHog setup

Global filters to apply to **every** insight below:

```
demo_mode  is not  true
channel    is not  internal
```

Fixtures and founder testing otherwise inflate the entire funnel.

### Insight 1 — Launch funnel (Funnel, ordered, 7-day window)

```
app_opened → card_search_started → comparison_completed → choice_opened
```
Breakdown by `channel`. This single insight yields metrics 1, 3, 5.

**Do not put `card_identity_confirmed` in this funnel.** It only fires when the
buyer taps a confirmation. A rail-card click or an explicit name + number search
is auto-confirmed and skips the gallery entirely, so including the step reads as
a large drop-off that never happened. Confirmed empirically on 2026-08-16: a
rail-card search produced `comparison_completed` with no `card_identity_confirmed`.

Track confirmation separately instead (Insight 8).

### Insight 8 — Confirmation load (Trends, formula)

```
A = card_identity_confirmed
B = card_search_started
formula: A / B
```
This is the share of searches ambiguous enough to need a human tap — a measure of
catalog and query-parsing quality, not a funnel step. Rising means buyers are
being asked to disambiguate more often.

### Insight 2 — Answer rate (Trends, formula)

```
A = comparison_completed  where result_state = best_buy
B = comparison_completed  where result_state = inspect_first
C = comparison_completed
formula: (A + B) / C
```
Breakdown by `game`. A low answer rate on One Piece and a healthy one on Pokémon
is a coverage problem, not a UI problem.

### Insight 3 — Verdict trust (Trends, formula)

```
A = choice_opened
B = comparison_completed  where result_state = best_buy
formula: A / B
```

### Insight 4 — Decision latency (Trends, total count)

`choice_opened`, breakdown by `time_to_open_bucket`. Watch the `over_60s` share.

### Insight 5 — Fold engagement (Trends, formula)

```
A = alternatives_expanded
B = comparison_completed
formula: A / B
```
Add `method_opened` and `qa_opened` as separate series.

### Insight 6 — Reliability (Trends)

`comparison_failed` and `comparison_completed` as two series, breakdown by
`marketplace`. Cross-check the total against the server's `api_request_completed`
in `src/lib/ops/events.ts` — **the gap is your ad-blocker rate.** Reddit skews
blocker-heavy; without this check a normal day reads as a traffic collapse.

### Insight 7 — Repeat use (Trends, formula)

```
A = second_comparison_started
B = comparison_completed
formula: A / B
```

## Analysis hygiene

1. Filter `demo_mode = true` and `channel = internal` everywhere (the global
   filters above).
2. **Cohort by day, never cumulative.** A launch spike poisons cumulative
   averages permanently.
3. **Do not A/B test at launch.** At n≈200 only ~30–50% effects are detectable.
   Ship sequentially, compare day-cohorts, accept it is directional.
4. Below n=100, report counts, not percentages with decimals — "7 of 43", not
   "16.3%".
5. Reconcile client vs server counts before concluding anything from a drop.

## Reading it: which number moves which fix

| Low metric | Real problem | Fix |
|---|---|---|
| Landing CVR | the post | rewrite the pitch, not the app |
| Search rate | hero doesn't explain, or blank-page paralysis | copy + the card rail |
| Confirm rate | identity UX or catalog gaps | confirmation flow / adapter coverage |
| Answer rate | supply — eBay has nothing comparable | more sources, or loosen comparability |
| Activation, high fold-opens | verdict not trusted | evidence presentation |
| Activation, low fold-opens | verdict not compelling or wrong | ranking |
| In-session repeat | one-shot novelty, not a habit | the real retention problem |

Activation is a ratio of ratios and can drop for five unrelated reasons. Always
decompose to the level that actually moved before changing anything.

## Deliberately not instrumented

Session replay and autocapture stay off (`AGENTS.md`, Analytics Privacy). The
app collects a buyer ZIP, so replay would make masking configuration load-bearing
for a public privacy claim. `time_to_open_bucket` plus the fold-open events
answer the same question — did the buyer trust the verdict, and which evidence
did they need — without recording the session.

Revisit only if the funnel shows a drop that fold-rates and user interviews
cannot explain; then enable replay behind a flag for 7 days, comparison page
only, ZIP masked.
