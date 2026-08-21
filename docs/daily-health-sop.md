# Daily health SOP

How TCGlens finds its own bugs without a person watching, and — just as
important — without an agent burning tokens hunting for bugs that are not there.

## Why this exists

On 2026-08-21 a buyer reported that Suicune HGSS21 showed "Exact TCGplayer
mapping unavailable" while TCGplayer's own page carried 55 listings and a $60.44
market price. The investigation found three separate defects and one process
failure:

- A promo set-name alias table existed only on an undeployed branch. **The fix
  had been written two days earlier and production never got it.**
- The group tie-break sent four base sets to the wrong TCGplayer group.
- A transient catalog 500 deleted the market reference entirely, because the
  fallback path could not carry a price.

Together, 2,002 of 20,460 catalogued cards had no market anchor — and because
`ranking.ts` gates the market-floor replica check on a non-null anchor, those
cards also had **no replica gate at all**. The suite was green the whole time.
None of this was a code-correctness bug a test could catch. Every one of them was
a *coverage* or *distance* bug, and nothing measured either.

The rule that follows: **if a property can silently degrade without failing a
test, it needs a daily measurement, not a better test.**

## What runs every day

`.github/workflows/daily-health.yml`, 13:00 UTC (after the TCGCSV dump
publishes, before US buying hours). Each check is plain Node or vitest.

| Check | Question | The bug it would have caught |
| --- | --- | --- |
| `deploy-drift` | Is a finished `fix:` commit sitting on a branch? | The 2-day-old alias fix that production never received |
| `market-anchor` | Does a card from every catalogued set still reach a TCGplayer anchor? | All 2,002 anchor-less cards |
| `provider-health` | Do the sources answer, and is the feed fresh? | pokemontcg.io at a 64% 5xx rate; a TCGCSV feed past its 48h staleness warning |
| `abstention-rate` | What does a real basket of cards actually end up as on production? | Anchor loss and eligibility collapse, from the buyer's side |
| `page-timing` | How long does each page take to answer? | A route that quietly got slow |
| `concurrency-smoke` | Do five simultaneous buyers all get served? | Errors or queueing that a single-user test never shows |

Run any of them locally:

```bash
node scripts/health/deploy-drift.mjs
```

```bash
npm run review:market-anchor
```

### Exit codes are load-bearing

    0  PASS          measured, within budget
    1  FAIL          measured, out of budget — a real regression
    2  INCONCLUSIVE  could not measure (provider down) — never pages anyone

The third code is the one that keeps the system alive. pokemontcg.io fails a
majority of requests on a bad day. A check that reports that as a product
regression gets muted within a week, and **a muted check is exactly how the
original bug survived for months.**

Thresholds in these scripts are *measurements with headroom*, not aspirations.
Raise one when coverage genuinely improves. Never lower one to make a red run
green — that converts an instrument into decoration.

## Escalation ladder

1. **Green day** — nothing happens. No issue, no notification, **no model
   tokens**. This is the overwhelmingly common case and it must stay free.
2. **Red check** — the workflow opens *one* GitHub issue, or comments on the
   existing open one. Still pure `gh`, still no model tokens. A recurring
   failure updates one thread instead of filling the inbox.
3. **Agent triage (opt-in)** — only when `ANTHROPIC_API_KEY` is configured, and
   only on an already-red check. Never on a green day, never speculatively.

## Boundaries for the triage agent

The point of the boundary is that "go find bugs" is an unbounded, expensive, and
low-yield instruction. "Here is a failing measurement, here is the class of fix
it belongs to" is bounded and high-yield.

**Budget:** one triage run per failing check per day. Hard stop. If the same
check is still failing tomorrow, that is a human decision, not a second agent run.

**The agent MAY open a PR for the mechanical class only.** A fix qualifies as
mechanical when all four hold:

1. The failure is a **data mapping**, not a judgement — a set name the crosswalk
   cannot match, a TCGplayer group that was renamed, a new release absent from
   the alias table.
2. The correct value can be **verified against a provider feed**, card by card,
   rather than inferred from a name that looks right.
3. The fix is **additive** — a new alias entry, a new fixture row. It does not
   change ranking math, eligibility rules, exclusion patterns, thresholds, or
   any buyer-facing copy.
4. It ships with a **test that fails without it**.

**The agent MUST NOT**, under any circumstance, without a human decision:

- Touch `ranking.ts` scoring, `MARKET_FLOOR_RATIO`, lens selection, or
  abstention rules.
- Change a threshold in a health check to make it pass.
- Modify buyer-facing copy or any claim about what a source proves.
- Add, widen, or re-scope an external data source. The Production Data
  Boundaries in `AGENTS.md` are a legal and policy surface, not a config knob.
- Merge its own PR, or push to `main`.

**Everything else is report-only:** an issue with the measurement, the evidence,
and a proposed fix. An agent that cannot verify a mapping against real product
data writes down what it could not verify. It does not guess.

## Known open findings

Measured during the 2026-08-21 investigation, not yet fixed:

- **An implausible market anchor disables eligibility.** When TCGCSV has no
  `marketPrice`, the adapter falls back to `midPrice` — but those are different
  statistics: market is derived from sales, mid is the midpoint of current asks.
  For an illiquid card with a few fantasy-priced listings that produces a
  nonsense anchor. Measured: the Luffy OP05-119 manga print anchors at
  $39,999.50 (low $9,999.99 / high $125,000, market `null`), so the market floor
  lands near $18,000 and **every real listing is excluded**. About 1.3% of price
  rows are mid-only, and 6 of 10 sampled were >= $500 — the population skews
  hard toward exactly the illiquid cards where mid is meaningless. This changes
  a ranking input, so it needs the founder decision challenge in `AGENTS.md`
  before anyone writes it.
- **Ambiguous TCGplayer products abstain silently.** `base1-4` Charizard matches
  both "Charizard" and "Charizard (Black Dot Error)", so the exact-print selector
  correctly refuses to choose and the card falls back to the inline catalog
  anchor. Safe, but an exact name equality preference would resolve it.
- **Latency has a long tail.** One `Pikachu 58/102` comparison took 291 seconds
  against production. `page-timing` measures the document response, not the
  comparison route, so this is currently unmeasured.
- **A 19-day-old `fix:` commit sits unreleased** on `origin/codex/identity-first-search`.
  `deploy-drift` reports it; whether to ship it is a human call.

## Roadmap

Ordered by evidence, not ambition.

**Next — the checks that need a browser.** Two of the properties worth watching
cannot be measured with `fetch`:

- *Clicking a card on the rail opens its listing.* The rail submits a rebuilt
  query rather than the card id, so a card whose seeded `setCode` disagrees with
  the catalog can land on a confirmation step instead of a report. This needs a
  real browser driving a real click; Playwright is not currently a dependency,
  and adding one to run in CI daily is a deliberate choice, not a side effect.
- *Real page-load cost.* Time to first byte is not time to usable. Core Web
  Vitals need a browser too.

**After that:**

- *Identity stability.* Two identical requests should confirm the same print. A
  degraded catalog tier can change which candidate leads, and a wrong-number
  candidate reaching the buyer is a correctness risk, not a latency one.
- *Comparison-route latency*, so the 291-second tail is measured rather than
  anecdotal.
- *One Piece anchor coverage*, which today depends on hand-curated product ids
  in `one-piece-print-metadata.ts` and has no equivalent of the Pokemon sweep.

**Deliberately not automated:** anything that would need the agent to judge
whether a ranking outcome is *correct*. That is a founder decision with a
falsifiable test attached, and it belongs in `PROGRESS.md`, not a cron job.
