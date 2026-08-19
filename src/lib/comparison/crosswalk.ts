import { resolveTcgplayerProductVariants, setNameMatchTerms, type TcgplayerProductMatch } from "@/lib/external/tcgcsv";
import { resolveEbayProductForCard, type EbayProductResolution } from "@/lib/external/ebay";
import type { BuyerContext, CardIdentityCandidate } from "@/lib/schemas";
import { assessPrintFidelity } from "@/lib/comparison/print-fidelity";
import { collectorNumbersEquivalent } from "@/lib/comparison/collector-number";
import { ONE_PIECE_PRINT_METADATA_REVISION } from "@/lib/external/one-piece-print-metadata";

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
  const cacheKey = `${ONE_PIECE_PRINT_METADATA_REVISION}|${card.id}`;
  const cached = crosswalkCache.get(cacheKey);
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
    const products = await resolveTcgplayerProductVariants(card, fetcher);
    const product = selectExactTcgplayerProduct(card, products);
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

  crosswalkCache.set(cacheKey, { entry, at: now().getTime() });
  return entry;
}

export function clearCrosswalkCache() {
  crosswalkCache.clear();
}

export function selectExactTcgplayerProduct(
  card: CardIdentityCandidate,
  products: TcgplayerProductMatch[],
): TcgplayerProductMatch | null {
  const preferred = card.tcgplayerProductId
    ? products.filter((product) => product.productId === card.tcgplayerProductId)
    : [];
  if (card.tcgplayerProductId && preferred.length !== 1) return null;
  if (preferred.length === 1) {
    return exactProductIdentityMatches(card, preferred[0]) ? preferred[0] : null;
  }
  const pool = products.filter((product) => releaseMatches(product.groupName, card.setName));
  const credible = pool.filter((product) => {
    const assessment = assessPrintFidelity({
      card,
      matchText: `${product.productName} ${product.collectorNumber} ${product.groupName} ${card.language} ${product.productUrl}`,
      listingPrice: 0,
      exactMarketAnchor: null,
    });
    if (assessment.match === "exact" || assessment.match === "compatible") return true;
    return false;
  });
  return credible.length === 1 ? credible[0] : null;
}

function exactProductIdentityMatches(card: CardIdentityCandidate, product: TcgplayerProductMatch) {
  const expectedName = normalizeIdentityText(card.name);
  const productName = normalizeIdentityText(product.productName);
  return Boolean(
    collectorNumbersEquivalent(card.cardNumber, product.collectorNumber)
    && expectedName
    && productName.includes(expectedName),
  );
}

function normalizeIdentityText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Shares the promo-group alias table with the TCGCSV group lookup so a release
// the group search can find cannot then be rejected here: TCGplayer publishes
// "SV: Scarlet & Violet Promo Cards" for the set pokemontcg.io calls "Scarlet &
// Violet Black Star Promos", and the two names have no common suffix.
function releaseMatches(groupName: string, setName: string) {
  const group = normalizeRelease(groupName);
  return setNameMatchTerms(setName).some((term) => {
    const wanted = normalizeRelease(term);
    return Boolean(wanted && (group === wanted || group.endsWith(wanted)));
  });
}

function normalizeRelease(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
