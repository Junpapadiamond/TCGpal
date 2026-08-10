import type { CardIdentityCandidate } from "@/lib/schemas";

export type IdentityGroup = {
  setName: string;
  // Catalog release date for the set, or null when the catalog has none.
  releaseDate: string | null;
  items: CardIdentityCandidate[];
};

// Above this many candidates, the confirmation UI groups them by set so a broad
// query (e.g. "pikachu") stays scannable instead of becoming a wall of cards.
export const IDENTITY_GROUP_THRESHOLD = 6;

// Group identity candidates by set, newest set first.
//
// Release order is the one arrangement that reads the same way for every card:
// a buyer scanning a long picker is thinking "the recent one" or "the 1999 one",
// never "the one our matcher scored fourth". Ordering by score instead looks
// arbitrary from the outside, because for a name-only query ("pikachu") every
// exact-name match earns the identical score and the tie-break falls through to
// whatever order the catalog API happened to return.
//
// Sets with no release date keep their incoming (confidence/score) order and
// sort after every dated set. The bundled One Piece catalog has no dates, and
// inventing a chronology from set codes would silently mis-order the promo,
// anniversary, and reprint lines that share a numbering scheme with the main
// sets. Absent stays absent.
export function groupIdentitiesBySet(identities: CardIdentityCandidate[]): IdentityGroup[] {
  const groups = new Map<string, IdentityGroup>();
  for (const identity of identities) {
    const setName = identity.setName || identity.setCode || "Other";
    const group = groups.get(setName);
    if (group) {
      group.items.push(identity);
      // A set's date is whatever the first dated print in it reports; later
      // prints only fill a gap, never overwrite.
      group.releaseDate ??= identity.setReleaseDate ?? null;
    } else {
      groups.set(setName, { setName, releaseDate: identity.setReleaseDate ?? null, items: [identity] });
    }
  }

  // Stable sort: undated groups compare equal to each other and therefore hold
  // the insertion order the confidence ranking gave them.
  return Array.from(groups.values()).sort((a, b) => {
    if (a.releaseDate && b.releaseDate) return b.releaseDate.localeCompare(a.releaseDate);
    if (a.releaseDate) return -1;
    if (b.releaseDate) return 1;
    return 0;
  });
}

// "2021/08/27" -> "2021". Returns null for an absent or unparseable date so the
// caller can omit the label rather than render an empty pair of brackets.
export function setReleaseYear(releaseDate: string | null | undefined): string | null {
  const year = (releaseDate ?? "").match(/\d{4}/)?.[0];
  return year ?? null;
}

// How many cards may be open at once before the remaining sets stay collapsed.
// Every set open is the right default — collapsing charges a click per set to
// reveal, most often, a single card. But the tail is extreme: measured against
// the live One Piece catalog on 2026-08-10, "Vinsmoke Reiju" opens 20 cards over
// 8 sets (~4 screens) while "Monkey.D.Luffy" opens 186 over 74 sets — a 49,024px
// page, roughly 68 screens. A budget keeps the common search fully open and lets
// only the handful of flagship characters fall back to collapsed groups, which
// the filter bar above is there to narrow.
export const IDENTITY_EXPANDED_CARD_BUDGET = 60;

// Which groups start expanded, walking in display order until the budget runs
// out. The first group always opens: a picker with nothing open would be worse
// than the behaviour this replaced.
export function expandGroupsWithinBudget(
  groups: Pick<IdentityGroup, "items">[],
  budget: number = IDENTITY_EXPANDED_CARD_BUDGET,
): boolean[] {
  let used = 0;
  return groups.map((group, index) => {
    // Open while the budget is not yet met, letting the group that crosses it
    // open too. Refusing the straddling group would leave the page short of the
    // budget it was allowed — a set is opened whole or not at all.
    const open = index === 0 || used < budget;
    if (open) used += group.items.length;
    return open;
  });
}
