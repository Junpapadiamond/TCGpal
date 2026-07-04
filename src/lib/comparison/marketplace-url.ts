import type { Marketplace } from "@/lib/schemas";

const hostMarketplaces: Array<{ pattern: RegExp; marketplace: Marketplace }> = [
  { pattern: /(^|\.)mercari\.com$/i, marketplace: "Mercari" },
  { pattern: /(^|\.)mercari\.jp$/i, marketplace: "Mercari" },
  { pattern: /(^|\.)snkrdunk\.com$/i, marketplace: "SNKRDUNK" },
  { pattern: /(^|\.)yahoo\.co\.jp$/i, marketplace: "Yahoo Auctions JP" },
  { pattern: /(^|\.)whatnot\.com$/i, marketplace: "Whatnot" },
  { pattern: /(^|\.)tcgplayer\.com$/i, marketplace: "TCGplayer" },
  { pattern: /(^|\.)facebook\.com$/i, marketplace: "Facebook" },
  { pattern: /(^|\.)reddit\.com$/i, marketplace: "Reddit" },
  { pattern: /(^|\.)ebay\.com$/i, marketplace: "eBay" },
];

export function detectMarketplaceFromUrl(value: string): Marketplace {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return hostMarketplaces.find(({ pattern }) => pattern.test(host))?.marketplace ?? "Other";
  } catch {
    return "Other";
  }
}
