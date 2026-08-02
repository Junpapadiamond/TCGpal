"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const copy = {
  en: {
    eyebrow: "Method & evidence contract",
    title: "How Lens TCG compares listings",
    intro: "Lens TCG helps a buyer who already knows the card decide which active raw-single listing is best supported — or whether the available evidence is too weak to recommend one.",
    back: "Compare a card",
    sections: [
      ["1. Confirm the exact print", "Catalog identity comes first. Name-only searches pause for confirmation; an explicit name and collector number can auto-confirm. Same-number artwork variants and reprints are kept separate whenever the catalog can prove that distinction."],
      ["2. Check bounded sources", "eBay Browse supplies active seller listings. TCGCSV/TCGplayer supplies an aggregate market reference only — it is never presented as a seller listing. A user-pasted public HTTPS listing may be fetched once within the stated access limits. Other sources remain manual checks until an approved provider is connected."],
      ["What the market reference means", "The reference is an item-only aggregate market price for the confirmed print and seller-stated condition context when comparable. Lens TCG compares item price to that item-only reference. Shipping and estimated tax remain visible in the separate checkout-cost breakdown; they are not used to manufacture an above-market warning."],
      ["3. Calculate comparable checkout cost", "Comparable cost is item price + stated shipping. When the buyer supplies a tax rate or ZIP-derived estimate, estimated tax is applied to item + shipping. If tax is unknown, Lens TCG says pre-tax total. If shipping is unknown, the listing cannot win the Cheapest or Best Value recommendation."],
      ["4. Rank by the chosen lens", "Best Value combines item-price position, condition compatibility, seller-track-record signals, and reviewable listing evidence. Cheapest uses comparable checkout cost. Safest emphasizes seller history and evidence. Best-documented emphasizes item-specific photos and explicit details. These lenses are independent and may select the same listing."],
      ["Why listings are excluded", "The receipt lists excluded rows and their reasons. Common causes include the wrong print, an unsupported condition, unknown shipping, non-USD pricing, inactive inventory, slabs or lots, novelty/proxy language, or a price far below the exact-print reference without enough identity proof."],
      ["What Lens TCG does not do", "Lens TCG does not grade cards from photos, authenticate cards, detect counterfeits, predict prices, claim unverified sold history, or call a seller a scam. Marketplace condition remains the seller’s claim. Missing seller data is labeled unverified, not automatically risky."],
      ["Saved receipts and privacy", "A stable receipt is an immutable 30-day snapshot, not a promise that the listing is still available. It shows when the comparison was saved and offers a live refresh. Lens TCG only creates these receipts for server-verified card searches, removes the buyer ZIP, and never publishes pasted or manually entered listing facts through this route."],
      ["Freshness, failures, and abstention", "Every report carries an observation time, source status, assumptions, exclusions, and warnings. TCGplayer feed freshness is shown and flagged when stale. Source failures remain visible. When no listing has compatible identity, condition, and complete cost, Lens TCG returns Next Moves instead of demo inventory or a guessed recommendation."],
    ],
  },
  zh: {
    eyebrow: "方法与证据契约",
    title: "Lens TCG 如何比较商品",
    intro: "Lens TCG 面向已经知道要买哪张卡的买家：先确认确切卡图，再比较未评级单卡的在售商品；证据不足时会明确不做推荐。",
    back: "开始比较卡片",
    sections: [
      ["1. 先确认确切版本", "系统先核对卡片目录。只输入名称时会暂停并请你确认；名称加收藏编号足够明确时可自动确认。只要目录能够证明，同编号的不同卡图与再版会保持分开。"],
      ["2. 查询有边界的来源", "eBay Browse 提供真实在售商品。TCGCSV / TCGplayer 只提供汇总市场参考，绝不会伪装成卖家商品。用户主动贴入的公开 HTTPS 商品链接可在既定边界内读取一次；其他来源在接入获批供应商前只作为手动检查。"],
      ["市场参考价代表什么", "参考价是已确认版本在可比品相语境下的商品本身汇总价格，不含运费与税。Lens TCG 只拿商品标价与这项参考价比较；运费和预估税会在结账成本明细中单独列出，不会被用来制造“高于市场”的警告。"],
      ["3. 计算可比结账成本", "可比成本等于商品标价加卖家所列运费。买家提供税率或可推算税率的邮编时，预估税会按商品加运费计算。税未知时显示“税前合计”；运费未知时，该商品不能赢得“最便宜”或“最划算”。"],
      ["4. 按所选角度排序", "“最划算”综合商品价格位置、品相匹配、卖家记录与可复核证据；“最便宜”看可比结账成本；“最稳妥”强调卖家历史与证据；“证据最足”强调实物照片和明确细节。各角度独立计算，也可能选中同一条商品。"],
      ["为什么商品会被排除", "决策凭据会列出被排除的商品及具体原因。常见原因包括错版、品相不符、运费未知、非美元、已下架、评级卡或卡组、定制／复制品措辞，或在缺少版本证据时价格远低于确切版本参考。"],
      ["Lens TCG 不做什么", "Lens TCG 不根据照片评级、不提供鉴真或仿品检测、不预测价格、不声称未经验证的成交记录，也不会把卖家称为骗子。品相仍是卖家声明；缺少卖家资料会标为“信息不足”，而不是自动判为高风险。"],
      ["保存凭据与隐私", "稳定凭据是一份保留 30 天的不可变快照，不代表商品仍然在售。页面会显示保存时间并提供重新查询实时商品的按钮。Lens TCG 只为服务器已验证的纯卡片搜索建立凭据，会移除买家邮编，也不会通过这条路径公开贴入或手动填写的商品资料。"],
      ["时效、失败与不做推荐", "每份报告都会显示观察时间、来源状态、假设、排除项与警告。TCGplayer 数据会显示日期，过旧时会提醒。来源失败不会被隐藏。当没有同时满足版本、品相与完整成本的商品时，系统会给出下一步，而不是用示例库存或猜测凑出推荐。"],
    ],
  },
} as const;

export function MethodPageClient() {
  const [lang, setLang] = useState<keyof typeof copy>("en");
  const t = copy[lang];
  return (
    <main className="min-h-screen bg-[#f4f7f3] text-[#24312f]">
      <header className="border-b border-[#d6ded5] bg-[#fcfbf6]">
        <div className="mx-auto flex max-w-[1040px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Lens TCG home"><Image src="/lens-logo-horizontal.svg" alt="Lens TCG" width={140} height={40} preload /></Link>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-0.5" role="group" aria-label="Switch language">
              {(["en", "zh"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={lang === value} onClick={() => setLang(value)} className={`rounded px-3 py-1.5 text-xs font-black ${lang === value ? "bg-[#2f6f73] text-[#fcfbf6]" : "text-[#52635c]"}`}>{value === "en" ? "EN" : "中文"}</button>
              ))}
            </div>
            <Link className="secondary-button" href="/">{t.back}</Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1040px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <section className="max-w-3xl">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="mt-3 font-serif text-4xl font-black leading-tight text-[#2f6f73] sm:text-5xl">{t.title}</h1>
          <p className="mt-5 text-lg leading-8 text-[#52635c]">{t.intro}</p>
        </section>
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {t.sections.map(([title, body], index) => (
            <section key={title} className={`rounded-xl border border-[#d6ded5] bg-[#fcfbf6] p-6 ${index < 4 ? "" : "lg:col-span-2"}`}>
              <h2 className="font-serif text-2xl font-black text-[#24312f]">{title}</h2>
              <p className="mt-3 leading-7 text-[#52635c]">{body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
