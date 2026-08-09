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
    eyebrow: "方法与证据约定",
    title: "Lens TCG 怎么比商品",
    intro: "Lens TCG 给已经知道要买哪张卡的人用：先认准确切卡图，再比在售裸卡；证据不够就直说不推荐。",
    back: "去比一张卡",
    sections: [
      ["1. 先认准确切版本", "先查卡片目录。只输入卡名时会停下来让你确认；卡名加卡号够明确就自动确认。只要目录能证明，同卡号的不同卡图和再版会分开算。"],
      ["2. 只查有边界的来源", "eBay Browse 提供真实在售商品。TCGCSV / TCGplayer 只给汇总市价参考，不会冒充卖家商品。你主动贴进来的公开 HTTPS 链接，会在既定边界内读一次；其他来源在接入获批供应商之前，都只是手动查。"],
      ["市场参考价是什么", "参考价只算商品本身，不含运费和税，对应已确认的版本和可比的品相语境。Lens TCG 只拿标价跟它比。运费和预估税在结账成本里单独列，不会被拿来凑出一句「高于市场」的警告。"],
      ["3. 算可比结账成本", "可比成本 = 标价 + 卖家写的运费。你填了税率或能推算税率的邮编，预估税就按商品加运费算。税不知道就写「税前总价」；运费不知道，这条拿不到「最便宜」和「最划算」。"],
      ["4. 按你选的视角排序", "「最划算」看价格位置、品相匹配、卖家记录和可查证据；「最便宜」看可比结账成本；「最稳妥」看卖家历史和证据；「证据最足」看实物照片和明确细节。四个视角各算各的，也可能都选中同一条。"],
      ["商品为什么会被排除", "决策凭证会列出被排除的商品和具体原因。常见的有：错版、品相不符、运费未知、不是美元、已下架、评级卡或卡组、定制／复制品措辞，还有版本证据不足却价格远低于确切版本参考价。"],
      ["Lens TCG 不做什么", "不看照片评级，不做鉴真，不预测价格，不声称没核实过的成交记录，也不会说某个卖家是骗子。品相仍是卖家自己说的；卖家资料缺失只标「信息不足」，不会直接算成高风险。"],
      ["凭证与隐私", "凭证是一份存 30 天的快照，存下来就不再改，也不代表商品还在卖。页面会写保存时间，并留一个重新查在售商品的入口。只有服务器验证过的纯卡片搜索才会生成凭证，买家邮编会被去掉；你贴进来或手填的商品信息，不会通过这条路径公开。"],
      ["时效、失败与不给推荐", "每份报告都写清观察时间、来源状态、假设、排除项和提醒。TCGplayer 数据会显示日期，过旧会提示。来源失败不会藏着。版本、品相、完整成本凑不齐时，我们给下一步怎么做，而不是拿示例数据或猜测凑一个推荐。"],
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
