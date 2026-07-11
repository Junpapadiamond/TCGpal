import { describe, expect, it } from "vitest";
import {
  chooseProduct,
  markSharedProductMappings,
  productMatchesRelease,
} from "./research-one-piece-exact-prints.mjs";

function product(name, groupName = "One Piece Promotion Cards", abbreviation = "OP-PR") {
  return { name, group: { name: groupName, abbreviation } };
}

describe("One Piece research release matching", () => {
  it("does not confuse competition tiers that share the same image family", () => {
    expect(productMatchesRelease(
      product("Monkey.D.Luffy (Regional Finalist)"),
      { name: "Online Regional Champion", code: null },
    )).toBe(false);
    expect(productMatchesRelease(
      product("Monkey.D.Luffy (3rd Anniversary Tournament 3 Brothers Winner Pack)"),
      { name: "3rd Anniversary Tournament 3 Brothers Pack", code: null },
    )).toBe(false);
  });

  it("requires online/offline channel agreement for regional releases", () => {
    expect(productMatchesRelease(
      product("Kid & Killer (Online Regional Participation Pack)"),
      { name: "Offline Regional Participation Pack", code: null },
    )).toBe(false);
  });

  it("does not prefix-match one set code to a different numbered set", () => {
    expect(productMatchesRelease(
      product("Some Card", "Unrelated Set", "OP10"),
      { name: "Romance Dawn", code: "OP-1" },
    )).toBe(false);
  });

  it("does not let a broad promo group bypass competition tier and channel checks", () => {
    expect(productMatchesRelease(
      product("Monkey.D.Luffy (Regional Finalist)", "One Piece Promotion Cards", "OP-PR"),
      { name: "Online Regional Champion", code: "P" },
    )).toBe(false);
  });

  it("retains the next visual candidate even when release evidence leaves one match", () => {
    const best = {
      product: product("Nami (Anniversary)", "One Piece Promotion Cards", "OP-PR"),
      distance: 10,
    };
    const visualRunnerUp = {
      product: product("Nami (Alternate Art)", "Romance Dawn", "OP01"),
      distance: 40,
    };

    expect(chooseProduct(
      [best, visualRunnerUp],
      { name: "English 1st Anniversary Set", code: "P" },
    ).runnerUp).toBe(visualRunnerUp);
  });

  it("downgrades a product mapped to multiple canonical prints", () => {
    const records = ["OP01-029_p2", "OP01-029_r1"].map((canonicalPrintId) => ({
      canonicalPrintId,
      tcgplayerGroupId: 23496,
      tcgplayerProductId: 593272,
      verification: "verified",
      confidence: "high",
      conflicts: [],
    }));

    expect(markSharedProductMappings(records)).toEqual([
      expect.objectContaining({
        canonicalPrintId: "OP01-029_p2",
        verification: "conflicting",
        confidence: "low",
        conflicts: [expect.objectContaining({ reason: "shared_external_product_mapping" })],
      }),
      expect.objectContaining({
        canonicalPrintId: "OP01-029_r1",
        verification: "conflicting",
        confidence: "low",
        conflicts: [expect.objectContaining({ reason: "shared_external_product_mapping" })],
      }),
    ]);
  });

  it("downgrades a verified mapping that shares a product with an unresolved sibling", () => {
    const records = [
      {
        canonicalPrintId: "P-030",
        tcgplayerGroupId: 17675,
        tcgplayerProductId: 455823,
        verification: "verified",
        confidence: "high",
        conflicts: [],
      },
      {
        canonicalPrintId: "P-030_p3",
        tcgplayerGroupId: 17675,
        tcgplayerProductId: 455823,
        verification: "unresolved",
        confidence: "low",
        conflicts: [],
      },
    ];

    expect(markSharedProductMappings(records)[0]).toMatchObject({
      verification: "conflicting",
      confidence: "low",
    });
  });
});
