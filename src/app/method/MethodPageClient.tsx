"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const copy = {
  en: {
    eyebrow: "Method & evidence contract",
    title: "How TCGlens compares listings",
    intro: "TCGlens helps a buyer who already knows the card decide which active raw-single listing is best supported — or whether the available evidence is too weak to recommend one.",
    back: "Compare a card",
    sections: [
      ["1. Confirm the exact print", "Catalog identity comes first. Name-only searches pause for confirmation; an explicit name and collector number can auto-confirm. Same-number artwork variants and reprints are kept separate whenever the catalog can prove that distinction."],
      ["2. Check bounded sources", "eBay Browse supplies active seller listings. TCGCSV/TCGplayer supplies an aggregate market reference only — it is never presented as a seller listing. A user-pasted public HTTPS listing may be fetched once within the stated access limits. Other sources remain manual checks until an approved provider is connected."],
      ["What the market reference means", "The reference is an item-only aggregate market price for the confirmed print and seller-stated condition context when comparable. TCGlens compares item price to that item-only reference. Shipping and estimated tax remain visible in the separate checkout-cost breakdown; they are not used to manufacture an above-market warning."],
      ["3. Calculate comparable checkout cost", "Comparable cost is item price + stated shipping. When the buyer supplies a tax rate or ZIP-derived estimate, estimated tax is applied to item + shipping. If tax is unknown, TCGlens says pre-tax total. If shipping is unknown, the listing cannot win the Cheapest or Best Value recommendation."],
      ["4. Rank by the chosen lens", "Best Value combines item-price position, condition compatibility, seller-track-record signals, and reviewable listing evidence. Cheapest uses comparable checkout cost. Safest emphasizes seller history and evidence. Best-documented emphasizes item-specific photos and explicit details. These lenses are independent and may select the same listing."],
      ["Why listings are excluded", "The receipt lists excluded rows and their reasons. Common causes include the wrong print, an unsupported condition, unknown shipping, non-USD pricing, inactive inventory, slabs or lots, novelty/proxy language, or a price far below the exact-print reference without enough identity proof."],
      ["What TCGlens does not do", "TCGlens does not grade cards from photos, authenticate cards, detect counterfeits, predict prices, claim unverified sold history, or call a seller a scam. Marketplace condition remains the seller’s claim. Missing seller data is labeled unverified, not automatically risky."],
      ["Saved receipts and privacy", "A stable receipt is an immutable 30-day snapshot, not a promise that the listing is still available. It shows when the comparison was saved and offers a live refresh. TCGlens only creates these receipts for server-verified card searches, removes the buyer ZIP, and never publishes pasted or manually entered listing facts through this route."],
      ["Freshness, failures, and abstention", "Every report carries an observation time, source status, assumptions, exclusions, and warnings. TCGplayer feed freshness is shown and flagged when stale. Source failures remain visible. When no listing has compatible identity, condition, and complete cost, TCGlens returns Next Moves instead of demo inventory or a guessed recommendation."],
    ],
  },
  zh: {
    eyebrow: "怎么比价",
    title: "这条为什么值得先看？",
    intro: "想收的卡已经选好了，剩下就是挑哪条。TCGlens 帮你核对版本，把卡价、运费和卖家信息放一起比。信息不够时，会告诉你还缺什么。",
    back: "去查卡价",
    sections: [
      ["1. 先选对版本", "同名、同卡号，也可能有不同卡图和再版。先查卡牌目录，能分清的版本会分开列。只输卡名时，选一下你要的卡图；卡名加卡号足够明确，就直接往下查。"],
      ["2. 查在售单卡", "eBay 商品通过官方 Browse 接口查询。其他平台是否查到数据，会在结果里写明。TCGplayer / TCGCSV 提供市场参考价，不是某位卖家的报价。你贴的公开 HTTPS 商品链接，只会尝试读取那一页；不允许读取的页面需要你手动填写。"],
      ["参考价要怎么看", "参考价只算卡价，不含运费和税。这份价格没有细分品相，按 NM 看；只有你要 NM、卖家也标 NM 时，价差才计入价格评分。其他品相仍显示与 NM 的价差，供你参考。有瑕卡低于 NM 价，不等于捡漏。"],
      ["3. 别漏算运费和手续费", "税前总价是卡价、运费和必要的买家手续费之和。填了税率或能识别的美国邮编，会另算预估税；实际金额看结账页。没估税就写「税前总价」。运费或必要手续费没写清的，暂时不能选为推荐。"],
      ["4. 看你更在意什么", "「综合推荐」一起看总价、品相要求、卖家评价和图文信息。「总价最低」从符合条件的商品里选总价最低的。「稳妥优先」更看重卖家记录和商品资料。「图文最全」看照片数量和品相说明。四种方式各自比较，可能选中同一条。"],
      ["便宜的为什么没选上", "比价记录里会写具体原因，比如版本不对、品相不符、费用不全、不是美元计价，或已经不在售。评级卡、整套卡、未拆封产品，以及标题写明是定制品或复制品的，也不参与裸卡比价。标价远低于这个版本的参考价时，还要再核对，不能只凭卡号一样就当作捡漏。"],
      ["品相还得看卖家实拍", "NM、LP 等品相按卖家标注，中文说明只是帮助理解，不等于统一的验卡标准。TCGlens 不看图评级、不鉴定真伪，也不预测涨跌。没查到的成交记录不会编；没查到卖家评价，只标信息不足，不直接判断卖家不可靠。"],
      ["分享的是当时的比价记录", "分享链接保留 30 天，页面会写明查询时间。价格和库存可能有变化，可以随时重新查。这种记录只保存服务器核对过的卡牌搜索结果，并去掉收货邮编；你贴的链接和手填的商品信息不会通过它公开。"],
      ["查不到，就把原因写出来", "每次比价都会列出查询时间、数据来源、计算前提和筛除原因。参考价太旧会提醒，平台查询失败也会显示。版本、品相或费用还没确认齐时，就先给你下一步查找入口，不凑一个推荐。"],
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
          <Link href="/" aria-label="TCGlens home"><Image src="/lens-logo-horizontal.svg" alt="TCGlens" width={140} height={40} preload /></Link>
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
