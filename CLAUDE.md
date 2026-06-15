@AGENTS.md

# CardPlan AI — Codebase Reference

The product goal, Phase 0 scope, engineering rules, and guardrails live in
`AGENTS.md` (imported above) and are authoritative. This file documents the
**codebase structure, data flow, and conventions** so an AI assistant can make
changes without re-deriving the architecture each time.

> Framework note: this project is on **Next.js 16** (App Router) with **React
> 19**. Conventions differ from older Next.js. Before any framework-level change
> read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation
> notices.

## Tech Stack

- **Next.js 16** App Router + **React 19** (single client page, server route for AI)
- **TypeScript** (strict), path alias `@/*` → `src/*`
- **Tailwind CSS v4** via `@tailwindcss/postcss` (config in `postcss.config.mjs`, styles in `src/app/globals.css`)
- **Zod v4** — all app data shapes and runtime validation
- **React Hook Form** — all form state
- **lucide-react** — icons
- **OpenAI Responses API** (`https://api.openai.com/v1/responses`) called server-side via a provider adapter
- **Vitest** (node environment) — unit + eval tests
- **localStorage** — the only persistence layer in Phase 0

## Directory Map

```
src/
  app/
    page.tsx                 Entire client UI (single-file SPA, 7 views, "use client")
    layout.tsx               Root layout
    globals.css              Tailwind + design tokens / component classes (.primary-button, .field, etc.)
    api/hermes/
      route.ts               POST handler — validates request, calls routeHermes()
      route/route.ts          Re-exports POST so the live endpoint is /api/hermes/route (see Gotchas)
  lib/
    schemas.ts               Zod schemas + inferred types + option enums (single source of truth)
    storage.ts               localStorage load/save helpers (SSR-safe), keys prefixed "cardplan."
    sample-data.ts           defaultProfile / defaultPlanInput / defaultRawVsSlabInput / starterJournalEntry
    plan-generator.ts        Deterministic mock 3-plan generator (generatePlan)
    listing-risk.ts          Deterministic text-based risk scoring (analyzeListingRisk)
    raw-vs-slab.ts           Deterministic EV / break-even math (calculateRawVsSlab) — pure arithmetic
    raw-vs-slab.test.ts      Math unit tests
    listing-risk.test.ts     Risk-logic unit tests
    ai/
      config.ts              Provider + model selection from env (getAiConfig, getModelForStep)
      provider.ts            AiProvider interface; OpenAiResponsesProvider + UnavailableProvider
      hermes.ts              Hermes Router: classify task -> agent -> critic -> response
      critic.ts              Safety critic (banned-language scan + optional AI critic)
      tools.ts               Wrappers exposing deterministic lib fns as "tools"
      hermes.test.ts         Eval harness (routing, schema validity, math determinism, safety)
  evals/
    fixtures/hermes-fixtures.ts   Named request fixtures driving the eval harness
docs/card_plan_ai_prd_v0.2.md     Product requirements (background reading)
```

## How It Fits Together

### UI layer (`src/app/page.tsx`)
- One `"use client"` component holds all seven views via a `view` state union:
  `landing | onboarding | dashboard | plan | risk | raw | journal`.
- Five React Hook Form instances (profile, plan, risk, raw, journal).
- On mount, hydrates from `localStorage` inside a `setTimeout(…, 0)` to avoid SSR
  hydration mismatches; seeds a starter journal entry if none exist.
- Every form submit re-validates with the matching Zod schema (`schema.parse`)
  before updating state and persisting.
- "Generate/Analyze with AI" buttons POST to the Hermes route via `callHermes`,
  then parse the response with `hermesResponseSchema` and render an `AgentTrace`.

### Persistence (`src/lib/storage.ts`)
- Only `localStorage`. Keys: `cardplan.profile`, `cardplan.latestPlan`,
  `cardplan.journalEntries`. Helpers are SSR-safe (`typeof window` guards) and
  fail closed to a fallback on parse errors. Do **not** introduce a backend,
  auth, or external storage in Phase 0.

### Deterministic core (must stay pure TypeScript)
- `raw-vs-slab.ts` — **all Raw vs Slab arithmetic must live here**, never in an
  LLM. Computes net sale values, expected profit, worst case, and break-even
  PSA10 probability, plus cautious explanation/recommendation strings.
- `plan-generator.ts` / `listing-risk.ts` — mock structured logic that produces
  schema-shaped, cautious output and serves as the fallback when AI is off.

### AI layer (Hermes)
Flow in `routeHermes` (`src/lib/ai/hermes.ts`):
1. `classifyHermesTask` picks a `HermesTaskType` from `taskHint` or which input
   is present (`LISTING_RISK_CHECK` > `PLAN_GENERATION` > `RAW_VS_SLAB_EXPLAIN` >
   `JOURNAL_DRAFT`).
2. The matching agent runs. PLAN and LISTING_RISK call the LLM via
   `provider.completeJson` with a deterministic baseline in the prompt; on any
   error they **fall back** to the deterministic result and set `fallbackUsed`.
   RAW_VS_SLAB and JOURNAL_DRAFT stay fully deterministic.
3. Listing risk merges rule + AI reports conservatively (`mergeRiskReports`:
   takes the higher risk score, lower confidence, union of missing-info/risks).
4. The **Critic / Safety Agent** (`critic.ts`) scans output for banned language
   (`bannedLanguage`) and optionally runs an AI critic; flags become `warnings`.
5. Returns a `hermesResponseSchema`-validated payload with a step-by-step `trace`.

Provider/model selection (`config.ts`): `AI_PROVIDER` defaults to `openai`;
GLM/Kimi/MiMo are recognized but routed to `UnavailableProvider`. Use
`OPENAI_MODEL_PRIMARY` for final generation and `OPENAI_MODEL_CHEAP` for
classifier/critic steps (`getModelForStep`). **No API key → everything still
works via deterministic fallbacks** (the eval harness depends on this).

### Schemas (`src/lib/schemas.ts`)
Single source of truth. Define new data shapes here as Zod schemas, export the
inferred type, and reuse the `*Options` const arrays for select fields. Server
responses are validated on **both** ends (route + client).

## Conventions

- **Validate at boundaries**: `schema.parse` on every form submit, API request,
  and API response. Never trust shape without parsing.
- **Types from schemas**: prefer `z.infer` types over hand-written interfaces.
- **Server-only AI**: API keys are read from `process.env` inside route/provider
  code only. Never reference keys or call OpenAI from a `"use client"` file.
- **Cautious output**: no profit promises, "must buy", or PSA10 certainty.
  Surface assumptions, missing info, and conditional next actions. The critic's
  `bannedLanguage` list enforces a baseline — keep new copy consistent with it.
- **Styling**: use the semantic class names defined in `globals.css`
  (`primary-button`, `secondary-button`, `nav-button`, `field`, `form-grid`)
  plus Tailwind utilities; match the existing muted-green palette.
- **Adapters over inline branching**: add new AI providers behind the
  `AiProvider` interface in `provider.ts`, not in UI components.

## Gotchas

- **Hermes endpoint path**: the client fetches `/api/hermes/route`. The real
  handler is `src/app/api/hermes/route.ts`; `src/app/api/hermes/route/route.ts`
  re-exports `POST` so the nested URL resolves. Keep both in sync — if you move
  the handler, update the client `fetch` URL in `page.tsx` (`callHermes`).
- **Model IDs in env** (`gpt-5.4-mini` / `gpt-5.4-nano`) are placeholders for the
  demo; they come from `.env.local` and are not validated against a real catalog.
- **Hydration**: localStorage reads are deferred to a post-mount timeout on
  purpose — keep reads out of render/SSR paths.

## Commands

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # eslint (flat config, eslint-config-next)
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
npm run build      # next build
```

Run lint, typecheck, test, and build before handing off. The eval harness in
`src/lib/ai/hermes.test.ts` asserts task routing, schema-valid fallbacks,
deterministic Raw vs Slab math, missing-evidence flagging, safety-language
rejection, and cheap-vs-primary model selection — keep these green when touching
the AI layer.

## Manual Verification Flow

Landing → onboarding → save profile → generate a (Chopper) plan → analyze a
risky listing → recalculate Raw vs Slab → save a Decision Journal entry → reload
to confirm `localStorage` persistence.

## Out of Scope (Phase 0)

Supabase, auth, image upload, vision models, payments, scraping, external
marketplace APIs, always-on web search, and any multi-provider runtime beyond
OpenAI. Do not add these without an explicit phase change.
