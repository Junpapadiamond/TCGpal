import type { ComparisonPlatformResult } from "@/lib/schemas";

// Only known, safe states reach buyer copy. Raw provider error text stays in the
// technical trace; a paused pilot must not look like an outage retry can fix.
export function sourceStatusLabel(source: ComparisonPlatformResult | undefined, lang: "en" | "zh") {
  const zh = lang === "zh";
  if (!source || source.status === "skipped") return zh ? "仅供手动查询" : "Manual check only";
  if (source.status === "complete") return zh ? `找到 ${source.count} 条` : `${source.count} found`;
  if (source.detail === "Cross-market pilot budget reached; this source is paused.") {
    return zh ? "试用已暂停：额度已用完" : "Pilot paused — allowance reached";
  }
  if (source.detail.startsWith("Paid source paused:")) return zh ? "数据源已暂停，等待配置审核" : "Source paused pending configuration review";
  return zh ? "本次读取失败" : "Unavailable this search";
}
