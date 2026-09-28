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

The founder supplied an Anthropic-compatible gateway configuration for testing. The credential is stored in ignored `.env.local` and, after the founder's September 28 request, encrypted Vercel Preview variables scoped to `codex/natural-language-search`. No credential or response headers are recorded here. Production model configuration was not changed.

- Gateway health: HTTP 200, requested model `claude-opus-5`, minimal response in 3.6 seconds.
- Initial semantic probe incorrectly inferred Chinese card language from a Chinese buyer sentence. Regression coverage now rejects model-added language or altered card numbers and falls back to the local parse.
- After the guard and prompt change, the founder's original mixed-language Charizard query returned correct model-backed intent in 3.6 seconds; a Luffy OP05-119 / $150 / LP query returned correct model-backed intent in 3.6 seconds. Some calls hit the eight-second bound and used deterministic fallback. This is limited integration evidence, not a model accuracy benchmark.
- Local full identity request: HTTP 200 in 18.0 seconds, 99 real Charizard catalog candidates, 24 reference refreshes, 94 candidates with dated prices. The sample TCGCSV timestamp was September 6, so these are explicitly older references, not current offers. No eBay credentials were available locally; listing/ranking checks use injected fixtures and are not live inventory evidence.

## Verification and release status

Behavior changes were implemented test-first: intent parsing, model failures/constraint changes, gallery-to-comparison budget transfer, complete-cost exclusions, cache/receipt separation, and the six-card comparison contract. No model or provider secrets are used in hermetic tests.

Final automated gate: lint, TypeScript, metadata audit, plugin validation, `git diff --check`, and production build passed. Vitest: 119 files / 1,612 tests passed; five opt-in suites/tests skipped. The standard six-card journey ran with injected providers, including a $150 pre-tax ceiling that excludes the fixture's $255 offer and does not leak into the next card's request.

Built-in browser access to the local page was rejected by the browser security policy; that local access was not retried. The founder subsequently requested a Vercel test deployment and environment setup. Cloud-preview observations are recorded below. The automated gate and bounded smoke alone do not satisfy the complete UI release gate. Graphify's documented macOS CLI is unavailable on this Windows host; structural graph regeneration is pending.

## Vercel preview verification — September 28

- READY deployment: `dpl_ESampSx2ND9WTFG6sq3oHaaiNRwe`, runtime commit `b9636df9c53c7ab3b8c4c1972c2f1810bda4d3da`, [preview](https://tcgpal-8eorjkcyl-junhsus-projects.vercel.app/). Access requires Vercel authentication or an authorized temporary share link.
- Preview branch overrides: `AI_PROVIDER=anthropic`, `ANTHROPIC_BASE_URL=https://api.intenext.ai`, `ANTHROPIC_MODEL=claude-opus-5`; encrypted `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` both use the founder-supplied credential. Vercel's form disallows empty values, so the inherited bearer token was replaced only for this branch. Both bearer and x-api-key authentication returned HTTP 200 in bounded probes. No production or other-branch variables were replaced.
- Redeployed after saving configuration. The deployed `/api/ai/health` returned HTTP 200, `ok: true`, provider `anthropic`, model `claude-opus-5` with a successful probe.
- Built-in browser, original query `我要搜150块一下的好品项的charizard`: resolved Charizard, editable seller-stated NM, $150 pre-tax ceiling; 99 catalog versions, 24 refreshed references, 58 references within budget, six initially visible. Visible refreshed TCGCSV references were dated September 27.
- Selecting Charizard TG03/TG30 returned 69 eBay rows, 20 eligible; displayed winner $29.95 pre-tax, item $29.95 and free shipping, with 14 seller photos. Lower item-price rows with unknown shipping stayed separate. Whatnot/Mercari remained manual checks; no paid pilot was enabled.
- Edit search to `Luffy OP05-119 under $150 LP`: One Piece, exact collector number retained, LP, $150 ceiling, nine versions. New search cleared the query and budget; the existing condition preference remained LP.
- EN and 中文 desktop plus 390×844 中文 mobile views captured. Mobile page width 375px within a 390px viewport, with no horizontal overflow. Interaction verification used keyboard activation: browser pointer actions did not produce observable changes, so pointer behavior is inconclusive rather than marked passed.
- Still pending before production release: the full five-card sequential manual smoke, reliable pointer activation checks, and structural Graphify refresh when its CLI is available. This preview does not change `lenstcg.com`.
