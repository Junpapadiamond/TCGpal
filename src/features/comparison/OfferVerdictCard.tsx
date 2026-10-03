"use client";

import type { NormalizedListing } from "@/lib/schemas";
import { ListingPhoto } from "./SellerPhotoGallery";
import { useLang, useT } from "./i18n";
import { buildOfferVerdictCopy } from "./offer-verdict-copy";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function OfferVerdictCard({ listing, candidates, attribution, marketPrice = null }: {
  listing: NormalizedListing;
  candidates: NormalizedListing[];
  attribution: string;
  marketPrice?: number | null;
}) {
  const { lang } = useLang();
  const t = useT();
  const zh = lang === "zh";
  const verdict = buildOfferVerdictCopy(listing, candidates, lang, marketPrice);
  const displayComplete = listing.costComplete && verdict.assessment.missingCharges.length === 0;
  const total = displayComplete ? listing.estimatedLandedCost ?? listing.preTaxTotal : verdict.assessment.knownSubtotal;
  const itemOnly = !displayComplete && total === listing.price;
  const versionNeedsChecking = !verdict.assessment.identityConfirmed || verdict.assessment.issues.some((issue) => issue.code === "identity_unverified");
  const conditionDiffers = verdict.assessment.issues.some((issue) => issue.category === "condition" && issue.code !== "condition_unstated");
  const knownSeller = listing.seller.feedbackPercentage !== null && listing.seller.feedbackCount !== null;
  const preview = listing.imageKind === "listing_preview" || listing.imageKind === "catalog_reference";
  return <article aria-label={`${listing.marketplace} ${zh ? "判断" : "verdict"}: ${listing.title}`} className="min-w-0 py-4">
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-4">
      <ListingPhoto listing={listing} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <p className="min-w-0 max-w-[48ch] flex-1 break-words text-sm font-bold leading-6 text-[#24312f]">{listing.title}</p>
          <div className="text-right tabular-nums">
            <p className="text-xl font-black text-[#24312f]">{money(total)}</p>
            <p className="text-[10px] font-semibold text-[#64736c]">{displayComplete
              ? listing.estimatedTax === null ? zh ? "税前总价" : "pre-tax total" : zh ? "预估到手价" : "est. landed"
              : itemOnly ? zh ? "商品价 · 总价待确认" : "item price · total unconfirmed" : zh ? "已知费用 · 总价待确认" : "known costs · total unconfirmed"}</p>
          </div>
        </div>
        {total !== listing.price && <p className="mt-1 text-xs leading-5 text-[#52635c]">{zh ? "商品价" : "Item price"} <span>{money(listing.price)}</span></p>}
        <p className="text-xs leading-5 text-[#52635c]">{listing.claimedCondition === "Unknown" ? zh ? "卖家没标品相" : "Condition not stated" : `${zh ? "卖家标注" : "Seller claims"}: ${t.conditions[listing.claimedCondition]}`}</p>
        <p className="text-xs leading-5 text-[#52635c]">{zh ? "运费" : "Shipping"}: {listing.shipping === null ? zh ? "未知" : "unknown" : money(listing.shipping)} · {zh ? "买家手续费" : "Buyer fees"}: {listing.buyerFee === null ? zh ? "未知" : "unknown" : money(listing.buyerFee)}</p>
        {(versionNeedsChecking || conditionDiffers || verdict.assessment.priceNeedsReview) && <p className="mt-1 text-xs font-bold leading-5 text-[#806521]">{[
          versionNeedsChecking ? zh ? "版本待核对" : "Version needs checking" : null,
          conditionDiffers ? zh ? "品相不符合当前要求" : "Condition differs from your request" : null,
          verdict.assessment.priceNeedsReview ? zh ? "价格异常，请核对商品" : "Unusual price; inspect the item" : null,
        ].filter(Boolean).join(" · ")}</p>}
      </div>
    </div>
    <div className={`mt-3 rounded-md border px-3 py-2.5 ${verdict.tone === "positive" ? "border-[#c9d7ce] bg-[#e7efe8]" : verdict.tone === "review" ? "border-[#dfd6b6] bg-[#faf5e5]" : "border-[#d6ded5] bg-[#f1f3ee]"}`}>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-5 text-[#24312f]"><span className="text-[10px] font-black uppercase tracking-wide text-[#64736c]">{zh ? "判断" : "Verdict"}</span><strong>{verdict.label}</strong></p>
      <p className="mt-1 text-xs leading-5 text-[#52635c]">{verdict.why}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[#52635c]">{verdict.nextStep}</p>
    </div>
    <p className="mt-2 text-xs leading-5 text-[#64736c]">{zh ? `卡片匹配置信度：${({ high: "高", medium: "中", low: "低" })[listing.matchConfidence]}` : `Card-match confidence: ${listing.matchConfidence}`}</p>
    <p className="mt-2 text-xs leading-5 text-[#64736c]">{knownSeller
      ? `${listing.seller.feedbackPercentage}% ${zh ? "好评" : "positive"} · ${listing.seller.feedbackCount} ${zh ? "条评价" : "ratings"}`
      : zh ? "卖家记录未核实" : "Seller record unverified"} · {preview || listing.evidence.photoCount === 0
        ? zh ? "完整品相实拍未核实" : "Full condition photos unverified"
        : zh ? `${listing.evidence.photoCount} 张实物照片可核对` : `${listing.evidence.photoCount} item-specific photos listed`}</p>
    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
      <p className="text-[11px] leading-5 text-[#64736c]">{attribution} · <time dateTime={listing.observedAt}>{new Date(listing.observedAt).toLocaleString(zh ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time></p>
      {listing.url && <a href={listing.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs font-bold text-[#2f6f73] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73]">{zh ? "查看商品" : "View listing"} <span aria-hidden="true">↗</span></a>}
    </div>
  </article>;
}
