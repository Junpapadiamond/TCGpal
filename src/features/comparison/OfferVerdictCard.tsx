"use client";

import type { NormalizedListing } from "@/lib/schemas";
import { ListingPhoto } from "./SellerPhotoGallery";
import { ListingSignals } from "./ListingSignals";
import { useLang } from "./i18n";
import { IconChevronDown } from "./icons";
import { buildOfferVerdictCopy } from "./offer-verdict-copy";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function OfferVerdictCard({ listing, candidates, attribution, marketPrice = null }: {
  listing: NormalizedListing;
  candidates: NormalizedListing[];
  attribution: string;
  marketPrice?: number | null;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const verdict = buildOfferVerdictCopy(listing, candidates, lang, marketPrice);
  const displayComplete = listing.costComplete && verdict.assessment.missingCharges.length === 0;
  const total = displayComplete ? listing.estimatedLandedCost ?? listing.preTaxTotal : verdict.assessment.knownSubtotal;
  const itemOnly = !displayComplete && total === listing.price;
  const versionNeedsChecking = !verdict.assessment.identityConfirmed || verdict.assessment.issues.some((issue) => issue.code === "identity_unverified");
  const conditionDiffers = verdict.assessment.issues.some((issue) => issue.category === "condition" && issue.code !== "condition_unstated");
  return <article aria-label={`${listing.marketplace} ${zh ? "判断" : "verdict"}: ${listing.title}`} className="min-w-0 py-4">
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-4">
      <ListingPhoto listing={listing} />
      <div className="min-w-0">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-2">
          <p className="min-w-0 max-w-[48ch] flex-1 break-words font-serif text-xl sm:text-2xl font-bold leading-tight text-[#24312f]">{listing.title}</p>
          <div className="text-left tabular-nums sm:text-right">
            <p className="font-mono text-3xl font-black text-[#24312f]">{money(total)}</p>
            <p className="text-[10px] font-semibold text-[#64736c]">{displayComplete
              ? listing.estimatedTax === null ? zh ? "税前总价" : "pre-tax total" : zh ? "预估到手价" : "est. landed"
              : itemOnly ? zh ? "商品价 · 总价待确认" : "item price · total unconfirmed" : zh ? "已知费用 · 总价待确认" : "known costs · total unconfirmed"}</p>
          </div>
        </div>
        {total !== listing.price && <p className="mt-1 text-xs leading-5 text-[#52635c]">{zh ? "商品价" : "Item price"} <span>{money(listing.price)}</span></p>}
        <p className="text-xs leading-5 text-[#52635c]">{zh ? "运费" : "Shipping"}: {listing.shipping === null ? zh ? "未知" : "unknown" : money(listing.shipping)} · {zh ? "买家手续费" : "Buyer fees"}: {listing.buyerFee === null ? zh ? "未知" : "unknown" : money(listing.buyerFee)}</p>
        {(versionNeedsChecking || conditionDiffers || verdict.assessment.priceNeedsReview) && <p className="mt-1 text-xs font-bold leading-5 text-[#806521]">{[
          versionNeedsChecking ? zh ? "版本待核对" : "Version needs checking" : null,
          conditionDiffers ? zh ? "品相不符合当前要求" : "Condition differs from your request" : null,
          verdict.assessment.priceNeedsReview ? zh ? "价格异常，请核对商品" : "Unusual price; inspect the item" : null,
        ].filter(Boolean).join(" · ")}</p>}
      </div>
    </div>
    <ListingSignals listing={listing} marketPrice={marketPrice} />
    <div className={`mt-3 rounded-lg border px-3 py-2.5 ${verdict.tone === "positive" ? "border-[#c9d7ce] bg-[#e7efe8]" : verdict.tone === "review" ? "border-[#dfd6b6] bg-[#faf5e5]" : "border-[#d6ded5] bg-[#f1f3ee]"}`}>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-5 text-[#24312f]"><strong>{verdict.label}</strong></p>
    </div>
    <details className="group/evidence mt-1 text-xs leading-5 text-[#52635c]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-[#2f6f73] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73] [&::-webkit-details-marker]:hidden">{zh ? "查看依据" : "Details"}<IconChevronDown className="h-3.5 w-3.5 group-open/evidence:rotate-180" /></summary>
      <p className="mt-1 text-xs leading-5 text-[#52635c]">{verdict.why}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[#52635c]">{verdict.nextStep}</p>
      {verdict.catch && <p className="mt-1">{verdict.catch}</p>}
      <p className="mt-2 text-xs leading-5 text-[#64736c]">{zh ? `卡片匹配置信度：${({ high: "高", medium: "中", low: "低" })[listing.matchConfidence]}` : `Card-match confidence: ${listing.matchConfidence}`}</p>
    </details>
    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
      <p className="text-[11px] leading-5 text-[#64736c]">{attribution} · <time dateTime={listing.observedAt}>{new Date(listing.observedAt).toLocaleString(zh ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time></p>
      {listing.url && <a href={listing.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs font-bold text-[#2f6f73] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73]">{zh ? "查看商品" : "View listing"} <span aria-hidden="true">↗</span></a>}
    </div>
  </article>;
}
