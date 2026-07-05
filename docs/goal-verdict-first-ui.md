# Goal: De-generic the UI — plainspoken landing, verdict-first results

_Audience: coding agents. Read `PRODUCT.md` (Anti-references, Design Principles, Brand Personality) and `AGENTS.md` (Engineering Rules, visual verification) first — they override this doc. Reference mock: `docs/mockups/verdict-first-mock.html` (open it; it shows the target information hierarchy and voice, not final pixels). Date: 2026-07-05._

## The problem (why this goal exists)

The live UI is competent but drifts into **two of our own stated anti-references**:

1. **Landing** reads "AI-generated": a ✦-sparkle eyebrow over a four-card `01/02/03/04` "How a trustworthy comparison works" grid, plus an uppercase eyebrow on nearly every block. `PRODUCT.md` explicitly rejects "AI-looking heroes with stacked badges, repeated uppercase eyebrows, decorative cards, and copy that sounds more poetic than useful."
2. **Results** reads like a **dashboard**: it leads with a lens switcher ("SHOWING YOU / Best value · your default") and an unexplained "80/100" score — matching the anti-reference "generic marketplace dashboards with dense tables, unexplained scores."

**Target impression** (from `PRODUCT.md` brand + Design Principle #1 "lead with the buyer's next decision"): *a careful collecting friend just did the homework and is handing you one clear call — with the receipts if you want them.* The felt emotion should be **relief and trust**, not analysis. Verdict first, receipt underneath, workbench on demand.

**This is a presentation/IA reframe only.** Do not change ranking, math, eligibility, claims, or data. The same deterministic result must render — reorganized and re-voiced.

## Guardrails (non-negotiable)

- **No changes to ranking, landed-cost math, eligibility, exclusion logic, or the market anchor.** Diff must be presentation + copy only. Ranked order, prices, and percentages stay identical to current output.
- Preserve the **cream/teal/gold** visual system, **EN + 中文** parity, and the current type system (the mock approximates colors/fonts — use real tokens).
- Any per-listing verdict/"catch" sentence must be **deterministic**, assembled from fields the ranker already produces (price rank, seller tier, evidence/photo count, next-best delta). It must pass the existing unsupported-claim critic and must **never** imply a grade/condition prediction ("Best condition evidence" ≠ "best condition"). No model-authored narrative on the initial comparison path.
- Keep demo fixtures unmistakably labeled; keep the collapsed technical trace; keep real card images.
- Accessibility: semantic headings, labels, visible focus, keyboard nav, reduced-motion, WCAG AA contrast (watch muted text on cream).
- **Keep the validating/loading animation** (Identity → eBay → Filter cards) — it's on-brand (Design Principle #5) and out of scope to change.

## Workstreams

### 1. Landing: kill the generic, show a concrete example
- Remove the four-card "How a trustworthy comparison works" grid **and the ✦ sparkle icon** entirely.
- Reduce uppercase eyebrows to **≤2 per screen**.
- Replace the methodology cards with **one concrete worked-example strip using real/live numbers** (see mock §A): "You search *Charizard VMAX 074/073* → confirmed exact print → 8 real listings found, 42 replicas/wrong prints removed → best value $163.86 landed, 29% under the $231 reference." Prefer live/templated numbers from a real recent comparison; fall back to a clearly representative static example.
- Keep the hero headline ("Find the exact card. Compare real listings.") and the in-hero search form — those already work.
- Method detail moves to `/Method` (link), not the homepage.

### 2. Results: verdict-first hierarchy
Reorder `src/features/comparison/ComparisonApp.tsx` + `RecommendationBody` so the page reads top-to-bottom as **Verdict → (demoted lenses) → Alternatives → Receipt** (mock §B):
- **Lead with the recommendation**, not the lens switcher. A calm "Our pick — best value" hero: card image, title, big landed price, "% under reference", and the plain-language judgment.
- **Demote the lens toggle** to a secondary "Optimize instead for: Cheapest / Safest / Best-documented" row *below* the verdict, keeping the "same pick as…" note.
- **De-emphasize the score.** Don't lead with "80/100"; translate to words ("Strong overall") and/or show the number small and muted. Let the existing plain tags (Decent seller / Thin evidence) carry meaning.

### 3. Verdict copy: judgment + the catch + the alternative
Replace the circular "Why this pick: best combination… (80/100)" with a deterministic sentence template that states **why this one, the main caveat, and the next-best tradeoff** — e.g. "Cheapest Near-Mint from a solid seller. The catch: only 2 photos, so you can't inspect the corners. Want to check condition first? The 7-photo listing below is ~$27 more." Move per-listing caveats **onto the card**, out of the generic "Before you buy" sidebar.

### 4. Receipt block
Consolidate the market reference + "Checked eBay + TCGplayer · time · See how we checked" + "See why N listings were excluded" + "Copy result" into one coherent **receipt region under the verdict** (mock §B). Frame it as a shareable decision receipt (label + Copy; a real Share backend is out of scope here but leave the affordance).

### 5. Fix the winner image on first paint
The top recommendation's card image renders as a grey placeholder while lower cards load. Priority-load the hero result image with a proper skeleton — a grey box on the single most important element undercuts the "we found your card" trust.

## Non-goals
- No changes to ranking, scoring, eligibility, math, exclusions, or data sources.
- No new lenses; no model-authored verdict narrative on the initial path; no sharing/receipt backend.
- Don't touch the loading animation. No new scope-gated features (scanning, image upload, etc.).
- Pixel-parity with the mock is **not** required — match its hierarchy and voice, use real design tokens.

## Success criteria (what "done" means)

**Impression / usability (the real bar):**
- In a hallway test, a first-time user shown the results page states **the recommendation and its main tradeoff in one sentence, above the fold, without scrolling** (desktop and mobile).
- Users describe the results page as "it told me which to buy," not "it gave me a dashboard/tool."

**Concrete UI checks (verifiable):**
- Zero ✦ sparkle icons anywhere; **≤2 uppercase eyebrows** per screen.
- Landing has **no four-equal-card methodology grid**; method is ≤1 line + a `/Method` link; a concrete real-number example is present.
- Results lead with the verdict; the lens toggle sits **below** it; no raw "NN/100" is the primary signal.
- Verdict shows why-this + the catch + the next-best alternative, sourced from deterministic fields; unsupported-claim critic passes; no grade-prediction language (add/keep a test).
- Winner card image loads without a visible grey box (priority/skeleton).

**Integrity (must hold):**
- Ranked order, prices, %-under-reference, and excluded-count are **byte-for-byte the same** as current deterministic output (presentation-only diff — show it).
- EN + 中文 parity; axe/a11y clean; keyboard + reduced-motion intact; AA contrast holds.
- `npm run lint && npm run typecheck && npm run test && npm run build` green.

## Verification & handoff
Per `AGENTS.md`: run the gate commands, then `npm run dev` and drive landing + a real card comparison in a browser (Playwright/Chromium). Capture **before/after** screenshots of the landing hero and the results page in **English and 中文 plus a mobile viewport**, and share them. Confirm the ranked output is unchanged. When green and visually verified, fast-forward to `main` so Vercel deploys — don't leave it on a side branch.
