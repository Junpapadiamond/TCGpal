import { resolveTcgplayerProduct, type TcgplayerProductMatch } from "@/lib/external/tcgcsv";
import { resolveEbayProductForCard, type EbayProductResolution } from "@/lib/external/ebay";
import type { BuyerContext, CardIdentityCandidate } from "@/lib/schemas";

// R1: the canonical card id (pokemontcg.io id, confirmed at the version step)
// maps to each platform's native identifier so connectors never re-match free
// text. eBay's "identifier" is a query template; TCGplayer's is a product id.
// A missing TCGplayer mapping degrades that source to "no match" — never a
// hard failure. (cardmarket_id_product is reserved for a future connector.)
export type CardCrosswalkEntry = {
  canonicalCardId: string;
  ebayQueryTemplate: string;
  ebayProduct: EbayProductResolution | null;
  tcgplayerProductId: number | null;
  tcgplayerGroupId: number | null;
  tcgplayerUrl: string | null;
  tcgplayerProduct: TcgplayerProductMatch | null;
};

type CacheEntry = { entry: CardCrosswalkEntry; at: number };

const CROSSWALK_TTL_MS = 6 * 60 * 60 * 1000;
const crosswalkCache = new Map<string, CacheEntry>();

export async function resolveCardCrosswalk(
  card: CardIdentityCandidate,
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
  buyer: BuyerContext = { country: "US", postalCode: "", taxRate: null, desiredCondition: "Unknown" },
): Promise<CardCrosswalkEntry> {
  const cached = crosswalkCache.get(card.id);
  if (cached && now().getTime() - cached.at < CROSSWALK_TTL_MS) {
    return cached.entry;
  }

  // Recall-first eBay query template (matches the eBay adapter's default):
  // name + collector number; set names are the token real titles most omit.
  const ebayQueryTemplate = [card.name, card.cardNumber || card.setName]
    .filter(Boolean)
    .join(" ")
    .trim();
  let entry: CardCrosswalkEntry = {
    canonicalCardId: card.id,
    ebayQueryTemplate,
    ebayProduct: null,
    tcgplayerProductId: null,
    tcgplayerGroupId: null,
    tcgplayerUrl: null,
    tcgplayerProduct: null,
  };

  try {
    entry = {
      ...entry,
      ebayProduct: await resolveEbayProductForCard(card, buyer, fetcher),
    };
  } catch {
    // eBay Catalog metadata improves precision when available, but the Browse
    // keyword path remains the deterministic fallback and must not hard-fail.
  }

  try {
    const product = await resolveTcgplayerProduct(card, fetcher, { preferredProductId: card.tcgplayerProductId ?? null });
    if (product) {
      entry = {
        ...entry,
        tcgplayerProductId: product.productId,
        tcgplayerGroupId: product.groupId,
        tcgplayerUrl: product.productUrl,
        tcgplayerProduct: product,
      };
    }
  } catch {
    // Feed hiccups must not break the crosswalk: the eBay leg stays valid and
    // the TCGplayer leg is retried on the next uncached resolution.
    return entry;
  }

  crosswalkCache.set(card.id, { entry, at: now().getTime() });
  return entry;
}

export function clearCrosswalkCache() {
  crosswalkCache.clear();
}
