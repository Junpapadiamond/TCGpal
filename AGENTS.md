<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project uses Next.js 16. APIs, conventions, and file structure may differ from older training data. Read the relevant guide in `node_modules/next/dist/docs/` before making framework-level changes. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# CardPlan AI Agent Guide

## Product Goal

CardPlan AI is a cautious planning layer for TCG collectors and small sellers. It helps users turn goals, budgets, risk preferences, listing details, and grading assumptions into structured decisions.

The product must feel like a careful hobby assistant, not a financial advisor, hype tool, or trading bot.

## Phase 0 Scope

Use `localStorage` only. Do not add Supabase, auth, image upload, payments, scraping, external marketplace APIs, real AI calls, or the Hermes router in Phase 0.

Core pages:

- Landing page
- Onboarding questionnaire
- Dashboard
- Plan Generator
- Listing Risk Checker
- Raw vs Slab Calculator
- Decision Journal

## Engineering Rules

- Raw vs Slab calculations must use deterministic TypeScript functions.
- Plan Generator and Listing Risk Checker may use mock structured logic, but outputs must stay schema-shaped and cautious.
- Use Zod schemas for app data.
- Use React Hook Form for form state.
- Save demo state in `localStorage`.
- Avoid profit promises, "must buy" language, and unsupported PSA10 certainty.
- Always show assumptions, missing information, and conditional next actions where relevant.

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
- Generate a Chopper plan
- Analyze a risky listing
- Recalculate Raw vs Slab
- Save a Decision Journal entry and reload to confirm persistence
