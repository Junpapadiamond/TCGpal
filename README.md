# TCGpal

TCGpal is a PM-demo MVP for a cautious decision layer for TCG collectors and small sellers. It is not another price chart. It helps users decide whether a marketplace listing is worth pursuing by connecting card-first recommendations, listing risk, raw-vs-slab math, and their own decision history.

## Phase 0 Demo

Built features:

- First-run TCG/persona/budget picker
- Card-forward Home with curated demo recommendations
- Listing Risk Checker using pasted title, description, price, and goal
- Raw vs Slab Calculator using deterministic TypeScript math
- Decision Journal saved to `localStorage`, including assumed PSA10 odds and actual grading outcomes
- 30-day decision plan items generated from Listing Risk and Raw vs Slab results
- Journal-based grading calibration that adjusts new PSA10 assumptions from recent outcomes
- Hermes Router server route with AI-assisted Listing Risk actions and technical trace
- Provider adapter with OpenAI default and future GLM/Kimi/MiMo extension points
- Eval harness for routing, schema validation, deterministic math, safety language, and model-cost guards

Deferred features:

- Supabase
- Auth
- Image upload
- Vision model
- External marketplace APIs
- Payments
- Perplexity/web search
- Full multi-provider runtime beyond OpenAI

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- React Hook Form
- Zod
- Vitest
- localStorage persistence
- OpenAI Responses API via a server-side provider adapter

## AI Setup

Copy `.env.example` to `.env.local` and add your API key:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL_PRIMARY=gpt-5.4-mini
OPENAI_MODEL_CHEAP=gpt-5.4-nano
```

The demo still works without an API key. In that case, Hermes returns local fallback results. Technical trace is available behind a collapsed UI toggle.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Product Guardrails

TCGpal should explain uncertainty and tradeoffs. It should not promise profit, claim guaranteed grades, or tell a user they must buy a card.
