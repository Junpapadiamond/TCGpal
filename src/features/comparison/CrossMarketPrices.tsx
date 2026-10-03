"use client";

import { collectorNumberConflict } from "@/lib/comparison/collector-number";
import { whatnotSearchUrl } from "@/lib/comparison/marketplace-search";
import { trackEvent } from "@/lib/analytics";
import type { CardIdentityCandidate, ComparisonPlatformResult, NormalizedListing, TcgGame } from "@/lib/schemas";
import { useLang, useT } from "./i18n";
import { IconChevronDown } from "./icons";
import { sourceStatusLabel } from "./source-status";
import { CrossMarketCostNote } from "./CrossMarketOpportunities";

const defaultMarkets = ["eBay", "Whatnot", "Mercari"] as const;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const incompatible = new Set(["excluded_product_type", "not_raw_single", "identity_sibling_mismatch", "identity_variant_mismatch", "language_conflict", "listing_inactive"]);

export function CrossMarketPrices({ candidates, platforms, card, game = "pokemon" }: {
  candidates: NormalizedListing[];
  platforms: ComparisonPlatformResult[];
  card?: CardIdentityCandidate | null;
  game?: TcgGame;
}) {
  const { lang } = useLang();
  const t = useT();
  const zh = lang === "zh";
  const markets = [...new Set([...defaultMarkets, ...platforms
    .filter((source) => source.configured && source.status !== "skipped")
    .map((source) => source.marketplace)])];
  const query = card ? [card.name, card.cardNumber, card.variant, card.setName].filter(Boolean).join(" ") : "";
  return <section aria-label={zh ? "跨平台比价" : "Across marketplaces"} className="overflow-hidden rounded-xl border border-[#d6ded5] bg-[#fcfbf6]">
    <div className="px-4 py-3 sm:px-5">
      <h3 className="font-serif text-lg font-black text-[#24312f]">{zh ? "跨平台比价" : "Across marketplaces"}</h3>
      <p className="mt-1 text-xs leading-5 text-[#64736c]">{zh ? "查看商品标价；运费、手续费和税另算。信息未确认齐的商品不会入选推荐。" : "Browse item prices. Shipping, fees and tax are separate; incomplete offers cannot become a buy recommendation."}</p>
    </div>
    <div className="divide-y divide-[#d6ded5] border-t border-[#d6ded5]">
      {markets.map((marketplace) => {
        const source = platforms.find((platform) => platform.marketplace === marketplace);
        const rows = source?.status === "complete" ? candidates.filter((listing) => listing.marketplace === marketplace
          && listing.active && listing.raw && listing.price > 0 && listing.currency === "USD" && !listing.userSupplied
          && listing.printMatch !== "mismatch" && listing.matchConfidence !== "low"
          && !listing.eligibilityIssues.some((issue) => incompatible.has(issue.code))
          && !(card && collectorNumberConflict(`${listing.title} ${listing.matchAspectText}`, card.cardNumber)))
          .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id)).slice(0, 3) : [];
        const status = rows.length === 0 && source?.status === "complete"
          ? zh ? "这次没找到对应的在售单卡" : "No matching active listings"
          : sourceStatusLabel(source, lang);
        const manualUrl = query && rows.length === 0
          ? marketplace === "Whatnot" ? whatnotSearchUrl(query)
            : marketplace === "Mercari" ? `https://www.mercari.com/search/?keyword=${encodeURIComponent(query)}` : null
          : null;
        const heading = <span className="block min-w-0">
          <span className="text-sm font-bold text-[#2f6f73]">{marketplace}</span>
          <span className="mt-0.5 block text-xs font-normal leading-5 text-[#64736c]">{status}
            {marketplace === "Stomping Grounds" && rows.length > 0 ? zh ? " · 库存待确认" : " · Stock unconfirmed" : ""}
          </span>
        </span>;
        return <section key={marketplace} aria-label={zh ? `${marketplace} 标价` : `${marketplace} prices`} className="min-w-0">
          {rows.length === 0 ? <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
            {heading}
            {manualUrl && <a href={manualUrl} target="_blank" rel="noopener noreferrer"
              onClick={() => trackEvent("other_marketplace_clicked", { marketplace, game })}
              className="inline-flex min-h-11 items-center text-xs font-bold text-[#2f6f73] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73]">
              {zh ? `手动搜索 ${marketplace}` : `Search ${marketplace} manually`}<span aria-hidden="true"> ↗</span>
            </a>}
          </div> : <details className="group/source">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-[#f4f7f3] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2f6f73] sm:px-5 [&::-webkit-details-marker]:hidden">
              {heading}
              <span className="ml-auto text-right text-sm font-bold tabular-nums text-[#24312f]">{zh ? `${money(rows[0].price)} 起` : `From ${money(rows[0].price)}`}<span className="block text-xs font-normal text-[#64736c]">{zh ? "仅商品价" : "item only"}</span></span>
              <IconChevronDown className="h-4 w-4 shrink-0 text-[#2f6f73] group-open/source:rotate-180" />
            </summary>
            <div className="border-t border-[#e0e5dc] px-4 sm:px-5">
              {marketplace === "Stomping Grounds" && <p className="pt-3 text-xs leading-5 text-[#806521]">{zh
                ? "商店显示有货，但提醒维护期间库存可能不准确。请到商店确认是否有货。"
                : "Store reports stock, but warns inventory may be inaccurate during maintenance. Confirm availability at the store."}</p>}
              <ul className="divide-y divide-[#e0e5dc]">
                {rows.map((listing) => {
                  const versionNeedsChecking = listing.printMatch !== "exact" || listing.eligibilityIssues.some((issue) => issue.code === "identity_unverified");
                  const conditionDiffers = listing.eligibilityIssues.some((issue) => issue.category === "condition" && issue.code !== "condition_unstated");
                  const priceNeedsChecking = listing.eligibilityIssues.some((issue) => issue.category === "price");
                  return <li key={listing.id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <p className="min-w-0 break-words text-sm font-bold leading-6 text-[#24312f]">{listing.title}</p>
                      <p className="shrink-0 text-lg font-black tabular-nums text-[#24312f]">{money(listing.price)}</p>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#52635c]">{listing.claimedCondition === "Unknown" ? zh ? "卖家没标品相" : "Condition not stated" : `${zh ? "卖家标注" : "Seller claims"}: ${t.conditions[listing.claimedCondition]}`}</p>
                    <p className="text-xs leading-5 text-[#52635c]">{zh ? "运费" : "Shipping"}: {listing.shipping === null ? zh ? "未知" : "unknown" : money(listing.shipping)} · {zh ? "买家手续费" : "Buyer fees"}: {listing.buyerFee === null ? zh ? "未知" : "unknown" : money(listing.buyerFee ?? 0)}</p>
                    {(versionNeedsChecking || conditionDiffers || priceNeedsChecking) && <p className="mt-1 text-xs font-bold leading-5 text-[#806521]">{[
                      versionNeedsChecking ? zh ? "版本待核对" : "Version needs checking" : null,
                      conditionDiffers ? zh ? "品相不符合当前要求" : "Condition differs from your request" : null,
                      priceNeedsChecking ? zh ? "价格异常，请核对商品" : "Unusual price; inspect the item" : null,
                    ].filter(Boolean).join(" · ")}</p>}
                    <CrossMarketCostNote listing={listing} candidates={candidates} />
                    {marketplace === "Stomping Grounds" && <p className="mt-1 text-xs leading-5 text-[#64736c]">{zh ? "卖家记录未核实 · 缺少单张卡实拍照片" : "Seller track record unverified · Individual card photos unavailable"}</p>}
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
                      <p className="text-xs leading-5 text-[#64736c]">{marketplace === "eBay" ? "eBay Browse" : source?.sourceMode === "browser_dom" ? zh ? "商品页面数据" : "Listing page data" : source?.sourceMode === "third_party_provider" ? zh ? "Apify 数据源" : "Source: Apify" : marketplace} · <time dateTime={listing.observedAt}>{new Date(listing.observedAt).toLocaleString(zh ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time></p>
                      {listing.url && <a href={listing.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs font-bold text-[#2f6f73] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73]">{zh ? "查看商品" : "View listing"} ↗</a>}
                    </div>
                  </li>;
                })}
              </ul>
            </div>
          </details>}
        </section>;
      })}
    </div>
  </section>;
}
