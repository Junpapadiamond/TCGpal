# Sprint: AI writes the Action sentence (1 day, 2026-08-10)

## The goal in one line

Replace the canned Action sentence ("The numbers support this buy...") with an AI-written sentence about this specific listing — without ever letting the AI state a wrong fact.

## The one rule that makes it safe

**Your code decides, AI explains.** The buy/wait/pass decision, the label, and the thresholds in `verdict-copy.ts` do not change. The AI only writes the note under the label, and it may only use facts the system already collected. If anything looks off, the user sees today's canned sentence — so the worst case is exactly what you have now.

## Work orders (hand each to an agent)

### 1. Fact sheet

Build a function that turns the pick + comparison into a numbered list of plain facts, e.g. "1. Landed total $834.24. 2. 10 item photos. 3. Seller does not accept returns. 4. Item price 10% under NM reference. 5. Cheapest rival is $776.03 with 1 photo and seller risk signals." Copy the sanitizing approach from `sanitizeReportForQuestion` in `comparison-qa.ts`. No raw seller text in this version.

Done when: fact sheet is produced for every report shape, including the weird ones (no market reference, unknown condition, user-typed listing).

### 2. The writer

Call the existing AI provider (`provider.completeJson`, like `comparison-qa.ts` does) with: the fact sheet, the already-decided verdict (buy/wait/pass), and instructions — write 1–3 sentences, use only facts from the list, report which fact numbers you used, never invent numbers, never say scam/guaranteed/will grade.

Done when: it returns `{ note, citedFactIds }` matching a Zod schema.

### 3. The checker (most important piece)

Plain code, no AI. Reject the note if: any dollar amount, percentage, or count in it does not appear in the fact sheet; it contains banned phrases (reuse the `forbiddenAnswer` list); it's too long; or cited fact ids are missing. Rejected → fall back to the canned sentence, silently.

Done when: tests prove a note with a made-up number always gets rejected.

### 4. The test run

Collect ~20 saved/fixture reports covering the edge cases (no market anchor, unknown condition, non-NM search, risky seller, thin evidence, user-supplied). Script runs the writer on all 20 and prints every note next to its fact sheet. You read them once: zero wrong facts required.

Done when: script + results are committed.

### 5. The switch

Feature flag, off by default. Note is cached per report snapshot. Shared receipts (`/r/{id}`) keep the canned copy for now.

Done when: production behavior is unchanged with the flag off.

## Stretch (only if the day has room)

Read the seller's own title/description for flaw statements ("minor whitening, see photos") and show them as caveats. Safe because every caveat must be a near-quote of the seller's text — checkable with string matching. If built, these quotes join the fact sheet.

## Cut from this sprint

- "Why is this the top pick?" upgrade — the existing button already works.
- AI next moves — waiting on your D-NEXT-MOVES decision.

## How we know the sprint worked

Turn nothing on. Success = the 20-report test shows zero wrong facts and the notes actually mention listing-specific details. If the test isn't done by end of day, flag stays off — that's still a pass. Any wrong fact that slips past the checker and can't be fixed by tightening the checker = kill it, keep templates, write down why.
