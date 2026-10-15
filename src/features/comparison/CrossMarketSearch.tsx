"use client";

import { useEffect, useRef, useState } from "react";
import { comparisonReportSchema, type ComparisonReport } from "@/lib/schemas";
import { CrossMarketPrices } from "./CrossMarketPrices";
import { useLang } from "./i18n";
import { IconCardSearch, IconSpinner } from "./icons";

export function CrossMarketSearch({ report, initialResult, initialFailed = false }: { report: ComparisonReport; initialResult?: ComparisonReport | null; initialFailed?: boolean }) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [result, setResult] = useState<ComparisonReport | null>(initialResult ?? (report.request.marketScope === "cross" ? report : null));
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(initialFailed);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function search() {
    if (active.current || result) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      // This paid-source action is never retried automatically, even if its
      // response is lost. Toggling views keeps this mounted and reuses results.
      const response = await fetch("/api/agent/listing-compare", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...report.request, confirmedCardId: report.confirmedCard?.id ?? report.request.confirmedCardId, marketScope: "cross" }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]),
      });
      if (!response.ok) throw new Error("cross-market request failed");
      const parsed = comparisonReportSchema.parse(await response.json());
      if (parsed.status === "needs_confirmation" || (report.confirmedCard && parsed.confirmedCard?.id !== report.confirmedCard.id)) throw new Error("card identity changed");
      if (!controller.signal.aborted) setResult(parsed);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      active.current = null;
    }
  }

  if (result) return <CrossMarketPrices candidates={result.candidates} platforms={result.platforms} card={result.confirmedCard} game={result.request.cardHint.game} />;
  return <section aria-label={zh ? "按需跨平台查询" : "On-demand cross-market search"} className="rounded-xl border border-[#d6ded5] bg-[#fcfbf6] p-5 sm:p-6">
    <h2 className="font-serif text-xl font-bold text-[#24312f]">{zh ? "想再看看其他平台？" : "Want to check other marketplaces?"}</h2>
    {!failed && <p className="mt-2 max-w-prose text-sm leading-6 text-[#64736c]">{zh
      ? "当前只查询了 eBay。点击后才会查询 Whatnot、Mercari 等已连接来源，消耗一次额外查询额度。查过后切换视图不会重复查询。"
      : "Your first search checks eBay only. Start an additional search to check connected sources such as Whatnot and Mercari. This uses provider credits; switching views afterward reuses the results."}</p>}
    <button type="button" disabled={loading} onClick={() => void search()} className="primary-button mt-4">
      {loading ? <IconSpinner className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <IconCardSearch className="h-4 w-4" />}
      {loading ? zh ? "正在查询其他平台…" : "Searching other marketplaces…" : zh ? "查询其他平台" : "Search other marketplaces"}
    </button>
    {failed && <p role="alert" className="mt-3 text-sm text-[#9a4a2c]">{zh ? "这次跨平台查询未完成，可能已使用额度。eBay 结果仍可查看；再次查询需主动点击，也可以使用下方链接自行搜索。" : "The additional search could not finish. Credits may have been used. Your eBay results are still available. Retry only when ready, or use the links below to search manually."}</p>}
  </section>;
}
