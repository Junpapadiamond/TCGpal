# November 2 performance and catalog repair

## Observed problems

Production logs on November 2 Eastern (November 3 UTC) recorded a 9,482 ms card-identity request and a 90,274 ms cross-market comparison. The latter returned eBay/Whatnot/merchant rows while Mercari failed. The UI withheld the completed eBay report until the optional cross request finished. This is evidence of upstream latency and orchestration waterfalls, not proof that more server memory or CPU is needed.

The bundled Pokémon catalog reconstructed every image as `images.pokemontcg.io/{set}/{number}.png`. The official source now contains Scrydex URLs for newer cards and set symbols, including Ascended Heroes Pikachu. The API is also [deprecated](https://dev.pokemontcg.io/); its announcement says existing keys continue until March 1, 2027. No provider subscription or credential migration is included here.

## Changes and boundaries

- Display eBay as soon as its report arrives. One explicitly requested cross-market expansion continues separately, with duplicate acquisition disabled. Edit, New search, and browser history cancel/ignore stale completions. Switching views or language still never acquires inventory.
- Check the verified report cache before reloading card identity. Reuse the same eBay search and recall evidence for single-to-cross expansion, retaining original observation timestamps and the original 15-minute expiry. Pure-card keys remain scoped to card, game, condition, delivery/tax context, provider configuration and market scope. Custom agents and failed searches are not cached.
- Give the live Pokémon API 1.5 seconds when the real, source-dated bundled catalog can recover that query. Unknown/new cards retain their longer lookup budget. Confirmed-card recovery preserves the exact ID; a fast failure may still recover an inline market anchor within the remaining budget. No catalog price is fabricated.
- Resolve eBay identity and TCGCSV mapping in parallel. Keep deadlines active through body parsing and propagate cancellation through provider fetch wrappers. Record each provider's duration to distinguish future server and upstream delays.
- Refresh the compact catalog from official `PokemonTCG/pokemon-tcg-data` revision `39a26a144c8b6ef6c2fb17b2c29d0bb7121e3a11` (source date September 16, 2026). Preserve explicit image/symbol URLs when they differ from legacy paths. Catalog size is 20,635 cards, up 191; 879 require nonlegacy artwork URLs. Invalidate old identity/report cache entries by catalog/image revision.

All pricing, exact-print, unknown-cost, seller-evidence, paid-provider counters and access boundaries remain enforced. Cross-market providers can still take their existing bounded time or fail; the improvement is that they no longer withhold the primary result. No paid provider activation, quota reset, or server-plan change was made.

## Decision and falsifiable check

The strongest case for these changes is that known catalog identities and already acquired eBay facts need not be repeatedly fetched, and useful results can be shown independently. Two serious objections are stale bundled metadata and extending the apparent freshness of cached listings. Source dates, exact-ID recovery, versioned keys, original timestamps and TTL caps address those objections without changing ranking evidence.

Decision: make this bounded repair before considering a provider replacement or server upgrade. Owner: repository maintainer. Review: November 2 release verification, then the next founder search session. Success: known catalog lookup completes near its 1.5-second head start; primary results render while cross is unresolved; repeated searches reuse evidence without new eBay acquisition; all affected artwork loads; cancellation never displays another card's late result. Kill/revert the affected optimization if it substitutes a print, hides a failure, extends listing freshness, or permits duplicate paid acquisition.

## Verification

TDD reproduced the latency, body-deadline, eBay reuse, early-result and stale-result defects before implementation. Full suite: 147 files passed, five optional live files skipped; 1,961 tests passed and five skipped. Lint, typecheck and the production webpack build passed. Deployed verification is recorded below after completion.

All 20,635 expanded small/large artwork URLs were compared with the checked-out official source: zero mismatches. Local built-in browser verified four Ascended Heroes Pikachu images and their set symbols, in English and Chinese desktop and 390 px mobile; no horizontal overflow. Local identity logged 1,531–1,568 ms. Local eBay credentials were unavailable, so those captures verify catalog UI, not live inventory. Screenshots remain local under `output/qa/performance-2026-11-02/`.

Graphify CLI is unavailable on this Windows host (including the documented macOS path). Existing graph/source navigation was used; no graph regeneration is claimed. Work was isolated from the original dirty checkout.

## Result-card design follow-up

The founder selected concept one, then specified **Condition → Seller record → Price vs market**, no full card-match tile, and the existing clickable photographs. The shared `ListingSignals` component now applies that order to the primary recommendation, inspect lead, supporting candidates and cross-market offers. CSS evidence bars and a market-reference ruler use the existing deterministic facts; no emoji or generated card art enters the product. Print checks remain compact. Supporting reasons and confidence remain in keyboard-accessible Details disclosures; unknown charges, identity conflicts and seller-claim qualifiers remain visible.

The strongest case for this change is immediate comparison without repeated paragraphs. Two objections are that progress bars can look like grading certainty and that collapsed explanations can conceal a decision-changing limitation. The condition bar therefore labels evidence completeness, missing signals stay neutral, and charge/identity warnings remain outside disclosure. Decision: release this reversible presentation change without changing ranking. Owner: repository maintainer. Review: the next founder search session after November 2. Success: buyers can locate condition, seller history and reference-price position before opening Details, and still open/zoom/close photographs by mouse or keyboard. Kill criteria: any unknown signal appears verified, a warning disappears, or the image interaction breaks.

TDD added five signal tests and updated both result-card integration contracts. Full gate: 1,966 tests passed, five optional live tests skipped, lint/typecheck/build passed. The built-in browser checked English and Chinese desktop, 390 px mobile and 320 px Chinese without horizontal overflow, using the visibly labeled synthetic cross-market harness. Seller-photo and provider-preview dialogs still open, zoom and close with Escape, returning focus to the opener. A pre-existing unlayered anchor reset overrode Tailwind link colors; moving it into the base layer restores readable cream text on the teal primary button. See [design QA](../design-qa.md).

## Deployed checks

- Product commit `423ba15` fast-forwarded to main and pushed. Vercel `dpl_CXam4DLxJUmXeoGefqJy7ZrWXbZR` is READY and aliased to `lenstcg.com`.
- First production Umbreon identity: 1,028 ms server time; comparison: 2,627 ms, including eBay at 1,684 ms and 50 candidates. Repeat report: 121 ms server time / 1,307 ms from the local HTTP client, with an explicit verified-cache hit and no identity reacquisition.
- Broad Pikachu identity: HTTP 200 in 1,757 ms from the local client, 200 choices, all four Ascended Heroes image URLs at the source-provided Scrydex paths. The API timeout and September 17 UTC bundled-source date remain visible in warnings; this is not a claim of live catalog freshness.
- No additional paid source search was used for these checks. Pending cross-market display, duplicate prevention, cancellation and source reuse are covered by injected-provider regression tests, not a fresh paid production run.
- Built-in production browser completed five sequential eBay-only searches: Umbreon VMAX 215/203 → Edit Luffy OP01-024/base → New Charizard 4/102 → Edit Zoro OP01-001/base → New Pikachu 25/165. Both One Piece selections retained the chosen base print. A subsequent broad Pikachu search filtered to Ascended Heroes rendered all four card artworks and all four set symbols successfully.
- UI product commit `470efdf` is READY in `dpl_4K87LqmixdRsPxxbTyXRSfc9Buqk`, aliased to `lenstcg.com`. A real Pikachu result rendered the three signals in English/Chinese desktop and 390 px mobile, retained image navigation/zoom/Escape and keyboard Details. A saved receipt restored with its caution and refreshed successfully. Production logs showed a 124 ms cache hit and a subsequent fresh 2,453 ms comparison (50 eBay candidates; provider 1,862 ms). Browser warning/error logs were empty. Final live captures: `live-signals-{en,zh}.jpg`, `live-signals-mobile-{en,zh}.jpg`, and repaired catalog `live-pikachu-en.jpg` in the local QA directory.
