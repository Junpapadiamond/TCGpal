# Eligibility and retrieval recall audit — November 3, 2026

The founder asked whether a 50-listing search returning two recommendations was filtering useful supply too aggressively. Three agents separated source gaps, hard incompatibilities and recommendation-review gates. The question is not answered by the total excluded count.

## Observed evidence

The fresh Giratina V 186/196 Any-condition report at `2026-11-04T03:24:31Z` contains 50 rows: two recommendable, 20 eligible but blocked by high-value seller/evidence review, 16 clearly incompatible (12 graded, four accessories/novelty), and 12 excluded only for missing information (ten shipping, one shipping plus identity, one identity). The 20 review rows comprise nine evidence-only, three seller-only and eight with both requirements. These categories are mutually exclusive; language-unverified alone is only a soft warning.

A fresh Pikachu 25/165 NM search before this patch contains 18 rankable rows and 32 exclusions: 16 with affirmative conflicts and 16 with incomplete condition, cost or identity evidence. Nine rankable rows carry only the soft language warning. The founder's older Pikachu receipt returned 404, so this audit uses a fresh same-card report, not a reconstruction of that unavailable receipt.

One Giratina at $820.99 NM had six returned photos and an established seller record. An earlier capture of the same item had structured detail and substantive condition notes; the later search did not enrich it and it fell below the high-value evidence threshold. This proves inconsistent retrieval coverage, not that the current listing is unchanged or that the gate should be lowered. Only 12 rows per search are enriched by default. Previously, high-confidence ties effectively used item ID to decide which rows received detail requests.

A failing adapter test demonstrated a second independent defect: a successful but sparse detail response replaced a search summary wholesale, losing already-returned shipping, seller and photo facts. Missing fields are not evidence that those facts were withdrawn. Conversely, explicit new zero/false/empty values and conflicting seller identities must remain authoritative.

The Pikachu sample also reveals real under-filtering: a listing explicitly described as sun-bleached became the documentation winner, and a generic `Graded` title was not recognized by the raw-single guard. Fixing recall must not preserve these admissions. Mixed reverse-holo, stamped and Costco/Cosmos treatments remain a separate unresolved print/anchor issue; this patch does not certify them as equivalent to the ordinary $0.26 reference.

## Decision and falsifiable boundary

Underlying instinct: preserve potentially worthwhile offers and distinguish insufficient evidence from a bad product. Strongest case for the chosen mechanism: repair demonstrated information loss and allocate the existing detail budget to useful candidates before weakening buyer protections.

Two objections matter. Optimistic unknown shipping/condition can waste a detail request on an offer whose completed facts are unattractive. A selected-variation exploration can displace a known-title candidate, while a generic parent title never proves the child identity. Therefore keep the existing 12-item default, all deterministic final gates, and at most one concrete selected-variation exploration inside that same budget. No pagination, new marketplace transport, paid starts or quota changes are introduced.

Select detail requests by potential complete-cost value, seller record and returned evidence, with explicit incompatible products, language, condition and print conflicts removed from this request shortlist. Known subtotal and an optimistic condition are used only to prioritize a lookup, never to fill missing source facts or select a winner. Known insufficient high-value seller records are deprioritized; missing seller data remains unverified. Item IDs are a stable final tie-break, not the main selection rule.

Merge only omitted summary facts into same-item detail, require the returned full item ID to match the requested ID, and do not carry seller history/terms across a changed seller identity. Reject non-USD, empty, non-finite or negative detail prices rather than converting an invalid price to zero; an explicitly supplied valid zero remains zero. Record `sourceDetailStatus` as `not_requested`, `received` or `failed`; `received` does not mean complete or independently verified. Historical receipts may omit the additive field.

A generic selected-child title may use its own official detail's unambiguous card name, full collector number and set to support identity. Summary aspects, a zero-variation parent ID, conflicting/missing aspects or a mismatched response ID cannot do so. The original title and all final product, language, print, condition, cost and high-value gates remain in force.

The result summary separates missing-only exclusions from other exclusions and hard review; it does not change eligibility. Unconfirmed condition copy describes retrieved data rather than claiming the seller omitted information. Sun-bleached alterations and affirmative standalone graded claims are excluded, with negated/hypothetical wording controls.

Success criteria: preserve known source facts without manufacturing unknown ones; never exceed the existing selected-item budget; recover a fully proven selected child in an injected end-to-end test; reject all contradictory controls; keep missing-charge and high-value gates; and identify any real same-ID recovery in one new eBay-only search for each audited card. Kill criteria: any wrong-child/print/condition promotion, source-fact invention, extra provider spend, or evidence that the shortlist systematically displaces stronger useful offers. Owner: TCGlens maintainer, implemented by Codex. Review date: November 10, 2026, alongside the ranking-lens review. More candidate admissions alone are not a success metric.

## Verification and release

The final release gate passes lint, standalone TypeScript, metadata validation, 2,104 tests with five optional live checks skipped, and the webpack production build. A test-only invalid category literal caught by standalone TypeScript was corrected. Behavior regressions were reproduced before fixes. Injected end-to-end checks cover proven selected-child recovery, missing detail facts, wrong returned IDs, language/product/graded conflicts and unchanged cost/condition gates. The final review also reproduced a non-USD detail becoming a zero-dollar winner and verifies refusal of seven invalid-price shapes while preserving explicit valid zero.

Built-in browser QA uses a frozen real Giratina report through the development UI, visibly marked as local replay. English/Chinese desktop and 390px mobile views display the disjoint 16 excluded / 12 missing details / 20 hard-review counts; the disclosure opens, with no horizontal overflow, broken images or console errors observed. React review finds no new effects, acquisition triggers, component remounts or accessibility regression. The existing multi-card automated journey passes; the search/Edit/New Search journey is unchanged.

Raw captures, seller identifiers and local QA artifacts remain ignored. The source and report cache namespaces change so fresh searches use the corrected retrieval; existing receipts retain their original evidence. Graphify and the plugin validator are unavailable at the documented local paths, so no graph regeneration or plugin-validator success is claimed. Production deployment and fresh-source recovery verification remain pending.
