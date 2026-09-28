# Natural-language card search — September 28, 2026

## Decision

The buyer wants to say “150美元以下、品相好的Charizard,” see a few plausible versions, and compare a chosen print. The strongest case is fewer manual filters while retaining the buyer's card-first intent.

Three objections shape this experiment:

- An NM aggregate item reference cannot establish a live checkout price. Shipping, mandatory fees, print identity and seller condition still need verification.
- “Good condition” is ambiguous. The UI exposes an editable seller-stated Near Mint assumption; it does not grade photos.
- Comparing every version would multiply latency and source costs. The gallery uses bounded reference reads; marketplace fan-out starts only after the buyer selects a print.

Recommendation: ship an editable interpretation and reference-priced version gallery behind the existing search box, then reuse deterministic listing comparison. The founder explicitly chose a USD pre-tax ceiling including shipping; tax is separate. Existing rolling cards remain unchanged. Model output may translate card names but may not change explicit print/language/number constraints or numeric budgets.

## Smallest falsifiable test

- Owner: Codex for implementation and verification; founder for the browser usability check.
- Review date: September 28, 2026, before release.
- Success: all supported English/Chinese/mixed-language examples retain budget, condition and card identity; zero over-budget or incomplete-cost winners; budget remains editable; six sequential searches span both games and Edit/New transitions; older/missing prices are labeled.
- Kill criteria: any invented price or source, silent card-language/number change, over-budget recommendation, fixture inventory in production, or marketplace acquisition before print confirmation. Disable the interpretation path if these cannot be contained. A slow model must fall back within eight seconds.
- Assumptions still unproven: natural language improves completion rate; the first 24 refreshed versions provide sufficient reference coverage; users understand the distinction between a reference price and a live offer. No conversion claim is made.

## Implementation boundaries

- Public Zod contracts own optional `searchIntent`, `priceCoverage`, `budgetMax` and `buyer.budget` fields.
- AI understands intent; deterministic extraction owns numeric ceilings and retains collector-number/set/language/print constraints. Unsupported or contradictory requests ask for an edit.
- Exact TCGCSV product selection, at most 24 versions, four workers, eight-second reference deadline. No new data source or paid pilot use.
- Browsing starts with six reference-priced choices; other choices can be expanded. Unknown prices remain unknown. References older than 72 hours are marked.
- Ranking, cache keys and latest-receipt indexes include the pre-tax budget. Starting a new search clears it; editing and history retain it.
- Search examples expand to 18 per game, with natural-language starters. The rolling card effect and click behavior are preserved.

## Live observations

The founder supplied an Anthropic-compatible gateway configuration for local testing. The credential is stored only in ignored `.env.local`; no credential or response headers are recorded here. Production model configuration was not changed.

- Gateway health: HTTP 200, requested model `claude-opus-5`, minimal response in 3.6 seconds.
- Initial semantic probe incorrectly inferred Chinese card language from a Chinese buyer sentence. Regression coverage now rejects model-added language or altered card numbers and falls back to the local parse.
- After the guard and prompt change, the founder's original mixed-language Charizard query returned correct model-backed intent in 3.6 seconds; a Luffy OP05-119 / $150 / LP query returned correct model-backed intent in 3.6 seconds. Some calls hit the eight-second bound and used deterministic fallback. This is limited integration evidence, not a model accuracy benchmark.
- Local full identity request: HTTP 200 in 18.0 seconds, 99 real Charizard catalog candidates, 24 reference refreshes, 94 candidates with dated prices. The sample TCGCSV timestamp was September 6, so these are explicitly older references, not current offers. No eBay credentials were available locally; listing/ranking checks use injected fixtures and are not live inventory evidence.

## Verification and release status

Behavior changes were implemented test-first: intent parsing, model failures/constraint changes, gallery-to-comparison budget transfer, complete-cost exclusions, cache/receipt separation, and the six-card comparison contract. No model or provider secrets are used in hermetic tests.

Final automated gate: lint, TypeScript, metadata audit, plugin validation, `git diff --check`, and production build passed. Vitest: 119 files / 1,612 tests passed; five opt-in suites/tests skipped. The standard six-card journey ran with injected providers, including a $150 pre-tax ceiling that excludes the fixture's $255 offer and does not leak into the next card's request.

Built-in browser access to the local page was rejected by the browser security policy. EN/中文 desktop, mobile screenshots and the sequential manual smoke are pending; no alternate browser surface was used. The automated gate alone does not satisfy the repository's UI release gate. This work stays on `codex/natural-language-search` until visual verification is available. Graphify's documented macOS CLI is unavailable on this Windows host; structural graph regeneration is pending.
