import { isGradedListing } from "./graded-listing";

const exclusionPatterns = [
  /\bsealed\b/i,
  // "Booster" on its own is a set name, not a sealed product: every One Piece
  // "Extra Booster: <set>" single carries it, so a bare word filter dropped the
  // raw singles this list exists to protect. Sealed product names its container.
  /\bbooster[\s-]*(?:box(?:es)?|packs?|cases?|bundles?)\b/i,
  /\blot\b/i,
  /\bproxy\b/i,
  /\breprint\b/i,
  /\bcustom\b/i,
  /\bdigital\b/i,
  // Novelty / replica items that carry the exact card name + number but are not
  // the real raw single (the dominant noise in cheap eBay search results).
  /\bgold\s+metal\b/i,
  /\bmetal\s+card\b/i,
  /\bsticker\b/i,
  /\bdecal\b/i,
  /\bcredit\s+card\b/i,
  /\bdiy\b/i,
  /\bfor\s+display\b/i,
  /\breplica\b/i,
  /\bacrylic\b/i,
  /\bfan[\s-]?made\b/i,
  // Sellers list unofficial cards as "fan art" far more often than "fan made",
  // and the phrase is never a real print class in either game.
  /\bfan[\s-]?art\b/i,
  /\baltered\b/i,
  // Explicit sun bleaching is a physical alteration, not a print treatment.
  // Keep "Ghost Rare", "Sun & Moon" and the Bleach franchise out of this rule.
  /\bsun[\s-]*bleached\b/i,
  /\bmagnet\b/i,
  /\bkeychain\b/i,
  /\bplush\b/i,
  /\b(?:rugs?|carpets?|doormats?|tapestr(?:y|ies)|mouse[\s-]?pads?|desk[\s-]?mats?)\b/i,
  /\bnon[\s-]?textured\b/i,
  // "Extended art" is a Magic print class. Neither Pokémon nor One Piece has
  // one, so on eBay the phrase only ever names an aftermarket item — a display
  // case, an acrylic stand, a DIY/custom card, or an art print — carrying the
  // real card's name and collector number. Requiring the exact phrase
  // "extended art case" let every other phrasing ("... Extended Art Display
  // Case", a bare "... 215/203 Extended Art") through as a raw single. The real
  // print classes sellers do use — "alternate art", "full art", "art rare",
  // "special art" — are matched by altArtTitlePattern and unaffected.
  /\bextended[\s-]*art(?:work)?\b/i,
  /\bart\s+case\b/i,
  /\bmagnetic\s+(?:case|holder)\b/i,
  /\bwall\s+art\b/i,
  /\bposter\s+print\b/i,
  /\bplaymat\b/i,
  /\bdisplay\s+case\b/i,
  /\bcard\s+set\b/i,
  /\b\d+\s*(?:pcs|cards?)\b/i,
  // A playset is four copies priced as one line, so it clears the market floor on
  // price-per-card and then gets compared against a single-card anchor. Both
  // spellings and both count orders appear on eBay.
  /\bplay\s?sets?\b/i,
  // Explicit copy counts can precede the name or sit mid-title without "lot".
  /(?:^|\s)(?:[2-9]|\d{2,})\s*[x×](?=\s|$)/i,
  /(?:^|\s)[x×]\s*(?:[2-9]|\d{2,})(?=\s|$)/i,
  /\(\s*x\s*\d+\s*\)/i,
  /\bx\s?\d+\s*$/i,
];

export function isExcludedProduct(listing: { title: string; matchAspectText?: string }) {
  // Remove only an explicit local denial. Other alteration/product claims in
  // the same title still count, including a contradictory bleaching claim.
  const productTitle = listing.title.replace(/\b(?:not|never)\s+(?:been\s+)?sun[\s-]*bleached\b/gi, "");
  if (isGradedListing(listing.title) || exclusionPatterns.some(pattern => pattern.test(productTitle))) return true;
  // Structured product type is independent of the card name printed on merch.
  // Do not scan every aspect for broad words such as "sealed" or "custom".
  const type = listing.matchAspectText?.match(/(?:^|[.;])\s*(?:type|product type)\s*:\s*([^.;]+)/i)?.[1];
  return Boolean(type && /\b(?:rug|carpet|doormat|tapestry|mouse\s*pad|desk\s*mat|playmat|plush|poster|sticker|keychain)\b/i.test(type));
}
