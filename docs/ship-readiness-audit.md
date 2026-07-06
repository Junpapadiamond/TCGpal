# TCGpal Ship-Readiness Audit

Date: 2026-07-04

## Council verdict

Three independent product audits and three blinded peer judges reached the same conclusion: the previous build was engineering-green but product-red. It was suitable for moderated research, not for steering self-serve purchases, because its recommendation semantics could be false.

The highest-severity failures were:

1. Lens winners were forced to be different, so “Cheapest” could cost more than Best Value.
2. Desired and seller-claimed condition did not affect deterministic eligibility or ranking.
3. Unknown shipping silently became zero.
4. TCGCSV aggregate price rows were presented as concrete TCGplayer inventory.
5. Search-discovered snippets were parsed and ranked despite the documented link-only boundary.
6. Listing Q&A lost its target, retained stale answers, and always compared against Best Value.
7. Save/track controls, broad source counts, and marketing claims suggested capabilities the product did not have.
8. Model allocation and narrative added latency to a decision path already owned by deterministic code.

## Product thesis

TCGpal is the fastest trustworthy way to compare condition-compatible raw copies and know when the data is insufficient to recommend one.

The honest launch wedge is a high-consideration U.S. raw-single purchase:

- confirm the exact print;
- compare concrete active eBay listings and exact user-supplied listings;
- use TCGplayer/TCGCSV only as a labeled aggregate reference;
- require compatible seller-stated condition and known shipping before recommending;
- show one recommendation with independent Best Value, Cheapest, Safest, and Documented lenses;
- abstain instead of filling gaps with optimistic assumptions.

## Proven, Better, New

- Proven: collectors already check TCGplayer price context, eBay photos, seller records, condition claims, and shipping before meaningful purchases.
- Better: TCGpal reconciles those checks into one exact-version, condition-aware, complete-cost receipt.
- New: grounded per-listing Q&A explains the deterministic decision without overriding source truth.

The “new” layer is intentionally last. More autonomous marketplace agents do not earn their place until they improve a measured buyer outcome.

## Tony Fadell product read

The painful user problem is uncertainty at the moment before purchase, not lack of another card dashboard. Product quality includes every touchpoint: the promise, wait time, source labels, total language, skipped-row explanation, listing link, and fallback behavior.

That leads to four rules:

- Start with the buyer’s decision, not the available APIs.
- Make every data limitation visible at the point where it changes the decision.
- Remove controls that do not complete a real job.
- Keep AI off the critical path unless an offline evaluation proves incremental value.

## AI and agent boundary

AI earns a bounded place for:

- ambiguous alias/query interpretation when structured parsing has no useful signal;
- exact user-pasted page extraction gaps;
- translation and identity context with citations kept separate from listing evidence;
- listing-and-lens-specific explanations grounded in the report.

AI does not currently earn a place in:

- marketplace allocation;
- eligibility;
- cost math;
- condition compatibility;
- lens selection;
- the initial result narrative.

## Distribution

The initial motion should be concierge-led “check this before you buy,” not broad acquisition.

1. Recruit five buyers who recently considered a meaningful raw-single purchase through personal collector networks, local game stores, card shows, and focused buyer groups.
2. Observe their normal workflow before explaining TCGpal.
3. Run their real cards through the adjudicated comparison corpus.
4. Recruit five more only after the first five produce no unresolved correctness failure.
5. Measure recommendation agreement, time to confidence, opened listing, return with a second card, and voluntary sharing.

Do not spend on paid acquisition, SEO breadth, additional games, or additional agent integrations until correctness and repeat-use gates pass. A privacy-safe shareable comparison receipt is a better next distribution investment than another marketplace connector.

## Launch gates

Self-serve launch requires:

- all ranking invariants green on at least 30 human-adjudicated real listings;
- zero known condition or incomplete-cost recommendation failures;
- at least 90% expert agreement on buy/pass, with every disagreement reviewed;
- English and 中文 desktop/mobile flows verified;
- keyboard, focus, reduced-motion, and error states verified;
- p95 comparison latency measured without model allocation;
- written confirmation or counsel review for public use of TCGplayer-derived pricing. TCGCSV explicitly documents backend application use and daily caching; TCGplayer's separate API terms still require an access application for direct TCG Content/API use.

Until the legal gate is resolved, the build is technically pilot-ready but not approved for unrestricted public launch.

## External source notes

- [TCGCSV documentation](https://tcgcsv.com/docs) permits backend ingestion, asks applications to use a custom User-Agent, and recommends daily caching rather than user-facing direct fetches.
- [TCGCSV FAQ](https://tcgcsv.com/faq) explicitly permits processing the cached JSON/CSV data.
- [TCGplayer API Terms](https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions) separately require an application for use of TCGplayer API content. This is why public-launch review remains a gate rather than an engineering assumption.
