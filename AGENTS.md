<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project uses Next.js 16. APIs, conventions, and file structure may differ from older training data. Read the relevant guide in `node_modules/next/dist/docs/` before making framework-level changes. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TCGpal Agent Guide

## Current Status

The app is a Phase 0.7 PM-demo MVP. It is intentionally local-first and card-forward:

- Brand is `TCGpal`.
- First open starts with a three-step onboarding flow: favorite TCGs, player persona, and optional budget range.
- Home shows curated card recommendations immediately, using designed CSS card placeholders instead of real card images.
- A card decision sheet connects each recommendation to Raw vs Slab, Listing Risk, and 30-day plan actions.
- Raw vs Slab is deterministic TypeScript math.
- Listing Risk combines deterministic text-risk logic with optional server-side AI explanation.
- Decision Journal and 30-day plan are persisted in `localStorage`.
- Journal grading history can influence future PSA10 assumptions through deterministic calibration.
- Hermes/agent trace exists for portfolio and debugging, but should stay collapsed or low-visibility for normal users.

## Product Goal

TCGpal is a cautious decision layer for TCG collectors and small sellers. The product should feel card-first: users choose TCGs and persona, see curated cards immediately, then decide whether to check listing risk, run raw-vs-slab math, or add a decision to a 30-day plan.

The product must feel like a careful hobby assistant, not a financial advisor, hype tool, or trading bot.

## Phase 0 Scope

Use `localStorage` only. Do not add Supabase, auth, image upload, payments, scraping, external marketplace APIs, or always-on web search in the current phase.

Core pages:

- First-run TCG/persona/budget picker
- Card-forward Home with curated demo recommendations
- Listing Risk Checker
- Raw vs Slab Calculator
- Decision Journal
- 30-day decision plan items created from Listing Risk and Raw vs Slab outputs
- Hermes Router API route
- AI-assisted Listing Risk actions

Plan Generator is no longer a user-facing primary function. Do not re-add it to the main navigation unless the product direction changes explicitly. Planning should appear as a downstream action from risk/calculator decisions.

Do not add Pokemon APIs, real card images, Supabase, eBay data, or vision in this phase. The current recommendation experience must remain deterministic and cheap.

## Current Architecture

- `src/app/page.tsx`: main client app, navigation, onboarding, Home, calculators, risk checker, journal, decision sheet.
- `src/lib/schemas.ts`: Zod schemas for profile, forms, journal, plan items, AI result shapes.
- `src/lib/storage.ts`: localStorage persistence and backward-compatible profile loading.
- `src/lib/curated-recommendations.ts`: deterministic demo recommendation data and conversion helpers for calculator/risk inputs.
- `src/lib/raw-vs-slab.ts`: deterministic grading EV math.
- `src/lib/listing-risk.ts`: deterministic pasted-listing risk scan.
- `src/lib/journal-calibration.ts`: deterministic journal-based PSA10 assumption calibration.
- `src/lib/ai/*`: server-side provider adapter, Hermes routing, agents, critic, and local fallbacks.
- `src/app/api/hermes/route`: server API for Hermes agent routing.
- `src/app/api/ai/health`: dev-facing AI configuration/model health check.

## Engineering Rules

- Raw vs Slab calculations must use deterministic TypeScript functions.
- Curated first-home recommendations must stay deterministic and must not require model calls.
- Listing Risk Checker may use mock structured logic and AI explanation, but outputs must stay schema-shaped and cautious.
- Journal history should influence calculator assumptions through deterministic calibration logic where possible.
- AI calls must happen server-side only through the provider adapter. Never expose API keys to the browser.
- Keep `AI_PROVIDER=openai` as the default. GLM/Kimi/MiMo should be added behind adapters, not directly in UI components.
- Prefer cheap models for classification and critic steps; reserve the primary model for final plan/risk generation.
- Use Zod schemas for app data.
- Use React Hook Form for form state.
- Save demo state in `localStorage`.
- Avoid profit promises, "must buy" language, and unsupported PSA10 certainty.
- Always show assumptions, missing information, and conditional next actions where relevant.
- User-facing copy should say `TCGpal`, not `CardPlan AI`. Historical PRD docs may keep the old name.
- Keep card visuals central to new surfaces. If real images are not available, use explicit card-shaped placeholders.
- Keep Hermes trace available for portfolio review, but do not let it compete with the user decision result.

## Model And Cost Strategy

- Use no model call for onboarding, Home recommendations, Raw vs Slab math, or journal calibration.
- Use cheap models for task classification and critic/safety review.
- Use the primary model only for final AI explanation when the user explicitly clicks an AI action.
- Do not use always-on web search.
- Do not add vision until card database and SKU mapping are reliable.
- If OpenAI is unavailable or the configured model fails, the UI must fall back to local deterministic logic with a short friendly warning. Never show raw Zod/API stack traces to users.

## Near-Term Roadmap

Preferred sequence:

1. Polish the card-forward Home and decision sheet interactions.
2. Add Pokemon autocomplete using a free card API only after the deterministic curated flow feels good.
3. Add real card thumbnails through API-provided image URLs; do not self-host card art.
4. Add cached reference pricing later, ideally after Supabase is genuinely needed.
5. Add One Piece through a curated JSON list before attempting broad coverage.
6. Add eBay sold comps and image recognition only after the card database layer is stable.

## Verification

Run these before handing off changes:

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

Then run the UI locally:

```bash
npm run dev
```

Verify the main flow:

- Landing to onboarding
- Save profile
- See card-forward Home recommendations after onboarding
- Open a card decision sheet
- Send a recommendation to Raw vs Slab
- Send a recommendation to Listing Risk
- Add a recommendation to the 30-day plan
- Analyze a risky listing
- Recalculate Raw vs Slab
- Add a Listing Risk or Raw vs Slab result to the 30-day plan
- Confirm journal grading history can adjust PSA10 assumptions
- Save a Decision Journal entry and reload to confirm persistence
