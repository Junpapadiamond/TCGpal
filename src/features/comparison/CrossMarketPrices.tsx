"use client";

import { collectorNumberConflict } from "@/lib/comparison/collector-number";
import { selectMarketOffer } from "@/lib/comparison/offer-verdict";
import { whatnotSearchUrl } from "@/lib/comparison/marketplace-search";
import { trackEvent } from "@/lib/analytics";
import type { CardIdentityCandidate, ComparisonPlatformResult, NormalizedListing, TcgGame } from "@/lib/schemas";
import { useLang, useT } from "./i18n";
import { IconChevronDown } from "./icons";
import { sourceStatusLabel } from "./source-status";
import { MarketplaceBrand } from "./MarketplaceBrand";
import { buildOfferVerdictCopy } from "./offer-verdict-copy";
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
  const t = useT();
  const zh = lang === "zh";
  const markets = [...new Set([...defaultMarkets, ...platforms
    .filter((source) => source.configured && source.status !== "skipped")
    .map((source) => source.marketplace)])];
  const query = card ? [card.name, card.cardNumber, card.variant, card.setName].filter(Boolean).join(" ") : "";
  return <section aria-label={zh ? "跨平台比价" : "Across marketplaces"} className="pt-2">
    <div className="sr-only">
      <h3>{zh ? "跨平台比价" : "Across marketplaces"}</h3>
    </div>
    <div className="divide-y divide-[#dde3dc]">
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
        const assessment = lead ? buildOfferVerdictCopy(lead, candidates, lang, card?.marketMid ?? null).assessment : null;
        const warnings = assessment ? [
          !assessment.identityConfirmed || assessment.issues.some(issue => issue.code === "identity_unverified") ? zh ? "版本待核对" : "Check version" : null,
          assessment.issues.some(issue => issue.category === "condition" && issue.code !== "condition_unstated") ? zh ? "品相不符" : "Condition mismatch" : null,
          assessment.priceNeedsReview ? zh ? "价格需核对" : "Check price" : null,
          assessment.missingCharges.length === 2 ? zh ? "运费及手续费待确认" : "Shipping + buyer fees unknown"
            : assessment.missingCharges[0] === "shipping" ? zh ? "运费待确认" : "Shipping unknown"
              : assessment.missingCharges[0] === "buyer_fee" ? zh ? "买家手续费待确认" : "Buyer fees unknown" : null,
          marketplace === "Stomping Grounds" ? zh ? "库存待确认" : "Stock unconfirmed" : null,
        ].filter(Boolean).join(" · ") : "";
        const offer = lead ? <>
            <OfferVerdictCard listing={lead} candidates={candidates} attribution={attribution} marketPrice={card?.marketMid ?? null} sourceStatus={marketplace === "eBay" ? status : undefined} />
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
        </> : null;
        return <section key={marketplace} aria-label={zh ? `${marketplace} 标价` : `${marketplace} prices`} className="min-w-0">
          {marketplace === "Whatnot" && <h3 className="pt-6 text-lg font-semibold tracking-tight text-[#24312f]">{zh ? "其他平台对比" : "Other marketplaces"}</h3>}
          {lead && marketplace !== "eBay" ? <details className="group/market">
            <summary className="grid min-h-20 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73] sm:grid-cols-[200px_minmax(0,1fr)_24px] [&::-webkit-details-marker]:hidden">
              <MarketplaceBrand marketplace={marketplace} />
              <span className="order-3 col-span-2 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 sm:order-none sm:col-span-1 sm:border-l sm:border-[#dde3dc] sm:pl-7">
                <span className="text-base font-semibold text-[#155e63] sm:text-xl">{zh ? "商品价" : "Item"} {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(lead.price)}</span>
                <span className="text-xs text-[#64716a] sm:text-sm">{lead.claimedCondition === "Unknown" ? zh ? "品相未知" : "Condition unknown" : `${t.conditions[lead.claimedCondition]} · ${zh ? "卖家标注" : "seller claim"}`}</span>
                {warnings && <span className="text-xs leading-5 text-[#896419] sm:text-sm">{warnings}</span>}
              </span>
              <IconChevronDown className="h-4 w-4 justify-self-end text-[#20676a] group-open/market:rotate-180" />
            </summary>
            <div className="border-t border-[#e7ebe5] pb-3">{offer}</div>
          </details> : <>
            {!lead && <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-5 sm:min-h-20">
              <h4 className="text-sm"><MarketplaceBrand marketplace={marketplace} /></h4>
              <p className="min-w-0 flex-1 text-xs leading-5 text-[#64716a] sm:ml-8">{status}</p>
              {!lead && manualUrl && <a href={manualUrl} target="_blank" rel="noopener noreferrer"
                onClick={() => trackEvent("other_marketplace_clicked", { marketplace, game })}
                className="inline-flex min-h-11 items-center text-xs font-medium text-[#20676a] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73]">
                {zh ? `手动搜索 ${marketplace}` : `Search ${marketplace} manually`}<span aria-hidden="true"> ↗</span>
              </a>}
            </div>}
            {offer}
          </>}
        </section>;
      })}
    </div>
  </section>;
}
