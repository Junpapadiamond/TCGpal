# Compact result cards — direction A

The founder selected A after three independent reviews of density, proportions and brand hierarchy. This supersedes the oversized, unframed result layout released in `b420109`. One listing now has one visible boundary containing its photo, price, signals and actions. The cream/teal/gold system and actual marketplace marks remain.

## Implementation

- The result content is 1120px wide at desktop; frames have a 12px radius and 1px gray-green border. Listing titles are 22px, the primary total 34px and signal values 24px. Lead photos remain clickable, at 112px desktop / 80px mobile width.
- Condition, seller record and item-price comparison stay in that order. Desktop qualifiers sit beside their values. Meters retain their existing meanings; unknown seller/evidence values remain unknown.
- Secondary marketplaces use separate compact expandable cards, with missing-charge and identity/condition warnings visible before expansion. Both redundant “Other marketplaces” headings were removed.
- TCGplayer is a visible reference strip outside manual-link disclosures, explicitly labeled as an NM item reference with its original freshness or unavailable state. It is not a purchasable listing candidate.
- The TCGplayer SVG was successfully loaded but rendered at 0×0 inside an auto-sized flex wrapper. Brand containers now have explicit dimensions and cannot shrink; images use contain. Browser verification measures the mark at 92×28px. Mercari keeps its existing wordmark crop.
- Seller feedback remains available in the main listing's Details. Source timestamps, confidence, missing costs, photo provenance, focus controls and accessible action names are retained.

## Design decision and limits

Clear listing ownership and lower visual weight are the goal. The case for A is a distinct recommendation followed by quickly scanned alternatives. Its tradeoffs are an extra disclosure for secondary evidence and less photo detail at thumbnail size. Photos still open the gallery; mandatory warnings remain outside the disclosure.

The initial 320px height was a design estimate, not a fixed constraint. Preserving full card proportions, truthful supporting facts and 44px controls produces a measured 366px primary cross-market card at 1440×900. That viewport still contains the complete primary card, three marketplace cards and TCGplayer reference. Forcing the initial estimate would reduce useful content or control sizes.

Smallest test: same synthetic facts in EN/中文 at 1440×900, 390×844 and 320×844, including expanded offers and photo controls. Success: price/platform ownership is clear, full desktop comparison fits, and mobile has no clipped costs or horizontal overflow. Kill criteria: hidden mandatory warning, broken photo controls, reference mistaken for inventory, or unreadable mobile layout. Owner: Codex implementation/QA; founder visual preference. Review date: 2026-11-03. No buyer-comprehension study is claimed.

## Verification

- TDD: updated the comparison-flow test to require the TCGplayer link outside a closed disclosure; observed the failure, then the passing behavior.
- Focused suite: 93 tests pass. Full gate: lint, typecheck, 1,971 passing tests / five optional live skips, webpack production build and diff check pass.
- Built-in browser: EN/中文 single/cross desktop, both mobile languages, 320px layout, gallery open/zoom/close, platform expansion, language/view toggles and mobile reference strip checked. At 320px the document scroll/client widths both measure 305px after the scrollbar. Photos/source warnings remain visible in their appropriate states.
- Two independent final screenshot reviews passed density and proportion checks; the third reviewer implemented the brand sizing fix. Mobile auxiliary text should not be reduced further. Long UTC timestamps may wrap at narrow widths (non-blocking).
- The five-search hermetic product-flow contract passed in the full suite. Search/confirmation/Edit/New Search behavior was not modified, so the five-card manual sequence was not repeated.
- No provider, ranking, identity, cache or acquisition change; no paid provider start. Local QA uses the existing clearly labeled synthetic harness, never fallback production inventory.
- Graphify is unavailable on this Windows host; focused source/diff navigation was used. No graph regeneration claimed. React review found no new fetch effects, dependency or provider coupling.
- Evidence: local `output/qa/compact-results-a-2026-11-02/` (the review began before midnight). Screenshots include cross/single EN/中文, cross mobile, narrow Chinese, expanded offers and the mobile reference strip.

## Production

Local release gate passed. Production deployment and visible checks are pending the main push.
