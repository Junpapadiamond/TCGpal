"use client";

import { useEffect, useRef, useState } from "react";
import { comparisonReportSchema, searchableMarketplaceSchema, type ComparisonReport, type SearchableMarketplace } from "@/lib/schemas";
import { MarketSelector } from "./MarketSelector";
import { CrossMarketPrices } from "./CrossMarketPrices";
import { useLang } from "./i18n";
import { IconCardSearch, IconSpinner } from "./icons";

export function CrossMarketSearch({ report, initialResult, initialFailed = false, initialPending = false }: { report: ComparisonReport; initialResult?: ComparisonReport | null; initialFailed?: boolean; initialPending?: boolean }) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [result, setResult] = useState<ComparisonReport | null>(initialResult ?? (report.request.marketScope === "cross" ? report : null));
  const [searching, setLoading] = useState(false);
  const loading = initialPending || searching;
  const [failed, setFailed] = useState(initialFailed);
  const [markets, setMarkets] = useState<SearchableMarketplace[] | undefined>((initialResult ?? report).request.marketplaces);
  const [editingMarkets, setEditingMarkets] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function search() {
    if (active.current || (result && !editingMarkets) || initialPending) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      // This paid-source action is never retried automatically, even if its
      // response is lost. Toggling views keeps this mounted and reuses results.
      const response = await fetch("/api/agent/listing-compare", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...report.request, confirmedCardId: report.confirmedCard?.id ?? report.request.confirmedCardId, marketScope: "cross", marketplaces: markets }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]),
      });
      if (!response.ok) throw new Error("cross-market request failed");
      const parsed = comparisonReportSchema.parse(await response.json());
      if (parsed.status === "needs_confirmation" || (report.confirmedCard && parsed.confirmedCard?.id !== report.confirmedCard.id)) throw new Error("card identity changed");
      if (!controller.signal.aborted) {
        setResult(parsed);
        setEditingMarkets(false);
      }
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      active.current = null;
    }
  }

  return <>
    {result && !editingMarkets && <div className="flex justify-end">
      <button type="button" className="secondary-button" onClick={() => setEditingMarkets(true)}>{zh ? "更改平台" : "Change markets"}</button>
    </div>}
    {(!result || editingMarkets) && <section aria-label={zh ? "按需跨平台查询" : "On-demand cross-market search"} className="rounded-xl border border-[#d6ded5] bg-[#fcfbf6] p-5 sm:p-6">
    <MarketSelector value={markets} onChange={setMarkets} disabled={loading} />
    <button type="button" disabled={loading} onClick={() => void search()} className="primary-button mt-4">
      {loading ? <IconSpinner className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <IconCardSearch className="h-4 w-4" />}
      {loading ? zh ? "正在查询其他平台…" : "Searching other marketplaces…"
        : result ? zh ? "查询所选平台" : "Search selected markets" : zh ? "查询其他平台" : "Search other marketplaces"}
    </button>
    {result && <button type="button" disabled={loading} className="secondary-button ml-3 mt-4" onClick={() => {
      setMarkets(result.request.marketplaces);
      setEditingMarkets(false);
      setFailed(false);
    }}>{zh ? "取消" : "Cancel"}</button>}
    {failed && <p role="alert" className="mt-3 text-sm text-[#9a4a2c]">{zh ? "这次查询未完成，可能已计入试用次数。已有结果仍可查看；再次查询需主动点击。" : "This search could not finish. The attempt may count toward the trial limit. Existing results remain available. Another search requires an explicit click."}</p>}
  </section>}
    {result && <CrossMarketPrices candidates={result.candidates} platforms={result.platforms} card={result.confirmedCard} game={result.request.cardHint.game} selectedMarkets={result.request.marketplaces ?? searchableMarketplaceSchema.options} />}
  </>;
}
