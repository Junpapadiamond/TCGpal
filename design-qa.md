# TCGpal App Shell Design QA

- Source visual truth: `/Users/chenjunhsu/Desktop/projects/TCGpal/output/design-qa/app-shell-reference.png`
- Implementation screenshot: `/Users/chenjunhsu/Desktop/projects/TCGpal/output/design-qa/results-en-desktop-final.png`
- English desktop: `/Users/chenjunhsu/Desktop/projects/TCGpal/output/design-qa/results-en-desktop-final.png`
- Chinese desktop: `/Users/chenjunhsu/Desktop/projects/TCGpal/output/design-qa/results-zh-desktop-final.png`
- Mobile viewport: `/Users/chenjunhsu/Desktop/projects/TCGpal/output/design-qa/results-en-mobile-final.png`
- Full-view comparison: `/Users/chenjunhsu/Desktop/projects/TCGpal/output/design-qa/side-by-side-final.png`
- Focused comparison: `/Users/chenjunhsu/Desktop/projects/TCGpal/output/design-qa/focused-comparison-final.png`
- Desktop viewport: 1280px wide, complete labeled-demo result state
- Mobile viewport: 390 × 844, complete labeled-demo result state

**Findings**

- No actionable P0/P1/P2 findings remain.
- Fonts and typography: the implementation preserves TCGpal's existing Fraunces/Noto Serif display stack and compact system body text. The hierarchy matches the source: compact app bar, serif card identity/title, monospaced prices, and small data labels. Long listing titles truncate on compact rows and wrap on the lead row without collision.
- Spacing and layout rhythm: the persistent query bar, market strip, four lens controls, lead listing row, supporting rows, sticky rail, and footer match the source composition. The preview is intentionally limited to four rows before “Show all,” preserving the target density.
- Colors and visual tokens: the existing cream/teal/gold system is retained. Semantic green, amber, terracotta, and neutral tags remain legible and consistent with the product's risk/evidence language.
- Image quality and asset fidelity: live catalog/listing card images replace the mockup's placeholder thumbnails at the correct card aspect ratio. Existing brand and icon assets are reused; no placeholder artwork was introduced.
- Copy and content: marketing copy disappears in the results state. Market information is expressed as compact data marks. Dynamic source warnings remain visible because source transparency is a product requirement.
- Responsive behavior: the 390px result view keeps the app bar, editable query, market data, lens controls, and lead row usable without horizontal overflow.
- Accessibility and behavior: lens tabs expose pressed state; Save and Track expose persistent state; Track uses a semantic switch; Edit opens a labeled compact form; language switching updates the page language; focus styles and reduced-motion behavior remain present.

**Patches made since the previous QA pass**

- Reduced the default result preview from eight rows to four.
- Changed “Check the math” from a boxed submodule to a compact inline disclosure.
- Verified Best Value/Cheapest reordering, Save card, Track card, English/中文 switching, and mobile layout.

**Follow-up Polish**

- [P3] The live-source warning adds vertical space above the market strip when a provider fails. This is intentional evidence transparency, but a future iteration could compress repeated provider errors into a one-line status disclosure.

final result: passed
