"use client";

import { searchableMarketplaceSchema, type SearchableMarketplace } from "@/lib/schemas";
import { createContext, useContext, type ReactNode } from "react";
import { useLang } from "./i18n";

const MarketAvailability = createContext<readonly SearchableMarketplace[]>(["Fanatics Collect", "Cardmarket", "CardTrader"]);

export function MarketAvailabilityProvider({ pendingMarkets, children }: { pendingMarkets: SearchableMarketplace[]; children: ReactNode }) {
  return <MarketAvailability.Provider value={pendingMarkets}>{children}</MarketAvailability.Provider>;
}

export function MarketSelector({ value, onChange, disabled = false }: {
  value?: SearchableMarketplace[];
  onChange: (value: SearchableMarketplace[] | undefined) => void;
  disabled?: boolean;
}) {
  const { lang } = useLang();
  const pending = useContext(MarketAvailability);
  const zh = lang === "zh";
  const style = "min-h-11 rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73] disabled:opacity-60";
  return <fieldset disabled={disabled} className="mt-3">
    <legend className="mb-2 text-sm font-semibold text-[#52635c]">{zh ? "查询平台" : "Markets to search"}</legend>
    <div className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={!value} onClick={() => onChange(undefined)} className={`${style} ${!value ? "border-[#2f6f73] bg-[#2f6f73] text-white" : "border-[#d6ded5] bg-white text-[#52635c]"}`}>{zh ? "全部" : "All"}</button>
      {searchableMarketplaceSchema.options.map(market => {
        const selected = Boolean(value?.includes(market));
        return <button key={market} type="button" aria-pressed={selected}
          onClick={() => onChange(!value ? [market] : selected ? value.length > 1 ? value.filter(item => item !== market) : value : [...value, market])}
          className={`${style} ${selected ? "border-[#2f6f73] bg-[#e5efea] text-[#245c60]" : "border-[#d6ded5] bg-white text-[#52635c]"}`}>
          {market}{pending.includes(market) && <> <span className="ml-1 font-normal text-xs">{zh ? "待接通" : "Pending"}</span></>}
        </button>;
      })}
    </div>
    <p className="mt-2 text-xs text-[#64736c]">{pending.length > 0
      ? zh ? "待接通平台暂不返回自动报价；已连接来源仍受查询额度限制。" : "Pending markets cannot return automatic offers yet. Connected sources retain their search limits."
      : zh ? "已连接来源仍受查询额度限制。" : "Connected sources retain their search limits."}</p>
  </fieldset>;
}
