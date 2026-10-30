# UI simplicity review — October 29, 2026

Status: local implementation; build and visual release gates blocked by the execution environment. This is a source review with two captured production baselines, not a completed visual acceptance report.

The founder requested less secondary labeling and explanatory copy, with hierarchy and controls carrying more of the meaning. AGENTS.md now makes this a bilingual UI rule while preserving decision-critical facts and accessible names.

## Surface review

| Step | Surface | Finding and local change | Verification state |
|---|---|---|---|
| 1 | Search | Removed the card-rail instruction; the card buttons retain their hover CTA and accessible action names. The empty search no longer repeats the selected game above its selector. | Production baseline captured; local component tests pass; new layout needs browser verification. |
| 2 | Loading and print selection | A spinner and one heading replace the loading eyebrow/paragraph. Removed the duplicate confirmation eyebrow and instruction; empty/error recovery copy remains. | Source and component review; browser capture blocked. |
| 3 | Recommended listing and Q&A | One lens badge replaces stacked pick/lens badges. Removed the Next step / Why it stands out / What to know / Alternative prefixes and the Q&A preamble. Concrete action, rationale, caution and alternative facts remain. | Production baseline captured; local component tests pass; new layout needs browser verification. |
| 4 | Cross-market view | Removed the section instruction, the repeated empty-result explanation and the Verdict prefix. Shortened the opt-in text while retaining connected platforms and extra-credit disclosure. | Component tests cover verdicts, missing charges, source status and opt-in behavior; browser capture blocked. |
| 5 | Shared receipt | Removed the saved/confirmed eyebrows and sharing instruction. Moved the existing stale-price/availability caveat to the header, showing it once. | Receipt tests pass; browser capture blocked. |
| 6 | Method and unavailable receipt | Removed decorative eyebrows; kept descriptive headings, method explanations and recovery actions. | Method render test passes; browser capture blocked. |

Photo-gallery qualifiers, source/recall evidence, manual-source labels, cost and tax assumptions, form labels, source errors and developer-only diagnostics were reviewed and retained. No provider, ranking, eligibility, cache, API or acquisition behavior changed. Existing cream/teal/gold styles and semantic controls remain.

## Captured baselines

Pre-change production search and result screenshots were inspected locally. Screenshot export was excluded from this release.

## Validation

- ESLint and TypeScript: passed through installed CLI equivalents; npm is absent from PATH.
- Focused UI suite: 85 tests passed.
- Full suite: 140 files passed, 5 skipped; 1,914 tests passed, 5 skipped (`vitest run --maxWorkers=2`, 110.15 seconds). This includes the six-card journey across both games and Edit/New Search transitions. An initial run found the obsolete Q&A copy assertion (updated) and one six-card timeout under concurrent build load; the successful rerun used two workers without weakening timeouts.
- Metadata audit and `git diff --check`: passed; review image links and the WS-UX section marker checked.
- Built-in browser: existing production search and saved result captured and inspected. The local Next dev server and isolated QA proxy started, but local browser requests timed out; a local fetch reported EACCES. No changed English/Chinese desktop or mobile screenshot is claimed. Both task-owned servers were stopped.
- Production build: blocked by fonts.googleapis.com DNS failures and EPERM creating .next/server/app/api. No font/config change or access workaround was introduced.
- React review: no new state, effects, fetches or dependencies; accessible action labels, headings, alerts, disclosures and source facts remain. The identity-loading spinner now respects reduced motion.
- Graph navigation used the existing AST graph because Graphify is unavailable here. Presentation/copy edits did not add modules or domain relationships.
- Release gate is incomplete. No merge, push or deployment was performed. Resume by verifying the changed screens in English and Chinese at desktop and mobile widths, then run the build in an environment with the required access.
