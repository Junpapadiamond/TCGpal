# TCGlens search-entry design QA

## Animated search examples — 2026-10-03

- Six curated suggestions rotate every three seconds with a 280ms fade/5px upward entrance and a 35ms stagger. Automatic changes stay within the examples component; they do not modify the search field or call providers.
- Hover, keyboard focus, typing, hidden tabs, and reduced-motion preferences stop automatic changes. A localized pause/resume button and the existing More examples control remain available. A refresh excludes the currently displayed group even when session storage is unavailable.
- Mobile uses two columns with three fixed-height rows. English and 中文 were inspected at 1440 × 1024 and 390 × 844; the mobile document width remained 390px. Desktop reserves a second chip row so the controls below remain stable for normal groups.
- Screenshots: `C:/Users/徐晨濬/.codex/visualizations/2026/10/03/01a101bb-46d9-7242-b70f-a9b7beb310e6/search-examples/`: `en-desktop.jpg`, `zh-desktop.jpg`, `en-mobile.jpg`, `zh-mobile.jpg`.
- Built-in browser smoke: Pikachu 58/102 example → Edit Luffy OP01-024/base → New Charizard 4/102 → Edit Zoro OP01-001/base → New Pikachu 25/165 → New Nami OP01-016/SP. Every result retained the selected identity; incomplete One Piece synthetic evidence remained an inspect lead. No live marketplace acquisition was used.
- Verification: seven timer/interaction regression tests, the existing 53 comparison tests, lint, typecheck, metadata audit, and the default Turbopack production build passed. The final full suite passed 118 files / 1,606 tests, with five optional live tests skipped. Installed CLIs were invoked directly because npm is absent from PATH. The isolated worktree uses a local copy of existing dependencies because Turbopack rejects a junction outside its root.
- Browser console: one expected Fast Refresh reload warning during development; no application errors. Graphify regeneration remains unavailable because this Windows host has no Graphify CLI.

## Search-entry redesign — 2026-09-27

## Result

No actionable P0/P1/P2 findings remain for this change.

## Visual target and evidence

- Target: the first displayed Phia-inspired concept, adjusted by the founder to remove decorative lines, keep the existing rolling/clickable card rail, and offer more varied search examples.
- Source: `C:/Users/徐晨濬/.codex/generated_images/01a0e143-728d-7b31-8752-9e5dc1d2bd0d/exec-2018fc45-a650-4949-a950-80053164d8eb.png` (1487 × 1058).
- Evidence directory: `C:/Users/徐晨濬/.codex/visualizations/2026/09/27/01a0e143-728d-7b31-8752-9e5dc1d2bd0d/tcglens-phia-design/`.
- Implementation: `landing-en-desktop.png`, `landing-zh-desktop.png` (1440 × 1024 CSS viewport); `landing-zh-mobile.png`, `landing-en-mobile.png` (390 × 844 CSS viewport, full-page captures).
- State: empty card-search homepage, cream/teal theme, six examples, original card art/rolling rail. Source and implementation were opened together in the same comparison input. The source is a concept image, not a browser capture; composition was compared proportionally, not as a pixel-perfect diff.
- Focused comparison: the search controls, chip labels and card rail are legible in the full desktop images; mobile controls were inspected separately at 390px.

## Findings and fixes

- [Resolved P2] A pill radius on the two-row mobile search box produced a large oval. The breakpoint now uses a 24px radius; the submit button remains fully visible. Re-captured and inspected in `landing-zh-mobile.png`.
- Typography: existing Fraunces/Noto Serif families retained, with a larger, lighter hero heading. The centered hierarchy follows the selected concept. Existing exact-card copy remains instead of the concept's marketing headline.
- Layout: rounded search surface, six wrapping examples and explicit refresh control. The existing game, ZIP and condition controls remain directly below. No horizontal overflow at 390px; a longer mobile page is expected from six usable touch targets.
- Colors: existing cream, teal and restrained gold tokens retained. Decorative lines, textured art and handwritten text from the concept are omitted as requested.
- Images: actual existing catalog card art and original rolling track retained. Generated concept card art is not used. No failed images were observed on the homepage.
- Content: examples contain supported card-name/number queries. Explicit condition presets update the real minimum-condition control. Budget parsing or new AI capability is not claimed. The rail hint reads “Click a card to compare” / “点击卡片，开始比价”.

## Interaction and accessibility checks

- Examples fill the editable field and focus it; condition presets apply, with no comparison until submit. More examples preserves typed text. Six distinct examples are selected from each game's 16-item pool and avoid the previous group.
- Original rail animation remains running; a real pointer click on Charizard starts comparison. Existing focus, clone-click and reduced-motion behavior is unchanged and covered by the suite.
- Built-in browser smoke: Umbreon VMAX 215/203 → Edit Luffy OP01-024 (base) → New/rail click Charizard 4/102 → Edit Zoro OP01-001 (base) → New Pikachu 25/165 → New Nami OP01-016 (SP). Correct identity remained visible after each transition. One Piece fixture rows correctly remained inspect leads when fixture evidence was incomplete.
- Flow used the visibly labeled local synthetic-provider harness; no paid acquisition or live provider validation was performed.
- English/中文 desktop and mobile checked. Example buttons have accessible labels and 44px minimum height. Browser warning/error logs were empty in the inspected tabs.
- Gate: ESLint, TypeScript, metadata audit, 114 test files / 1,571 tests passed (5 files/tests skipped), and Next production build passed. Installed CLIs were invoked directly because npm is absent from PATH.

## Follow-up polish

- No blocking follow-up. Graphify CLI is unavailable on this Windows host; structural graph regeneration remains unverified.

final result: passed
