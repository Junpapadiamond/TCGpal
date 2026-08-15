# Design brief: remove the remaining "AI-generic" feel

Handoff spec for a coding agent. Scope: presentation layer only. Written 2026-07-23 after a live review of https://tcgpal.vercel.app/ (full flow: search "Greninja Gold Star SWSH144" → confirm → 12-listing eBay result) plus a code audit.

## Context the agent needs

- Product: TCGpal/TCGlens — evidence-backed listing comparison for raw TCG singles (Pokémon + One Piece). Read `AGENTS.md` first; its product guardrails are binding (never invent data, unknown ≠ risky, etc.).
- Framework: **Next.js 16** — per `AGENTS.md`, read `node_modules/next/dist/docs/` before any framework-level change.
- Almost all UI lives in one file: `src/features/comparison/ComparisonApp.tsx` (~3,140 lines). Design tokens/utility classes: `src/app/globals.css`. Fonts: `src/app/layout.tsx` (Fraunces display serif, IBM Plex Mono for money, Noto Serif SC for zh). All user-facing strings are in `src/features/comparison/i18n.tsx` — **every copy change must be made in both `en` and `zh`**.
- The visual identity (cream paper + teal/gold, grain overlay, letterpress serif) is intentional and already passed a design QA (`design-qa.md`). **Do not restyle the palette, fonts, or paper system. Do not introduce shadcn/ui or any component library** — that would re-genericize the app.
- What still reads as AI-generated is structural: repetition, box-in-box nesting, placeholder-looking assets, and dead space. The changes below, in priority order, fix that.

## Change 1 (P0): stop repeating the "Confirmed print" box on every row

Observed: all 11 supporting listing rows render the identical box "Confirmed print: SWSH Black Star Promos · SWSH144 · Promo" + bullet "The full collector number and card name identify the selected print." Repetition is the #1 tell and adds nothing after the first occurrence.

- Component: `PrintIdentitySummary` (ComparisonApp.tsx ~line 2723). Render sites: line ~2121 (`InspectFirstHero`), ~2635 (lead/choice card), ~2971 (`CompactCandidateRow`, with `compact`).
- Rule to implement:
  - Lead pick and Inspect-First hero: keep the full box as-is.
  - Compact rows (`compact` prop): suppress the box entirely when `listing.printMatchReasons` contains only the generic reasons (`pokemon_full_number_and_name_match`, `pokemon_full_number_and_set_match` — see i18n.tsx ~line 256). Replace with a small inline confirmation tag (e.g. `✓ print` style matching the existing 10px uppercase tags in `CompactCandidateRow`) with `title`/`aria-label` carrying the full metadata string.
  - Compact rows with *non-generic* reasons (special prints, manga/parallel variants, mismatches): keep the box — this is real signal and existing tests depend on it.
- i18n: add the short tag label to both `en` and `zh` dictionaries.

## Change 2 (P0): supporting rows become a ledger, not a stack of cards

Observed: each supporting row is its own bordered `paper-panel`-style card inside the results panel — box-in-box-in-box. The brand language is "receipt/evidence"; a dense ledger fits it and reads hand-designed. Reference density: McMaster-Carr.

- Component: `CompactCandidateRow` (~line 2927) and the list that renders it inside the "Compare N other eligible listings" disclosure.
- Implement: remove the per-row `article` border/background (`rounded-md border border-[#d6ded5] bg-[#fcfbf6]`). Render rows as a single panel containing rows separated by `border-b border-[#d6ded5]` hairlines (last row no border). Keep: thumbnail pair, truncating title, condition · photos · Ask line, mono right-aligned price with its uppercase sub-label, `MarketDeltaBadge`, View listing link, hover state (e.g. `hover:bg-[#f7f9f5]`), and all `aria` labels. Tighten vertical padding (~py-2.5 → py-2) since Change 1 removes the box.
- Keep it a semantic list or rows of `article`s — no need for an actual `<table>`; density and shared dividers are the goal.

## Change 3 (P1): homepage marquee must never show "SAMPLE"-watermarked cards

Observed: the landing card strip showed One Piece official images watermarked "SAMPLE" — looks like unfinished placeholder content. Cause: `CardMarquee`/`buildMarqueeItems` (~lines 1147–1204) replays recent searches from localStorage; the bundled One Piece catalog uses en.onepiece-cardgame.com images, which are all SAMPLE-watermarked (acknowledged in `next.config.ts` comments).

- Implement: in `buildMarqueeItems` (or `composeCarouselCards`/`safeCarouselImageUrl` ~line 220), exclude images hosted on the watermarked domain(s) (check `next.config.ts` remotePatterns for the exact hostnames; `images.pokemontcg.io` and `images.scrydex.com` are clean). When fewer than the minimum remain, top up from a small curated seed list of 6–8 visually strong `images.pokemontcg.io` card URLs (hardcoded constant is fine) instead of falling back to abstract card backs.
- Do not add new image domains without updating `next.config.ts`.

## Change 4 (P1): confirmation step — don't strand a single candidate left

Observed: with one candidate, `IdentityConfirmation` (~line 1493) shows one card in the left of a wide empty panel (~60% dead space right).

- Implement: when `identities.length === 1`, center the `IdentityCard` (e.g. `max-w-sm mx-auto`) or pair it with a short right-hand aside using existing token styles ("Next: we rank live eBay listings for this exact print" — copy in both languages). Multi-candidate grid stays unchanged.

## Change 5 (P2, optional): compress the three-column explainer trio

"WHY IT STANDS OUT / WHAT TO KNOW / NEXT-BEST OPTION" — three parallel paragraphs is a classic LLM output shape. In the lead card (`ComparisonResult` ~1684, keys `whyItStandsOut`/`whatToKnow`/`nextBestOption` in i18n.tsx ~265), keep the content but compress: one verdict sentence + a compact facts line; "Next-best" becomes a single line. Copy-only + layout; do not touch how the strings are computed. Skip if it risks test churn beyond budget.

## Change 6 (decision required from the owner — do not guess)

The UI says **TCGlens**; the domain, repo, and assets say **TCGpal** (`public/tcgpal-logo-*.svg`, tcgpal.vercel.app). Inconsistent naming itself signals "generated." Ask the owner which name wins before touching metadata/logos; skip in this pass if unanswered.

## Hard constraints

- No changes to ranking, filtering, identity, or API code (`src/lib/**`) except the marquee image filter if it lives in a lib helper.
- No new dependencies, no component libraries, no Tailwind config changes.
- Both languages (EN/中文) for every string; zh uses the same serif fallback stack automatically.
- Preserve all `aria-*`, focus rings, and reduced-motion behavior noted in `design-qa.md`.

## What to test

Automated — run `npm test` (vitest; it also runs `metadata:check`). Tests likely affected, in `src/features/comparison/ComparisonApp.test.tsx`:

- "renders precise special-print evidence reasons in English and Chinese" (~line 406) — must still pass: special-print reasons stay visible in compact rows (Change 1 keeps non-generic reasons).
- "shows the confirmed reference art beside the seller listing photo" (~line 440) — thumbnail pair must survive the ledger refactor.
- "shows an unresolved same-number listing as Inspect First, never as the buy" (~line 566) — Inspect-First hero keeps its full print box.
- Add one test: a compact row whose only reasons are generic shows the tag (with full metadata in its accessible name) and does NOT render the "Confirmed print:" box text.

Manual QA (dev server + the live flow):

1. Search "Greninja Gold Star SWSH144" → confirm → results. Expand "Compare N other eligible listings": rows are hairline-divided, no repeated print box, tag tooltip shows full print metadata.
2. Search a One Piece special print (e.g. a Nami parallel from the existing tests) → confirm compact rows with special-print reasons still show the reason box.
3. Landing page desktop ≥1024px: marquee shows only clean art, zero "SAMPLE" watermarks, including after localStorage contains One Piece recents (do a One Piece search first, return home).
4. Single-candidate confirmation (the Greninja query) → card centered/balanced; multi-candidate (name-only search like "Pikachu") → grid unchanged.
5. Toggle 中文 on every changed screen; check truncation and the new tag.
6. Mobile 390px: results rows don't overflow horizontally; tap targets ≥44px preserved.
7. `prefers-reduced-motion`: marquee respects existing behavior.
8. Keyboard: tab through a ledger row — Ask, View listing, and the tag's accessible name all reachable/announced.

Done = `npm test` green + the 8 manual checks pass + no visual regression on the lead pick card (compare against `output/browser-after/results-en-desktop.png`).
