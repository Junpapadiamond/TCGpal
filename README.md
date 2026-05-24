# CardPlan AI

CardPlan AI is a PM-demo MVP for a cautious planning layer for TCG collectors and small sellers. It is not another price chart. It helps users connect goals, budget, risk, listings, grading assumptions, and decision records into a clearer action plan.

## Phase 0 Demo

Built features:

- Landing page
- Onboarding questionnaire
- Dashboard
- Plan Generator with mock structured logic
- Listing Risk Checker using pasted title, description, price, and goal
- Raw vs Slab Calculator using deterministic TypeScript math
- Decision Journal saved to `localStorage`
- Hermes Router server route with AI-assisted Plan and Listing Risk actions
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

The demo still works without an API key. In that case, Hermes returns local fallback results and shows the fallback in the agent trace.

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

CardPlan AI should explain uncertainty and tradeoffs. It should not promise profit, claim guaranteed grades, or tell a user they must buy a card.
