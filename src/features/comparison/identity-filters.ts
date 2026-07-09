import type { CardIdentityCandidate } from "@/lib/schemas";

export type IdentityFilters = {
  setFilter: string;
  rarityFilter: string;
  printTypeFilter: string;
};

export type IdentityFacets = {
  setOptions: string[];
  rarityOptions: string[];
  printTypeOptions: string[];
  filteredIdentities: CardIdentityCandidate[];
};

// Groups a print's specific variant label ("Alternate Art (P1)", "Secret Rare Alt
// (R2)") into the coarser bucket collectors actually browse by, so the filter
// dropdown has a handful of options instead of one per unique print marker. Base
// prints (no variant label) get their own bucket rather than being unfilterable.
export function printTypeOf(identity: CardIdentityCandidate, basePrintLabel: string): string {
  if (!identity.variant) return basePrintLabel;
  return identity.variant.replace(/\s*\([^)]*\)\s*$/, "").trim() || basePrintLabel;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

// A print's rarity code and its print-type bucket are not independent — SP CARD
// rarity is always a Special Art print, SEC rarity never coexists with Special
// Art, and so on. Presenting Set/Rarity/Print-type as three fully independent
// dropdowns lets a buyer pick a combination the catalog can never satisfy, which
// silently renders as "0 versions" and reads as broken. Each facet's option list
// is computed against the OTHER active filters (never against itself, so a
// dropdown can always be changed away from its current value) — exactly the
// standard e-commerce faceted-search pattern.
export function computeIdentityFacets(
  identities: CardIdentityCandidate[],
  filters: IdentityFilters,
  basePrintLabel: string,
): IdentityFacets {
  function matches(identity: CardIdentityCandidate, skip: keyof IdentityFilters | null) {
    if (skip !== "setFilter" && filters.setFilter && (identity.setName || identity.setCode) !== filters.setFilter) return false;
    if (skip !== "rarityFilter" && filters.rarityFilter && identity.rarity !== filters.rarityFilter) return false;
    if (skip !== "printTypeFilter" && filters.printTypeFilter && printTypeOf(identity, basePrintLabel) !== filters.printTypeFilter) return false;
    return true;
  }

  return {
    setOptions: uniqueSorted(
      identities.filter((identity) => matches(identity, "setFilter")).map((identity) => identity.setName || identity.setCode),
    ),
    rarityOptions: uniqueSorted(
      identities.filter((identity) => matches(identity, "rarityFilter")).map((identity) => identity.rarity),
    ),
    printTypeOptions: uniqueSorted(
      identities.filter((identity) => matches(identity, "printTypeFilter")).map((identity) => printTypeOf(identity, basePrintLabel)),
    ),
    filteredIdentities: identities.filter((identity) => matches(identity, null)),
  };
}

// Applies one dropdown's change and clears any OTHER filter that the new
// selection makes unreachable (e.g. picking Rarity=SEC after Print type=Special
// Art was already set — that pair never coexists in the catalog). The just-
// changed field always wins and is never cleared by this call; only the other
// two are checked, against options computed with the new value already applied.
// This resolves conflicts unambiguously — a purely symmetric "which of two
// already-conflicting filters wins" has no well-defined answer, but "the field
// the user just touched wins" always does.
export function applyIdentityFilterChange(
  current: IdentityFilters,
  changedKey: keyof IdentityFilters,
  changedValue: string,
  identities: CardIdentityCandidate[],
  basePrintLabel: string,
): IdentityFilters {
  const tentative: IdentityFilters = { ...current, [changedKey]: changedValue };
  const facets = computeIdentityFacets(identities, tentative, basePrintLabel);
  const optionsFor: Record<keyof IdentityFilters, string[]> = {
    setFilter: facets.setOptions,
    rarityFilter: facets.rarityOptions,
    printTypeFilter: facets.printTypeOptions,
  };
  const result = { ...tentative };
  for (const key of Object.keys(result) as Array<keyof IdentityFilters>) {
    if (key === changedKey) continue;
    if (result[key] && !optionsFor[key].includes(result[key])) result[key] = "";
  }
  return result;
}

// Clears the "Clear filters" case where all three should reset regardless of
// current combination — kept trivial and separate from the per-change logic
// above so callers never have to guess which field is "authoritative".
export function clearIdentityFilters(): IdentityFilters {
  return { setFilter: "", rarityFilter: "", printTypeFilter: "" };
}
