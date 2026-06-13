# TCGpal mobile plan

## Reframe first: mobile is probably your PRIMARY context

Most TCG buyers feel the "should I buy this now?" pressure **on their phone** — at a shop, in a Discord, scrolling eBay/闲鱼 in bed. The anti-FOMO moment happens on mobile. So treat mobile as the core experience, not a port of the desktop site.

## Recommendation: responsive web + PWA first, native (Expo) only if/when needed

You already have a working Next.js app. A PWA gets you ~90% of a "phone app" at ~10% of the cost, and is the right call for a research-preview MVP. Hold React Native until you have a concrete reason (App Store presence, real push, native camera/scan).

---

## Phase 1 — Make the web app genuinely responsive (biggest win)

Audit every surface at 375px width. The current dense desktop layouts are the main problem:

- **Modals → full-screen sheets.** The Ready to Buy modal and the decision sheet are centered desktop dialogs. On mobile they should be full-screen, single-column, scrollable, with a sticky bottom action bar (Pre-buy Check / Raw vs Slab / etc.).
- **Dense forms → steppers / progressive disclosure.** Raw vs Slab (9 inputs) and Journal (8 textareas) are brutal on a phone. Show 2–3 core fields, put the rest behind "Advanced". Probabilities as sliders/percent, not raw decimals.
- **Tap targets & type.** Min 44px touch targets, no font below ~14px, more spacing.
- **Buy check card.** Already compact — make the 4 dimension chips wrap 2×2, keep Debug collapsed.
- **Split `page.tsx`.** The ~3,500-line monolith will fight you on every mobile change. Extract per-screen components as you touch them.

Deliverable: the whole flow usable one-handed on a phone in the browser.

## Phase 2 — Turn it into an installable PWA

- `manifest.webmanifest`: name, theme color `#2f6f73`, background, display `standalone`, and the icons you already generated (`icon-192/512`, `apple-touch icon-180`).
- Service worker (Next.js: `next-pwa` or a hand-rolled SW) for an offline app shell.
- "Add to Home Screen" prompt. iOS: add `apple-mobile-web-app-*` meta + the 180px touch icon.
- Your `localStorage` persistence already works offline — good fit; just confirm the journal/plan survive offline.

Deliverable: users can install TCGpal to their home screen, launch full-screen, use core flows offline.

## Phase 3 — Mobile-native UX touches (still web)

- **Share target / paste:** let a user share an eBay/marketplace link or text straight into TCGpal → prefill the Listing Risk / Buy check. This is the killer mobile interaction for your product.
- **Camera:** `getUserMedia` to snap card photos (feeds the future evidence/vision work).
- **Deep link to eBay sold** (the feature you're adding) is especially natural on mobile — one tap to the eBay app.
- Haptics on verdict, bottom-reachable primary actions.

## Phase 4 — Native app, only if you need it

Trigger conditions: App Store/Play presence, reliable push notifications, barcode/card scanning, or richer offline. Path: **Expo (React Native)**.

Your architecture makes this much cheaper than usual: the deterministic libs (`raw-vs-slab`, `listing-risk`, `fomo-check`, budget rules, the market-check client types) are **pure framework-agnostic TypeScript**. Move them into a shared package (or keep calling your `/api` routes from the native app) and reuse them as-is. Only the UI layer gets rewritten in RN. Plan for two UI codebases but one logic core.

---

## Suggested sequence & sizing (rough)

1. Responsive pass on the 3 key surfaces (Ready to Buy, Buy check, Raw vs Slab) — **medium**, highest ROI.
2. PWA manifest + SW + install — **small**.
3. Share-target + camera — **medium**.
4. Native (Expo) — **large**, defer until validated.

## Key principles
- Mobile-first, not mobile-port.
- PWA before native; native only on a real trigger.
- Keep deterministic logic framework-agnostic so any client can reuse it.
- Carry the "honest + calm" UI discipline to small screens (collapse the machinery, surface the verdict).
