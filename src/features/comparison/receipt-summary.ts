// The decision receipt's closed-state line: one calm sentence-length string
// carrying the guardrail facts — which sources were live, the market reference
// and its freshness, and when this was observed — so folding the receipt never
// hides sources or timestamps without exposing internal pipeline counts.

export type ReceiptSummaryInput = {
  liveSources: string;
  marketMid: number | null;
  marketAsOf: string | null;
  observedTime: string;
  lang: "en" | "zh";
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatAsOf(marketAsOf: string, lang: ReceiptSummaryInput["lang"]) {
  const date = new Date(marketAsOf);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function buildReceiptSummaryLine({
  liveSources,
  marketMid,
  marketAsOf,
  observedTime,
  lang,
}: ReceiptSummaryInput): string {
  const zh = lang === "zh";
  const parts: string[] = [];

  parts.push(liveSources.trim()
    ? (zh ? `${liveSources} 实时` : `${liveSources} live`)
    : (zh ? "没有实时来源" : "No live source"));

  if (marketMid !== null) {
    const asOf = marketAsOf ? formatAsOf(marketAsOf, lang) : null;
    parts.push(zh
      // Named explicitly: beside a live-sources segment, a bare "market $X"
      // reads as if the marketplaces produced the anchor. Only the
      // TCGplayer/TCGCSV reference ever does.
      ? `TCGplayer 市价 ${formatMoney(marketMid)}${asOf ? `（截至 ${asOf}）` : ""}`
      : `TCGplayer market ${formatMoney(marketMid)}${asOf ? ` (as of ${asOf})` : ""}`);
  } else {
    parts.push(zh ? "没有 TCGplayer 市价参考" : "no TCGplayer market reference");
  }

  parts.push(observedTime);

  return parts.join(" · ");
}
