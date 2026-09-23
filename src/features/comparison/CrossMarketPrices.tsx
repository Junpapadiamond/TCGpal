"use client";

import { collectorNumberConflict } from "@/lib/comparison/collector-number";
import type { CardIdentityCandidate, ComparisonPlatformResult, NormalizedListing } from "@/lib/schemas";
import { useLang, useT } from "./i18n";
import { IconChevronDown } from "./icons";

const markets = ["eBay", "Whatnot", "Mercari"] as const;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const incompatible = new Set(["excluded_product_type", "not_raw_single", "identity_sibling_mismatch", "identity_variant_mismatch", "language_conflict", "listing_inactive"]);

export function CrossMarketPrices({ candidates, platforms, card }: {
  candidates: NormalizedListing[];
  platforms: ComparisonPlatformResult[];
  card?: CardIdentityCandidate | null;
}) {
  const { lang } = useLang();
  const t = useT();
  const zh = lang === "zh";
  return <section aria-label={zh ? "三平台商品标价" : "Marketplace asking prices"} className="rounded-xl border border-[#d6ded5] bg-[#fcfbf6]">
    <details className="group/prices">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-black text-[#2f6f73] transition hover:text-[#24585c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73] [&::-webkit-details-marker]:hidden">
        <span>{zh ? "查看各平台标价" : "View marketplace asking prices"}</span>
        <IconChevronDown className="h-4 w-4 shrink-0 group-open/prices:rotate-180" />
      </summary>
      <div className="border-t border-[#d6ded5] px-4 pb-1 pt-3">
        <p className="text-xs leading-5 text-[#52635c]">{zh
          ? "补充报价供核对，按各平台商品标价从低到高排列。运费、手续费和税另计；版本、品相或费用未核实的商品不会成为购买推荐。"
          : "Additional listings to review, ordered by asking price within each marketplace. Shipping, buyer fees and tax are separate. Unverified versions, conditions or costs cannot become a buy recommendation."}</p>
      </div>
      <div className="divide-y divide-[#d6ded5] px-4">
        {markets.map((marketplace) => {
          const source = platforms.find((platform) => platform.marketplace === marketplace);
          const rows = source?.status === "complete" ? candidates.filter((listing) => listing.marketplace === marketplace
            && listing.active && listing.raw && listing.price > 0 && listing.currency === "USD" && !listing.userSupplied
            && listing.printMatch !== "mismatch" && listing.matchConfidence !== "low"
            && !listing.eligibilityIssues.some((issue) => incompatible.has(issue.code))
            && !(card && collectorNumberConflict(`${listing.title} ${listing.matchAspectText}`, card.cardNumber)))
            .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id)).slice(0, 3) : [];
          const empty = source?.status === "fallback" ? zh ? "本次读取失败" : "Unavailable this search"
            : source?.status === "complete" ? zh ? "未找到匹配的在售商品" : "No matching active listings"
              : zh ? "尚未连接" : "Not connected";
          return <section key={marketplace} aria-label={zh ? `${marketplace} 标价` : `${marketplace} prices`} className="min-w-0 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-sm font-black text-[#2f6f73]">{marketplace}</h3>
              {rows.length === 0 && <p className="text-xs text-[#64736c]">{empty}</p>}
            </div>
            {rows.length > 0 && <ul className="divide-y divide-[#e0e5dc]">
              {rows.map((listing) => {
                const versionNeedsChecking = listing.printMatch !== "exact" || listing.eligibilityIssues.some((issue) => issue.code === "identity_unverified");
                const conditionNeedsChecking = listing.claimedCondition === "Unknown";
                const conditionDiffers = listing.eligibilityIssues.some((issue) => issue.category === "condition" && issue.code !== "condition_unstated");
                const priceNeedsChecking = listing.eligibilityIssues.some((issue) => issue.category === "price");
                return <li key={listing.id} className="py-3 sm:grid sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4">
                  <div className="flex flex-wrap items-baseline gap-x-2 sm:block">
                    <p className="text-xl font-black tabular-nums text-[#24312f]">{money(listing.price)}</p>
                    <span className="text-xs text-[#64736c]">{zh ? "商品标价" : "asking price"}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="mt-2 break-words text-sm font-bold leading-6 text-[#24312f] sm:mt-0">{listing.title}</p>
                    <p className="mt-2 text-xs leading-5 text-[#52635c]">{conditionNeedsChecking ? zh ? "品相未注明" : "Condition not stated" : `${zh ? "卖家声称" : "Seller claims"}: ${t.conditions[listing.claimedCondition]}`}</p>
                    <p className="text-xs leading-5 text-[#52635c]">{zh ? "运费" : "Shipping"}: {listing.shipping === null ? zh ? "未知" : "unknown" : money(listing.shipping)} · {zh ? "买家手续费" : "Buyer fees"}: {listing.buyerFee === null ? zh ? "未知" : "unknown" : money(listing.buyerFee ?? 0)}</p>
                    {(versionNeedsChecking || conditionDiffers || priceNeedsChecking) && <p className="mt-2 text-xs font-bold leading-5 text-[#806521]">{[
                      versionNeedsChecking ? zh ? "版本待核对" : "Version needs checking" : null,
                      conditionDiffers ? zh ? "品相不符合当前要求" : "Condition differs from your request" : null,
                      priceNeedsChecking ? zh ? "价格异常，请核对商品" : "Unusual price; inspect the item" : null,
                    ].filter(Boolean).join(" · ")}</p>}
                    <p className="mt-2 text-[11px] leading-5 text-[#64736c]">{marketplace === "eBay" ? "eBay Browse" : source?.sourceMode === "browser_dom" ? zh ? "商品页面数据" : "Listing page data" : source?.sourceMode === "third_party_provider" ? zh ? "Apify 数据源" : "Source: Apify" : marketplace} · <time dateTime={listing.observedAt}>{new Date(listing.observedAt).toLocaleString(zh ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time></p>
                    {listing.url && <a href={listing.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center text-sm font-black text-[#2f6f73] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73]">{zh ? "查看商品" : "View listing"} ↗</a>}
                  </div>
                </li>;
              })}
            </ul>}
          </section>;
        })}
      </div>
    </details>
  </section>;
}
