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
    scopeBadge: "Pokémon & One Piece · Raw singles · US",
  },
  hero: {
    eyebrow: "Best value, least time",
    title: "Find the best-value card — fast.",
    subtitle:
      "Tell us the card. We compare listings across marketplaces and hand you the best-value buy — weighing price, safety, and evidence — in seconds, not twenty tabs.",
    promiseTax: "Real all-in price vs market",
    promiseSeller: "Filters out fakes & replicas",
    promiseEvidence: "Best value across marketplaces",
  },
  form: {
    heading: "Start with the card",
    heroSearchLabel: "Search for a card",
    heroSearchPlaceholder: "Type the card — e.g. \"Greninja Gold Star SWSH144\" or \"P-096 Japanese Promo\"",
    heroSearchRequired: "Type a card to search, or fill in the details below.",
    heroParsedPrefix: "We understood:",
    heroParsedNothing: "Treating this as a plain name search — add details below if it needs narrowing.",
    refineToggle: "Refine the search — set, number, condition, tax",
    gameLabel: "Card game",
    games: { pokemon: "Pokémon", onePiece: "One Piece" } as Record<TcgGame, string>,
    runDemo: "Run the labeled demo",
    cardName: "Card name",
    set: "Set",
    collectorNumber: "Collector number",
    deliveryZip: "Delivery ZIP",
    optionalTaxRate: "Optional tax rate",
    desiredCondition: "Desired condition",
    listingToggle: "Already found a listing? Add it — with evidence — for the comparison",
    ledgerSubhead: "On a marketplace we don't search yet? Add it by hand",
    ledgerHelp:
      "Paste the details of a listing you found on TCGplayer, Facebook, Mercari, Whatnot, or a local shop. We never fetch it — it ranks in the same comparison from what you enter. This is a fallback for the platforms we don't search automatically yet.",
    ledgerAdd: "Add a listing",
    ledgerRemove: "Remove",
    listingUrl: "Listing URL",
    listingUrlHelp:
      "eBay links use the official API. Any other marketplace link is fetched once — just the page you paste — and read automatically; if it can't be read, your typed facts below are used instead.",
    marketplace: "Marketplace",
    ebayAutoDetected: "eBay · auto-detected from URL",
    listingTitle: "Listing title",
    askingPrice: "Asking price",
    shipping: "Shipping",
    sellerClaimedCondition: "Seller-claimed condition",
    evidenceSubhead: "Seller & photo evidence — optional, strengthens the ranking",
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
      " Pokémon and One Piece raw singles in USD. Other marketplaces stay manual until a legal provider is connected.",
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
    versions: (n: number) => `${n} version${n === 1 ? "" : "s"}`,
    confirm: "Confirm this version",
    noMatch:
      "No catalog match was found. Check the card name, then add the printed collector number (for example, 215/203) or a set name/code and try again.",
    lookupUnavailable:
      "The card catalog is temporarily unavailable, so we couldn't list versions. This is a lookup hiccup, not a missing card — please try again in a moment.",
  },
  result: {
    demoTitle: "Labeled demo inventory.",
    demoBody:
      " eBay credentials are not configured, so these candidate listings are fixtures—not live offers.",
    liveDataIssue: "Some live data couldn't load — the ranking below uses only what was available.",
    sourcesTitle: "Sources checked",
    sourcesHint: "Each marketplace joins the comparison automatically once its API is connected.",
    sourceQueried: "Queried",
    sourceUnavailable: "Unavailable",
    sourceNotConnected: "Not connected",
    sourceCount: (n: number) => `${n} listing${n === 1 ? "" : "s"}`,
    moveFoil: "Move to catch the foil",
    versionConfirmed: "Exact version confirmed",
    marketApprox: "TCGplayer market ≈",
    marketAsOf: (date: string) => `prices as of ${date}`,
    marketStale: "over 48h old — treat with care",
    marketCatalogApprox: "catalog price (approximate freshness)",
    view: "view",
    eligibleSummary: (n: number) => `Compared ${n} eligible listing${n === 1 ? "" : "s"} across marketplaces`,
    sourcesInline: (queried: number, total: number) => `Sources: ${queried} queried live · ${total - queried} not connected`,
    defaultLensNote: "We open on Best Value — price, seller trust, and evidence combined. Switch the angle anytime — you decide.",
    avoidedTraps: (n: number) =>
      `Screened out ${n} risky listing${n === 1 ? "" : "s"} — look-alikes, far-below-market, or wrong version.`,
    evidenceLedger: "Evidence ledger",
    everyCandidate: "Every eligible candidate",
    excluded: (n: number) => `See why ${n} listing${n === 1 ? " was" : "s were"} excluded`,
    tooRiskySkip: "Too risky — skip",
    referenceContext: "Reference context",
    reference: (value: string) => `$${value} reference`,
    openManualCheck: "Open manual check",
    japanPriceChecks: "Japan price checks",
    japanPriceChecksBody:
      "Open these Japanese search pages to inspect yen prices and buy paths yourself. TCGpal has not fetched or ranked those pages; paste a specific listing back here to compare it.",
    beforeYouBuy: "Before you buy",
    howWeChecked: "How we checked — sources, reference pricing, and the validation trace",
    technicalTrace: "Technical validation trace",
    helpValidate: "Help validate the product",
    feedbackQuestion: "Did this evidence change what you would do?",
    feedbackSaved: "Feedback saved. Thank you.",
    yes: "Yes",
    notYet: "Not yet",
  },
  lens: {
    bestValue: "Best Value",
    cheapest: "Cheapest usable",
    safest: "Safest buy",
    bestDocumented: "Best documented",
    bestValueHint: "Best combination of price vs. market, seller trust, and evidence.",
    cheapestHint: "Lowest total price, including shipping and any tax.",
    safestHint: "Best combined seller trust and listing-evidence score.",
    bestDocumentedHint:
      "Most complete photo and condition evidence — not a grade prediction.",
  },
  card: {
    recommended: "Top pick",
    whyLeads: "Why it leads",
    sellerSays: (cond: string) => `Seller says: ${cond}`,
    conditionNotStated: "Seller did not state a condition",
    sellerTrack: (pct: string, count: string) => `${pct}% positive · ${count} ratings`,
    noSellerTrack: "No seller track record on this listing",
    userAdded: "User-added",
    estLanded: "est. landed",
    preTaxTotal: "pre-tax total",
    freeShipping: "free ship",
    priceBreakdown: (item: string, shipping: string, tax: string | null) =>
      `Item ${item} · Shipping ${shipping}${tax ? ` · Est. tax ${tax}` : " · tax not included"}`,
    underMarket: (pct: number) => `${pct}% under market`,
    aboveMarket: (pct: number) => `+${pct}% above market`,
    trustedSeller: "Trusted seller",
    unverifiedSeller: "Unverified seller",
    decentSeller: "Decent seller",
    unprovenSeller: "Unproven seller",
    wellDocumented: "Well-documented",
    partlyDocumented: "Partly documented",
    thinEvidence: "Thin evidence",
    lowRisk: "Low risk",
    unverified: "Unverified",
    someRisk: "Some risk",
    higherRisk: "Higher risk",
    goToListing: "Go to listing",
    userSupplied: "User-supplied candidate",
    photos: (n: number) => `${n} photo${n === 1 ? "" : "s"}`,
    frontBack: "Front + back",
    corners: "Corners",
    surface: "Surface",
    photoEvidenceAria: "Listing photo evidence",
    checkMath: "Check the math behind these labels",
    mathHint: "Every label above is computed from these inputs by fixed rules — no model opinion. Verify any line against the listing itself.",
    mathPrice: "Price vs market",
    mathSeller: "Seller trust",
    mathEvidence: "Photo & condition evidence",
    mathRisk: "Risk score",
    mathValue: "Best Value composite",
    mathNoMarket: "no market anchor — scored neutral",
    mathDemoHidden: "demo listing — market comparison hidden",
    mathRiskFormula: (seller: number, evidence: number) => `= ${seller}% seller trust + ${evidence}% evidence`,
    mathValueFormula: (price: number, risk: number, evidence: number) => `= ${price}% price + ${risk}% risk + ${evidence}% evidence`,
    mathVs: (total: string, market: string) => `${total} vs ${market} market`,
    mathFeedback: (pct: number) => `${pct}% positive`,
    mathRatings: (n: number) => `${n} ratings`,
    mathReturns: "returns accepted",
    mathReturnsUnknown: "returns unknown",
    mathProtection: "buyer protection",
    mathNoSellerData: "no seller data provided",
    mathConditionNotes: "condition notes",
    thTrusted: "80+ trusted · 60+ decent",
    thDocumented: "50+ well-documented · 25+ partly",
    thRisk: "80+ low risk · 60+ some risk",
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
    scopeBadge: "宝可梦 & 海贼王 · 未评级单卡 · 美国",
  },
  hero: {
    eyebrow: "省时间，买得值",
    title: "几秒钟找到最划算的那张卡。",
    subtitle:
      "报上卡名，我们把各平台在售的放一起比，价格、卖家、图都替你看过，挑出最划算的那张，不用自己开一堆标签页。",
    promiseTax: "到手总价 vs 市价",
    promiseSeller: "自动过滤仿品与复刻",
    promiseEvidence: "跨平台比最划算",
  },
  form: {
    heading: "从卡名开始",
    heroSearchLabel: "搜索卡片",
    heroSearchPlaceholder: "直接输入卡片——比如「Greninja Gold Star SWSH144」或「P-096 日版 Promo」",
    heroSearchRequired: "请输入要搜索的卡片，或者在下面分别填写详细信息。",
    heroParsedPrefix: "我们理解为：",
    heroParsedNothing: "按普通名称搜索处理——如果需要缩小范围，请在下面补充详细信息。",
    refineToggle: "细化搜索——系列、编号、品相、税率",
    gameLabel: "卡牌游戏",
    games: { pokemon: "宝可梦", onePiece: "海贼王" },
    runDemo: "运行示例数据",
    cardName: "卡名",
    set: "系列",
    collectorNumber: "收藏编号",
    deliveryZip: "收货邮编",
    optionalTaxRate: "税率（可选）",
    desiredCondition: "期望品相",
    listingToggle: "已经看中某个商品？连同证据一起加入比对",
    ledgerSubhead: "在我们还没接入的平台看到的？手动填进来",
    ledgerHelp:
      "粘贴你在 TCGplayer、脸书、Mercari、Whatnot 或本地店看到的商品信息。我们不会去抓取它，只用你填的信息，和自动搜到的结果排在同一张清单里。这是我们还没自动接入的平台的备用方式。",
    ledgerAdd: "加一个商品",
    ledgerRemove: "删除",
    listingUrl: "商品链接",
    listingUrlHelp:
      "eBay 链接走官方 API；其他平台链接只抓取你粘贴的那一页并自动读取，无法读取时使用下方手动填写的信息。",
    marketplace: "平台",
    ebayAutoDetected: "eBay · 已从链接自动识别",
    listingTitle: "商品标题",
    askingPrice: "标价",
    shipping: "运费",
    sellerClaimedCondition: "卖家标注品相",
    evidenceSubhead: "卖家与照片证据——选填，能让排序更可靠",
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
      " 美元计价的宝可梦与海贼王未评级单卡。其他平台在接入合规数据源前仍需手动填写。",
  },
  loading: {
    title: "TCGpal 正在核验比对",
    steps: "确认卡片 → 平台证据 → 确定性排序 → 结论复核",
  },
  error: { title: "这次比对需要再试一次。", retry: "立即重试" },
  identity: {
    eyebrow: "需要确认版本",
    heading: "你要找的是哪一张？",
    desc: "这里先停一下：同图再版和相似版本太多，价格很容易看走眼。选好版本，我们再按它来排在售商品。",
    confidence: (level: string) => `可信度 ${level}`,
    versions: (n: number) => `${n} 个版本`,
    confirm: "确认这个版本",
    noMatch:
      "没找到对得上的卡片。先核对一下卡片名称，再补上卡面上的收藏编号（比如 215/203）或系列名称 / 代码，然后重试。",
    lookupUnavailable:
      "卡片库暂时连不上，没能列出版本。这是查询出了点小问题，不是没有这张卡——过一会儿再试一下。",
  },
  result: {
    demoTitle: "标注的示例库存。",
    demoBody: " 未配置 eBay 凭据，因此这些候选商品是示例数据，并非真实在售。",
    liveDataIssue: "部分实时数据没能加载，下面的排序只用了能拿到的数据。",
    sourcesTitle: "已查询的来源",
    sourcesHint: "每个平台在接入对应 API 后会自动加入比对。",
    sourceQueried: "已查询",
    sourceUnavailable: "不可用",
    sourceNotConnected: "未接入",
    sourceCount: (n: number) => `${n} 条在售`,
    moveFoil: "移动鼠标看闪膜效果",
    versionConfirmed: "已确认确切版本",
    marketApprox: "TCGplayer 市价 ≈",
    marketAsOf: (date: string) => `价格更新于 ${date}`,
    marketStale: "已超过 48 小时 —— 谨慎参考",
    marketCatalogApprox: "目录价格（时效近似）",
    view: "查看",
    eligibleSummary: (n: number) => `已跨平台比对 ${n} 个符合条件的商品`,
    sourcesInline: (queried: number, total: number) => `来源：已实时查询 ${queried} 个 · ${total - queried} 个未接入`,
    defaultLensNote: "默认展示最划算的那张——价格、卖家可信度、证据综合最优，随时切换角度，最后由你来定。",
    avoidedTraps: (n: number) => `已经帮你筛掉 ${n} 个有问题的商品：仿品、价格低得离谱，或版本对不上。`,
    evidenceLedger: "证据清单",
    everyCandidate: "每个符合条件的候选",
    excluded: (n: number) => `看看为什么排除了这 ${n} 个`,
    tooRiskySkip: "风险较高——跳过",
    referenceContext: "参考背景",
    reference: (value: string) => `参考价 $${value}`,
    openManualCheck: "打开手动查询",
    japanPriceChecks: "日本价格参考",
    japanPriceChecksBody:
      "打开这些日本站内搜索，自己查看日元价格和购买路径。TCGpal 没有抓取或排序这些页面；如果看到具体商品，可以把链接粘回来再比对。",
    beforeYouBuy: "下单前注意",
    howWeChecked: "核验过程——来源、参考价与完整记录",
    technicalTrace: "技术核验记录",
    helpValidate: "帮助我们验证产品",
    feedbackQuestion: "这些证据改变了你的决定吗？",
    feedbackSaved: "反馈已保存，谢谢。",
    yes: "是",
    notYet: "还没",
  },
  lens: {
    bestValue: "最划算",
    cheapest: "最便宜",
    safest: "最稳妥",
    bestDocumented: "证据最足",
    bestValueHint: "价格、卖家可信度、证据的综合最优解。",
    cheapestHint: "含运费和税费的最低总价。",
    safestHint: "卖家可信度与商品证据综合得分最高。",
    bestDocumentedHint: "照片与品相证据最完整，但不是评级预测。",
  },
  card: {
    recommended: "本角度第一",
    whyLeads: "为什么排第一",
    sellerSays: (cond: string) => `卖家称：${cond}`,
    conditionNotStated: "卖家未标注品相",
    sellerTrack: (pct: string, count: string) => `好评率 ${pct}% · ${count} 条评价`,
    noSellerTrack: "该商品没有卖家信誉记录",
    userAdded: "用户添加",
    estLanded: "预估到手",
    preTaxTotal: "税前合计",
    freeShipping: "免运费",
    priceBreakdown: (item: string, shipping: string, tax: string | null) =>
      `商品 ${item} · 运费 ${shipping}${tax ? ` · 预估税 ${tax}` : " · 未含税"}`,
    underMarket: (pct: number) => `低于市价 ${pct}%`,
    aboveMarket: (pct: number) => `高于市价 ${pct}%`,
    trustedSeller: "可信卖家",
    unverifiedSeller: "信息不足的卖家",
    decentSeller: "尚可卖家",
    unprovenSeller: "未经验证卖家",
    wellDocumented: "证据充分",
    partlyDocumented: "证据一般",
    thinEvidence: "证据不足",
    lowRisk: "低风险",
    unverified: "信息不足",
    someRisk: "有一定风险",
    higherRisk: "风险较高",
    goToListing: "前往商品",
    userSupplied: "用户提供的候选",
    photos: (n: number) => `${n} 张照片`,
    frontBack: "正反面",
    corners: "边角",
    surface: "表面",
    photoEvidenceAria: "商品照片证据",
    checkMath: "核对这些标签的打分依据",
    mathHint: "上面每个标签都由这些数字按固定规则算出，不含模型主观判断，每一行都能对着商品页核实。",
    mathPrice: "价格 vs 市价",
    mathSeller: "卖家可信度",
    mathEvidence: "照片与品相证据",
    mathRisk: "风险分",
    mathValue: "最划算综合分",
    mathNoMarket: "暂无市价锚点——按中性 50 分计",
    mathDemoHidden: "示例商品——不展示市价对比",
    mathRiskFormula: (seller: number, evidence: number) => `= ${seller}% 卖家可信度 + ${evidence}% 证据`,
    mathValueFormula: (price: number, risk: number, evidence: number) => `= ${price}% 价格 + ${risk}% 风险分 + ${evidence}% 证据`,
    mathVs: (total: string, market: string) => `${total}，市价 ${market}`,
    mathFeedback: (pct: number) => `好评率 ${pct}%`,
    mathRatings: (n: number) => `${n} 条评价`,
    mathReturns: "支持退货",
    mathReturnsUnknown: "退货政策未知",
    mathProtection: "买家保护",
    mathNoSellerData: "未提供卖家数据",
    mathConditionNotes: "有品相说明",
    thTrusted: "80+ 可信 · 60+ 尚可",
    thDocumented: "50+ 证据充分 · 25+ 一般",
    thRisk: "80+ 低风险 · 60+ 有一定风险",
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
