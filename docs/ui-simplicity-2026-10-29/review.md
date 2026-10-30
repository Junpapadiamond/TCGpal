# UI simplicity release review — October 30, 2026

The founder requested less secondary labeling and explanatory copy, with hierarchy and controls carrying more meaning. AGENTS.md now applies this rule to both languages while preserving decision-critical facts and accessible names.

Implementation commit: `a8eeba7535b1215b553bda3bca99ed33467954c2`, based on the current production commit `eaffc27`. The on-demand eBay Seller Feedback component and its source boundary are preserved.

## Surface review

| Surface | Change | Evidence |
|---|---|---|
| Search | Removed the card-rail instruction and redundant empty-query game label. | English/Chinese desktop and 390px mobile inspected. |
| Loading and print selection | One loading heading and spinner; removed duplicate confirmation labels. Recovery instructions remain. | Live explicit-card loading observed; component tests cover confirmation and recovery. |
| Recommendation and Q&A | One lens badge; removed generic prefixes and the Q&A preamble. Actual rationale, cautions and alternatives remain. | One eBay-only Mew ex 232/91 comparison completed; English/Chinese desktop and English mobile captured; Q&A opened without making a model request. |
| Cross-market | Removed repeated introductions and Verdict prefix; shortened opt-in copy. | Switching views showed the explicit search button and extra-credit disclosure without starting cross-market acquisition. Offer/verdict component tests pass. |
| Saved receipt | Removed decorative labels and repeated sharing instructions; stale-price caveat appears once. | Receipt component tests pass. The older receipt was unavailable in preview, so successful receipt rendering was not visually verified; unavailable state and return-to-search were checked. |
| Method | Removed decorative eyebrow. | English page rendered and inspected. |

Photo qualifiers, source/recall evidence, cost and tax assumptions, confidence, field labels, source errors and collapsed diagnostics remain. No ranking, eligibility, acquisition, API, dependency or project configuration changed.

## Release validation

- Local baseline: ESLint, typecheck, metadata audit and 1,914 tests passed (5 skipped).
- Latest-production merge: cloud lint and typecheck passed.
- Hermetic cloud suite: 143 test files passed, 5 skipped; **1,935 tests passed, 5 skipped**, in 76.05 seconds. Includes the six-card journey, both games, Edit/New Search transitions and the new seller-feedback tests.
- Vercel excludes `output/`, including two tracked test inputs. The verification build restores only the metadata and audit JSON from the exact tested Git SHA. Tests run with a clean environment via `env -i PATH="$PATH"`, without provider credentials or Vercel cache settings. An earlier environment-inheriting run was rejected as a release result; production configuration was not changed.
- Production-mode Next.js build passed on deployment `dpl_i4tQa2DqvwFzp4FnDQCmX8is1JrP`. The hermetic test/build verification runs on `dpl_BYtfLAo91NSJSLdKip12kT1i3Cuh`.
- Preview checked through the existing authenticated Chrome session. No protection settings changed and no share link was created. No paid cross-market search, seller-feedback fetch or Q&A model request was initiated during UI QA.
- Screenshots remain local in this review directory: `after-result-en-desktop.png`, `after-result-zh-desktop.png`, `after-result-en-mobile.png`, search, cross-market, method and unavailable-receipt views. Screenshot export to GitHub was excluded after automatic review rejected unverified screenshot uploads.
- Graph regeneration is unnecessary for these presentation/copy changes. The original local dev/build environment restrictions are superseded by the cloud build and browser evidence above.
