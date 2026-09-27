import { describe, expect, it } from "vitest";
import { normalizeEbayCondition } from "./ebay";

describe("eBay seller condition evidence", () => {
  it.each([
    ["Ungraded", "Charizard 4/102 120 HP", "Unknown"],
    ["Near Mint", "Charizard 4/102 120 HP", "Near Mint"],
    ["HP", "Charizard 4/102", "Heavily Played"],
    ["Near Mint or Lightly Played", "Charizard 4/102", "Lightly Played"],
    ["Near Mint", "Charizard 4/102 (HP)", "Heavily Played"],
    ["Ungraded", "Charizard 4/102 not mint", "Unknown"],
    ["Ungraded", "Charizard 4/102 NM-LP", "Lightly Played"],
    ["Ungraded", "Charizard 4/102 creased", "Damaged"],
    ["Near Mint", "Charizard 4/102 no damage or creases", "Near Mint"],
  ])("preserves the stated condition for %s / %s", (condition, title, expected) => {
    expect(normalizeEbayCondition(condition, title)).toBe(expected);
  });
});
