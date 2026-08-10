import { describe, expect, it } from "vitest";
import {
  applyIdentityFilterChange,
  computeIdentityFacets,
  printTypeOf,
  type IdentityFilters,
} from "@/features/comparison/identity-filters";
import type { CardIdentityCandidate } from "@/lib/schemas";

const BASE_PRINT = "Base print";

function make(overrides: Partial<CardIdentityCandidate> & { id: string }): CardIdentityCandidate {
  return {
    name: "Portgas.D.Ace",
    setName: "Set A",
    setCode: "SETA",
    cardNumber: overrides.id,
    language: "EN",
    imageUrl: null,
    confidence: "medium",
    matchReasons: [],
    rarity: null,
    variant: null,
    ...overrides,
  };
}

const emptyFilters: IdentityFilters = { setFilter: "", rarityFilter: "", printTypeFilter: "" };

// A realistic multi-print One Piece pool: the same rarity code never spans two
// print-type buckets and vice versa, so a naive independent-facet UI lets a
// buyer pick a combination (e.g. Rarity=SEC + Print type=Special Art) that can
// never match anything in the catalog.
const pool: CardIdentityCandidate[] = [
  make({ id: "base-r", setName: "Set A", rarity: "R", variant: null }),
  make({ id: "alt-r", setName: "Set A", rarity: "R", variant: "Alternate Art (P1)" }),
  make({ id: "base-sec", setName: "Set A", rarity: "SEC", variant: null }),
  make({ id: "secalt-sec", setName: "Set A", rarity: "SEC", variant: "Secret Rare Alt (P1)" }),
  make({ id: "sp", setName: "Set B", rarity: "SP CARD", variant: "Special Art (P5)" }),
  make({ id: "tr", setName: "Set B", rarity: "TR", variant: "Treasure Rare (R1)" }),
];

describe("printTypeOf", () => {
  it("buckets a print by its variant label with the parenthetical stripped", () => {
    expect(printTypeOf(make({ id: "x", variant: "Alternate Art (P1)" }), BASE_PRINT)).toBe("Alternate Art");
    expect(printTypeOf(make({ id: "y", variant: "Special Art (P5)" }), BASE_PRINT)).toBe("Special Art");
    expect(printTypeOf(make({ id: "z", variant: null }), BASE_PRINT)).toBe(BASE_PRINT);
  });
});

describe("computeIdentityFacets", () => {
  it("returns every option when no filter is active", () => {
    const facets = computeIdentityFacets(pool, emptyFilters, BASE_PRINT);
    expect(facets.rarityOptions).toEqual(["R", "SEC", "SP CARD", "TR"]);
    expect(facets.printTypeOptions).toEqual([BASE_PRINT, "Alternate Art", "Secret Rare Alt", "Special Art", "Treasure Rare"].sort());
    expect(facets.filteredIdentities).toHaveLength(6);
  });

  // The core bug: selecting Rarity=SEC must narrow print-type options to only
  // what co-occurs with SEC in the pool (Base print, Secret Rare Alt) — Special
  // Art / Alternate Art / Treasure Rare should not even be offered, since picking
  // them would silently produce zero results.
  it("narrows the print-type options to what actually co-occurs with the selected rarity", () => {
    const facets = computeIdentityFacets(pool, { ...emptyFilters, rarityFilter: "SEC" }, BASE_PRINT);
    expect(facets.printTypeOptions.sort()).toEqual([BASE_PRINT, "Secret Rare Alt"].sort());
    expect(facets.printTypeOptions).not.toContain("Special Art");
    expect(facets.printTypeOptions).not.toContain("Alternate Art");
  });

  it("narrows the rarity options to what actually co-occurs with the selected print type", () => {
    const facets = computeIdentityFacets(pool, { ...emptyFilters, printTypeFilter: "Alternate Art" }, BASE_PRINT);
    expect(facets.rarityOptions).toEqual(["R"]);
  });

  it("each facet's own options ignore its own current selection (so it can still be changed)", () => {
    // Rarity=SEC selected; the rarity dropdown's OWN option list must still show
    // every rarity (R, SP CARD, TR too) so the buyer can switch away from SEC —
    // only the OTHER dropdowns get narrowed by it.
    const facets = computeIdentityFacets(pool, { ...emptyFilters, rarityFilter: "SEC" }, BASE_PRINT);
    expect(facets.rarityOptions).toEqual(["R", "SEC", "SP CARD", "TR"]);
  });

  it("filters the identity list by all active filters jointly", () => {
    const facets = computeIdentityFacets(pool, { setFilter: "Set A", rarityFilter: "SEC", printTypeFilter: "Secret Rare Alt" }, BASE_PRINT);
    expect(facets.filteredIdentities.map((identity) => identity.id)).toEqual(["secalt-sec"]);
  });
});

describe("applyIdentityFilterChange", () => {
  it("clears a sibling filter whose selection the new choice makes unreachable", () => {
    // Print type=Special Art was picked first; then the buyer picks Rarity=SEC,
    // a combination with zero overlap. The stale print-type filter must clear
    // instead of leaving the buyer looking at a silent zero-result screen. The
    // field the buyer just touched (rarity) always wins.
    const current: IdentityFilters = { setFilter: "", rarityFilter: "", printTypeFilter: "Special Art" };
    const next = applyIdentityFilterChange(current, "rarityFilter", "SEC", pool, BASE_PRINT);
    expect(next).toEqual({ setFilter: "", rarityFilter: "SEC", printTypeFilter: "" });
  });

  it("leaves a compatible sibling filter untouched", () => {
    const current: IdentityFilters = { setFilter: "", rarityFilter: "", printTypeFilter: "Secret Rare Alt" };
    const next = applyIdentityFilterChange(current, "rarityFilter", "SEC", pool, BASE_PRINT);
    expect(next).toEqual({ setFilter: "", rarityFilter: "SEC", printTypeFilter: "Secret Rare Alt" });
  });

  it("never clears the field that was just changed", () => {
    // Rarity=SP CARD only coexists with Special Art / Set B — picking it while
    // Set A is active must clear the incompatible Set filter, not the rarity
    // the buyer is actively choosing.
    const current: IdentityFilters = { setFilter: "Set A", rarityFilter: "", printTypeFilter: "" };
    const next = applyIdentityFilterChange(current, "rarityFilter", "SP CARD", pool, BASE_PRINT);
    expect(next.rarityFilter).toBe("SP CARD");
    expect(next.setFilter).toBe("");
  });

  it("is idempotent: re-applying the same change twice is a no-op the second time", () => {
    const current: IdentityFilters = { setFilter: "", rarityFilter: "", printTypeFilter: "Special Art" };
    const once = applyIdentityFilterChange(current, "rarityFilter", "SEC", pool, BASE_PRINT);
    const twice = applyIdentityFilterChange(once, "rarityFilter", "SEC", pool, BASE_PRINT);
    expect(twice).toEqual(once);
  });
});

// "Evolving Skies (2021)" is a far better affordance than "Evolving Skies" for a
// buyer who remembers roughly when they pulled the card but not the set name.
describe("set filter options carry the release year", () => {
  it("labels a set with its release year and keeps the value as the raw set name", () => {
    const facets = computeIdentityFacets(
      [
        make({ id: "1", setName: "Evolving Skies", setReleaseDate: "2021/08/27" }),
        make({ id: "2", setName: "Base", setReleaseDate: "1999/01/09" }),
      ],
      { setFilter: "", rarityFilter: "", printTypeFilter: "" },
      BASE_PRINT,
    );
    expect(facets.setOptionDetails).toEqual([
      { value: "Evolving Skies", label: "Evolving Skies (2021)", year: "2021" },
      { value: "Base", label: "Base (1999)", year: "1999" },
    ]);
  });

  // Never invent a year. One Piece sets have no date in the bundled catalog, so
  // those options stay unlabelled rather than guessing.
  it("omits the year when the catalog has no release date", () => {
    const facets = computeIdentityFacets(
      [make({ id: "1", setName: "Romance Dawn", setReleaseDate: null })],
      { setFilter: "", rarityFilter: "", printTypeFilter: "" },
      BASE_PRINT,
    );
    expect(facets.setOptionDetails).toEqual([
      { value: "Romance Dawn", label: "Romance Dawn", year: null },
    ]);
  });

  it("orders set options newest first, undated last, matching the group order", () => {
    const facets = computeIdentityFacets(
      [
        make({ id: "1", setName: "Base", setReleaseDate: "1999/01/09" }),
        make({ id: "2", setName: "Undated", setReleaseDate: null }),
        make({ id: "3", setName: "151", setReleaseDate: "2023/09/22" }),
      ],
      { setFilter: "", rarityFilter: "", printTypeFilter: "" },
      BASE_PRINT,
    );
    expect(facets.setOptionDetails.map((option) => option.value)).toEqual(["151", "Base", "Undated"]);
    // The plain string list stays in step so existing callers cannot drift.
    expect(facets.setOptions).toEqual(["151", "Base", "Undated"]);
  });
});
