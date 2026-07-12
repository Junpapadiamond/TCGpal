import type { CardIdentityCandidate, ComparisonReference } from "@/lib/schemas";

type JapanReferenceLink = {
  label: string;
  url: string;
  note: string;
};

export function buildJapanReferenceLinks(
  card: CardIdentityCandidate,
  observedAt: string,
): ComparisonReference[] {
  const query = buildJapanSearchQuery(card);
  const links: JapanReferenceLink[] = [
    {
      label: "Yahoo Auctions JP price check",
      url: searchUrl("https://auctions.yahoo.co.jp/search/search", "p", query),
      note: manualNote("Yahoo Auctions JP"),
    },
    {
      label: "Mercari JP price check",
      url: searchUrl("https://jp.mercari.com/search", "keyword", query),
      note: manualNote("Mercari JP"),
    },
    {
      label: "SNKRDUNK Japan price check",
      url: searchUrl("https://snkrdunk.com/search", "keyword", query),
      note: manualNote("SNKRDUNK"),
    },
  ];

  if (isOnePiece(card)) {
    links.push(
      {
        label: "Card Rush OP price check",
        url: searchUrl("https://www.cardrush-op.jp/product-list", "keyword", card.cardNumber || query),
        note: manualNote("Card Rush OP"),
      },
      {
        label: "Yuyutei OP price check",
        url: searchUrl("https://yuyu-tei.jp/sell/opc/s/search", "search_word", card.cardNumber || query),
        note: manualNote("Yuyutei OP"),
      },
    );
  } else {
    links.push({
      label: "Yuyutei Pokemon price check",
      url: searchUrl("https://yuyu-tei.jp/sell/poc/s/search", "search_word", card.cardNumber || query),
      note: manualNote("Yuyutei Pokemon"),
    });
  }

  return links.map((link) => ({
    ...link,
    status: "missing",
    observedAt,
    rawLow: null,
    rawMid: null,
    rawHigh: null,
  }));
}

export function buildJapanSearchQuery(card: CardIdentityCandidate) {
  return [
    card.cardNumber,
    card.name,
    isOnePiece(card) ? "ワンピースカード" : "ポケカ",
  ].filter(Boolean).join(" ").trim();
}

export function isJapanReferenceLabel(label: string) {
  return /(?:Japan|JP|Card Rush|Yuyutei)/i.test(label);
}

function manualNote(source: string) {
  return `${source} was not fetched or analyzed by TCGlens. Open this Japan price/buy search manually; paste a specific listing back into TCGlens if you want it ranked with the other evidence.`;
}

function searchUrl(base: string, key: string, query: string) {
  const url = new URL(base);
  url.searchParams.set(key, query);
  return url.toString();
}

function isOnePiece(card: Pick<CardIdentityCandidate, "id" | "setCode" | "cardNumber">) {
  const key = `${card.id} ${card.setCode} ${card.cardNumber}`.toUpperCase();
  return /\b(?:OP|ST|EB|PRB|P)-?\d{0,3}-\d{1,4}\b/.test(key);
}
