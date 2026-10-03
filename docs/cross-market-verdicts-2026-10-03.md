# Marketplace verdicts and listing previews — October 3, 2026

Owner: Codex. Review date: October 3 after deployment and whenever provider fields change. This implements the founder's request for eBay, Whatnot and Mercari verdicts and pictures after automatic acquisition was restored.

## Decision and falsifiable boundary

The underlying need is a usable buying judgment for every observed offer. The strongest case for an eBay-style surface is that raw asking prices leave buyers to reconstruct identity, condition and cost. Two serious objections to identical purchase recommendations are missing checkout charges and search thumbnails that do not establish actual-card condition. Observed Soldgraph responses omit shipping, fees and seller history; its official OpenAPI and Whatnot documentation expose one nullable primary `image`, not a gallery. Availability remains a provider claim.

Use the same visible verdict structure with deterministic evidence-sensitive outcomes. An eligible complete-cost offer may be considered using existing actions and marketplace-scoped lens wording. Missing-charge-only offers receive a strict pre-tax break-even comparison; unresolved print/condition or unusual prices receive inspect-first guidance. Mismatches fail. The global production ranking remains unchanged.

Smallest live test: Blastoise ex 200/165, all three platforms, with their actual images loading and their lead verdicts visible before expanding alternatives. Success requires English/中文 desktop and mobile usability, working preview enlargement, no false zero charges and no promoted incomplete winner. Kill on an unsafe image URL, preview treated as seller photography, wrong print, false complete cost, anomalous cheap lead or unsupported buy. This is one operational sample, not population coverage or photographic authentication.

## Contracts and interface

- `src/lib/comparison/offer-verdict.ts` owns per-offer assessment and platform lead selection. Valid complete rows reuse Best Value; otherwise price-review, print and condition evidence precede known subtotal.
- `src/features/comparison/offer-verdict-copy.ts` turns facts into localized reasons and next steps. An equal/higher known subtotal has no price advantage; only a positive missing-charge budget can describe conditional savings. Lens superlatives name the observed marketplace sample, and nonwinner rows never claim to be its best offer.
- `CrossMarketPrices.tsx` exposes one lead verdict per platform, with at most two other offers in a collapsed disclosure. It shows condition claims, known/unknown charges, card-match confidence, seller/photo limitations, provider attribution and original timestamps.
- `soldgraph.ts` accepts optional image values only on exact documented HTTPS CDN hosts, with bounded length, no credentials/port/fragment and preserved signed query strings. A refused image does not discard an otherwise usable offer. Browser preview rendering does not fetch marketplace pages or add image evidence; `imageUrls` stays empty and `photoCount` stays zero.
- `SellerPhotoGallery.tsx` distinguishes previews from eBay seller photos, supports enlargement/zoom/Escape/focus return, and displays an unavailable-image fallback on load failure. eBay explicitly marks its supplied gallery as seller photos. The report and provider cache revisions prevent older image-less results masking this change.
- `scripts/testing/cross-market-preview.mjs` uses injected synthetic provider responses and visibly synthetic local SVG previews only for local QA. It does not populate production inventory or publish receipts.

## Verification

TDD reproduced missing preview semantics, cheapest-lens scope, duplicate gallery queries, stale complete-cost flags, nonwinner superlatives, equal-cost language and an unreviewed image host before fixes. Full gate: 1,807 tests pass, five optional live tests skipped; ESLint, TypeScript, metadata audit and webpack build pass. Built-in local QA verified English/中文 desktop, 390px mobile with no horizontal overflow, loaded synthetic previews, zoom, Escape and focus return. Local dev used fallback fonts when sandboxed Google Fonts requests were refused; the production build and deployed visual verification used the configured fonts. No new source request, paid upgrade or quota extension is introduced by verdict rendering.

### Deployed evidence

- Product commit `e95ccfa` fast-forwarded to main; production `dpl_8STzv571V2RTKEqwpLR4vcKqdXJc` reached READY and was aliased to lenstcg.com.
- October 3, 15:22:35 UTC: a no-ZIP comparison returned HTTP 200 in 4.620 seconds, eBay 50 / Whatnot 3 / Mercari 3 / Stomping Grounds 2. eBay's selected complete pre-tax total was $129.99. Whatnot NM $135 received the $5.01-higher-known-cost verdict; Mercari explicitly NM $138.89 received the $8.90-higher verdict. Shipping and buyer fees stayed null, all four global lens winners remained eBay, and no preview increased photo evidence.
- The ordinary built-in browser refreshed the existing production comparison. eBay seller pictures and all six actual Whatnot/Mercari CDN previews loaded with positive natural dimensions. Whatnot enlargement, Mercari zoom, Escape and focus return passed. The $45 Mercari row remained a secondary inspect-unusual-price offer; generic-condition $135 remained inspect-first. All secondary disclosures returned to collapsed state.
- English and 中文 desktop and a 390px mobile production view were visually inspected. Mobile content/client width both measured 375px, all six previews loaded, and source verdicts stayed visible. Browser warning/error checks and deployment-scoped warning/error/fatal logs were empty during verification. Owned local QA servers were stopped and temporary viewport overrides reset.
- Outside-Git proof is in the October 3 visualization directory `cross-market/`: `verdict-live-desktop-en-full.jpg`, `verdict-live-desktop-zh-full.jpg`, `verdict-live-mobile-zh.jpg`, `verdict-live-mobile-zh-full.jpg`, `verdict-live-whatnot-preview.jpg` and sanitized `verdict-live-api.json`. These are observed listings, not the local synthetic fixtures.

This verifies the requested three-platform verdict-and-picture flow for Blastoise. It does not establish universal card coverage, unlimited free capacity, current stock, photographic authentication or missing checkout charges. The existing 80-search application allowance, provider free plan, source attribution and acquisition boundaries remain in force.

Graphify's CLI is unavailable on this Windows host. Existing graph navigation and verified source relationships were used; regeneration is not claimed.
