"use client";

import type { ReactNode } from "react";
import { deriveMarketRead } from "@/lib/comparison/ranking";
import { highValueReviewReasons } from "@/lib/comparison/recommendation-policy";
import type { NormalizedListing } from "@/lib/schemas";
import { useLang } from "./i18n";

type Tone = "positive" | "review" | "neutral";
const tones = {
  positive: "text-[#20676a]",
  review: "text-[#896419]",
  neutral: "text-[#596961]",
};
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const conditionShort = { "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", Damaged: "DMG", Unknown: "—" };

function SignalTile({ label, value, note, foot, tone, children }: {
  label: string; value: string; note: string; foot: string; tone: Tone; children: ReactNode;
}) {
  return <div role="group" aria-label={label} data-tone={tone} className={`flex min-w-0 flex-col px-2.5 first:pl-0 last:pr-0 sm:px-5 ${tones[tone]}`}>
    <dt className="text-[11px] font-medium leading-4 text-[#59645f] sm:text-xs">{label}</dt>
    <dd className="mb-2 mt-1 flex flex-col gap-x-2 gap-y-0.5 sm:flex-row sm:flex-wrap sm:items-baseline">
      <span className="break-words text-lg font-semibold leading-tight tracking-[-0.03em] sm:text-2xl">{value}</span>
      {note && <span className="text-[11px] leading-4 text-[#64716a] sm:text-xs">{note}</span>}
    </dd>
    {children}
    <dd className="mt-2 min-h-8 text-[11px] leading-4 text-[#64716a] sm:min-h-4 sm:text-xs">{foot}</dd>
  </div>;
}

// The filled area is evidence coverage / the existing seller score, never a
// probability of authenticity or a predicted physical grade. Unknown is empty.
function EvidenceBar({ value, label }: { value: number | null; label: string }) {
  return <div className="mt-auto flex h-[3px] w-full max-w-[200px] gap-1" role={value === null ? undefined : "meter"}
    aria-label={label} aria-valuemin={value === null ? undefined : 0} aria-valuemax={value === null ? undefined : 100}
    aria-valuenow={value === null ? undefined : Math.round(value)}>
    {[0, 1, 2, 3].map(index => <span key={index} className="relative flex-1 overflow-hidden rounded-sm bg-current/10">
      <span aria-hidden="true" className="absolute inset-0 origin-left bg-current" style={{ transform: `scaleX(${value === null ? 0 : Math.max(0, Math.min(1, value / 25 - index))})` }} />
    </span>)}
  </div>;
}

export function ListingSignals({ listing, marketPrice }: { listing: NormalizedListing; marketPrice: number | null }) {
  const zh = useLang().lang === "zh";
  const preview = listing.imageKind === "listing_preview" || listing.imageKind === "catalog_reference";
  const photos = preview ? 0 : listing.evidence.photoCount;
  const evidenceKnown = !preview && (photos > 0 || listing.evidence.substantiveConditionNotes);
  const evidence = evidenceKnown ? listing.evidenceCompletenessScore : null;
  const evidenceLabel = evidence === null ? zh ? "实拍未核实" : "Photos unverified"
    : evidence >= 50 ? zh ? "资料较全" : "More evidence" : zh ? "资料较少" : "Limited evidence";
  const { feedbackPercentage: percent, feedbackCount: count } = listing.seller;
  const sellerKnown = count !== 0 && percent !== null && count !== null;
  const market = deriveMarketRead(listing, marketPrice);
  const conditionDiffers = listing.conditionCompatibilityScore === 0 && listing.claimedCondition !== "Unknown";
  const conditionTone: Tone = conditionDiffers ? "review" : evidence === null || listing.claimedCondition === "Unknown" ? "neutral" : evidence >= 50 ? "positive" : "review";
  const recordNeedsReview = highValueReviewReasons(listing).includes("seller_record");
  const sellerTone: Tone = !sellerKnown ? "neutral" : recordNeedsReview ? "review" : listing.sellerTrustScore >= 60 ? "positive" : "review";
  const priceTone: Tone = !market || !market.conditionMatched || Math.abs(market.delta) < 0.05 ? "neutral" : market.delta < 0 ? "positive" : "review";
  const delta = market ? Math.round(Math.abs(market.delta) * 100) : 0;
  const priceValue = market ? delta === 0 ? zh ? "接近参考价" : "Near reference" : `${market.delta < 0 ? "−" : "+"}${delta}%`
    : marketPrice === null || marketPrice <= 0 ? zh ? "暂无参考价" : "No reference" : zh ? "暂不可比" : "Not comparable";
  const priceNote = market && marketPrice !== null ? zh ? `标价对比 ${money(marketPrice)}` : `Item vs ${money(marketPrice)}`
    : !listing.costComplete ? zh ? "总费用未确认" : "Total unconfirmed" : zh ? "市场数据不足" : "Market data unavailable";
  return <dl aria-label={zh ? "商品概览" : "Listing signals"} className="mt-3 grid grid-cols-3 divide-x divide-[#dde3dc] border-y border-[#dde3dc] py-3 sm:py-2">
    <SignalTile label={zh ? "品相" : "Condition"} value={listing.claimedCondition === "Unknown" ? zh ? "未知" : "Unknown" : conditionShort[listing.claimedCondition]}
      note={conditionDiffers ? zh ? "品相不符" : "Condition mismatch" : zh ? "卖家标注" : "Seller claim"} foot={evidenceKnown ? `${photos} ${zh ? "张照片" : photos === 1 ? "photo" : "photos"} · ${evidenceLabel}` : evidenceLabel} tone={conditionTone}>
      <EvidenceBar value={evidence} label={zh ? "品相资料完整度" : "Condition evidence completeness"} />
    </SignalTile>
    <SignalTile label={zh ? "卖家记录" : "Seller record"} value={sellerKnown ? `${percent}%` : zh ? "未核实" : "Unverified"}
      note={sellerKnown ? zh ? "好评" : "Positive feedback" : count === 0 ? zh ? "暂无评价" : "No ratings yet" : ""}
      foot={count === null || count === 0 ? "" : `${zh ? `${count.toLocaleString()} 条评价` : `${count.toLocaleString()} ratings`}${recordNeedsReview ? zh ? " · 记录待核对" : " · Review record" : ""}`} tone={sellerTone}>
      <EvidenceBar value={sellerKnown ? listing.sellerTrustScore : null} label={zh ? "卖家记录评分" : "Seller record score"} />
    </SignalTile>
    <SignalTile label={zh ? "价格对比" : "Price vs market"} value={priceValue} note={priceNote}
      foot={market && !market.conditionMatched ? zh ? "NM 参考价" : "NM reference" : zh ? "仅比较商品标价" : "Item price only"} tone={priceTone}>
      <div aria-hidden="true" className="relative mt-auto h-[3px] w-full max-w-[200px] rounded-sm bg-current/10">
        <span className="absolute -top-1 bottom-[-4px] left-1/2 w-px bg-current/40" />
        {market && <span className="absolute -top-0.5 h-2.5 w-1.5 rounded-sm bg-current" style={{ left: `${Math.max(2, Math.min(96, 50 + market.delta * 45))}%` }} />}
      </div>
    </SignalTile>
  </dl>;
}
