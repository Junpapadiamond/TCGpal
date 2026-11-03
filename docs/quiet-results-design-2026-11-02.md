# Selected Option 1: quiet comparison results

The founder selected the first visual direction and asked to keep real platform marks such as Whatnot. Both result views now use a wider cream canvas, sans-serif result typography, a prominent total/action, and a Condition → Seller record → Price vs market strip divided by fine rules. Secondary marketplace offers collapse into a short row showing the item price, seller condition claim and all relevant review warnings; opening the row restores its photo, signals, source timestamp and evidence.

The existing platform assets are shared by the result and manual-reference surfaces. Mercari's original wordmark is displayed through a clipped viewport to remove its excess canvas padding. Seller photos still open the existing keyboard-accessible gallery. No generated logo, decorative emoji or new icon dependency was introduced.

## Decision boundary

The underlying instinct is to let buyers scan the same evidence with less visual clutter. The strongest case for this layout is that the price and three buying signals have a stable location. The two serious tradeoffs are reduced discoverability of secondary evidence and greater reliance on spacing when large card borders are removed. Accordingly, collapsed rows retain unknown-cost, condition/version/price and stock warnings, and explicit platform names remain available to assistive technology. Real platform colors are retained rather than recolored to imitate the generated mock.

Smallest test: render the selected layout with isolated synthetic provider facts, exercise source disclosures and photo controls, and complete five searches including both games and Edit/New transitions. Success means the exact selected card survives each transition, costs and source failures stay truthful, and keyboard/mobile controls work without overflow. Kill criteria: hidden mandatory warnings, an incomplete-cost winner, broken gallery focus, a stale-card result or unusable narrow layout. Owner: Codex for implementation/QA; founder for visual preference. Review date: 2026-11-03. This test passed; no buyer-comprehension study is claimed.

## Boundaries retained

- Source adapters, paid allowances, caches, timings, ranking and identity math are unchanged. The prior latency release remains `1284f55`; this release makes no further provider speedup claim.
- Unknown shipping/buyer fees stay unknown and do not become complete-cost winners. Collapsed copy names whether shipping, buyer fees, or both are missing.
- Market reference remains item-only and condition-aware. Unverified seller data stays neutral, and preview/catalog pictures do not increase evidence scores.
- View/language/disclosure changes do not start acquisition. This visual test made no paid marketplace start.
- The local fixture proxy forwards Next navigation headers and remains outside product routes; all fixture pages retain an unmistakable QA banner.

## Verification

- Lint and TypeScript pass; 148 test files pass, five optional live files skipped: 1,971 passing tests and five skips.
- Webpack production build and `git diff --check` pass. Graphify CLI is unavailable; no graph refresh claimed.
- Built-in browser: final desktop English/中文, 390px both languages, 320px and 768px checked. Photos open, zoom and close with Escape/focus restoration. Platform disclosures work by keyboard; source warnings stay visible before expanding.
- Five sequential searches on the production build through the injected-provider harness: Luffy OP01-024/base, Edit Pikachu 58/102/cross, New Charizard 4/102, Edit Zoro OP01-001/base, New Umbreon VMAX 215/203. All reached the matching result. One Piece fixture abstention remained intact.
- Development hot refresh stalled an earlier transition; a clean production build did not reproduce it across the full sequence. No new production-build console warning/error was observed.
- Local evidence: `output/qa/quiet-results-2026-11-02/`. Fixture artwork/facts are explicitly synthetic test material. See root `design-qa.md` for the selected-reference comparison and resolved findings.

## Production

Local gate is green. Deployment ID, final commit and visible production checks will be added after Vercel reaches READY.
