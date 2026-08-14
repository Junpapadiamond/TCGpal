# Plan — One Piece buy accuracy, renewal audit, login backend (2026-08-14)

Four asks, in the order they unblock each other. Written before any code changed so the
target is falsifiable rather than retrofitted to whatever the run produced.

## Definition of the number being moved

The existing instrument (`npm run measure:print-recall`) scores **recall**: did the report
end in `best_buy`. That is not what this goal asks for. A report can reach `best_buy` on a
listing that is the wrong artwork — recall counts it as a hit, a buyer would call it a
miss.

So the target metric here is **buy accuracy**:

> For a fixed set of 10 One Piece cards, the share whose recommended listing exists, is
> reachable at the eBay URL we show, and is the confirmed print.

Scoring rules, fixed in advance:

| Verdict | Counts as accurate | When |
|---|---|---|
| `correct` | yes | Winner URL resolves to a live listing for the confirmed print. |
| `wrong-print` | no | Winner is a sibling artwork, another number, or another language than confirmed. |
| `dead-link` | no | URL 404s / redirects to search / listing ended. |
| `abstained` | no | `next_moves` — no recommendation at all. |
| `inspect_first` | no | Not a recommendation; the buyer still has to adjudicate. |

Gate: **≥ 8 / 10 correct**, and at least one of the ten is a competition (tournament-channel)
print scored `correct`.

Abstention is deliberately scored as a miss here. That is stricter than the product's own
value system, which prefers abstaining to guessing — so a run that hits 8/10 under this
rule is genuinely stronger than one that hits 8/10 under recall.

## Phase 1 — Instrument (no product change)

Add `scripts/measure-one-piece-buy-accuracy.mjs`: drives the same public
`/api/agent/listing-compare` endpoint as the other probes (shared `lib/compare-probe.mjs`,
same buyer context), but records the **winner** — lens, listing id, title, price, eBay URL,
`printMatch` — and emits a Markdown adjudication sheet plus a JSON sidecar. Adjudication is
by hand against the live URL; the script only collects and scores.

## Phase 2 — Baseline

Run the ten-card set against the local dev server with live eBay credentials. Adjudicate
every winner. Record the starting accuracy and, for each miss, which gate produced it
(identity, retrieval, exclusion, cost, or no supply).

## Phase 3 — Fix, TDD

Only defects the baseline actually shows. Each fix starts as a failing test in the module
that owns the decision (`ranking.ts`, print-fidelity, the eBay query builder, or the
One Piece catalog/metadata), never as a loosened guardrail that lets siblings through.
Re-measure after each change; a fix that raises accuracy by trading away print fidelity is
a regression, not a fix.

## Phase 4 — Competition card

Add one tournament-channel print to the eval set and make it resolve and rank correctly.
Candidate: `OP03-123_p2` Charlotte Katakuri, *Regional 2024 Wave2* — already curated in
`one-piece-print-metadata.ts` as `channel: "tournament"`, a real card with real eBay supply,
and its number carries four siblings, so it is a genuine test rather than a free win.

## Phase 5 — Renewal audit

Every self-renewing thing in the system, checked for whether it actually renews:

1. eBay OAuth application token (`src/lib/external/ebay.ts`) — cached in module memory with
   a 60s early-refresh margin. Check: does it renew, is the margin sound, is a mid-flight
   401 recovered, does a concurrent burst stampede the token endpoint.
2. TCGCSV daily market anchor — claimed self-refreshing; check freshness labelling and what
   happens on a stale/failed day.
3. Bundled One Piece catalog — explicitly *not* self-renewing; quantify the current drift
   with `npm run catalog:freshness`.
4. Report cache (15 min) and receipt snapshots (30 day) — check TTLs are actually applied
   and that expiry is graceful.

## Phase 6 — Login backend investigation

Question as asked: *does login require building a backend on Vercel?* Deliverable is a
written decision with the actual constraints of this codebase (Next.js 16 on Vercel,
Upstash Redis already present, no auth today, auth listed as a non-goal until the pilot
passes), the options, the recommendation, and what it costs. Written as advice, not
implemented — auth is a stated non-goal and building it silently would be the wrong call.

## Out of scope

- No new marketplaces, no scraping, no relaxing of the source boundaries in AGENTS.md.
- No auth implementation.
- No change that makes a sibling print acceptable in order to raise a number.

---

# Results (same day)

## The number

**9 of 13 correct (69.2%)** against a target of ≥80%. Every winner was adjudicated by
opening the listing and comparing the photo against the official card image; the filled
sheet is `docs/one-piece-buy-accuracy-2026-08-14.md`.

The competition-card goal was met: `OP07-053_p1` (Tournament Pack 2024 Oct.-Dec.) returns
a Best Value pick at $11.64 that is the confirmed print.

## What changed

Five deterministic fixes, each a failing test first, none of them a loosened guardrail:

1. **Cached provider failures** (`report-cache.ts`) — a report whose configured live source
   failed was cached for 15 minutes. One 10-second eBay timeout froze a zero-listing answer
   for Shanks OP09-001; a cold re-run found 50.
2. **Releases outside the catalogued prints** (`print-fidelity.ts`) — a listing naming a
   promotional run the confirmed print does not belong to is now a mismatch. Six of the
   nine sibling rows in the base-proof sample were exactly this.
3. **Stated stats that contradict the print** (`print-fidelity.ts`) — eBay's item specifics
   carry cost and power. Two listings titled for OP02-013 and OP07-119 both pictured the
   OP16-118 Ace, and one was a $59 Best Value recommendation.
4. **Fan art** (`ranking.ts`) — "fan made", "custom", and "proxy" were filtered; "fan art"
   was not, and a Japanese fan-made card reached the buyer as an OP06-118 candidate.
5. **Playsets** (`ranking.ts`) — a "(x4)" listing was recommended as a single card and
   compared against a one-card anchor.

## What D-OP-BASE-PROOF settled

**KILL at 52.6%** (10 base / 9 sibling / 19 adjudicated). The shortcut that would have
recovered 9 of 10 recall misses is dead, and the sample says why: sellers routinely name
the wrong release, and in one case both the title and eBay's own Set aspect said
"Emperors in the New World Regular" over a photo of the manga alternate art.

## Why it stopped at 69%

All four remaining misses are seller metadata that is simply false, and each is invisible
to every text signal available:

| Card | Winner | Why text cannot catch it |
|---|---|---|
| Nami OP01-016 | OP01-016_p3 artwork | Title and Set aspect say only "Romance Dawn". |
| Luffy ST01-001 | $79.99 Nor Con foil parallel | Set, power, and number all read correct. |
| Ace OP02-013_p1 | SP OP02-013_p3 | Title and Set aspect claim the P1 alt art; cost/power agree because every print shares them. |
| Rosinante OP04-119 | Japanese card | Seller declares "Language: English, Country of Origin: USA". |

That is the honest ceiling of text-based print proof on One Piece. The next lever is
comparing the listing photo to the official card image — raised as **D-OP-IMAGE-PROOF** in
`PROGRESS.md`, deliberately not built here because it would be the first server-side image
fetch and that is a source-boundary decision, not an engineering one.
