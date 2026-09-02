import { describe, expect, it } from "vitest";
import { CONDENSE_ENTER_Y, CONDENSE_EXIT_Y, shouldCondenseHeader } from "@/features/comparison/header-condense";

describe("shouldCondenseHeader", () => {
  it("stays expanded at the top of the page", () => {
    expect(shouldCondenseHeader(0, false)).toBe(false);
  });

  it("condenses once the buyer has scrolled into the result", () => {
    expect(shouldCondenseHeader(CONDENSE_ENTER_Y + 1, false)).toBe(true);
  });

  it("holds its state through the gap between the two thresholds", () => {
    // Without hysteresis the header toggles on every pixel around one threshold,
    // and because condensing changes the header's height it scrolls the page
    // underneath itself — a loop the buyer sees as flicker.
    const middle = Math.round((CONDENSE_ENTER_Y + CONDENSE_EXIT_Y) / 2);
    expect(shouldCondenseHeader(middle, true)).toBe(true);
    expect(shouldCondenseHeader(middle, false)).toBe(false);
  });

  it("expands again only after scrolling back near the top", () => {
    expect(shouldCondenseHeader(CONDENSE_EXIT_Y - 1, true)).toBe(false);
  });

  it("leaves room between the thresholds for the height the header gives back", () => {
    expect(CONDENSE_ENTER_Y).toBeGreaterThan(CONDENSE_EXIT_Y);
  });
});
