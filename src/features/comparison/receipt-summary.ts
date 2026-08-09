// The decision receipt's closed-state line: one calm sentence-length string
// carrying the guardrail facts — which sources were live, the market reference
// and its freshness, how many listings were excluded, and when this was
// observed — so folding the receipt never hides sources or timestamps.

export type ReceiptSummaryInput = {
  liveSources: string;
  marketMid: number | null;
  marketAsOf: string | null;
  excludedCount: number;
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
  excludedCount,
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
      ? `市场参考价 ${formatMoney(marketMid)}${asOf ? `（截至 ${asOf}）` : ""}`
      : `market ${formatMoney(marketMid)}${asOf ? ` (as of ${asOf})` : ""}`);
  } else {
    parts.push(zh ? "没有市场参考价" : "no market reference");
  }

  if (excludedCount > 0) {
    parts.push(zh ? `已排除 ${excludedCount} 条` : `${excludedCount} excluded`);
  }

  parts.push(observedTime);

  return parts.join(" · ");
}
