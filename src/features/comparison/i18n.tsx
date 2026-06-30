"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { ConditionClaim, Marketplace, TcgGame } from "@/lib/schemas";

export type Lang = "en" | "zh";

const STORAGE_KEY = "tcgpal:lang";

// English is the source dictionary; `Dict = typeof en` forces the Chinese
// dictionary to cover every key (and matching function signatures) at compile time.
const en = {
  langName: { en: "EN", zh: "中文" },
  toggleAria: "Switch language",
  header: {
    home: "TCGpal home",
    checkListing: "Check a listing",
    method: "Method",
    scopeBadge: "Pokémon · Raw singles · US",
  },
  hero: {
    eyebrow: "Pokémon card deal finder",
    title: "Find the best deal on any Pokémon card.",
    subtitle:
      "Type the card. TCGpal scans live eBay listings and shows you the safest buy, the cheapest, and the best-documented — with the real all-in price.",
    promiseTax: "Real all-in price — item + shipping + tax",
    promiseSeller: "Filters out fakes & replicas",
    promiseEvidence: "Shows the TCGplayer market price",
    guardrail: "Condition is the seller's claim — we never predict a grade.",
  },
  form: {
    heading: "Start with the card",
    gameLabel: "Card game",
    games: { pokemon: "Pokémon", onePiece: "One Piece" } as Record<TcgGame, string>,
    runDemo: "Run the labeled demo",
    cardName: "Card name",
    set: "Set",
    collectorNumber: "Collector number",
    collectorHelp:
      "Add the collector number to jump straight to ranked listings; with just a name, you'll confirm the exact version next.",
    deliveryZip: "Delivery ZIP",
    optionsToggle: "Options — tax rate and desired condition",
    optionalTaxRate: "Optional tax rate",
    desiredCondition: "Desired condition",
    listingToggle: "Already eyeing a specific listing? Add it (optional)",
    ledgerToggle: "Compare prices from other platforms (optional)",
    ledgerHelp:
      "Add listings you found on TCGplayer, Facebook, Mercari, Whatnot, or a local shop. We never fetch them — they rank in the same ledger from what you enter.",
    ledgerAdd: "Add a listing",
    ledgerRemove: "Remove",
    listingUrl: "Listing URL",
    listingUrlHelp:
      "Only eBay URLs are fetched automatically. Other links remain user-supplied evidence.",
    marketplace: "Marketplace",
    ebayAutoDetected: "eBay · auto-detected from URL",
    listingTitle: "Listing title",
    askingPrice: "Asking price",
    shipping: "Shipping",
    sellerClaimedCondition: "Seller-claimed condition",
    advancedToggle: "Add seller and photo evidence for a stronger comparison",
    sellerNotes: "Seller description / condition notes",
    feedbackPct: "Feedback %",
    feedbackCount: "Feedback count",
    returnsAccepted: "Returns accepted",
    buyerProtection: "Buyer protection",
    photoCount: "Item-specific photo count",
    explicitEvidence: "Explicit evidence",
    evFrontBack: "Front and back are shown",
    evCorners: "Corners and edges have closeups",
    evSurface: "Surface, foil, or video evidence exists",
    evNotes: "Condition notes mention specific defects",
    conditionDisclaimer:
      "Condition labels remain seller claims. TCGpal scores evidence completeness, not likely grade.",
    submitIdle: "Find best listings",
    submitLoading: "Validating evidence…",
    ph: {
      cardName: "Umbreon VMAX",
      set: "Evolving Skies / SWSH7",
      collectorNumber: "215/203",
      zip: "10001",
      tax: "8.0",
      listingUrl: "https://www.ebay.com/itm/... or paste another marketplace link",
      listingTitle: "Paste the seller's exact title",
      price: "0.00",
      shipping: "0.00",
      sellerNotes:
        "Paste condition notes, return terms, and what the seller says the photos show.",
      feedbackPct: "99.5",
      feedbackCount: "500",
    },
    phOnePiece: {
      cardName: "Monkey.D.Luffy",
      set: "Romance Dawn / OP-01",
      collectorNumber: "OP01-001",
    },
  },
  catalogKey: { label: "Catalog key", language: "English" },
  conditions: {
    Unknown: "Unknown",
    "Near Mint": "Near Mint",
    "Lightly Played": "Lightly Played",
    "Moderately Played": "Moderately Played",
    "Heavily Played": "Heavily Played",
    Damaged: "Damaged",
  } as Record<ConditionClaim, string>,
  // Brand names (eBay, TCGplayer, …) fall back to their English value; only
  // the generic entries get a localized label.
  marketplaces: {
    "Local shop": "Local shop",
    Other: "Other",
  } as Partial<Record<Marketplace, string>>,
  howItWorks: {
    eyebrow: "How the validation loop works",
    s1t: "Confirm the exact card",
    s1d: "Set, collector number, language, and reprint must agree.",
    s2t: "Gather supported evidence",
    s2d: "Official eBay data, optional references, and your pasted candidates.",
    s3t: "Rules score every option",
    s3d: "The agent reconciles evidence; deterministic math chooses winners.",
    s4t: "Critic checks every claim",
    s4d: "No invented comps, scam certainty, or grading promises.",
    supportedLabel: "Supported now:",
    supportedBody:
      " Pokémon raw singles in USD. Other marketplaces stay manual until a legal provider is connected.",
  },
  loading: {
    title: "TCGpal is validating the comparison",
    steps: "Identity → marketplace evidence → deterministic ranking → claim critic",
  },
  error: { title: "The comparison needs another try." },
  identity: {
    eyebrow: "Version confirmation required",
    heading: "Which exact card do you want?",
    desc: "TCGpal pauses here because same-art reprints and similar versions can make the wrong price look convincing. Pick the version, and we'll rank live listings for it.",
    confidence: (level: string) => `${level} confidence`,
    versions: (n: number) => `${n} version${n === 1 ? "" : "s"}`,
    confirm: "Confirm this version",
    noMatch:
      "No catalog match was found. Check the Pokémon name, then add the printed collector number (for example, 215/203) or a set name/code and try again.",
  },
  result: {
    demoTitle: "Labeled demo inventory.",
    demoBody:
      " eBay credentials are not configured, so these candidate listings are fixtures—not live offers.",
    liveDataIssue: "Some live data couldn't load — the ranking below uses only what was available.",
    moveFoil: "Move to catch the foil",
    versionConfirmed: "Exact version confirmed",
    marketApprox: "TCGplayer market ≈",
    view: "view",
    eligibleOptions: "Eligible options",
    yourBestBuy: "How the options rank",
    recommendedListing: "Why this one leads",
    defaultLensNote: "We open on the safest verified option. Switch the angle anytime — you decide.",
    avoidedTraps: (n: number) =>
      `Screened out ${n} risky listing${n === 1 ? "" : "s"} — look-alikes, far-below-market, or wrong version.`,
    evidenceLedger: "Evidence ledger",
    everyCandidate: "Every eligible candidate",
    excluded: (n: number) => `See why ${n} listing${n === 1 ? " was" : "s were"} excluded`,
    referenceContext: "Reference context",
    reference: (value: string) => `$${value} reference`,
    openManualCheck: "Open manual check",
    beforeYouBuy: "Before you buy",
    technicalTrace: "Technical validation trace",
    helpValidate: "Help validate the product",
    feedbackQuestion: "Did this evidence change what you would do?",
    feedbackSaved: "Feedback saved. Thank you.",
    yes: "Yes",
    notYet: "Not yet",
  },
  lens: {
    cheapest: "Cheapest",
    safest: "Safest",
    bestDocumented: "Best-documented",
    cheapestHint: "Lowest total price, including shipping and any tax.",
    safestHint: "Best combined seller trust and listing-evidence score.",
    bestDocumentedHint:
      "Most complete photo and condition evidence — not a grade prediction.",
  },
  card: {
    recommended: "Top pick",
    whyLeads: "Why it leads",
    sellerSays: (cond: string) => `Seller says: ${cond}`,
    estLanded: "est. landed",
    preTaxTotal: "pre-tax total",
    freeShipping: "free ship",
    priceBreakdown: (item: string, shipping: string, tax: string | null) =>
      `Item ${item} · Shipping ${shipping}${tax ? ` · Est. tax ${tax}` : " · tax not included"}`,
    underMarket: (pct: number) => `${pct}% under market`,
    aboveMarket: (pct: number) => `+${pct}% above market`,
    trustedSeller: "Trusted seller",
    decentSeller: "Decent seller",
    unprovenSeller: "Unproven seller",
    wellDocumented: "Well-documented",
    partlyDocumented: "Partly documented",
    thinEvidence: "Thin evidence",
    lowRisk: "Low risk",
    someRisk: "Some risk",
    higherRisk: "Higher risk",
    goToListing: "Go to listing",
    userSupplied: "User-supplied candidate",
    photos: (n: number) => `${n} photo${n === 1 ? "" : "s"}`,
    frontBack: "Front + back",
    corners: "Corners",
    surface: "Surface",
    photoEvidenceAria: "Listing photo evidence",
  },
  candidate: {
    demo: "Demo",
    rawSingle: "Raw single",
    match: (conf: string) => `${conf} match`,
    observed: (when: string) => `Observed ${when}`,
    preTax: "Pre-tax",
  },
  status: { used: "used", unavailable: "unavailable", missing: "missing" },
};

export type Dict = typeof en;

const zh: Dict = {
  langName: { en: "EN", zh: "中文" },
  toggleAria: "切换语言",
  header: {
    home: "TCGpal 首页",
    checkListing: "查验商品",
    method: "方法",
    scopeBadge: "宝可梦 · 未评级单卡 · 美国",
  },
  hero: {
    eyebrow: "宝可梦卡找好价",
    title: "找到任何宝可梦卡的最佳购买。",
    subtitle:
      "输入卡名，TCGpal 会扫描 eBay 在售商品，挑出最稳妥、最便宜、资料最全的那一张——并算出真实到手价。",
    promiseTax: "真实到手价 —— 商品 + 运费 + 税",
    promiseSeller: "自动过滤仿品与复刻",
    promiseEvidence: "显示 TCGplayer 市价",
    guardrail: "品相为卖家描述 —— 我们绝不预测评级。",
  },
  form: {
    heading: "从卡名开始",
    gameLabel: "卡牌游戏",
    games: { pokemon: "宝可梦", onePiece: "海贼王" },
    runDemo: "运行示例数据",
    cardName: "卡名",
    set: "系列",
    collectorNumber: "收藏编号",
    collectorHelp:
      "填了收藏编号就能直接看到排好序的商品；只填卡名的话，下一步再让你确认具体版本。",
    deliveryZip: "收货邮编",
    optionsToggle: "选项：税率与期望品相",
    optionalTaxRate: "税率（可选）",
    desiredCondition: "期望品相",
    listingToggle: "已经看中某个商品？添加它（可选）",
    ledgerToggle: "对比其他平台的价格（可选）",
    ledgerHelp:
      "把你在 TCGplayer、脸书、Mercari、Whatnot 或本地店看到的商品加进来。我们不会去抓取它们，只用你填的信息，和 eBay 的结果排在同一张清单里。",
    ledgerAdd: "加一个商品",
    ledgerRemove: "删除",
    listingUrl: "商品链接",
    listingUrlHelp:
      "只有 eBay 链接会被自动抓取，其他链接仅作为你提供的参考。",
    marketplace: "平台",
    ebayAutoDetected: "eBay · 已从链接自动识别",
    listingTitle: "商品标题",
    askingPrice: "标价",
    shipping: "运费",
    sellerClaimedCondition: "卖家标注品相",
    advancedToggle: "补充卖家与照片证据，让比对更可靠",
    sellerNotes: "卖家描述 / 品相说明",
    feedbackPct: "好评率 %",
    feedbackCount: "评价数",
    returnsAccepted: "支持退货",
    buyerProtection: "买家保护",
    photoCount: "实物照片数量",
    explicitEvidence: "明确证据",
    evFrontBack: "展示正反面",
    evCorners: "边角有特写",
    evSurface: "有表面 / 闪膜 / 视频证据",
    evNotes: "品相说明提到具体瑕疵",
    conditionDisclaimer:
      "品相标签仅为卖家声明。TCGpal 评估的是证据完整度，而非品相评级预测。",
    submitIdle: "查找最佳商品",
    submitLoading: "正在核验证据…",
    ph: {
      cardName: "Umbreon VMAX",
      set: "Evolving Skies / SWSH7",
      collectorNumber: "215/203",
      zip: "10001",
      tax: "8.0",
      listingUrl: "https://www.ebay.com/itm/... 或粘贴其他平台链接",
      listingTitle: "粘贴卖家的完整标题",
      price: "0.00",
      shipping: "0.00",
      sellerNotes: "粘贴品相说明、退货条款，以及卖家对照片的描述。",
      feedbackPct: "99.5",
      feedbackCount: "500",
    },
    phOnePiece: {
      cardName: "Monkey.D.Luffy",
      set: "Romance Dawn / OP-01",
      collectorNumber: "OP01-001",
    },
  },
  catalogKey: { label: "目录键", language: "英文" },
  conditions: {
    Unknown: "未知",
    "Near Mint": "近全新 (NM)",
    "Lightly Played": "轻度磨损 (LP)",
    "Moderately Played": "中度磨损 (MP)",
    "Heavily Played": "重度磨损 (HP)",
    Damaged: "破损",
  },
  marketplaces: {
    "Local shop": "本地店",
    Other: "其他",
  },
  howItWorks: {
    eyebrow: "核验流程如何运作",
    s1t: "确认确切的卡片",
    s1d: "系列、收藏编号、语言和再版必须一致。",
    s2t: "收集受支持的证据",
    s2d: "官方 eBay 数据、可选参考，以及你粘贴的候选。",
    s3t: "规则为每个选项打分",
    s3d: "agent 先把证据理顺，再用确定性算法选出最优项。",
    s4t: "逐条复核结论",
    s4d: "不会编造成交价，也不会断言是骗局或保证评级。",
    supportedLabel: "目前支持：",
    supportedBody:
      " 美元计价的宝可梦未评级单卡。其他平台在接入合规数据源前仍需手动填写。",
  },
  loading: {
    title: "TCGpal 正在核验比对",
    steps: "确认卡片 → 平台证据 → 确定性排序 → 结论复核",
  },
  error: { title: "这次比对需要再试一次。" },
  identity: {
    eyebrow: "需要确认版本",
    heading: "你要找的是哪一张？",
    desc: "这里先停一下：同图再版和相似版本太多，价格很容易看走眼。选好版本，我们再按它来排在售商品。",
    confidence: (level: string) => `可信度 ${level}`,
    versions: (n: number) => `${n} 个版本`,
    confirm: "确认这个版本",
    noMatch:
      "没找到对得上的卡片。先核对一下宝可梦名称，再补上卡面上的收藏编号（比如 215/203）或系列名称 / 代码，然后重试。",
  },
  result: {
    demoTitle: "标注的示例库存。",
    demoBody: " 未配置 eBay 凭据，因此这些候选商品是示例数据，并非真实在售。",
    liveDataIssue: "部分实时数据没能加载，下面的排序只用了能拿到的数据。",
    moveFoil: "移动鼠标看闪膜效果",
    versionConfirmed: "已确认确切版本",
    marketApprox: "TCGplayer 市价 ≈",
    view: "查看",
    eligibleOptions: "符合条件的选项",
    yourBestBuy: "排序是怎么来的",
    recommendedListing: "为什么这张排第一",
    defaultLensNote: "默认先给最稳妥的那张已核验商品，随时切换角度，最后由你来定。",
    avoidedTraps: (n: number) => `已经帮你筛掉 ${n} 个有问题的商品：仿品、价格低得离谱，或版本对不上。`,
    evidenceLedger: "证据清单",
    everyCandidate: "每个符合条件的候选",
    excluded: (n: number) => `看看为什么排除了这 ${n} 个`,
    referenceContext: "参考背景",
    reference: (value: string) => `参考价 $${value}`,
    openManualCheck: "打开手动查询",
    beforeYouBuy: "下单前注意",
    technicalTrace: "技术核验记录",
    helpValidate: "帮助我们验证产品",
    feedbackQuestion: "这些证据改变了你的决定吗？",
    feedbackSaved: "反馈已保存，谢谢。",
    yes: "是",
    notYet: "还没",
  },
  lens: {
    cheapest: "最便宜",
    safest: "最稳妥",
    bestDocumented: "证据最足",
    cheapestHint: "含运费和税费的最低总价。",
    safestHint: "卖家可信度与商品证据综合得分最高。",
    bestDocumentedHint: "照片与品相证据最完整，但不是评级预测。",
  },
  card: {
    recommended: "本角度第一",
    whyLeads: "为什么排第一",
    sellerSays: (cond: string) => `卖家称：${cond}`,
    estLanded: "预估到手",
    preTaxTotal: "税前合计",
    freeShipping: "免运费",
    priceBreakdown: (item: string, shipping: string, tax: string | null) =>
      `商品 ${item} · 运费 ${shipping}${tax ? ` · 预估税 ${tax}` : " · 未含税"}`,
    underMarket: (pct: number) => `低于市价 ${pct}%`,
    aboveMarket: (pct: number) => `高于市价 ${pct}%`,
    trustedSeller: "可信卖家",
    decentSeller: "尚可卖家",
    unprovenSeller: "未经验证卖家",
    wellDocumented: "证据充分",
    partlyDocumented: "证据一般",
    thinEvidence: "证据不足",
    lowRisk: "低风险",
    someRisk: "有一定风险",
    higherRisk: "风险较高",
    goToListing: "前往商品",
    userSupplied: "用户提供的候选",
    photos: (n: number) => `${n} 张照片`,
    frontBack: "正反面",
    corners: "边角",
    surface: "表面",
    photoEvidenceAria: "商品照片证据",
  },
  candidate: {
    demo: "示例",
    rawSingle: "未评级单卡",
    match: (conf: string) => `匹配度 ${conf}`,
    observed: (when: string) => `记录于 ${when}`,
    preTax: "税前",
  },
  status: { used: "已使用", unavailable: "不可用", missing: "缺失" },
};

const messages: Record<Lang, Dict> = { en, zh };

// A tiny external store backs the language choice. useSyncExternalStore reads it
// without a hydration mismatch: the server (and the initial client render) use
// getServerSnapshot ("en"), then React re-renders with the persisted value. This
// also avoids calling setState inside an effect to hydrate from localStorage.
let currentLang: Lang | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): Lang {
  if (currentLang === null) {
    try {
      currentLang = localStorage.getItem(STORAGE_KEY) === "zh" ? "zh" : "en";
    } catch {
      currentLang = "en";
    }
  }
  return currentLang;
}

function getServerSnapshot(): Lang {
  return "en";
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function persistLang(lang: Lang) {
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore unavailable storage */
  }
  listeners.forEach((listener) => listener());
}

export function useLang(): { lang: Lang; setLang: (lang: Lang) => void } {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { lang, setLang: persistLang };
}

// Mounted once near the root; keeps the <html lang> attribute in sync for
// accessibility. This effect only writes to the DOM (no setState).
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { lang } = useLang();
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  return <>{children}</>;
}

export function useT(): Dict {
  return messages[useLang().lang];
}
