"use client";

import { collectorNumberConflict } from "@/lib/comparison/collector-number";
import { selectMarketOffer } from "@/lib/comparison/offer-verdict";
import { whatnotSearchUrl } from "@/lib/comparison/marketplace-search";
import { trackEvent } from "@/lib/analytics";
import type { CardIdentityCandidate, ComparisonPlatformResult, NormalizedListing, TcgGame } from "@/lib/schemas";
import { useLang } from "./i18n";
import { IconChevronDown } from "./icons";
import { sourceStatusLabel } from "./source-status";
import { OfferVerdictCard } from "./OfferVerdictCard";

const defaultMarkets = ["eBay", "Whatnot", "Mercari"] as const;
const incompatible = new Set(["excluded_product_type", "not_raw_single", "identity_sibling_mismatch", "identity_variant_mismatch", "language_conflict", "listing_inactive"]);

function sourceAttribution(marketplace: NormalizedListing["marketplace"], source: ComparisonPlatformResult | undefined, zh: boolean) {
  if (marketplace === "eBay") return "eBay Browse";
  if (source?.sourceMode === "browser_dom") return zh ? "商品页面数据" : "Listing page data";
  if (source?.sourceMode === "third_party_provider") {
    const provider = source.label.includes("Soldgraph") ? "Soldgraph" : "Apify";
    return zh ? `${provider} 数据源` : `Source: ${provider}`;
  }
  return marketplace;
}

export function CrossMarketPrices({ candidates, platforms, card, game = "pokemon" }: {
  candidates: NormalizedListing[];
  platforms: ComparisonPlatformResult[];
  card?: CardIdentityCandidate | null;
  game?: TcgGame;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const markets = [...new Set([...defaultMarkets, ...platforms
    .filter((source) => source.configured && source.status !== "skipped")
    .map((source) => source.marketplace)])];
  const query = card ? [card.name, card.cardNumber, card.variant, card.setName].filter(Boolean).join(" ") : "";
  return <section aria-label={zh ? "跨平台比价" : "Across marketplaces"} className="overflow-hidden rounded-xl border border-[#d6ded5] bg-[#fcfbf6]">
    <div className="px-4 py-3 sm:px-5">
      <h3 className="font-serif text-lg font-black text-[#24312f]">{zh ? "跨平台比价" : "Across marketplaces"}</h3>
      <p className="mt-1 text-xs leading-5 text-[#64736c]">{zh ? "查看各平台的商品图片、已知费用和判断。缺失费用会明确标出。" : "Compare listing pictures, known costs and verdicts across platforms. Missing charges stay explicit."}</p>
    </div>
    <div className="divide-y divide-[#d6ded5] border-t border-[#d6ded5]">
      {markets.map((marketplace) => {
        const source = platforms.find((platform) => platform.marketplace === marketplace);
        const rows = source?.status === "complete" ? candidates.filter((listing) => listing.marketplace === marketplace
          && listing.active && listing.raw && listing.price > 0 && listing.currency === "USD" && !listing.userSupplied
          && listing.printMatch !== "mismatch" && listing.matchConfidence !== "low"
          && !listing.eligibilityIssues.some((issue) => incompatible.has(issue.code))
          && !(card && collectorNumberConflict(`${listing.title} ${listing.matchAspectText}`, card.cardNumber))) : [];
        const lead = selectMarketOffer(rows, marketplace) ?? rows.sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))[0];
        const others = rows.filter((listing) => listing.id !== lead?.id).sort((a, b) => a.price - b.price || a.id.localeCompare(b.id)).slice(0, 2);
        const status = rows.length === 0 && source?.status === "complete"
          ? zh ? "这次没找到对应的在售单卡" : "No matching active listings"
          : sourceStatusLabel(source, lang);
        const manualUrl = query && rows.length === 0
          ? marketplace === "Whatnot" ? whatnotSearchUrl(query)
            : marketplace === "Mercari" ? `https://www.mercari.com/search/?keyword=${encodeURIComponent(query)}` : null
          : null;
        const attribution = sourceAttribution(marketplace, source, zh);
        return <section key={marketplace} aria-label={zh ? `${marketplace} 标价` : `${marketplace} prices`} className="min-w-0 px-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-4">
            <h4 className="text-sm font-black text-[#2f6f73]">{marketplace}</h4>
            <p className="text-xs leading-5 text-[#64736c]">{status}{marketplace === "Stomping Grounds" && lead ? zh ? " · 库存待确认" : " · Stock unconfirmed" : ""}</p>
          </div>
          {!lead ? <div className="pb-4">
            <p className="mt-2 text-xs leading-5 text-[#64736c]">{zh ? "没有可核实的商品，暂时无法给出购买判断。" : "No observed matching offer is available for a buying verdict."}</p>
            {manualUrl && <a href={manualUrl} target="_blank" rel="noopener noreferrer"
              onClick={() => trackEvent("other_marketplace_clicked", { marketplace, game })}
              className="inline-flex min-h-11 items-center text-xs font-bold text-[#2f6f73] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73]">
              {zh ? `手动搜索 ${marketplace}` : `Search ${marketplace} manually`}<span aria-hidden="true"> ↗</span>
            </a>}
          </div> : <>
            <OfferVerdictCard listing={lead} candidates={candidates} attribution={attribution} marketPrice={card?.marketMid ?? null} />
            {marketplace === "Stomping Grounds" && <p className="pb-3 text-xs leading-5 text-[#806521]">{zh
              ? "商店显示有货，但提醒维护期间库存可能不准确。请到商店确认是否有货。"
              : "Store reports stock, but warns inventory may be inaccurate during maintenance. Confirm availability at the store."}</p>}
            {source?.sourceMode === "third_party_provider" && source.label.includes("Soldgraph") && <p className="pb-3 text-xs leading-5 text-[#806521]">{zh
              ? "Soldgraph 报告这些商品在售，请到平台确认是否仍有货。"
              : "Soldgraph reports these listings as active. Confirm availability on the marketplace."}</p>}
            {others.length > 0 && <details className="group/source border-t border-[#e0e5dc]">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-xs font-bold text-[#2f6f73] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2f6f73] [&::-webkit-details-marker]:hidden">
                {zh ? `其他 ${others.length} 条商品` : `Other ${others.length} ${others.length === 1 ? "offer" : "offers"}`}
                <IconChevronDown className="h-4 w-4 shrink-0 group-open/source:rotate-180" />
              </summary>
              <ul className="divide-y divide-[#e0e5dc] border-t border-[#e0e5dc]">
                {others.map((listing) => <li key={listing.id}><OfferVerdictCard listing={listing} candidates={candidates} attribution={attribution} marketPrice={card?.marketMid ?? null} /></li>)}
              </ul>
            </details>}
          </>}
        </section>;
      })}
    </div>
  </section>;
}
