# TCGlens search-entry design QA

## Compact result cards, selected A — 2026-11-03

final result: passed

- Target: founder-selected A from the November 2 proportion/density review, refining the earlier Option 1 with explicit listing frames and smaller type. The written selection supersedes that mock's open unframed layout.
- Latest EN/中文 desktop captures and mobile captures were opened and inspected. Content width is 1120px; the primary cross-market card measures 366px tall. Its title/price/signals are 22/34/24px, photo 112px wide, and all three secondary marketplace cards plus TCGplayer reference fit the 1440×900 viewport. The 320px height proposal was allowed to grow to preserve full image proportions and 44px controls.
- One frame per listing; internal signals retain fine separators. Real Whatnot/Mercari/eBay marks remain, and TCGplayer renders at 92×28 instead of 0×0. No redundant Other marketplaces heading. NM item-reference/freshness is visible outside manual disclosures.
- Browser interaction checks: photo open/zoom/close, view/language switching, marketplace expansion and visible unknown charges. 390px EN/中文 and 320px 中文 checked; narrow document has no horizontal overflow. The mobile reference strip was separately inspected below the listing cards.
- Independent density and proportion agents passed the final screenshots. No P0/P1/P2 issue remains in checked states. P3: long timestamps can wrap on narrow screens; do not reduce mobile helper type further.
- TDD reference-disclosure regression, 93 focused tests, lint, typecheck, 1,971 full tests / five optional live skips and production build pass. Screenshots use conspicuous synthetic QA facts. No live/paid source behavior changed.
- Evidence and decision boundaries: [compact A release](docs/compact-results-a-2026-11-03.md). The older section below records historical QA, not the founder's acceptance of the previous scale.

## Quiet results, selected Option 1 — 2026-11-02

final result: passed

- Exact target: `C:/Users/徐晨濬/.codex/generated_images/01a19ec4-7336-7800-9b32-737e6b32adcd/exec-0604d064-af47-40b1-90be-3a2716eacde3.png`. Founder selected Option 1 and explicitly retained real marketplace marks, including Whatnot.
- Comparison input contained the selected image and the final `cross-zh.png` together. Source is 1487 × 1058; implementation viewport/capture is 1440 × 1024 at 1×. The source is approximately 1.033× the intended desktop canvas; compare proportional content regions, excluding the QA banner/browser scrollbar. This is an existing product implementation, not a static replica of the illustrative listing facts.
- Fonts: Geist for the result workspace, system Chinese sans fallback, 28px desktop listing titles, 48px total and 36px signal values. Resolved P2: the first implementation's desktop metadata and content area were too small relative to the target. Enlarged the content area and supporting type while preserving mobile sizing. Moved the existing form-font reset into the base CSS layer so it does not defeat text utilities.
- Spacing/layout: wide open canvas, restrained separators, three unboxed signals in the required order, compact expandable secondary offers, price and primary action grouped. Header/search controls, source failure rows, receipt, lens controls and feedback remain usable. At 320px the header may wrap before its existing scroll-condensed state; no overlap or horizontal overflow.
- Colors: warm near-white `#fafbf8`, deep teal `#155e63`, restrained gold caution and neutral unknown signals. Removed result grain/large tinted verdict panels. Status text and labels accompany all color encodings; meters still represent the existing scores, not authenticity/grade probabilities.
- Images/icons: reused actual eBay/Whatnot/Mercari assets and existing functional icon components. Resolved P2: Mercari's square padded source had been displayed as a tiny badge; a clipped image viewport now reveals the original wordmark at readable size. No raster asset was repainted, no logo was replaced with an emoji. Catalog art stands in for photos only in the explicitly labeled synthetic harness. Production retains seller photo provenance and clickable galleries.
- Content: synthetic fixture values differ intentionally from the mock. Real source availability, shipping, fees, condition claims and item-only reference semantics win over illustrative mock numbers. Missing-charge summaries name the actual missing charge; evidence/confidence remains in Details. Existing brand lockups and a per-offer timestamp footer are intentional deviations from the generated artwork.
- Interaction: photo open/zoom/Escape/focus restoration, keyboard marketplace expansion, single/cross view toggles, language toggles and lenses passed. Cross-market disclosures add no acquisition. The frozen fixture run completed Luffy OP01-024/base → Edit Pikachu 58/102/cross → New Charizard 4/102 → Edit Zoro OP01-001/base → New Umbreon VMAX 215/203. Incomplete One Piece fixture evidence stayed inspect-only. Development hot refresh stalled one earlier local transition; a clean production build completed the full sequence without that symptom or application errors.
- Responsive evidence: `output/qa/quiet-results-2026-11-02/` contains final single/cross English/中文 desktop screenshots, both languages at 390 × 844, and a cross-market 320 × 844 capture; 768 × 1024 was inspected too. The native desktop comparison made type, logos and signals readable; expanded details, gallery and narrow views supplied the focused interaction checks. The document scroll width equaled client width (375/305px after the 15px browser scrollbar) at the two mobile viewport widths.
- Verification: lint, typecheck, 1,971 passing tests with five optional live skips, webpack production build and diff check passed. Three new behavior regressions cover retained marks/disclosures and precise bilingual missing charges. React review found no new fetch effect, dependency or provider coupling. Graphify is absent on this Windows host, so source navigation was used and no regeneration is claimed.
- Checklist: selected target checked; real assets retained; evidence/cost gates retained; keyboard/gallery checked; desktop/mobile checked; local full gate green. No remaining P0/P1/P2 finding in the checked states. Production release evidence is recorded in [the release note](docs/quiet-results-design-2026-11-02.md).

## Listing signals and catalog repair — 2026-11-02

- Result: no blocking findings remain in the checked states. This is a presentation change, not a new condition/identity prediction or ranking model.
- Audit: the live eBay result repeated condition, confidence, price-position and recommendation prose. Cross-market offers repeated the same facts in different sentences. Both are now served by three shared tiles: Condition, Seller record, Price vs market. Longer reasoning and confidence remain under Details; costs, source/time and decision-changing warnings remain visible.
- Selected target: founder's option one, corrected to the exact three-signal order and existing clickable photographs. `output/qa/performance-2026-11-02/selected-signal-design.png` was inspected together with the implementation capture in the same comparison input. The concept is illustrative; actual listing titles, prices, original thumbnail sizing and existing actions are retained, so no pixel-perfect match is claimed. No generated image is used in production.
- Visual evidence: `output/qa/performance-2026-11-02/` contains `signals-ebay-en.jpg`, `signals-ebay-zh.jpg`, `signals-cross-en.jpg`, `signals-cross-zh.jpg` (1440 × 1024), `signals-ebay-mobile.jpg`, `signals-cross-mobile.jpg` (390 × 844), and `signals-narrow-zh.jpg` (320 × 844). These captures use a visibly labeled synthetic provider harness, not live marketplace facts. Document scroll width equals client width at 390 and 320 px.
- [Resolved P2] The unlayered global anchor reset defeated the primary button's light text color. Moved it into Tailwind's base layer; the actual button now uses `#fcfbf6` on `#2f6f73`. Re-captured after the fix.
- Semantics: condition remains a seller claim, the segmented bar represents evidence completeness, seller record uses the existing score, and the market ruler uses the existing item-price delta. Missing data has no filled meter; no seller ratings means Unverified. Played-condition references stay neutral and labeled NM reference. Unknown shipping/fees still prevent a comparable winner.
- Interaction: eBay photo and cross-market provider preview open, zoom and close; Escape restores focus to the original image button. Details opens by keyboard. View/language switching does not acquire listings. Existing share, lens and feedback controls remain available. No extra motion or icon dependency was added.
- Gate: five new signal regressions; full 1,966 passing tests, five optional live skips; lint, typecheck and webpack production build pass. Graphify CLI is unavailable on this host; no regeneration claimed. The original dirty checkout remains untouched.
- Live performance/catalog verification was on product `423ba15`: five sequential searches with both games and Edit/New transitions passed; all four Ascended Heroes Pikachu artworks and symbols loaded. See [release record](docs/performance-images-2026-11-02.md) for measured durations and final UI deployment evidence.
- Final production UI `470efdf` is READY at `lenstcg.com`. Real Pikachu offers, photo navigation/zoom/Escape, keyboard Details and saved-receipt refresh passed. `live-signals-en.jpg`, `live-signals-zh.jpg` (1440 × 1024) and `live-signals-mobile-en.jpg`, `live-signals-mobile-zh.jpg` (390 × 844) show the deployed result. No mobile overflow or browser warning/error was observed. Cross-market visual/unknown states were verified locally with injected providers; no additional paid acquisition was made.

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
