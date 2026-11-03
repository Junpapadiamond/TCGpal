"use client";

import type { ReactNode } from "react";
import { deriveMarketRead } from "@/lib/comparison/ranking";
import type { NormalizedListing } from "@/lib/schemas";
import { useLang } from "./i18n";

type Tone = "positive" | "review" | "neutral";
const tones = {
  positive: "border-[#cfddd5] bg-[#f2f7f2] text-[#2b6667]",
  review: "border-[#e4d9bd] bg-[#fbf7ec] text-[#806224]",
  neutral: "border-[#dce1d9] bg-[#f5f5f0] text-[#596961]",
};
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const conditionShort = { "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", Damaged: "DMG", Unknown: "—" };

function SignalTile({ label, value, note, foot, tone, children }: {
  label: string; value: string; note: string; foot: string; tone: Tone; children: ReactNode;
}) {
  return <div role="group" aria-label={label} data-tone={tone} className={`flex min-w-0 flex-col rounded-lg border px-2.5 py-3 sm:px-4 ${tones[tone]}`}>
    <dt className="text-[11px] font-semibold leading-4 sm:text-xs">{label}</dt>
    <dd className="mt-2 break-words text-base font-bold leading-tight tracking-tight sm:text-xl">{value}</dd>
    <dd className="mt-1 min-h-8 text-[10px] leading-4 sm:text-xs">{note}</dd>
    {children}
    <dd className="mt-2 text-[10px] leading-4 sm:text-[11px]">{foot}</dd>
  </div>;
}

// The filled area is evidence coverage / the existing seller score, never a
// probability of authenticity or a predicted physical grade. Unknown is empty.
function EvidenceBar({ value, label }: { value: number | null; label: string }) {
  return <div className="mt-auto flex h-1.5 gap-1" role={value === null ? undefined : "meter"}
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
  const conditionTone: Tone = evidence === null || listing.claimedCondition === "Unknown" ? "neutral" : evidence >= 50 ? "positive" : "review";
  const sellerTone: Tone = !sellerKnown ? "neutral" : listing.sellerTrustScore >= 60 ? "positive" : "review";
  const priceTone: Tone = !market || !market.conditionMatched || Math.abs(market.delta) < 0.05 ? "neutral" : market.delta < 0 ? "positive" : "review";
  const delta = market ? Math.round(Math.abs(market.delta) * 100) : 0;
  const priceValue = market ? delta === 0 ? zh ? "接近参考价" : "Near reference" : `${market.delta < 0 ? "−" : "+"}${delta}%`
    : marketPrice === null || marketPrice <= 0 ? zh ? "暂无参考价" : "No reference" : zh ? "暂不可比" : "Not comparable";
  const priceNote = market && marketPrice !== null ? zh ? `标价对比 ${money(marketPrice)}` : `Item vs ${money(marketPrice)}`
    : !listing.costComplete ? zh ? "总费用未确认" : "Total unconfirmed" : zh ? "市场数据不足" : "Market data unavailable";
  return <dl aria-label={zh ? "商品概览" : "Listing signals"} className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
    <SignalTile label={zh ? "品相" : "Condition"} value={listing.claimedCondition === "Unknown" ? zh ? "未知" : "Unknown" : conditionShort[listing.claimedCondition]}
      note={zh ? "卖家标注" : "Seller claim"} foot={evidenceKnown ? `${photos} ${zh ? "张照片" : photos === 1 ? "photo" : "photos"} · ${evidenceLabel}` : evidenceLabel} tone={conditionTone}>
      <EvidenceBar value={evidence} label={zh ? "品相资料完整度" : "Condition evidence completeness"} />
    </SignalTile>
    <SignalTile label={zh ? "卖家记录" : "Seller record"} value={sellerKnown ? `${percent}%` : zh ? "未核实" : "Unverified"}
      note={sellerKnown ? zh ? "好评" : "Positive feedback" : count === 0 ? zh ? "暂无评价" : "No ratings yet" : ""}
      foot={count === null || count === 0 ? "" : zh ? `${count.toLocaleString()} 条评价` : `${count.toLocaleString()} ratings`} tone={sellerTone}>
      <EvidenceBar value={sellerKnown ? listing.sellerTrustScore : null} label={zh ? "卖家记录评分" : "Seller record score"} />
    </SignalTile>
    <SignalTile label={zh ? "价格对比" : "Price vs market"} value={priceValue} note={priceNote}
      foot={market && !market.conditionMatched ? zh ? "NM 参考价" : "NM reference" : zh ? "仅比较商品标价" : "Item price only"} tone={priceTone}>
      <div aria-hidden="true" className="relative mt-auto h-1.5 rounded-sm bg-current/10">
        <span className="absolute -top-1 bottom-[-4px] left-1/2 w-px bg-current/40" />
        {market && <span className="absolute -top-0.5 h-2.5 w-1.5 rounded-sm bg-current" style={{ left: `${Math.max(2, Math.min(96, 50 + market.delta * 45))}%` }} />}
      </div>
    </SignalTile>
  </dl>;
}
