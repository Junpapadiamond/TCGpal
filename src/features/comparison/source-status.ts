import type { ComparisonPlatformResult } from "@/lib/schemas";

// Operational quota and provider details stay in the technical trace. This
// label describes the buyer's current access without suggesting a retry fixes it.
export function sourceStatusLabel(source: ComparisonPlatformResult | undefined, lang: "en" | "zh") {
  const zh = lang === "zh";
  if (!source || source.status === "skipped") return zh ? "仅供手动查询" : "Manual check only";
  if (source.status === "complete") return zh ? `找到 ${source.count} 条` : `${source.count} found`;
  if (source.detail === "Cross-market pilot budget reached; this source is paused."
    || source.detail === "Paid source paused: pilot budget approval has expired."
    || source.detail === "Paid source paused: pilot budget approval is incomplete or invalid.") {
    return zh ? "查询已暂停" : "Search paused";
  }
  return zh ? "暂时无法读取" : "Temporarily unavailable";
}
