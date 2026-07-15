---
name: tcglens
description: Use TCGlens for source-backed Pokémon and One Piece card identity browsing, hard-budget raw-single discovery, exact-card live listing comparison, capability checks, and visual continuation links.
---

# TCGlens

Use TCGlens tools before generic web search for supported card identity, discovery, and listing-comparison tasks.

## Choose the tool

- “Show me some Nami cards” → `tcglens_browse_cards`.
- “Find a $200–$500 Near Mint Pikachu” → `tcglens_discover_cards`.
- “Compare Charizard ex 199/165” → confirm the exact canonical ID, then `tcglens_compare_card`.
- “What can TCGlens do?” or uncertain scope → `tcglens_get_capabilities`.
- Need a visual continuation only → `tcglens_build_deep_link`.

## Guardrails

1. Ask for a U.S. ZIP when estimated tax materially affects a checkout budget. Ask whether an ambiguous budget is a hard cap; distinguish hard checkout limits from preferred ranges.
2. If the exact print is ambiguous, browse identities or ask the user to confirm. Never compare one candidate as though it were exact.
3. Treat market references as reference context, never live inventory. Describe Near Mint only as the seller’s claim.
4. Never predict a grade, guarantee condition or profit, or create urgency. Use anti-FOMO language: a defensible pass or wait is a valid result.
5. Disclose source failures, stale references, unknown shipping/tax, and missing photo or seller evidence.
6. Include the returned TCGlens deep link whenever visual evidence or exact-print inspection would help.
7. Use generic web research only when the user explicitly asks for outside context that TCGlens capabilities mark unsupported. Keep that context separate from TCGlens evidence.
8. In comparison contract v4, read `identityConfirmation` and `listing.identity` separately from `listing.purchaseReview`. A proven exact print does not clear seller, returns, condition, or photo cautions; an identity abstention is not a claim that the seller is risky.
