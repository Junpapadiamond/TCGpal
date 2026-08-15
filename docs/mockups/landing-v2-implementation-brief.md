# Implementation brief — landing v2 (cards as entrance)

Hand this to the coding agent as-is. It assumes the agent has repo access and will
read `AGENTS.md` and `PRODUCT.md` first.

---

## Goal

Rebuild the default (pre-search) comparison screen so that **the rolling card rail is a
working entrance into the product**, not decoration, and so that **copy is replaced by
interface**. Palette, fonts, logo and brand voice do not change.

Reference mockup: `docs/mockups/lens-landing-v2.html` — open it in a browser. The bar at
the top is mockup-only chrome; ignore it. Everything below the topbar is the target.

## Read before writing code

- `AGENTS.md` — Stable Runtime Contract, Product Guardrails, Founder Decision Challenge
- `PRODUCT.md` — Design Principles and **Anti-references** (this work is partly motivated
  by two of them; see "Why" below)
- `src/features/comparison/ComparisonApp.tsx` — everything below lives here
- `src/features/comparison/i18n.tsx` — all user-facing strings, `en` and `zh`
- `src/app/globals.css` — existing tokens, marquee CSS, reduced-motion block

## Why (do not skip — it constrains the how)

`PRODUCT.md` anti-references include *"Overanimated landing pages where motion competes
with the buyer's decision"* and *"AI-looking heroes with stacked badges, repeated
uppercase eyebrows, decorative cards."* Design Principle 5 says card motion must explain
"searching, fanning out, comparing, or selecting" — **not decorate**.

Today's marquee is `aria-hidden`, desktop-only, and non-interactive: pure decoration, and
in violation. The fix is not to delete it — it is to make the cards do real work. Once a
card is a button that starts a check, the motion is showing selectable inventory and the
principle is satisfied.

Every change below should be justified by that. If a change adds ornament without
function, drop it.

---

## Scope

**In scope:** the `!compactMode` branch of `ComparisonExperience` (the pre-search screen),
`CardMarquee`, `buildMarqueeItems`, `composeCarouselCards`, `toRecentCarouselCard`,
`RecentCarouselCard`, related `i18n` keys, related CSS in `globals.css`.

**Out of scope:** results rendering, identity confirmation UI, ranking, adapters, the
`compactMode` results header. Do not touch `src/lib/**` except the small type change in
Task 3.

---

## Task 1 — The rail becomes the entrance

Convert each marquee item from a decorative `<span>` into a real `<button type="button">`.

**Click behaviour.** Clicking a card runs the same flow as typing that card. Do not build
a parallel code path:

```ts
function checkCardFromRail(card: RecentCarouselCard) {
  const values = resetForNewCardSearch(form.getValues());
  form.reset({
    ...values,
    game: card.game,
    heroQuery: `${card.name} ${card.cardNumber}`.trim(),
    cardName: card.name,
    setCode: card.setCode,
    cardNumber: card.cardNumber,
  });
  trackEvent("rail_card_clicked", { game: card.game, source: /* "chase" | "recent" */ });
  void submitComparison(form.getValues());
}
```

Because name **and** collector number are both explicit, this hits the auto-confirm path
described in `AGENTS.md` step 2 and skips the version picker. That is intended. Verify it
actually does — if identity still returns `needs_confirmation` for some cards, let it;
do **not** force-confirm a candidate to make the demo smoother.

**Hover / focus state.** The card lifts ~6px, the border goes `#2f6f73`, a bottom veil
fades in, and a teal "Check this card" pill appears centred at the bottom of the artwork.
See `.cardbtn` in the mockup. The affordance lives on the card — no explanatory copy
anywhere on the page.

**Remove entirely:** the rail heading, any subtitle or "why these cards" line, any
Chase/Recent tabs, any visible pause button. The rail carries no chrome. The founder was
explicit about this.

**Motion control without a visible button** — all four must be true:

1. `mouseenter` / `focusin` on the rail container sets `data-paused="true"`;
   `mouseleave` / `focusout` clears it.
2. `@media (prefers-reduced-motion: reduce)` sets `animation: none` on the track.
   (`globals.css` already has a reduced-motion block — extend it, don't duplicate it.)
3. `@media (hover: none), (pointer: coarse)`: no auto-animation at all. The rail becomes a
   native horizontally-scrolling `scroll-snap-type: x mandatory` strip with the check pill
   permanently visible. A moving click target with no hover state is unusable on touch.
4. The rail must be visible on mobile. Today it is `hidden lg:block`. Remove that — it is
   the entrance now, so it cannot be desktop-only.

**Accessibility.** `buildMarqueeItems` duplicates the list so `translateX(-50%)` loops
seamlessly. That currently puts every card in the tab order twice. The duplicate half must
be rendered with `data-clone="true" tabindex="-1" aria-hidden="true"` and
`pointer-events: none`. Drop `aria-hidden` from the rail container itself and give it
`aria-label`. Each button needs an accessible name: `Check {name}, {setName} {cardNumber}`.

---

## Task 2 — Implicit chase / recent blend

There is no toggle and no label. The composition of the rail shifts silently as the user
accumulates history.

Replace `composeCarouselCards` with a blend that takes the user's recents and the curated
pool and returns a mixed list:

```ts
const RAIL_SLOTS = 14;

/** Recent share ramps with real usage and caps at 70%. Zero history = pure curated. */
export function recentShare(historyCount: number): number {
  if (historyCount <= 0) return 0;
  return Math.min(0.7, 0.18 + 0.13 * historyCount);
}

/**
 * Bresenham-style interleave: spreads recents evenly through the loop instead of
 * clumping them at one end, so the rail never reads as "your cards, then ours".
 */
export function blendRail(
  recent: RecentCarouselCard[],
  curated: RecentCarouselCard[],
  historyCount: number,
  slots = RAIL_SLOTS,
): RecentCarouselCard[] {
  const share = recentShare(historyCount);
  const out: RecentCarouselCard[] = [];
  let acc = 0, r = 0, c = 0;
  for (let i = 0; i < slots; i++) {
    acc += share;
    if (acc >= 1 && recent.length > 0) { acc -= 1; out.push(recent[r++ % recent.length]); }
    else { out.push(curated[c++ % curated.length]); }
  }
  return out;
}
```

Expected distribution (assert this in tests):

| history | target share | recents in 14 slots |
|---|---|---|
| 0 | 0% | 0 |
| 1 | 31% | 4 |
| 3 | 57% | 7 |
| 12 | 70% | 9 |

`historyCount` is `readRecentCarouselCards().length`. Keep `MAX_MARQUEE_REAL_CARDS` as the
cap on stored recents.

**Recents and curated cards must render identically** — no "checked 2d ago", no badge, no
ordering tell. The user recognises their own cards; anything that marks them re-introduces
the labelling we just removed. The only per-card variation is the rarity tag from Task 3,
which is a property of the card, not of its source.

Keep the `source: "chase" | "recent"` distinction in the analytics event only.

---

## Task 3 — Rarity tags that are not generic badges

The mockup ships a placeholder: one cream-and-gold pill, top-left of the artwork, same for
every rarity. **Do not implement that.** A tag that looks identical for `SIR`, `Rainbow`,
`Holo` and `Promo` carries no information — it is decoration wearing an information
costume, and uniform pills with uppercase micro-text are exactly what reads as generic.

Three rules:

**1. No pill, and not on the artwork.** The tag lives in the caption row *under* the card,
inline with the collector number. Physical cards print rarity in the card's own corner; a
floating capsule over the art is a web convention, not a TCG one — and it covers the thing
we are actually selling.

**2. The swatch carries the finish; the word is secondary.** What separates these
rarities in real life is the print treatment. Render a 10×10px rounded swatch that samples
it, then the label beside it:

| Rarity class | Swatch |
|---|---|
| Holo | linear-gradient 20°, `#2f6f73` → `#cfdad6` → `#2f6f73` |
| Reverse holo | same sheen + 1px dot texture overlay |
| Rainbow / Hyper | true rainbow, desaturated to ~40% so it sits on cream paper |
| Gold / Secret | `#b88a35` → `#f0d99a` → `#d7a84e` (existing `--gold` ramp) |
| Full art / SIR / SAR / Alt art | solid `#24312f` square with one corner cut — reads as art bleeding to the edge |
| Promo | four-point star outline in `#24312f` (promos carry a black star stamp) |
| Common / Uncommon / Rare | small ●, ◆, ★ outline in `--muted` |

Draw these as inline SVG or CSS gradients. **Do not trace, embed, or pixel-copy official
rarity symbols or set logos** — simple geometry only.

**3. Sentence case, quiet.** `Rainbow rare`, not `RAINBOW RARE`. 10.5px, weight 700,
colour `--muted`, no letter-spacing. `PRODUCT.md` names "repeated uppercase eyebrows" as an
anti-reference; the swatch is the loud element and the word is the caption.

The payoff: a collector reads gold-versus-rainbow pre-attentively without reading a word,
and nothing on screen looks like a template badge.

**Data.** `RecentCarouselCard` has no rarity field. Add `rarity: string | null` and
populate it in `toRecentCarouselCard` from `CardIdentityCandidate.rarity`. Add the same
field to `CURATED_MARQUEE_CARDS`.

**When rarity is unknown, render no tag at all.** Do not fall back to `"Rare"`. Guardrail
4: unknown stays unknown, and an invented rarity is a fabricated card fact.

Normalise raw rarity strings to the classes above in one small pure function
(`rarityFinish(rarity: string | null)`), so it is unit-testable and so One Piece codes
(`SR`, `SEC`, `L`, `P`) and Pokémon strings both map cleanly.

---

## Task 4 — Hero hierarchy and the single search block

Replace the `lg:grid-cols-[0.82fr_1.18fr]` split with one centred column, max-width 720px.
The current split leaves a dead gap: the left column uses `justify-between` but no longer
has enough content to fill it since commit `da56731`.

- Search input is the largest element on the page: ~20px text, ~19px vertical padding,
  submit button welded to its right edge (wraps to full width under 700px).
- The search field, game selector, ZIP, and the filters disclosure live inside **one**
  bordered card. Today the filters bar sits outside the search card and spans the full form
  width — a broken containment relationship. Same for the paste-listing panel.
- The nested boxes go: `paper-panel` → inner `section` → `input-with-icon` is three borders
  within ~250px. Collapse to one.
- Headline drops to ink `#24312f`. Teal is currently on the headline, input border, focus
  ring, primary button, links, icons and the tile checkmark — when the brand colour is on
  everything it emphasises nothing. Reserve `#2f6f73` for interactive elements. **The
  palette itself does not change.**
- The two 64px game logo tiles become a compact segmented control. They currently outweigh
  both the input and the submit button for a binary choice the parser auto-detects anyway.
- Restore the scope line (`Pokémon & One Piece · raw singles · U.S. listings`) as quiet
  caption text, not the boxed badge that was removed. It is the only statement of what the
  product covers.
- Restore a real placeholder example (`Charizard 4/102 · Luffy OP01-003 · SWSH144`). The
  current `"Card name or number"` teaches nothing; the parser's ability to read name,
  number, language and variant together is undiscoverable without an example.
- `ParsedPreview` must reserve its height and always render something, rather than
  returning `null`. It currently appears and disappears while typing, which shifts layout.

---

## Task 5 — ZIP on the landing form (bug, not polish)

`postalCode` is only registered in the results edit panel (~line 923). It is absent from
the landing form, but `estimateSalesTaxRateFromZip` and landed-cost ranking both depend on
it. Every first search therefore runs ZIP-less, so the one result that decides whether a
new user trusts the product has the weakest cost basis.

Add the ZIP field to the landing control row. It already persists via the existing
`postalCode` / `taxRatePercent` effect — reuse it, do not add new storage.

---

## Known open decision — do not silently resolve

`CURATED_MARQUEE_CARDS` is a hardcoded array of 8 cards, **all Pokémon**, newest around
Twilight Masquerade / Paradox Rift. Two consequences:

1. A One Piece buyer sees a cold-start rail with nothing for their game.
2. Any copy or naming that implies "newest" or "chase right now" is a claim the current
   data cannot back — a credibility problem for a product selling freshness and honest
   sourcing.

Since the rail carries no heading, we are not *stating* the claim, which is why this is not
blocking. But do **not** add such a claim, and do **not** invent card entries to fill the
gap. Add One Piece entries only from verified catalog data, following
`docs/card-identity-research-policy.md`. Leave a `TODO` naming the eventual source and
raise it in `PROGRESS.md` rather than papering over it.

---

## Tests (vitest, extend `ComparisonApp.test.tsx`)

1. `recentShare` returns 0 / 0.31 / 0.57 / 0.70 for history 0 / 1 / 3 / 12.
2. `blendRail` produces the counts in the Task 2 table and never returns two recents at
   both ends before any curated card (spread, not clumped).
3. With no stored recents, the rail contains only curated cards.
4. Clicking a rail card calls `submitComparison` with `cardName`, `setCode` and
   `cardNumber` populated from that card.
5. Cloned marquee items have `tabindex="-1"` and `aria-hidden="true"`; the real half does
   not — assert the number of *accessible* buttons equals the number of distinct cards.
6. `rarityFinish` maps representative Pokémon and One Piece rarity strings, and returns
   `null` for unknown/empty so no tag renders.
7. ZIP input is present on the landing form and its value reaches `buildRequest`.

Run `npm run lint` and the type check; keep both clean.

---

## Constraints

- Do not change the colour palette, fonts, logo, or the paper-grain / letterpress
  treatment.
- Do not rename `TCGpal` paths. Product-facing copy says `TCGlens` / `Lens TCG`.
- Every new user-facing string goes in **both** `en` and `zh` in `i18n.tsx`.
- No new dependencies.
- Keep motion honest: it may show searching, fanning out, comparing or selecting. Nothing
  else animates.
- Do not weaken any guardrail to improve the demo — no fixtures as fallback inventory, no
  invented rarities, no forced identity confirmation.

## Definition of done

Landing page matches `docs/mockups/lens-landing-v2.html` in structure and hierarchy;
clicking any rail card starts a real comparison; the rail works with keyboard, screen
reader, touch, and `prefers-reduced-motion`; the chase/recent blend shifts with history and
is invisible in the UI; rarity tags differentiate by finish and disappear when rarity is
unknown; ZIP is on the landing form; tests and lint pass.
