import { describe, expect, it } from "vitest";
import { submitsOnEnter } from "@/features/comparison/search-submit";

const base = { key: "Enter", isComposing: false, defaultPrevented: false };

describe("submitsOnEnter", () => {
  it("submits on a plain Enter, the way a search box is expected to behave", () => {
    expect(submitsOnEnter(base)).toBe(true);
  });

  it("ignores every other key", () => {
    expect(submitsOnEnter({ ...base, key: "a" })).toBe(false);
    expect(submitsOnEnter({ ...base, key: "Tab" })).toBe(false);
    expect(submitsOnEnter({ ...base, key: "Escape" })).toBe(false);
  });

  it("leaves an IME composition alone", () => {
    // Typing 中文 ends each candidate selection with Enter. Submitting there would
    // fire a search for a half-composed query and steal the buyer's keystroke.
    expect(submitsOnEnter({ ...base, isComposing: true })).toBe(false);
  });

  it("stands down when something upstream already handled the key", () => {
    expect(submitsOnEnter({ ...base, defaultPrevented: true })).toBe(false);
  });
});
