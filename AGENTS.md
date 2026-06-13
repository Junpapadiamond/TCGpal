<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project uses Next.js 16. APIs, conventions, and file structure may differ from older training data. Read the relevant guide in `node_modules/next/dist/docs/` before making framework-level changes. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TCGpal Agent Guide

## Current Status

The app is a Phase 0.8 PM-demo MVP. It is intentionally local-first, card-forward, and focused on pre-buy decision quality:

- Brand is `TCGpal`.
- First open starts with a lightweight demo login/signup gate, then a three-step onboarding flow: favorite TCGs, player persona, and budget guardrails.
- Home centers on a prominent Ready to Buy / 买前检查 flow, plus a small curated Pokemon demo card grid.
- Curated Pokemon cards may show real Pokemon TCG API image URLs when available, with CSS placeholders as fallback.
- A card decision sheet connects each recommendation to pre-buy check, Raw vs Slab, Listing Risk, and 30-day plan actions.
- The pre-buy check is deterministic-first and judges decision quality: emotional heat, budget strain, evidence quality, and version clarity.
- Raw vs Slab is deterministic TypeScript math.
- Listing Risk combines deterministic text-risk logic with optional server-side AI explanation.
- Decision Journal, 30-day plan, today purchases, cooldown tickets, locale, and demo session are persisted in `localStorage`.
- Journal grading history can influence future PSA10 assumptions through deterministic calibration.
- Pokemon TCG and PriceCharting adapters/routes exist as optional server-side data adapters. They are not part of always-on recommendation logic.
- Hermes/agent trace exists for portfolio and debugging, but should stay collapsed or low-visibility for normal users.
- OpenAI is wired server-side through the Responses API. The current configured/default model is `gpt-5.5-2026-04-23`.
- The current Ready to Buy / 买前检查 flow is not AI research: it is deterministic decision-quality scoring only. It does not fetch eBay, sold comps, or market history.

## Product Goal

TCGpal is a cautious decision layer for TCG collectors and small sellers. The product should feel card-first and emotionally supportive: users choose TCGs and persona, set a budget guardrail, run a pre-buy check when they feel pressure to buy, then decide whether to pause, ask for evidence, run raw-vs-slab math, check listing risk, or add a decision to a 30-day plan.

The product must feel like a careful hobby assistant, not a financial advisor, hype tool, or trading bot.

## Phase 0 Scope

Use `localStorage` only for user/demo state. Do not add Supabase, real auth, image upload, payments, scraping, or always-on web search in the current phase.

Allowed external-data boundaries in this phase:

- Optional server-side Pokemon TCG API adapter/routes for card lookup and image URLs.
- Optional server-side PriceCharting adapter/routes guarded by `PRICECHARTING_API_TOKEN`.
- No client-side API keys.
- No always-on marketplace search, automated scraping, or recommendation ranking from external APIs yet.

Core pages:

- First-run TCG/persona/budget picker
- Demo login/signup gate with local session only
- Card-forward Home with Ready to Buy / 买前检查 as the primary action
- Curated Pokemon demo recommendations with real images when provided by API-backed data
- Pre-buy check / Calm Verdict flow
- Listing Risk Checker
- Raw vs Slab Calculator
- Decision Journal
- 30-day decision plan items created from Listing Risk and Raw vs Slab outputs
- Hermes Router API route
- AI-assisted Listing Risk actions

Current AI entrypoints:

- `/api/ai/health` checks OpenAI configuration with a real lightweight model probe, not just an environment-variable presence check.
- `Risk` -> `Advanced: AI tools` -> `Analyze with AI` calls Hermes Listing Risk and should show `fallbackUsed:false` plus `gpt-5.5-2026-04-23` in trace when OpenAI is working.
- `Risk` -> `Advanced: AI tools` -> AI Pipeline uses Evidence/Risk/Critic agent stages where configured, with deterministic math kept separate.
- `Ready to Buy` does not call OpenAI yet. Do not imply that it checks sold history, eBay, or comps until a dedicated market-check agent/tool route exists.

Plan Generator is no longer a user-facing primary function. Do not re-add it to the main navigation unless the product direction changes explicitly. Planning should appear as a downstream action from risk/calculator decisions.

Do not add Supabase, eBay data, scraping, vision, or always-on web search in this phase. The current recommendation experience must remain deterministic and cheap. External card/pricing adapters are allowed only as optional lookup infrastructure and should not silently drive recommendation ranking.

## Current Architecture

- `src/app/page.tsx`: main client app, navigation, demo auth, onboarding, Home, Ready to Buy flow, calculators, risk checker, journal, decision sheet. This file is now too large and should be split before adding Comps/Parser features.
- `src/lib/schemas.ts`: Zod schemas for profile, forms, journal, plan items, AI result shapes.
- `src/lib/storage.ts`: localStorage persistence and backward-compatible profile loading.
- `src/lib/budget-ledger.ts`: deterministic today-budget spend tracking.
- `src/lib/fomo-check.ts`: deterministic pre-buy decision-quality scoring. User-facing copy should say "pre-buy check" / "买前检查", not "FOMO".
- `src/lib/curated-recommendations.ts`: deterministic demo recommendation data and conversion helpers for calculator/risk inputs.
- `src/lib/raw-vs-slab.ts`: deterministic grading EV math.
- `src/lib/listing-risk.ts`: deterministic pasted-listing risk scan.
- `src/lib/journal-calibration.ts`: deterministic journal-based PSA10 assumption calibration.
- `src/lib/ai/*`: server-side provider adapter, Hermes routing, agents, critic, and local fallbacks.
- `src/lib/external/*`: optional server-side external data adapters.
- `src/app/api/hermes/route`: server API for Hermes agent routing.
- `src/app/api/ai/health`: dev-facing AI configuration/model health check.
- `src/app/api/external/*`: optional external lookup routes.
- `public/tcgpal-logo-horizontal.svg`, `public/tcgpal-icon.svg`, and favicon PNGs: current logo/app icon assets.

## Engineering Rules

- Raw vs Slab calculations must use deterministic TypeScript functions.
- Curated first-home recommendations must stay deterministic and must not require model calls.
- Pre-buy check scoring must remain deterministic-first; AI can enrich copy later, but budget and hard-stop guardrails must not depend on model output.
- Listing Risk Checker may use mock structured logic and AI explanation, but outputs must stay schema-shaped and cautious.
- Journal history should influence calculator assumptions through deterministic calibration logic where possible.
- AI calls must happen server-side only through the provider adapter. Never expose API keys to the browser.
- Keep `AI_PROVIDER=openai` as the default. GLM/Kimi/MiMo/Claude-style providers should be added behind adapters, not directly in UI components.
- Never commit real API keys. `.env.local` is ignored and may contain local keys; `.env.example` must contain placeholders only.
- If a user pastes a live-looking key in chat, treat it as compromised and remind them to rotate/revoke it.
- Prefer cheap models for classification and critic steps; reserve the primary model for final plan/risk generation.
- Use Zod schemas for app data.
- Use React Hook Form for form state.
- Save demo state in `localStorage`.
- Keep all user-facing copy available in English and Chinese where practical.
- User-facing language should say "pre-buy check", "decision heat", "买前检查", or "上头程度"; avoid making "FOMO" the main UI term.
- Avoid profit promises, "must buy" language, and unsupported PSA10 certainty.
- Always show assumptions, missing information, and conditional next actions where relevant.
- User-facing copy should say `TCGpal`, not `CardPlan AI`. Historical PRD docs may keep the old name.
- Keep card visuals central to new surfaces. If real images are not available, use explicit card-shaped placeholders.
- Keep Hermes trace available for portfolio review, but do not let it compete with the user decision result.
- Before adding new major flows, split `src/app/page.tsx` into smaller components under `src/components` or feature folders.

## Model And Cost Strategy

- Use no model call for onboarding, Home recommendations, Raw vs Slab math, or journal calibration.
- Use no model call for the deterministic pre-buy check hard-stop logic.
- Current OpenAI default is `gpt-5.5-2026-04-23` for both primary and cheap roles until cheaper compatible model access is explicitly confirmed.
- Use cheaper models for task classification and critic/safety review only after verifying the model name/key entitlement with `/api/ai/health`.
- Use the primary model only for final AI explanation when the user explicitly clicks an AI action.
- Do not use always-on web search.
- Agent-like features are justified only when they gather or reconcile external evidence: listing parsing, version matching, sold comps, evidence critique, or report synthesis.
- GPT-5.5 can act as the tool allocator/agent brain, but only for tools exposed by TCGpal backend routes. It must not invent comps or claim marketplace research without a real tool result.
- The next justified agent route is likely `POST /api/agent/market-check`: identify card/version, call Pokemon/PriceCharting and later sold-comps providers, run deterministic budget/math guardrails, and return sources plus confidence.
- eBay sold history is not wired. Add it only through a reliable/legal data source such as an official/vetted eBay API or another licensed comps provider; do not add scraping as a shortcut.
- Do not add vision until card database and SKU mapping are reliable.
- If OpenAI is unavailable or the configured model fails, the UI must fall back to local deterministic logic with a short friendly warning. Never show raw Zod/API stack traces to users.

## Near-Term Roadmap

Preferred sequence:

1. Split `src/app/page.tsx` into smaller UI components before adding Comps/Parser.
2. Define a journal migration path from localStorage to durable account-backed storage; journal is the highest-value retention asset.
3. Polish the card-forward Home and decision sheet interactions.
4. Add Pokemon autocomplete using the existing optional Pokemon adapter only when the deterministic curated flow feels good.
5. Add a Ready to Buy market-check agent only after splitting `page.tsx`; it should call explicit backend tools and show sources/confidence.
6. Add cached reference pricing later, ideally after durable storage is genuinely needed.
7. Add One Piece through a curated JSON list before attempting broad coverage.
8. Add sold comps and image recognition only after the card database/SKU mapping layer is stable.

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
- `/api/ai/health` returns `ok:true` when a local OpenAI key/model is configured.
- Save profile
- See card-forward Home recommendations after onboarding
- Run Ready to Buy / pre-buy check and verify budget guardrails
- Open a card decision sheet
- Send a recommendation to Raw vs Slab
- Send a recommendation to Listing Risk
- Add a recommendation to the 30-day plan
- Analyze a risky listing
- Open Risk -> Advanced AI tools -> Analyze with AI; confirm trace shows `gpt-5.5-2026-04-23` and `fallbackUsed:false` when the API is working.
- Recalculate Raw vs Slab
- Add a Listing Risk or Raw vs Slab result to the 30-day plan
- Confirm journal grading history can adjust PSA10 assumptions
- Save a Decision Journal entry and reload to confirm persistence
