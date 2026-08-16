import { describe, expect, it } from "vitest";
import { typewriterFrame } from "./onboarding";

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

