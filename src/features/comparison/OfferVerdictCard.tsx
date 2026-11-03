"use client";

import type { NormalizedListing } from "@/lib/schemas";
import { ListingPhoto } from "./SellerPhotoGallery";
import { ListingSignals } from "./ListingSignals";
import { MarketplaceBrand } from "./MarketplaceBrand";
import { useLang } from "./i18n";
import { IconArrowUpRight, IconChevronDown } from "./icons";
import { buildOfferVerdictCopy } from "./offer-verdict-copy";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function OfferVerdictCard({ listing, candidates, attribution, marketPrice = null, sourceStatus, embedded = false }: {
  listing: NormalizedListing;
  candidates: NormalizedListing[];
  attribution: string;
  marketPrice?: number | null;
  sourceStatus?: string;
  embedded?: boolean;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const verdict = buildOfferVerdictCopy(listing, candidates, lang, marketPrice);
  const displayComplete = listing.costComplete && verdict.assessment.missingCharges.length === 0;
  const total = displayComplete ? listing.estimatedLandedCost ?? listing.preTaxTotal : verdict.assessment.knownSubtotal;
  const itemOnly = !displayComplete && total === listing.price;
  const versionNeedsChecking = !verdict.assessment.identityConfirmed || verdict.assessment.issues.some((issue) => issue.code === "identity_unverified");
  const conditionDiffers = verdict.assessment.issues.some((issue) => issue.category === "condition" && issue.code !== "condition_unstated");
  return <article aria-label={`${listing.marketplace} ${zh ? "判断" : "verdict"}: ${listing.title}`} className={`min-w-0 ${embedded ? "py-4" : "listing-card p-4 sm:px-5"}`}>
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-4 gap-y-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-x-5 lg:grid-cols-[112px_minmax(0,1fr)_auto] lg:items-center">
      <ListingPhoto listing={listing} size="lead" />
      <div className="min-w-0">
        {sourceStatus && <div className="mb-2 flex flex-wrap items-center gap-3"><MarketplaceBrand marketplace={listing.marketplace} /><span className="text-xs text-[#64716a]">{sourceStatus}</span></div>}
        <p className="max-w-[42ch] break-words text-base font-semibold leading-snug tracking-[-0.025em] sm:text-[22px] text-[#24312f]">{listing.title}</p>
        {total !== listing.price && <p className="mt-2 text-xs leading-5 text-[#52635c]">{zh ? "商品价" : "Item price"} <span>{money(listing.price)}</span></p>}
        <p className="text-xs leading-5 text-[#52635c]">{zh ? "运费" : "Shipping"}: {listing.shipping === null ? zh ? "未知" : "unknown" : money(listing.shipping)} · {zh ? "买家手续费" : "Buyer fees"}: {listing.buyerFee === null ? zh ? "未知" : "unknown" : money(listing.buyerFee)}</p>
        {(versionNeedsChecking || conditionDiffers || verdict.assessment.priceNeedsReview) && <p className="mt-1 text-xs font-bold leading-5 text-[#806521]">{[
          versionNeedsChecking ? zh ? "版本待核对" : "Version needs checking" : null,
          conditionDiffers ? zh ? "品相不符合当前要求" : "Condition differs from your request" : null,
          verdict.assessment.priceNeedsReview ? zh ? "价格异常，请核对商品" : "Unusual price; inspect the item" : null,
        ].filter(Boolean).join(" · ")}</p>}
      </div>
      <div className="col-span-2 flex items-center justify-between gap-4 sm:col-span-1 sm:col-start-2 lg:col-start-auto lg:flex-col lg:items-end lg:border-l lg:border-[#dde3dc] lg:pl-5">
        <div className="tabular-nums lg:text-right">
          <p className="text-[28px] font-semibold leading-none tracking-[-0.045em] text-[#155e63] sm:text-[34px]">{money(total)}</p>
          <p className="mt-1 max-w-48 text-xs text-[#64716a]">{displayComplete
            ? listing.estimatedTax === null ? zh ? "税前总价" : "pre-tax total" : zh ? "预估到手价" : "est. landed"
            : itemOnly ? zh ? "商品价 · 总价待确认" : "item price · total unconfirmed" : zh ? "已知费用 · 总价待确认" : "known costs · total unconfirmed"}</p>
          <p className={`mt-2 max-w-56 text-xs font-medium leading-5 ${verdict.tone === "positive" ? "text-[#20676a]" : verdict.tone === "review" ? "text-[#896419]" : "text-[#64716a]"}`}>{verdict.label}</p>
        </div>
    {listing.url && <a href={listing.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-[#155e63] px-4 text-xs font-semibold text-white sm:min-w-36 sm:text-sm transition-colors hover:bg-[#104c50] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#155e63]">{zh ? "查看商品" : "View listing"} <IconArrowUpRight className="h-4 w-4" /></a>}
      </div>
    </div>
    <ListingSignals listing={listing} marketPrice={marketPrice} />
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
      <p className="py-3 text-xs leading-5 text-[#64736c]">{attribution} · <time dateTime={listing.observedAt}>{new Date(listing.observedAt).toLocaleString(zh ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time></p>
      <details className="group/evidence min-w-0 open:col-span-2 text-xs leading-5 text-[#52635c] sm:text-sm sm:leading-6">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-[#2f6f73] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73] [&::-webkit-details-marker]:hidden">{zh ? "查看依据" : "Details"}<IconChevronDown className="h-3.5 w-3.5 group-open/evidence:rotate-180" /></summary>
        <p className="mt-1 text-xs leading-5 text-[#52635c] sm:text-sm sm:leading-6">{verdict.why}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-[#52635c]">{verdict.nextStep}</p>
        {verdict.catch && <p className="mt-1">{verdict.catch}</p>}
        <p className="mt-2 text-xs leading-5 text-[#64736c]">{zh ? `卡片匹配置信度：${({ high: "高", medium: "中", low: "低" })[listing.matchConfidence]}` : `Card-match confidence: ${listing.matchConfidence}`}</p>
      </details>
    </div>
  </article>;
}
