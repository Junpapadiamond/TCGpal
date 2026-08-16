// First-run guidance for the landing screen: a typed placeholder that teaches
// the "name + number" query shape, and a small demo showing why ranking on total
// cost changes the answer. Both are pure so the behaviour is testable without a
// DOM or a timer; the React layer only supplies ticks and visibility.

const HOLD_FRAMES = 14;

/**
 * Deterministic frame of the typed placeholder. Each example types out one
 * character per tick, holds, then deletes back to empty before the next one.
 * Pure in `tick`, so tests never need fake timers.
 */
export function typewriterFrame(examples: string[], tick: number): string {
  if (examples.length === 0) return "";
  const total = examples.reduce((sum, example) => sum + example.length * 2 + HOLD_FRAMES, 0);
  let offset = ((tick % total) + total) % total;
  for (const example of examples) {
    if (offset < example.length) return example.slice(0, offset + 1);
    offset -= example.length;
    if (offset < HOLD_FRAMES) return example;
    offset -= HOLD_FRAMES;
    if (offset < example.length) return example.slice(0, example.length - offset - 1);
    offset -= example.length;
  }
  return examples[0] ?? "";
}

export type TotalCostDemoRow = {
  item: number;
  shipping: number;
};

/**
 * Illustrative figures only — never live inventory. The UI renders these behind
 * a visible "Example" tag. The numbers are chosen so the cheaper sticker price
 * loses once shipping is counted; `onboarding.test.ts` locks that property in.
 */
export const TOTAL_COST_DEMO_ROWS: TotalCostDemoRow[] = [
  { item: 12.25, shipping: 14.99 },
  { item: 18.50, shipping: 3.99 },
];

export function demoRowTotal(row: TotalCostDemoRow) {
  return row.item + row.shipping;
}

export function demoWinnerIndex(rows: TotalCostDemoRow[]) {
  return rows.reduce(
    (best, row, index) => (demoRowTotal(row) < demoRowTotal(rows[best]) ? index : best),
    0,
  );
}
