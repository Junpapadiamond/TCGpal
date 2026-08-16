// First-run guidance for the landing screen: a typed placeholder that shows what
// a query can look like. Pure so the behaviour is testable without a DOM or a
// timer; the React layer only supplies ticks.

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
