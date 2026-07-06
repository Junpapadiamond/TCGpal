import { describe, expect, it } from "vitest";
import { groupIdentitiesBySet } from "@/features/comparison/identity-grouping";
import type { CardIdentityCandidate } from "@/lib/schemas";

function make(
  id: string,
  setName: string,
  confidence: CardIdentityCandidate["confidence"] = "low",
): CardIdentityCandidate {
  return {
    id,
    name: id,
    setName,
    setCode: setName,
    cardNumber: id,
    language: "EN",
    imageUrl: null,
    confidence,
    matchReasons: [],
  };
}

describe("groupIdentitiesBySet", () => {
  it("groups by set and preserves the incoming (confidence) order", () => {
    const groups = groupIdentitiesBySet([
      make("a", "Evolving Skies", "high"),
      make("b", "Base", "medium"),
      make("c", "Evolving Skies", "low"),
    ]);

    // First-seen set leads (input is confidence-sorted), members keep their order.
    expect(groups.map((group) => group.setName)).toEqual(["Evolving Skies", "Base"]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("falls back to setCode then 'Other' when the set name is blank", () => {
    const withCode = { ...make("x", ""), setName: "", setCode: "SV1" };
    const withNothing = { ...make("y", ""), setName: "", setCode: "" };

    const groups = groupIdentitiesBySet([withCode, withNothing]);

    expect(groups.map((group) => group.setName)).toEqual(["SV1", "Other"]);
  });
});
