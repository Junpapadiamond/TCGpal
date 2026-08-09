"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ListingPhoto } from "@/features/comparison/SellerPhotoGallery";
import {
  IconArrowUpRight,
  IconCardCheck,
  IconCaution,
  IconCheck,
  IconLink,
  IconPhotoProof,
  IconReceipt,
  IconSeal,
  IconTag,
} from "@/features/comparison/icons";
import { LanguageProvider, setLanguage, useLang } from "@/features/comparison/i18n";
import { buildVerdictCopy } from "@/features/comparison/verdict-copy";
import type { ComparisonSnapshot } from "@/lib/comparison/report-snapshot";
import type { ConditionClaim, NormalizedListing, RankedChoice } from "@/lib/schemas";
import { trackEvent } from "@/lib/analytics";
import {
  buildReceiptModel,
  buildReceiptRecheckPath,
  formatReceiptMoney,
  receiptListingCost,
} from "./receipt-model";

type ReceiptLang = "en" | "zh";

const chineseConditions: Record<ConditionClaim, string> = {
  "Near Mint": "近全新 (NM)",
  "Lightly Played": "轻度使用 (LP)",
  "Moderately Played": "中度使用 (MP)",
  "Heavily Played": "重度使用 (HP)",
  Damaged: "损坏",
  Unknown: "未知",
};

const chineseChoiceLabels: Record<RankedChoice["role"], string> = {
  best_value: "最优价值",
  lowest_landed_cost: "最低总价",
  safest_listing: "最稳妥选择",
  best_condition_evidence: "最完整证据",
};

const copy = {
  en: {
    home: "Lens TCG home",
    method: "Method",
    receipt: "Decision receipt",
    saved: "Saved comparison",
    immutable: "This receipt preserves the evidence and recommendation from this check.",
    checked: "Checked",
    expires: "Available until",
    recheck: "Re-check live",
    copy: "Copy receipt",
    copied: "Link copied",
    confirmed: "Confirmed card",
    identity: "Exact card",
    requested: "Requested condition",
    ourPick: "Our pick",
    secondLook: "Second look",
    onlyOne: "Only one comparable listing survived this check.",
    noBuy: "No trustworthy buy",
    inspect: "Inspect first",
    why: "Why this is the pick",
    uncertainty: "What remains uncertain",
    conditionPhotos: "Condition photos",
    seller: "Seller record",
    completePrice: "Complete price",
    item: "Item",
    shipping: "shipping",
    tax: "estimated tax",
    preTax: "pre-tax total",
    landed: "estimated landed total",
    sellerClaim: "Condition is still the seller’s claim. Lens TCG counts available photos but does not grade or authenticate their contents.",
    frontBack: "Front and back explicitly documented",
    closeups: "Closeups explicitly documented",
    surface: "Surface explicitly documented",
    photoContentUnknown: "Photo contents were not independently inspected",
    photos: (count: number) => `${count} seller photo${count === 1 ? "" : "s"} available`,
    feedback: (percentage: number, count: number | null) => `${percentage}% positive${count === null ? "" : ` across ${count.toLocaleString("en-US")} ratings`}`,
    sellerUnverified: "Seller history unavailable — neutrally unverified",
    returns: "Returns accepted",
    noReturns: "Returns not accepted",
    returnsUnknown: "Return policy unverified",
    buyerProtection: "Buyer protection reported",
    exactPassed: "Exact-print identity gate passed",
    exactReview: "Identity needs a final visual check on the live listing",
    sourceEvidence: "Source evidence",
    open: "Open listing",
    compared: (eligible: number) => `${eligible} comparable listing${eligible === 1 ? "" : "s"} survived`,
    excluded: (count: number) => `${count} listing${count === 1 ? "" : "s"} excluded`,
    sources: "Sources and boundaries",
    sourceChecked: "Source checked",
    warnings: "Warnings",
    exclusions: "Why others were excluded",
    oldReceipt: "Prices and availability may have changed. Re-checking creates a new receipt; this one does not change.",
    shareNote: "Share this receipt when you want another collector to audit the same evidence.",
    newSearch: "Check another card",
  },
  zh: {
    home: "Lens TCG 首页",
    method: "方法",
    receipt: "决策凭证",
    saved: "已保存的比较",
    immutable: "这份凭证保留了本次检查时的证据与推荐，不会随之后的检查改变。",
    checked: "检查时间",
    expires: "有效期至",
    recheck: "重新检查在售商品",
    copy: "复制凭证",
    copied: "链接已复制",
    confirmed: "已确认卡片",
    identity: "确切版本",
    requested: "最低卖家声明卡况",
    ourPick: "首选",
    secondLook: "第二选择",
    onlyOne: "本次检查只有一条商品通过可比性筛选。",
    noBuy: "暂无可信购买建议",
    inspect: "请先核对",
    why: "为什么选择它",
    uncertainty: "仍未确认的部分",
    conditionPhotos: "卡况照片",
    seller: "卖家记录",
    completePrice: "完整价格",
    item: "商品",
    shipping: "运费",
    tax: "预估税费",
    preTax: "税前合计",
    landed: "预估到手总价",
    sellerClaim: "卡况仍是卖家的声明。Lens TCG 只统计可用照片，不会对照片内容评级或鉴定真伪。",
    frontBack: "正反面已有明确材料",
    closeups: "细节近照已有明确材料",
    surface: "表面材料已有明确说明",
    photoContentUnknown: "照片内容未经独立检查",
    photos: (count: number) => `有 ${count} 张卖家照片`,
    feedback: (percentage: number, count: number | null) => `${percentage}% 好评${count === null ? "" : ` · ${count.toLocaleString("zh-CN")} 条评价`}`,
    sellerUnverified: "没有卖家历史数据——保持中性，标为未核实",
    returns: "接受退货",
    noReturns: "不接受退货",
    returnsUnknown: "退货政策未核实",
    buyerProtection: "来源显示有买家保障",
    exactPassed: "已通过确切版本识别门槛",
    exactReview: "仍需在商品页做最后的卡图核对",
    sourceEvidence: "来源证据",
    open: "打开商品",
    compared: (eligible: number) => `${eligible} 条可比商品通过筛选`,
    excluded: (count: number) => `${count} 条商品被排除`,
    sources: "来源与边界",
    sourceChecked: "已检查来源",
    warnings: "警告",
    exclusions: "其他商品被排除的原因",
    oldReceipt: "价格和库存可能已经改变。重新检查会创建新凭证；当前凭证不会变化。",
    shareNote: "需要其他收藏者复核时，分享这份凭证即可查看同一组证据。",
    newSearch: "检查另一张卡",
  },
};

export function classifyReceiptReferrer(referrer: string, origin: string) {
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    if (url.origin === origin) return "direct";
    if (url.hostname.includes("reddit.com")) return "reddit";
    if (url.hostname.includes("discord.com") || url.hostname.includes("discordapp.com")) return "discord";
  } catch {
    return "other";
  }
  return "other";
}

export function formatReceiptCondition(condition: ConditionClaim, lang: ReceiptLang) {
  return lang === "zh" ? chineseConditions[condition] : condition;
}

export function formatReceiptChoiceLabel(choice: Pick<RankedChoice, "role" | "label">, lang: ReceiptLang) {
  return lang === "zh" ? chineseChoiceLabels[choice.role] : choice.label;
}

export function formatReceiptIdentityNote(note: string | undefined) {
  if (!note || /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(note)) return null;
  return note;
}

export function ReceiptPageClient({ snapshot }: { snapshot: ComparisonSnapshot }) {
  return (
    <LanguageProvider>
      <ReceiptPageContent snapshot={snapshot} />
    </LanguageProvider>
  );
}

function ReceiptPageContent({ snapshot }: { snapshot: ComparisonSnapshot }) {
  const { lang } = useLang();
  const text = copy[lang];
  const model = useMemo(() => buildReceiptModel(snapshot), [snapshot]);
  const recheckPath = buildReceiptRecheckPath(snapshot);
  const [copied, setCopied] = useState(false);
  const [cardImageFailed, setCardImageFailed] = useState(false);

  useEffect(() => {
    trackEvent("receipt_viewed", {
      referrer_class: classifyReceiptReferrer(document.referrer, window.location.origin),
    });
  }, []);

  async function copyReceipt() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      trackEvent("receipt_link_copied");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const checkedAt = formatDateTime(snapshot.savedAt, lang);
  const expiresAt = formatDate(snapshot.expiresAt, lang);

  return (
    <main className="min-h-screen bg-[#f4f7f3] text-[#24312f]">
      <header className="border-b border-[#d6ded5] bg-[#fcfbf6]">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" aria-label={text.home} className="shrink-0">
            <Image src="/lens-logo-horizontal.svg" alt="Lens TCG" width={112} height={32} priority />
          </Link>
          <div className="flex items-center gap-3 text-xs font-black text-[#64736c]">
            <a className="hidden hover:text-[#2f6f73] sm:inline" href="/method">{text.method}</a>
            <div role="group" aria-label={lang === "zh" ? "切换语言" : "Switch language"} className="inline-flex rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-0.5">
              <button type="button" aria-pressed={lang === "en"} onClick={() => setLanguage("en")} className={`rounded px-2.5 py-1 ${lang === "en" ? "bg-[#2f6f73] text-[#fcfbf6]" : "text-[#52635c]"}`}>EN</button>
              <button type="button" aria-pressed={lang === "zh"} onClick={() => setLanguage("zh")} className={`rounded px-2.5 py-1 ${lang === "zh" ? "bg-[#2f6f73] text-[#fcfbf6]" : "text-[#52635c]"}`}>中文</button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex flex-col gap-4 border-b border-[#c9d7ce] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow"><IconReceipt className="h-4 w-4" />{text.saved}</p>
            <h1 className="mt-2 font-serif text-3xl font-black tracking-[-0.03em] sm:text-4xl">{text.receipt}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64736c]">{text.immutable}</p>
            <p className="mt-2 font-mono text-xs font-bold text-[#64736c]">
              {text.checked} {checkedAt} · {text.expires} {expiresAt}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyReceipt()} className="secondary-button min-h-11">
              <IconLink className="h-4 w-4" />{copied ? text.copied : text.copy}
            </button>
            <a href={recheckPath} onClick={() => trackEvent("receipt_recheck_clicked")} className="primary-button min-h-11">
              {text.recheck}<IconArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        {model.card && (
          <section aria-labelledby="confirmed-card-heading" className="grid gap-5 border-b border-[#d6ded5] py-6 md:grid-cols-[150px_minmax(0,1fr)] md:items-center">
            <div className="relative aspect-[2.5/3.5] w-[132px] overflow-hidden rounded-lg border border-[#c9d7ce] bg-[#e7efe8] shadow-[0_5px_16px_rgba(36,49,47,0.08)]">
              {model.card.imageUrl && !cardImageFailed ? (
                <Image src={model.card.imageUrl} alt={`${model.card.name} ${model.card.cardNumber}`} fill sizes="132px" className="object-contain" loading="eager" onError={() => setCardImageFailed(true)} />
              ) : (
                <div className="absolute inset-0 grid place-items-center px-3 text-center text-xs font-black text-[#64736c]">{model.card.cardNumber}</div>
              )}
            </div>
            <div>
              <p className="eyebrow"><IconCardCheck className="h-4 w-4" />{text.confirmed}</p>
              <h2 id="confirmed-card-heading" className="mt-2 font-serif text-3xl font-black tracking-[-0.025em]">{model.card.name}</h2>
              <p className="mt-2 text-sm font-bold text-[#52635c]">
                {model.card.setName} · {model.card.setCode} · #{model.card.cardNumber} · {model.card.language}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#c9d7ce] bg-[#e7efe8] px-2.5 py-1.5 text-[#2f6f73]"><IconCheck className="h-3.5 w-3.5" />{text.identity}</span>
                <span className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] px-2.5 py-1.5 text-[#52635c]">{text.requested}: {formatReceiptCondition(snapshot.report.request.buyer.desiredCondition, lang)}</span>
              </div>
            </div>
          </section>
        )}

        <section aria-labelledby="recommendation-heading" className="py-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow"><IconCheck className="h-4 w-4" />{model.primary ? text.compared(model.eligibleCount) : model.outcome === "inspect_first" ? text.inspect : text.noBuy}</p>
              <h2 id="recommendation-heading" className="mt-2 font-serif text-2xl font-black sm:text-3xl">
                {model.primary ? formatReceiptChoiceLabel(model.primary.choice, lang) : snapshot.report.narrative.summary}
              </h2>
            </div>
            {model.excluded.length > 0 && <span className="text-xs font-bold text-[#7a8982]">{text.excluded(model.excluded.length)}</span>}
          </div>

          {model.primary ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <ReceiptListingCard
                listing={model.primary.listing}
                label={text.ourPick}
                primary
                choice={model.primary.choice}
                alternatives={model.alternative ? [model.alternative] : []}
                marketPrice={model.card?.marketMid ?? null}
                lang={lang}
              />
              {model.alternative ? (
                <ReceiptListingCard
                  listing={model.alternative}
                  label={text.secondLook}
                  primary={false}
                  choice={null}
                  alternatives={[]}
                  marketPrice={model.card?.marketMid ?? null}
                  lang={lang}
                />
              ) : (
                <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-[#c9d7ce] bg-[#f7f9f5] p-6 text-center text-sm font-bold leading-6 text-[#64736c]">{text.onlyOne}</div>
              )}
            </div>
          ) : model.inspectListing ? (
            <div className="mt-5 max-w-2xl"><ReceiptListingCard listing={model.inspectListing} label={text.inspect} primary choice={null} alternatives={[]} marketPrice={model.card?.marketMid ?? null} lang={lang} /></div>
          ) : (
            <div className="mt-5 rounded-xl border border-[#e2c879] bg-[#fff8dc] p-5 text-sm leading-6 text-[#6f5a22]">
              <strong>{text.noBuy}.</strong> {snapshot.report.abstention?.reason ?? snapshot.report.narrative.summary}
            </div>
          )}
        </section>

        <section aria-label={text.uncertainty} className="rounded-xl border border-[#e2c879] bg-[#fff8dc] p-5">
          <div className="flex gap-3">
            <IconCaution className="mt-0.5 h-5 w-5 shrink-0 text-[#8d6032]" />
            <div>
              <h2 className="font-serif text-xl font-black text-[#6f5a22]">{text.uncertainty}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#6f5a22]">{text.sellerClaim}</p>
              <p className="mt-2 text-xs font-bold leading-5 text-[#8d6032]">{text.oldReceipt}</p>
            </div>
          </div>
        </section>

        <details className="mt-4 rounded-xl border border-[#d6ded5] bg-[#fcfbf6] p-5">
          <summary className="cursor-pointer font-serif text-lg font-black text-[#24312f]">{text.sources}</summary>
          <div className="mt-4 grid gap-5 text-sm leading-6 text-[#52635c] md:grid-cols-2">
            <div>
              <h3 className="font-black text-[#24312f]">{text.sourceChecked}</h3>
              <ul className="mt-2 space-y-2">
                {snapshot.report.platforms.map((platform) => <li key={platform.id}>{platform.label}: {platform.status} · {platform.count}</li>)}
              </ul>
              {snapshot.report.warnings.length > 0 && <><h3 className="mt-4 font-black text-[#24312f]">{text.warnings}</h3><ul className="mt-2 list-disc pl-5">{snapshot.report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></>}
            </div>
            <div>
              <h3 className="font-black text-[#24312f]">{text.exclusions}</h3>
              {model.excluded.length > 0 ? <ul className="mt-2 space-y-3">{model.excluded.map((listing) => <li key={listing.id}><strong>{listing.title}</strong>: {listing.exclusionReasons.join(" ")}</li>)}</ul> : <p className="mt-2">—</p>}
            </div>
          </div>
        </details>

        <footer className="mt-8 flex flex-col gap-3 border-t border-[#c9d7ce] py-6 text-sm text-[#64736c] sm:flex-row sm:items-center sm:justify-between">
          <p>{text.shareNote}</p>
          <div className="flex gap-4 font-black text-[#2f6f73]"><Link href="/">{text.newSearch}</Link><Link href="/method">{text.method}</Link></div>
        </footer>
      </div>
    </main>
  );
}

function ReceiptListingCard({
  listing,
  label,
  primary,
  choice,
  alternatives,
  marketPrice,
  lang,
}: {
  listing: NormalizedListing;
  label: string;
  primary: boolean;
  choice: RankedChoice | null;
  alternatives: NormalizedListing[];
  marketPrice: number | null;
  lang: ReceiptLang;
}) {
  const text = copy[lang];
  const total = receiptListingCost(listing);
  const verdict = choice ? buildVerdictCopy({ listing, choice, alternatives, marketPrice, lang }) : null;
  const sellerFacts = sellerSummary(listing, lang);
  const priceFacts = priceSummary(listing, lang);

  return (
    <article className={`rounded-xl bg-[#fcfbf6] p-4 sm:p-5 ${primary ? "border-2 border-[#2f6f73] shadow-[0_5px_16px_rgba(36,49,47,0.08)]" : "border border-[#c9d7ce]"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${primary ? "bg-[#2f6f73] text-[#fcfbf6]" : "border border-[#c9d7ce] bg-[#e7efe8] text-[#2f6f73]"}`}>{label}</span>
        <span className="font-mono text-xl font-black text-[#24312f]">{formatReceiptMoney(total)}</span>
      </div>
      <div className="mt-4 grid grid-cols-[72px_minmax(0,1fr)] gap-4">
        <ListingPhoto listing={listing} />
        <div className="min-w-0">
          <h3 className="text-base font-black leading-snug text-[#24312f]">{listing.title}</h3>
          <p className="mt-1 text-xs font-bold text-[#64736c]">{listing.marketplace} · {formatReceiptCondition(listing.claimedCondition, lang)}</p>
        </div>
      </div>

      {verdict && (
        <div className="mt-4 rounded-lg border border-[#c9d7ce] bg-[#e7efe8] p-3 text-sm leading-6 text-[#24585c]">
          <p><strong>{text.why}:</strong> {verdict.why}</p>
          <p className="mt-1"><strong>{text.uncertainty}:</strong> {verdict.catch}</p>
        </div>
      )}

      <div className="mt-4 divide-y divide-[#e4ebe3] border-y border-[#e4ebe3]">
        <EvidenceRow icon={<IconCardCheck className="h-4 w-4" />} label={text.identity} value={(listing.printMatch === "exact" || listing.printMatch === "compatible") ? text.exactPassed : text.exactReview} note={formatReceiptIdentityNote(listing.printMatchReasons?.[0] ?? listing.matchReasons[0])} />
        <EvidenceRow icon={<IconPhotoProof className="h-4 w-4" />} label={text.conditionPhotos} value={text.photos(listing.evidence.photoCount)} note={conditionEvidenceSummary(listing, lang)} />
        <EvidenceRow icon={<IconSeal className="h-4 w-4" />} label={text.seller} value={sellerFacts.value} note={sellerFacts.note} />
        <EvidenceRow icon={<IconTag className="h-4 w-4" />} label={text.completePrice} value={priceFacts.value} note={priceFacts.note} />
      </div>

      <div className="mt-4 flex justify-end">
        {listing.url ? <a href={listing.url} target="_blank" rel="noreferrer" onClick={() => trackEvent("choice_opened", { choice_role: primary ? "best_value" : "candidate", marketplace: listing.marketplace, demo_mode: listing.demo })} className={primary ? "primary-button min-h-11" : "secondary-button min-h-11"}>{text.open}<IconArrowUpRight className="h-4 w-4" /></a> : null}
      </div>
    </article>
  );
}

function EvidenceRow({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string | null }) {
  return (
    <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 py-3 text-sm">
      <span className="mt-0.5 text-[#2f6f73]">{icon}</span>
      <div><p><span className="font-black text-[#24312f]">{label}:</span> <span className="font-semibold text-[#52635c]">{value}</span></p>{note && <p className="mt-1 text-xs leading-5 text-[#7a8982]">{note}</p>}</div>
    </div>
  );
}

function conditionEvidenceSummary(listing: NormalizedListing, lang: ReceiptLang) {
  const text = copy[lang];
  const facts = [
    listing.evidence.frontBackExplicit && text.frontBack,
    listing.evidence.closeupsExplicit && text.closeups,
    listing.evidence.surfaceExplicit && text.surface,
  ].filter(Boolean) as string[];
  return facts.length > 0 ? facts.join(" · ") : text.photoContentUnknown;
}

function sellerSummary(listing: NormalizedListing, lang: ReceiptLang) {
  const text = copy[lang];
  const percentage = listing.seller.feedbackPercentage;
  const value = percentage === null ? text.sellerUnverified : text.feedback(percentage, listing.seller.feedbackCount);
  const returns = listing.seller.returnsAccepted === true ? text.returns : listing.seller.returnsAccepted === false ? text.noReturns : text.returnsUnknown;
  return { value, note: [returns, listing.seller.buyerProtection === true ? text.buyerProtection : null].filter(Boolean).join(" · ") };
}

function priceSummary(listing: NormalizedListing, lang: ReceiptLang) {
  const text = copy[lang];
  const totalLabel = listing.estimatedTax === null ? text.preTax : text.landed;
  const shipping = listing.shipping === null ? "?" : formatReceiptMoney(listing.shipping);
  const equation = `${text.item} ${formatReceiptMoney(listing.price)} + ${text.shipping} ${shipping}`;
  const tax = listing.estimatedTax === null ? null : `${text.tax} ${formatReceiptMoney(listing.estimatedTax)}`;
  return { value: `${formatReceiptMoney(receiptListingCost(listing))} ${totalLabel}`, note: [equation, tax].filter(Boolean).join(" · ") };
}

function formatDateTime(value: string, lang: ReceiptLang) {
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDate(value: string, lang: ReceiptLang) {
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium" }).format(new Date(value));
}
