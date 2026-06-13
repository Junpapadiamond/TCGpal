# Implementation prompt — eBay sold-comps deep link (no scraping)

Paste the block below to a coding agent working in the TCGpal repo.

---

## Context

You are working in TCGpal, a Next.js 16 + TypeScript app. Product philosophy (see `AGENTS.md`): a cautious, honest "buy-before check" tool. It is **deterministic-first** — AI explains, deterministic rules decide. Two hard rules for this task:

1. **No scraping, no fetching of eBay pages.** We do not request, render, or parse eBay search/sold results. eBay's ToS forbids it and it breaks constantly.
2. **Stay honest.** We must NOT claim we retrieved sold comps. Automated sold comps remain `unavailable`. What we add is a precise, user-clickable eBay **sold-listings search link** plus guidance on what to look for — i.e. we make the manual check one tap away, we don't fake it.

Relevant existing code:
- `src/lib/ai/market-check.ts` — the Market Check agent. `getSoldComps()` currently returns an honest `unavailable` result and records a source. The agent exposes a `get_sold_comps` tool.
- `src/lib/schemas.ts` — Zod schemas for the agent request/response (`marketCheckResponseSchema`, sold-comps shape).
- `src/app/page.tsx` — the Buy check card UI renders a MARKET dimension chip, NEXT ACTIONS, and a collapsed Debug details section.
- Copy is bilingual (`en` / `zh`) via locale copy objects in `page.tsx`.

## Goal

Add a deterministic helper that turns a card identity into a correct eBay **completed/sold** search URL, wire it into `get_sold_comps`, and surface it in the Buy check card so the user can verify recent sold prices in one tap.

## Tasks

1. **New file `src/lib/external/ebay-sold-link.ts`** exporting a pure function:
   ```ts
   buildEbaySoldSearchUrl(input: {
     cardName: string;
     version?: string;
     setNumber?: string;     // e.g. "125/094"
     grade?: string;         // e.g. "PSA 10", "raw"
     marketplace?: "US" | "UK" | "DE"; // default "US" -> ebay.com
   }): { url: string; query: string }
   ```
   - Build the search term from cardName + version + setNumber, and append the grade as a keyword when it is a graded value (e.g. `PSA 10`); when `raw`, do not add a grade keyword.
   - URL-encode properly. Base: `https://www.ebay.com/sch/i.html`, params `_nkw=<query>`, `LH_Sold=1`, `LH_Complete=1`.
   - Add sensible noise-exclusion keywords appended to `_nkw` (e.g. `-lot -proxy -reprint -digital -custom`). Keep this list small and documented.
   - Map `marketplace` to the right host (`ebay.com` / `ebay.co.uk` / `ebay.de`).
   - No network calls. Pure string building only.

2. **Wire into `getSoldComps()` in `market-check.ts`:**
   - Keep `available: false` / status `unavailable` for automated data (do not lie).
   - Add fields to the sold-comps result (extend the Zod schema): `manualCheckUrl: string`, `lookupQuery: string`.
   - Update the recorded source note to: "Automated sold comps are not connected. Generated a verified eBay sold-search link for manual review."
   - Update the `get_sold_comps` tool description so the model knows it returns a manual-verification link, not fetched data, and must not claim comps were retrieved.

3. **UI in `page.tsx` (Buy check card):**
   - In the MARKET dimension, when `manualCheckUrl` exists, render a link: "Check recent sold on eBay →" opening in a new tab (`target="_blank" rel="noopener noreferrer"`).
   - Add a one-line hint near it: "Look at the median of matching version + grade. Ignore outliers and lots." (and the `zh` equivalent).
   - Keep the honest MARKET label: if reference price is curated/demo, say so; sold comps still read as "manual check" not "found".
   - Add the link to NEXT ACTIONS as well (e.g. "Open eBay sold and confirm the price before offering.").

4. **Bilingual copy** for all new strings in both `en` and `zh` locale objects.

5. **Tests** — add `src/lib/external/ebay-sold-link.test.ts`:
   - Correct host per marketplace.
   - `LH_Sold=1&LH_Complete=1` present.
   - Grade keyword added for `PSA 10`, omitted for `raw`.
   - Query is URL-encoded; exclusions present.

## Constraints
- No new dependencies. No network/scraping. Deterministic + unit-testable.
- Respect `AGENTS.md` guardrails and the deterministic-budget hard-stop (do not touch decision logic).
- Do not upgrade the verdict because a link exists — a link is not evidence.

## Acceptance
- `npm run typecheck`, `npm run lint`, `npm run test` pass.
- In the Ready to Buy flow, the Buy check MARKET area shows a working "Check recent sold on eBay →" link that opens the correct sold search for the selected card + grade.
- Debug details still honestly show sold comps as unavailable (automated), with the generated link noted.
