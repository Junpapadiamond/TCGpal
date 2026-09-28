import type { CardIdentityCandidate } from "@/lib/schemas";
import { selectExactTcgplayerProduct } from "./crosswalk";
import { resolveTcgplayerProductVariants, searchTcgplayerListings } from "@/lib/external/tcgcsv";

// Reference-only enrichment before the buyer chooses a print. This never calls
// eBay, a marketplace agent, a paid pilot, or the comparison engine.
export async function loadBrowseMarketReferences(cards: CardIdentityCandidate[], signal?: AbortSignal) {
  const deadline = AbortSignal.timeout(8_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  // Several cards share a set. Reuse the same daily product/price response.
  const flights = new Map<string, Promise<Response>>();
  const fetcher: typeof fetch = async (input, init) => {
    const key = String(input);
    let flight = flights.get(key);
    if (!flight) {
      flight = fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([combined, init.signal]) : combined });
      flights.set(key, flight);
    }
    return (await flight).clone();
  };
  const output = [...cards];
  let next = 0;
  let checked = 0;
  const cap = Math.min(cards.length, 24);
  await Promise.all(Array.from({ length: Math.min(4, cap) }, async () => {
    while (next < cap && !combined.aborted) {
      const index = next++;
      const card = cards[index];
      try {
        const matches = await resolveTcgplayerProductVariants(card, fetcher);
        const product = selectExactTcgplayerProduct(card, matches);
        if (!product) continue;
        const reference = await searchTcgplayerListings(card, product, fetcher);
        if (reference.anchor?.mid != null) {
          output[index] = { ...card, marketMid: reference.anchor.mid, marketLow: reference.anchor.low,
            marketHigh: reference.anchor.high, marketUrl: reference.anchor.url, marketSource: "tcgcsv",
            marketAsOf: reference.asOf, tcgplayerProductId: product.productId, tcgplayerGroupId: product.groupId };
        }
      } catch { /* Preserve the catalog reference and its timestamp, or unknown. */ }
      finally { checked++; }
    }
  }));
  return { cards: output, checked };
}
