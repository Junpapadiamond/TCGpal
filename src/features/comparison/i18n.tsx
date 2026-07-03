"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { ConditionClaim, Marketplace } from "@/lib/schemas";

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
    eyebrow: "Evidence-backed buy recommendations",
    title: "The one to buy—three ways to be right.",
    subtitle:
      "Tell us the card. TCGpal compares live listings and recommends the cheapest, safest, or best-documented option.",
    promiseTax: "Price + shipping + optional tax",
    promiseSeller: "Seller and return signals",
    promiseEvidence: "Evidence quality, never grade prediction",
  },
  form: {
    heading: "Find the best listing",
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
    listingUrl: "Listing URL",
    listingUrlHelp:
      "eBay links use the official API. Any other marketplace link is fetched once — just the page you paste — and read automatically; if it can't be read, your typed facts below are used instead.",
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
      " Pokémon raw singles in USD. eBay listings and TCGplayer daily prices are compared live; paste a listing URL to fold in any other marketplace.",
  },
  loading: {
    title: "TCGpal is validating the comparison",
    steps: "Identity → marketplace evidence → deterministic ranking → claim critic",
  },
  error: { title: "The comparison needs another try.", retry: "Retry now" },
  identity: {
    eyebrow: "Version confirmation required",
    heading: "Which exact card do you want?",
    desc: "TCGpal pauses here because same-art reprints and similar versions can make the wrong price look convincing. Pick the version, and we'll rank live listings for it.",
    confidence: (level: string) => `${level} confidence`,
    confirm: "Confirm this version",
    noMatch:
      "No catalog match was found. Check the Pokémon name, then add the printed collector number (for example, 215/203) or a set name/code and try again.",
  },
  result: {
    demoTitle: "Labeled demo inventory.",
    demoBody:
      " eBay credentials are not configured, so these candidate listings are fixtures—not live offers.",
    moveFoil: "Move to catch the foil",
    versionConfirmed: "Exact version confirmed",
    marketApprox: "TCGplayer market ≈",
    marketAsOf: (date: string) => `prices as of ${date}`,
    marketStale: "over 48h old — treat with care",
    marketCatalogApprox: "catalog price (approximate freshness)",
    view: "view",
    sourcesChecked: "Sources checked",
    sourceFound: (n: number) => `${n} found`,
    sourceZero: "0 found",
    sourceFailed: "failed",
    sourceNoMatch: "no match",
    sourceNotConfigured: "not connected",
    sourceBlocked: "not automatable",
    sourceUserAdded: "user-added",
    eligibleOptions: "Eligible options",
    yourBestBuy: "Your best buy",
    recommendedListing: "Recommended listing",
    defaultLensNote: "We default to the safest verified buy. Switch the lens anytime.",
    evidenceLedger: "Evidence ledger",
    everyCandidate: "Every eligible candidate",
    excluded: (n: number) => `${n} excluded candidate${n === 1 ? "" : "s"}`,
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
    recommended: "Recommended",
    userAdded: "User-added",
    sellerSays: (cond: string) => `Seller says: ${cond}`,
    conditionNotStated: "Seller did not state a condition",
    sellerTrack: (pct: string, count: string) => `${pct}% positive · ${count} ratings`,
    noSellerTrack: "No seller track record on this listing",
    estLanded: "est. landed",
    preTaxTotal: "pre-tax total",
    underMarket: (pct: number) => `${pct}% under market`,
    aboveMarket: (pct: number) => `+${pct}% above market`,
    trustedSeller: "Trusted seller",
    decentSeller: "Decent seller",
    unprovenSeller: "Unproven seller",
    unverifiedSeller: "Unverified seller",
    wellDocumented: "Well-documented",
    partlyDocumented: "Partly documented",
    thinEvidence: "Thin evidence",
    lowRisk: "Low risk",
    someRisk: "Some risk",
    higherRisk: "Higher risk",
    unverified: "Unverified",
    scoreLine: (trust: number, evidence: number, safety: number) =>
      `Trust ${trust} · Evidence ${evidence} · Safety ${safety} `,
    ofHundred: "(of 100)",
    goToListing: "Go to listing",
    userSupplied: "User-supplied candidate",
    photos: (n: number) => `${n} photo${n === 1 ? "" : "s"}`,
    frontBack: "Front + back",
    frontBackNo: "Front/back not shown",
    corners: "Corners",
    cornersNo: "Corners not shown",
    surface: "Surface",
    surfaceNo: "Surface not shown",
    photoEvidenceAria: "Listing photo evidence",
  },
  candidate: {
    demo: "Demo",
    rawSingle: "Raw single",
    match: (conf: string) => `${conf} match`,
    observed: (when: string) => `Observed ${when}`,
    preTax: "Pre-tax",
    safety: "Safety",
    evidence: "Evidence",
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
    eyebrow: "有据可依的购买建议",
    title: "最该买的那一张——三种角度都站得住。",
    subtitle:
      "告诉我们卡名，TCGpal 会比对在售商品，推荐最便宜、最稳妥或证据最充分的那一个。",
    promiseTax: "价格 + 运费 + 可选税费",
    promiseSeller: "卖家与退货信号",
    promiseEvidence: "证据质量，绝不预测评级",
  },
  form: {
    heading: "找到最佳商品",
    runDemo: "运行示例数据",
    cardName: "卡名",
    set: "系列",
    collectorNumber: "收藏编号",
    collectorHelp:
      "填入收藏编号可直接进入排序结果；只给卡名时，下一步会让你确认具体版本。",
    deliveryZip: "收货邮编",
    optionsToggle: "选项 —— 税率与期望品相",
    optionalTaxRate: "税率（可选）",
    desiredCondition: "期望品相",
    listingToggle: "已经看中某个商品？添加它（可选）",
    listingUrl: "商品链接",
    listingUrlHelp:
      "eBay 链接走官方 API；其他平台链接只抓取你粘贴的那一页并自动读取，无法读取时使用下方手动填写的信息。",
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
    s3d: "由 agent 调和证据；确定性计算选出赢家。",
    s4t: "审查器核对每条结论",
    s4d: "不编造成交价、不断言诈骗、不承诺评级。",
    supportedLabel: "目前支持：",
    supportedBody:
      " 美元计价的宝可梦未评级单卡。eBay 商品与 TCGplayer 每日价格实时比对；粘贴链接即可纳入其他平台的商品。",
  },
  loading: {
    title: "TCGpal 正在核验比对",
    steps: "确认身份 → 平台证据 → 确定性排序 → 结论审查",
  },
  error: { title: "这次比对需要再试一次。", retry: "立即重试" },
  identity: {
    eyebrow: "需要确认版本",
    heading: "你要的是哪一张确切的卡？",
    desc: "TCGpal 在这里暂停，因为同图再版和相似版本可能让错误的价格看起来很合理。选定版本后，我们会为它排序在售商品。",
    confidence: (level: string) => `可信度 ${level}`,
    confirm: "确认这个版本",
    noMatch:
      "没有找到匹配的目录卡片。请检查宝可梦名称，再补上印刷的收藏编号（例如 215/203）或系列名称 / 代码后重试。",
  },
  result: {
    demoTitle: "标注的示例库存。",
    demoBody: " 未配置 eBay 凭据，因此这些候选商品是示例数据，并非真实在售。",
    moveFoil: "移动鼠标看闪膜效果",
    versionConfirmed: "已确认确切版本",
    marketApprox: "TCGplayer 市价 ≈",
    marketAsOf: (date: string) => `价格更新于 ${date}`,
    marketStale: "已超过 48 小时 —— 谨慎参考",
    marketCatalogApprox: "目录价格（时效近似）",
    view: "查看",
    sourcesChecked: "已检查的来源",
    sourceFound: (n: number) => `找到 ${n} 条`,
    sourceZero: "0 条",
    sourceFailed: "失败",
    sourceNoMatch: "无匹配",
    sourceNotConfigured: "未接入",
    sourceBlocked: "无法自动访问",
    sourceUserAdded: "用户添加",
    eligibleOptions: "符合条件的选项",
    yourBestBuy: "你的最佳选择",
    recommendedListing: "推荐商品",
    defaultLensNote: "默认推荐最稳妥的已核验商品，可随时切换视角。",
    evidenceLedger: "证据清单",
    everyCandidate: "每个符合条件的候选",
    excluded: (n: number) => `已排除 ${n} 个候选`,
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
    bestDocumentedHint: "照片与品相证据最完整 —— 并非评级预测。",
  },
  card: {
    recommended: "推荐",
    userAdded: "用户添加",
    sellerSays: (cond: string) => `卖家称：${cond}`,
    conditionNotStated: "卖家未标注品相",
    sellerTrack: (pct: string, count: string) => `好评率 ${pct}% · ${count} 条评价`,
    noSellerTrack: "该商品没有卖家信誉记录",
    estLanded: "预估到手",
    preTaxTotal: "税前合计",
    underMarket: (pct: number) => `低于市价 ${pct}%`,
    aboveMarket: (pct: number) => `高于市价 ${pct}%`,
    trustedSeller: "可信卖家",
    decentSeller: "尚可卖家",
    unprovenSeller: "未经验证卖家",
    unverifiedSeller: "信息不足的卖家",
    wellDocumented: "证据充分",
    partlyDocumented: "证据一般",
    thinEvidence: "证据不足",
    lowRisk: "低风险",
    someRisk: "有一定风险",
    higherRisk: "风险较高",
    unverified: "信息不足",
    scoreLine: (trust: number, evidence: number, safety: number) =>
      `信誉 ${trust} · 证据 ${evidence} · 安全 ${safety} `,
    ofHundred: "（满分 100）",
    goToListing: "前往商品",
    userSupplied: "用户提供的候选",
    photos: (n: number) => `${n} 张照片`,
    frontBack: "正反面",
    frontBackNo: "未展示正反面",
    corners: "边角",
    cornersNo: "未展示边角",
    surface: "表面",
    surfaceNo: "未展示表面",
    photoEvidenceAria: "商品照片证据",
  },
  candidate: {
    demo: "示例",
    rawSingle: "未评级单卡",
    match: (conf: string) => `匹配度 ${conf}`,
    observed: (when: string) => `观察于 ${when}`,
    preTax: "税前",
    safety: "安全",
    evidence: "证据",
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
