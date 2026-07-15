# Comparison contract v5

Contract v5 keeps exact-print identity independent from purchase eligibility. A listing may prove the confirmed artwork and still be excluded because it is graded, a non-card product, the wrong language or condition, inactive, missing shipping, or implausibly priced.

## Typed eligibility issues

Every normalized listing exposes `eligibilityIssues` with a stable `code`, `category`, `disposition`, and user-facing `message`. Categories are `product`, `condition`, `cost`, `price`, `language`, `identity`, and `availability`; dispositions are `exclude` and `review`. The legacy `exclusionReasons` strings remain for one compatibility release and contain only excluding issues.

Primary reasons are ordered product → condition → cost/availability → price → language → identity. A slab whose title proves Law Manga therefore reports a product exclusion, not an artwork mismatch. An unstated language produces `language_unverified` as a review note; only explicit conflicting language excludes.

## One Piece positive proof

Print fidelity considers collector number, card name context, artwork class, treatment, reviewed release markers, and sibling conflicts. Product type and language are handled by eligibility. Seller-facing `Manga` can uniquely prove a manga sibling without an internal `_pN` suffix. Generic `SP` remains insufficient unless a reviewed seller-visible release or treatment marker makes the sibling intersection unique; for example, `EB03-055 + SP + Heroines` proves the Nico Robin Heroines SP.

## Research provenance

When a new alias, release marker, or sibling distinction needs investigation, follow `docs/card-identity-research-policy.md`. Official sources establish canonical facts; structured catalogs cross-check them; specialist guides, forums, Reddit, and marketplace examples surface terminology and failure modes. Community evidence never auto-promotes a runtime identity rule.

## Pokémon search and journey state

Pokémon name matching classifies exact, form, related, and unrelated names. Single-character searches exclude combination cards, Trainers, and overlapping longer names: Mew does not accept Mewtwo, and Mewtwo does not accept Mewtwo Spirit Link. Explicit combination-card input remains supported. Identity search requests only catalog fields needed by the gallery and cap name pages at 100; full price data is fetched after stable-ID confirmation.

Client requests use an AbortController plus a monotonically increasing generation. New Search, edited searches, and browser navigation cancel stale work; aborts do not retry or emit failure analytics. Search, confirmation, and result snapshots use Next.js 16's supported native History API. URLs contain only `query`, `game`, `step`, and canonical `card`; buyer and listing facts stay in memory.

## MCP and compatibility

TCGlens plugin `1.0.2` publishes comparison contract v5. MCP listing projections expose typed eligibility issues inside purchase review while keeping `listing.identity` separate. Card identity contract v1 and report identity fields from v4 remain compatible during the transition.
