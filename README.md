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

Deferred features:

- Supabase
- Auth
- Image upload
- Vision model
- External marketplace APIs
- Payments
- Hermes router
- Real multi-agent orchestration

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- React Hook Form
- Zod
- Vitest
- localStorage persistence

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
