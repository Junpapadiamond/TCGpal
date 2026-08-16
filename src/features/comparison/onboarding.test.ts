import { describe, expect, it } from "vitest";
import {
  TOTAL_COST_DEMO_ROWS,
  demoRowTotal,
  demoWinnerIndex,
  typewriterFrame,
} from "./onboarding";

describe("typewriter placeholder", () => {
  const examples = ["ab", "cde"];

  it("types the first example one character at a time", () => {
    expect(typewriterFrame(examples, 0)).toBe("a");
    expect(typewriterFrame(examples, 1)).toBe("ab");
  });

  it("holds the finished example before clearing it", () => {
    expect(typewriterFrame(examples, 2)).toBe("ab");
    expect(typewriterFrame(examples, 2 + 13)).toBe("ab");
  });

  it("deletes back to empty, then moves to the next example", () => {
    const deleteStart = 2 + 14;
    expect(typewriterFrame(examples, deleteStart)).toBe("a");
    expect(typewriterFrame(examples, deleteStart + 1)).toBe("");
    expect(typewriterFrame(examples, deleteStart + 2)).toBe("c");
  });

  it("loops back to the first example instead of running out", () => {
    const total = examples.reduce((sum, example) => sum + example.length * 2 + 14, 0);
    expect(typewriterFrame(examples, total)).toBe(typewriterFrame(examples, 0));
    expect(typewriterFrame(examples, total * 3 + 1)).toBe(typewriterFrame(examples, 1));
  });

  it("returns nothing rather than throwing when there are no examples", () => {
    expect(typewriterFrame([], 5)).toBe("");
  });
});

describe("total-cost demo", () => {
  it("adds shipping into the compared total", () => {
    expect(demoRowTotal(TOTAL_COST_DEMO_ROWS[0])).toBeCloseTo(27.24, 2);
    expect(demoRowTotal(TOTAL_COST_DEMO_ROWS[1])).toBeCloseTo(22.49, 2);
  });

  it("picks the higher sticker price because its total is lower", () => {
    // This is the whole claim the animation makes. If someone edits the demo
    // numbers into a row where the cheapest item also wins on total, the
    // demonstration silently stops demonstrating anything.
    const winner = demoWinnerIndex(TOTAL_COST_DEMO_ROWS);
    expect(winner).toBe(1);

    const cheapestItem = TOTAL_COST_DEMO_ROWS
      .reduce((low, row, index) => (row.item < TOTAL_COST_DEMO_ROWS[low].item ? index : low), 0);
    expect(cheapestItem).not.toBe(winner);
  });
});
