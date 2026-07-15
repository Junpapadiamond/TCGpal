import { describe, expect, it } from "vitest";
import {
  collectorNumberConflict,
  collectorNumberPattern,
  collectorNumbersEquivalent,
  normalizeCollectorNumber,
  parseCollectorNumber,
} from "@/lib/comparison/collector-number";

describe("collector-number identity", () => {
  it.each([
    ["1/91", "001/091"],
    ["232/91", "232/091"],
    ["TG23/TG30", "tg023/tg030"],
    ["OP01-016", "op1 0016"],
    ["P-096", "p 96"],
    ["SWSH144", "swsh0144"],
  ])("treats legal padding and separator variants as equal: %s = %s", (left, right) => {
    expect(collectorNumbersEquivalent(left, right)).toBe(true);
    expect(collectorNumbersEquivalent(right, left)).toBe(true);
  });

  it.each([
    ["232/91", "233/091"],
    ["232/91", "232/092"],
    ["4/102", "14/102"],
    ["OP01-016", "OP01-116"],
    ["P-096", "P-196"],
    ["OP01-016", "OP01-016_p4"],
  ])("rejects a different number or internal print suffix: %s != %s", (left, right) => {
    expect(collectorNumbersEquivalent(left, right)).toBe(false);
  });

  it("builds boundary-safe patterns without substring collisions", () => {
    const fraction = collectorNumberPattern("4/102");
    const onePiece = collectorNumberPattern("OP01-016");

    expect(fraction?.test("Venusaur 004/0102 Base Set")).toBe(true);
    expect(fraction?.test("Venusaur 14/102 Base Set")).toBe(false);
    expect(onePiece?.test("Nami op1 0016 parallel")).toBe(true);
    expect(onePiece?.test("Nami XOP01-016 parallel")).toBe(false);
    expect(onePiece?.test("Nami OP01-0167 parallel")).toBe(false);
  });

  it("detects explicit same-scheme conflicts but not number-less text", () => {
    expect(collectorNumberConflict("Mew ex 233/091 Paldean Fates", "232/91")).toBe(true);
    expect(collectorNumberConflict("Mew ex Paldean Fates", "232/91")).toBe(false);
    expect(collectorNumberConflict("Nami OP01-003 Romance Dawn", "OP01-016")).toBe(true);
    expect(collectorNumberConflict("Nami Romance Dawn", "OP01-016")).toBe(false);
  });

  it("normalizes parsed identity without retaining cosmetic padding", () => {
    expect(normalizeCollectorNumber(" 232 / 0091 ")).toBe("232/91");
    expect(normalizeCollectorNumber("op01_0016")).toBe("OP1-16");
    expect(parseCollectorNumber("OP01-016_p4")).toBeNull();
  });

  it("preserves equivalence and rejects substitutions across generated padding forms", () => {
    for (let numerator = 1; numerator <= 260; numerator += 13) {
      for (let denominator = 1; denominator <= 203; denominator += 17) {
        const canonical = `${numerator}/${denominator}`;
        for (let padding = 1; padding <= 4; padding += 1) {
          const padded = `${String(numerator).padStart(padding, "0")}/${String(denominator).padStart(padding, "0")}`;
          expect(collectorNumbersEquivalent(canonical, padded)).toBe(true);
          expect(collectorNumbersEquivalent(padded, canonical)).toBe(true);
          expect(collectorNumbersEquivalent(canonical, `${numerator + 1}/${denominator}`)).toBe(false);
        }
      }
    }
  });
});
