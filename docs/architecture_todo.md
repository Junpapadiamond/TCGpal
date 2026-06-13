# TCGpal Architecture TODO

## Why this exists

The current demo is useful enough to show, but the app is starting to outgrow the single-file prototype shape. Before adding Parser, Comps, or more agent-like features, clean up the architecture so new work does not make the product harder to trust or maintain.

## 1. Split the client app

`src/app/page.tsx` is currently the whole client app: navigation, onboarding, Home, Ready to Buy, decision sheet, listing risk, raw-vs-slab, journal, i18n copy, and helper components.

Do not add Comps/Parser directly into this file.

Suggested split:

- `src/components/brand/BrandMark.tsx`
- `src/components/layout/Header.tsx`
- `src/features/onboarding/*`
- `src/features/home/*`
- `src/features/ready-to-buy/*`
- `src/features/listing-risk/*`
- `src/features/raw-vs-slab/*`
- `src/features/journal/*`
- `src/lib/i18n/copy.ts`
- `src/lib/i18n/localize.ts`

Keep behavior unchanged during the first split. Move code first, then improve it.

## 2. Treat journal migration as a product requirement

`localStorage` is fine for the PM demo, but the Decision Journal is the highest-value retention asset. If users actually start writing buy theses, outcomes, and grading results, losing that data across devices is unacceptable.

Migration path to plan:

- Keep localStorage as offline/demo cache.
- Add export/import JSON before adding real accounts.
- Define stable journal and purchase ledger schemas.
- Add account-backed storage only when the product flow is stable enough to justify auth.
- When persistent storage arrives, migrate local entries into the account after explicit user confirmation.

Do not add real auth casually. The product should earn account creation by making the journal worth saving.

## 3. Keep external APIs bounded

The repo already has optional Pokemon TCG and PriceCharting server routes. This is okay, but the product rule is:

External APIs gather evidence. They do not silently drive recommendations.

Allowed:

- Card lookup/autocomplete.
- Card image URLs from trusted card databases.
- Price lookup behind configured server tokens.
- Future comps reports with source links and confidence levels.

Not allowed yet:

- Always-on market scanning.
- Scraping marketplaces without a clear policy.
- AI price prediction.
- Recommendation ranking based on external data without showing evidence.

## 4. Agent-like features that are actually justified

Only add agents where rules and static forms are not enough:

- Listing Parser: extract card, version, price, condition claims, and missing info from messy listing text.
- Version Matcher: detect language/set/number/reprint/promo mismatch.
- Comps Agent: gather recent sold comps, filter wrong versions, and show source links.
- Evidence Critic: point out missing photos, weak condition proof, and unsafe grading assumptions.
- Report Synthesizer: turn the above into a calm buy/wait/ask/run-math recommendation.

Budget hard stops, raw-vs-slab math, today-spend ledger, and basic guardrails should remain deterministic.
