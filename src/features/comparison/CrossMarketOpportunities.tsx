"use client";

import { incompleteCostOpportunity } from "@/lib/comparison/incomplete-cost";
import type { ComparisonPlatformResult, NormalizedListing } from "@/lib/schemas";
import { ListingPhoto } from "./SellerPhotoGallery";
import { useLang } from "./i18n";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function CrossMarketOpportunities({ candidates, platforms = [] }: {
  candidates: NormalizedListing[];
  platforms?: ComparisonPlatformResult[];
}) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const opportunities = candidates.flatMap((listing) => {
    const comparison = incompleteCostOpportunity(listing, candidates);
    return comparison ? [{ listing, comparison }] : [];
  }).sort((a, b) => a.comparison.knownSubtotal - b.comparison.knownSubtotal || a.listing.id.localeCompare(b.listing.id));
  const sources = platforms.filter((p) => ["ebay", "whatnot", "mercari"].includes(p.id));
  if (!opportunities.length && !sources.length) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-[#c9d7ce] bg-[#fcfbf6]" aria-label={zh ? "跨平台比价" : "Across marketplaces"}>
      <div className="px-4 py-4 sm:px-5">
        <h3 className="font-serif text-xl font-black text-[#24312f]">{zh ? "跨平台比价" : "Across marketplaces"}</h3>
        {sources.length > 0 && <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#52635c]">
          {sources.map((source) => <li key={source.id}><strong>{source.marketplace}</strong> · {source.status === "complete"
            ? zh ? `找到 ${source.count} 条` : `${source.count} found`
            : source.status === "fallback" ? zh ? "本次读取失败" : "Unavailable this search"
              : zh ? "尚未连接" : "Not connected"}</li>)}
        </ul>}
        {opportunities.length > 0 && <p className="mt-3 max-w-3xl text-sm leading-6 text-[#52635c]">{zh
          ? "以下商品通过了版本和品相筛选，但最终费用还不完整。先核对缺失费用，再决定是否比当前最低价更划算；此处比较均未计税。"
          : "These listings passed the print and condition checks, but their final costs are incomplete. Confirm the missing charges before choosing them over the cheapest complete listing. Comparisons here are pre-tax."}</p>}
      </div>
      {opportunities.length > 0 && <ul className="divide-y divide-[#d6ded5] border-t border-[#d6ded5]">
        {opportunities.map(({ listing, comparison }) => {
          const budget = comparison.missingCostBudget;
          const verdict = budget === null
            ? zh ? "可进一步核对：目前没有完整费用的商品作为比较基准。" : "Worth checking: no complete-cost listing is available as a benchmark."
            : budget > 0
              ? zh ? `额外运费和手续费低于 ${money(budget)}，才比当前最低价更便宜。` : `Cheaper only if the missing shipping and fees stay below ${money(budget)}.`
              : zh ? "已知费用已达到或超过当前最低价；还需加上缺失费用。" : "Known costs already meet or exceed the cheapest complete listing; missing charges come on top.";
          const sourceMode = platforms.find((platform) => platform.marketplace === listing.marketplace)?.sourceMode;
          const source = listing.userSupplied ? zh ? "用户提供" : "User supplied"
            : sourceMode === "browser_dom" ? zh ? "商品页面数据" : "Listing page data"
              : sourceMode === "third_party_provider" ? zh ? "Apify 第三方数据" : "Third-party data via Apify"
                : listing.marketplace;
          return <li key={listing.id} className="px-4 py-5 sm:px-5">
            <div className="flex items-start gap-4">
              <ListingPhoto listing={listing} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-black text-[#2f6f73]">{listing.marketplace}</p>
                  <p className="text-lg font-black tabular-nums text-[#24312f]">{money(listing.price)} <span className="text-xs font-normal text-[#64736c]">{zh ? "商品价" : "item price"}</span></p>
                </div>
                <h4 className="mt-1 break-words text-sm font-bold leading-6 text-[#24312f]">{listing.title}</h4>
                <p className="mt-2 text-sm leading-6 text-[#52635c]">{zh ? "运费" : "Shipping"}: {listing.shipping === null ? zh ? "未知" : "unknown" : money(listing.shipping)} · {zh ? "买家手续费" : "Buyer fees"}: {listing.buyerFee === null ? zh ? "未知" : "unknown" : money(listing.buyerFee ?? 0)}</p>
                <p className="mt-2 rounded-md bg-[#e7efe8] px-3 py-2 text-sm font-bold leading-6 text-[#2f6f73]"><span className="mr-1">{zh ? "TCGlens 判断：" : "TCGlens verdict:"}</span>{verdict}</p>
                <p className="mt-2 text-xs leading-5 text-[#64736c]">{listing.seller.feedbackCount === null
                  ? zh ? "卖家记录未核实" : "Seller track record unverified"
                  : zh ? `${listing.seller.feedbackCount} 条卖家评价` : `${listing.seller.feedbackCount} seller reviews`} · {zh ? `${listing.evidence.photoCount} 张卖家照片，不代表评级` : `${listing.evidence.photoCount} seller photos; not a grade prediction`}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="text-xs leading-5 text-[#64736c]">{source} · <time dateTime={listing.observedAt}>{new Date(listing.observedAt).toLocaleString(zh ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time></p>
                  {listing.url && <a href={listing.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-black text-[#2f6f73] underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[#2f6f73]">{zh ? `前往 ${listing.marketplace} 核对结账价` : `Check checkout on ${listing.marketplace}`} ↗</a>}
                </div>
              </div>
            </div>
          </li>;
        })}
      </ul>}
    </section>
  );
}
