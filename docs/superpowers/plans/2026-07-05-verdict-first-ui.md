# Verdict-First TCGpal UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic landing methodology grid and dashboard-first results hierarchy with a plainspoken worked example and one dominant, evidence-qualified recommendation.

**Architecture:** Keep ranking, eligibility, market math, and API payloads untouched. Add a pure presentation helper that turns existing normalized-listing and ranked-choice fields into locale-complete verdict clauses, then reorganize `ComparisonApp.tsx` around that output. Preserve existing design tokens, loading flow, analytics, and progressive technical disclosures.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, Tailwind CSS 4, React Hook Form, Vitest.

## Global Constraints

- Do not modify ranking, landed-cost math, eligibility, exclusions, market-anchor logic, or ranked output.
- Preserve the cream/teal/gold visual system and current type system.
- Preserve EN and 中文 fact parity with natural locale-complete templates.
- Use only deterministic fields already present on `NormalizedListing` and `RankedChoice`.
- Never imply photo inspection, authentication, grade prediction, or condition prediction.
- Tax absent means `pre-tax total`; never use “all-in.”
- Demo rows remain unmistakable and never show per-listing market deltas.
- Keep the existing validating/loading animation unchanged.
- Keep semantic headings, keyboard controls, visible focus, reduced motion, and WCAG AA contrast.
- Use Next.js 16 `fetchPriority="high"` or eager loading for the winner image; do not add deprecated `priority`.
- Preserve all user-owned untracked files.

---

### Task 1: Deterministic verdict copy

**Files:**
- Create: `src/features/comparison/verdict-copy.ts`
- Create: `src/features/comparison/verdict-copy.test.ts`

**Interfaces:**
- Consumes: `NormalizedListing`, `RankedChoice`, locale, and the already ordered comparable alternatives.
- Produces:

```ts
export type VerdictCopy = {
  why: string;
  catch: string;
  alternative: string | null;
  strength: string;
};

export function buildVerdictCopy(input: {
  listing: NormalizedListing;
  choice: RankedChoice;
  alternatives: NormalizedListing[];
  lang: "en" | "zh";
}): VerdictCopy;
```

- [ ] **Step 1: Write failing EN/中文 tests**

Cover Best Value, cheapest, safest, best-documented, thin evidence, unverified seller, user-added data, tax-known/unknown, and the next comparable option.

```ts
const copy = buildVerdictCopy({
  listing: winner,
  choice: bestValueChoice,
  alternatives: [documentedAlternative],
  lang: "en",
});

expect(copy.why).toContain("seller-stated Near Mint");
expect(copy.catch).toContain("2 item-specific photos");
expect(copy.alternative).toContain("$27.00 more");
expect(`${copy.why} ${copy.catch}`).not.toMatch(/will grade|best condition|authentic/i);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm run test -- src/features/comparison/verdict-copy.test.ts`

Expected: FAIL because `verdict-copy.ts` does not exist.

- [ ] **Step 3: Implement the finite clause library**

Use cost position, seller tier, evidence/photo count, role, and the first ordered alternative only. Qualify condition as seller-stated. Prefer missing evidence or unverified seller facts for the catch.

```ts
const cost = (listing: NormalizedListing) =>
  listing.estimatedLandedCost ?? listing.preTaxTotal;

const delta = cost(alternative) - cost(listing);
const pricePhrase = delta === 0
  ? samePrice[lang]
  : `${formatMoney(Math.abs(delta))} ${delta > 0 ? more[lang] : less[lang]}`;
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npm run test -- src/features/comparison/verdict-copy.test.ts`

Expected: PASS with all locale and unsupported-claim cases green.

### Task 2: Replace the landing methodology grid

**Files:**
- Modify: `src/features/comparison/ComparisonApp.tsx`
- Modify: `src/features/comparison/i18n.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: localized representative-example strings and the allowed Pokémon card image host.
- Produces: `WorkedExample`, rendered in the hero where `CardMarquee` currently appears.

- [ ] **Step 1: Remove the numbered methodology components**

Delete `LoopStep`, `HowItWorks`, its post-form render, and the unused `IconFoil` import. Keep `CardMarquee` helpers that are still used by `LoadingLoop`.

- [ ] **Step 2: Add locale-complete worked-example strings**

```ts
workedExample: {
  label: "Representative example",
  card: "Charizard VMAX 074/073",
  confirmed: "Exact print confirmed",
  reviewed: "8 comparable listings kept; 42 replicas or wrong prints omitted",
  recommendation: "$163.86 pre-tax, 29% under the $231 reference",
  note: "Example numbers, not live inventory. Real results show sources, missing facts, and confidence.",
  methodLink: "See how recommendations work",
}
```

Add natural 中文 equivalents with identical facts and caveats.

- [ ] **Step 3: Implement one concrete strip**

Use the real card image at `https://images.pokemontcg.io/swsh35/74_hires.png`, sentence-case labels, one border hierarchy, and a direct `/method` link. Remove the hero uppercase eyebrow and point landing navigation Method links to `/method`.

- [ ] **Step 4: Remove obsolete marquee-only styling if no longer used outside loading**

Retain any selectors used by `LoadingLoop`; remove only unreachable landing decoration. Do not change the loading component or its animation.

### Task 3: Reorder results and consolidate the receipt

**Files:**
- Modify: `src/features/comparison/ComparisonApp.tsx`
- Modify: `src/features/comparison/i18n.tsx`

**Interfaces:**
- Consumes: `buildVerdictCopy`, selected listing/choice, ordered alternatives, source status, market freshness, exclusions, cautions, and existing copy action.
- Produces: `RecommendationBody`, `LensControls`, and `DecisionReceipt`.

- [ ] **Step 1: Lead with the recommendation**

Move the current lens block below `RecommendedBuyHero`. Use a semantic `h2` for the verdict label and `h3` for the listing title. Keep lens buttons as native buttons with `aria-pressed`.

- [ ] **Step 2: Replace circular score copy**

Render:

```tsx
<p><strong>{t.result.whyItStandsOut}</strong> {verdict.why}</p>
<p><strong>{t.result.whatToKnow}</strong> {verdict.catch}</p>
{verdict.alternative && (
  <p><strong>{t.result.nextBestOption}</strong> {verdict.alternative}</p>
)}
```

Show `{verdict.strength} · {score}/100` as muted supporting metadata only.

- [ ] **Step 3: Put per-listing caveats on the winner**

Remove the generic “Before you buy” sidebar. Keep global cautions inside the decision receipt so grade-prediction and sold-history boundaries remain visible without competing with the recommendation.

- [ ] **Step 4: Demote lenses**

Render a quiet row titled “Optimize instead for:” below the verdict. Keep the same-pick note and unchanged lens-selection analytics.

- [ ] **Step 5: Consolidate the receipt**

Create one bordered receipt region after alternatives containing:

```tsx
<section aria-labelledby="decision-receipt-title">
  <h3 id="decision-receipt-title">{t.result.decisionReceipt}</h3>
  <MarketReferenceLine ... />
  <SourceStatusLine ... />
  <ExcludedListingsDetails ... />
  <button onClick={copyComparisonReceipt}>{t.result.copyReceipt}</button>
  <button disabled title={t.result.shareUnavailable}>{t.result.shareReceipt}</button>
</section>
```

Keep the full source/reference/trace drawer collapsed after the receipt and keep feedback below it.

- [ ] **Step 6: Preserve abstention**

When no ranked choice exists, render no emphasized listing CTA and retain the existing reason, source receipt, exclusions, and retry/manual paths.

### Task 4: Winner image loading and visual polish

**Files:**
- Modify: `src/features/comparison/ComparisonApp.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: winner listing image or confirmed-card fallback.
- Produces: a fixed-ratio above-the-fold image with eager/high-priority fetching and a skeleton that disappears on load.

- [ ] **Step 1: Add winner-only load state**

```tsx
const [imageLoaded, setImageLoaded] = useState(false);

<Image
  src={imageUrl}
  alt=""
  fill
  sizes="(max-width: 640px) 112px, 148px"
  fetchPriority="high"
  loading="eager"
  onLoad={() => setImageLoaded(true)}
  className={imageLoaded ? "opacity-100" : "opacity-0"}
/>
```

Reset the state when `imageUrl` changes without changing selection logic.

- [ ] **Step 2: Reserve the final geometry**

Use a fixed `aspect-[2.5/3.5]` wrapper, a cream/teal skeleton rather than a flat gray placeholder, and no layout-changing animation. Respect reduced motion.

- [ ] **Step 3: Apply Emil-style interaction polish**

Add subtle `:active` scale feedback to pressable controls, keep UI transitions under 250 ms, specify exact transition properties, and gate hover-only effects behind fine-pointer media queries.

### Task 5: Verification, review, and integration

**Files:**
- Refresh generated graph: `graphify-out/*`
- Capture artifacts: `output/playwright/before/*`, `output/playwright/after/*`

**Interfaces:**
- Consumes: completed UI and existing hermetic flow.
- Produces: verified branch fast-forwarded and pushed to `main`.

- [ ] **Step 1: Run focused tests**

Run: `npm run test -- src/features/comparison/verdict-copy.test.ts`

Expected: PASS.

- [ ] **Step 2: Prove ranking scope stayed untouched**

Run:

```bash
git diff main -- src/lib/comparison/ranking.ts src/lib/comparison/ranking.test.ts src/lib/comparison/fixtures.ts
```

Expected: no output.

- [ ] **Step 3: Run project gates**

Run in order:

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Browser verification**

Use Playwright Chromium against `npm run dev`. Capture landing and live results in EN and 中文 at desktop and 390px mobile. Verify keyboard lens switching, focus visibility, image skeleton/load behavior, reduced motion, no console errors, zero sparkle glyphs, at most two section eyebrows, and the unchanged loading sequence.

- [ ] **Step 5: Five-card manual flow**

Run the sequential Pokémon/One Piece flow with Edit and New search transitions. Confirm New search clears stale card/listing facts but retains ZIP, tax, preferred lens, and desired condition.

- [ ] **Step 6: Refresh Graphify and review**

Run:

```bash
/Users/chenjunhsu/.codex/tools/graphify/bin/graphify update .
git diff --check
git status --short
```

Inspect the full diff for presentation-only scope and secret safety.

- [ ] **Step 7: Commit, fast-forward, and push**

Commit the verified feature branch, switch to `main`, fast-forward merge `codex/verdict-first-ui`, and push `main` to origin.
