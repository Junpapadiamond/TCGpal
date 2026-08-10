import { describe, expect, it } from "vitest";
import { expandGroupsWithinBudget, groupIdentitiesBySet } from "@/features/comparison/identity-grouping";
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

// A buyer scanning a long version picker thinks in eras, not in match scores:
// "the recent one" or "the 1999 one". Release order is the only grouping that
// reads the same way for every card, so groups sort newest-set-first once the
// catalog supplies dates.
describe("groupIdentitiesBySet release ordering", () => {
  function dated(id: string, setName: string, setReleaseDate: string | null): CardIdentityCandidate {
    return { ...make(id, setName), setReleaseDate };
  }

  it("orders groups newest set first when release dates are known", () => {
    const groups = groupIdentitiesBySet([
      dated("a", "Base", "1999/01/09"),
      dated("b", "Evolving Skies", "2021/08/27"),
      dated("c", "151", "2023/09/22"),
    ]);
    expect(groups.map((group) => group.setName)).toEqual(["151", "Evolving Skies", "Base"]);
  });

  it("exposes each group's release date so the UI can label the era", () => {
    const groups = groupIdentitiesBySet([dated("a", "Evolving Skies", "2021/08/27")]);
    expect(groups[0]?.releaseDate).toBe("2021/08/27");
  });

  // One Piece carries no release date in the bundled catalog. Undated sets must
  // not be reordered into a made-up chronology — they keep the incoming
  // confidence/score order, which is the best signal available for them.
  it("leaves undated sets in their incoming order and sorts them after dated ones", () => {
    const groups = groupIdentitiesBySet([
      dated("a", "Romance Dawn", null),
      dated("b", "Paramount War", null),
      dated("c", "Evolving Skies", "2021/08/27"),
    ]);
    expect(groups.map((group) => group.setName)).toEqual(["Evolving Skies", "Romance Dawn", "Paramount War"]);
    expect(groups[1]?.releaseDate).toBeNull();
  });

  it("keeps each group's own items in the incoming order", () => {
    const groups = groupIdentitiesBySet([
      dated("a", "Base", "1999/01/09"),
      dated("b", "151", "2023/09/22"),
      dated("c", "Base", "1999/01/09"),
    ]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual(["a", "c"]);
  });
});

// Measured on 2026-08-10 against the live One Piece catalog: "Vinsmoke Reiju"
// opens 20 cards over 8 sets (~4 screens), "Shanks" 54 over 28 (~11 screens),
// "Nami" 89 over 53 (~18), and "Monkey.D.Luffy" 186 over 74 — a 49,024px page,
// about 68 screens. Expanding everything is right for the first three and
// unusable for the fourth, so the budget keeps the common case open and lets the
// long tail degrade into collapsed groups rather than an endless page.
describe("expandGroupsWithinBudget", () => {
  const group = (setName: string, count: number) => ({
    setName,
    releaseDate: null,
    items: Array.from({ length: count }, (_, index) => make(`${setName}-${index}`, setName)),
  });

  it("expands every group when the whole picker fits the budget", () => {
    const groups = [group("A", 4), group("B", 6), group("C", 3)];
    expect(expandGroupsWithinBudget(groups, 60)).toEqual([true, true, true]);
  });

  it("stops expanding once the running card count passes the budget", () => {
    const groups = [group("A", 20), group("B", 20), group("C", 20), group("D", 20)];
    expect(expandGroupsWithinBudget(groups, 45)).toEqual([true, true, true, false]);
  });

  // A page where nothing is open would be worse than today, not better.
  it("always expands the first group even when it alone exceeds the budget", () => {
    const groups = [group("A", 500), group("B", 1)];
    expect(expandGroupsWithinBudget(groups, 10)).toEqual([true, false]);
  });

  it("handles an empty picker", () => {
    expect(expandGroupsWithinBudget([], 60)).toEqual([]);
  });
});
