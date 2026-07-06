import type { CardIdentityCandidate } from "@/lib/schemas";

export type IdentityGroup = {
  setName: string;
  items: CardIdentityCandidate[];
};

// Above this many candidates, the confirmation UI groups them by set so a broad
// query (e.g. "pikachu") stays scannable instead of becoming a wall of cards.
export const IDENTITY_GROUP_THRESHOLD = 6;

// Group identity candidates by set. Input is expected to arrive already sorted by
// confidence (best first), so plain insertion order gives best-group-first and
// preserves each card's confidence order within its group — no extra sorting.
export function groupIdentitiesBySet(identities: CardIdentityCandidate[]): IdentityGroup[] {
  const groups = new Map<string, IdentityGroup>();
  for (const identity of identities) {
    const setName = identity.setName || identity.setCode || "Other";
    const group = groups.get(setName);
    if (group) {
      group.items.push(identity);
    } else {
      groups.set(setName, { setName, items: [identity] });
    }
  }
  return Array.from(groups.values());
}
