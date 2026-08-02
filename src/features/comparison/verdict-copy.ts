import type { ConditionClaim, NormalizedListing, RankedChoice } from "@/lib/schemas";

export type VerdictAction = {
  kind: "buy" | "wait" | "pass";
  label: string;
  note: string;
};

export type VerdictCopy = {
  why: string;
  catch: string;
  alternative: string | null;
  whyNotCheapest: string | null;
  action: VerdictAction;
};

type VerdictCopyInput = {
  listing: NormalizedListing;
  choice: RankedChoice;
  alternatives: NormalizedListing[];
  marketPrice: number | null;
  lang: "en" | "zh";
};

const zhConditions: Record<ConditionClaim, string> = {
  Unknown: "品相未标注",
  "Near Mint": "近全新 (NM)",
  "Lightly Played": "轻度磨损 (LP)",
  "Moderately Played": "中度磨损 (MP)",
  "Heavily Played": "重度磨损 (HP)",
  Damaged: "破损",
};

function listingCost(listing: NormalizedListing) {
  return listing.estimatedLandedCost ?? listing.preTaxTotal;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function englishCondition(listing: NormalizedListing) {
  return listing.claimedCondition === "Unknown"
    ? "a listing without a stated condition"
    : `this seller-stated ${listing.claimedCondition} listing`;
}

function chineseCondition(listing: NormalizedListing) {
  return listing.claimedCondition === "Unknown"
    ? "这条未标注品相的商品"
    : `这条卖家标注的${zhConditions[listing.claimedCondition]}商品`;
}

function englishTotal(listing: NormalizedListing) {
  const label = listing.estimatedTax === null ? "pre-tax total" : "estimated landed total";
  return `${formatMoney(listingCost(listing))} ${label}`;
}

function chineseTotal(listing: NormalizedListing) {
  const label = listing.estimatedTax === null ? "税前合计" : "预估到手总价";
  return `${label} ${formatMoney(listingCost(listing))}`;
}

function englishWhy(listing: NormalizedListing, choice: RankedChoice) {
  const condition = englishCondition(listing);
  const total = englishTotal(listing);
  switch (choice.role) {
    case "best_value":
      return `At ${total}, ${condition} has the strongest balance of complete cost, seller record, and reviewable evidence in this comparison.`;
    case "lowest_landed_cost":
      return `${condition[0].toUpperCase()}${condition.slice(1)} has the lowest comparable ${listing.estimatedTax === null ? "pre-tax total" : "estimated landed total"} at ${formatMoney(listingCost(listing))}.`;
    case "safest_listing":
      return `${condition[0].toUpperCase()}${condition.slice(1)} has the strongest combined seller record and listing evidence in this comparison, at ${total}.`;
    case "best_condition_evidence":
      return `${condition[0].toUpperCase()}${condition.slice(1)} has the most reviewable listing evidence in this comparison, with ${listing.evidence.photoCount} item-specific photos, at ${total}.`;
  }
}

function chineseWhy(listing: NormalizedListing, choice: RankedChoice) {
  const condition = chineseCondition(listing);
  const total = chineseTotal(listing);
  switch (choice.role) {
    case "best_value":
      return `${condition}${total}，在本次可比结果中，完整总价、卖家记录与可复核证据的综合最优。`;
    case "lowest_landed_cost":
      return `${condition}${total}，是本次可比结果中的最低总价。`;
    case "safest_listing":
      return `${condition}${total}，卖家记录与商品证据的综合表现为本次最强。`;
    case "best_condition_evidence":
      return `${condition}${total}，有 ${listing.evidence.photoCount} 张实物照片，是本次可复核材料最多的商品。`;
  }
}

function englishCatch(listing: NormalizedListing) {
  if (listing.userSupplied) {
    return "This recommendation uses user-entered facts for this listing. Verify them on the listing page before deciding.";
  }
  if (listing.riskLabel === "unverified") {
    return "Seller history was not provided, so this stays neutrally unverified.";
  }
  if (listing.evidence.photoCount <= 3) {
    const noun = listing.evidence.photoCount === 1 ? "photo is" : "photos are";
    return `Only ${listing.evidence.photoCount} item-specific ${noun} listed, so the seller's condition claim has limited review material.`;
  }
  if (listing.seller.returnsAccepted === false) {
    return "The seller does not accept returns.";
  }
  if (listing.seller.returnsAccepted === null) {
    return "The return policy was not verified.";
  }
  if (listing.evidenceCompletenessScore < 50) {
    return "The listing has only partial review material; Lens TCG did not inspect photo content.";
  }
  return "Condition remains the seller's claim. Review the listing before deciding.";
}

function chineseCatch(listing: NormalizedListing) {
  if (listing.userSupplied) {
    return "这项推荐使用了用户手动填写的商品信息，请先回到商品页逐项核对。";
  }
  if (listing.riskLabel === "unverified") {
    return "来源没有提供卖家历史记录，因此这里只能保持中性并标为信息未核实。";
  }
  if (listing.evidence.photoCount <= 3) {
    return `来源只列出 ${listing.evidence.photoCount} 张实物照片，卖家品相声明可供复核的材料有限。`;
  }
  if (listing.seller.returnsAccepted === false) {
    return "卖家不接受退货。";
  }
  if (listing.seller.returnsAccepted === null) {
    return "退货政策尚未核实。";
  }
  if (listing.evidenceCompletenessScore < 50) {
    return "这条商品只有部分可复核材料；Lens TCG 没有检查照片内容。";
  }
  return "品相仍是卖家的声明，请在决定前查看商品页。";
}

export function buildListingCatch(listing: NormalizedListing, lang: VerdictCopyInput["lang"]) {
  return lang === "zh" ? chineseCatch(listing) : englishCatch(listing);
}

function priceDifference(
  listing: NormalizedListing,
  alternative: NormalizedListing,
  lang: VerdictCopyInput["lang"],
) {
  const delta = listingCost(alternative) - listingCost(listing);
  if (Math.abs(delta) < 0.005) return lang === "zh" ? "价格相同" : "the same price";
  const amount = formatMoney(Math.abs(delta));
  if (lang === "zh") return delta > 0 ? `贵 ${amount}` : `便宜 ${amount}`;
  return delta > 0 ? `${amount} more` : `${amount} less`;
}

function englishAlternative(listing: NormalizedListing, alternative: NormalizedListing) {
  const difference = priceDifference(listing, alternative, "en");
  if (alternative.evidenceCompletenessScore > listing.evidenceCompletenessScore) {
    return `For more review material, the next ${alternative.marketplace} option has ${alternative.evidence.photoCount} item-specific photos and is ${difference}.`;
  }
  if (alternative.sellerTrustScore > listing.sellerTrustScore) {
    return `For stronger seller signals, the next ${alternative.marketplace} option is ${difference}.`;
  }
  if (listingCost(alternative) < listingCost(listing)) {
    return `For a lower total, the next ${alternative.marketplace} option is ${difference}.`;
  }
  return `The next comparable ${alternative.marketplace} option is ${difference}.`;
}

function chineseAlternative(listing: NormalizedListing, alternative: NormalizedListing) {
  const difference = priceDifference(listing, alternative, "zh");
  if (alternative.evidenceCompletenessScore > listing.evidenceCompletenessScore) {
    return `若想先看更多可复核材料，下一条 ${alternative.marketplace} 商品有 ${alternative.evidence.photoCount} 张实物照片，${difference}。`;
  }
  if (alternative.sellerTrustScore > listing.sellerTrustScore) {
    return `若更看重卖家信号，下一条 ${alternative.marketplace} 商品${difference}。`;
  }
  if (listingCost(alternative) < listingCost(listing)) {
    return `若更看重低总价，下一条 ${alternative.marketplace} 商品${difference}。`;
  }
  return `下一条可比的 ${alternative.marketplace} 商品${difference}。`;
}

// "Why not the cheapest" — the trust-building read. When the pick is not the
// cheapest eligible copy, state the savings being skipped and the specific,
// factual weakness of the cheaper copy. Deterministic facts only: no scam
// language, no authenticity or grading claims.
const CHEAPER_TRADEOFF_MARGIN = 10;

function cheaperTradeoffs(cheapest: NormalizedListing, listing: NormalizedListing, lang: VerdictCopyInput["lang"]) {
  const reasons: string[] = [];
  if (cheapest.evidenceCompletenessScore + CHEAPER_TRADEOFF_MARGIN <= listing.evidenceCompletenessScore) {
    reasons.push(lang === "zh"
      ? `可复核材料更少（${cheapest.evidence.photoCount} 张 vs ${listing.evidence.photoCount} 张实物照片）`
      : `less to review (${cheapest.evidence.photoCount} vs ${listing.evidence.photoCount} item-specific photos)`);
  }
  if (cheapest.riskLabel === "higher_risk") {
    reasons.push(lang === "zh" ? "卖家历史记录存在风险信号" : "risk signals on its seller track record");
  } else if (cheapest.sellerTrustScore + CHEAPER_TRADEOFF_MARGIN <= listing.sellerTrustScore) {
    reasons.push(lang === "zh" ? "卖家记录更弱" : "a weaker seller record");
  }
  if (cheapest.seller.returnsAccepted === false && listing.seller.returnsAccepted !== false) {
    reasons.push(lang === "zh" ? "不接受退货" : "no returns accepted");
  }
  if (reasons.length === 0) {
    reasons.push(lang === "zh" ? "综合价值评分更低" : "a lower combined value read");
  }
  return reasons.slice(0, 2);
}

function buildWhyNotCheapest(
  listing: NormalizedListing,
  alternatives: NormalizedListing[],
  lang: VerdictCopyInput["lang"],
): string | null {
  const cheapest = [...alternatives, listing].sort((a, b) => listingCost(a) - listingCost(b))[0];
  if (!cheapest || cheapest.id === listing.id) return null;
  const savings = listingCost(listing) - listingCost(cheapest);
  if (savings < 0.01) return null;
  const reasons = cheaperTradeoffs(cheapest, listing, lang);
  if (lang === "zh") {
    return `最便宜的可比商品（${cheapest.marketplace}，${chineseTotal(cheapest)}）能省 ${formatMoney(savings)}，但它${reasons.join("、")}——省下的钱换来的是更多不确定性。`;
  }
  const joined = reasons.join(" and ");
  return `The cheapest comparable copy (${englishTotal(cheapest)} on ${cheapest.marketplace}) would save ${formatMoney(savings)}, but it has ${joined} — the saving buys extra uncertainty this pick avoids.`;
}

// The action line — the last element of the decision layer: buy / wait / pass
// in deliberately cautious language. Deterministic rules only; thresholds are
// conservative so "wait" and "pass" fire on clear signals, not noise.
const ACTION_ABOVE_MARKET_RATIO = 0.15;
const ACTION_THIN_EVIDENCE_SCORE = 25;

function buildAction(
  listing: NormalizedListing,
  marketPrice: number | null,
  lang: VerdictCopyInput["lang"],
): VerdictAction {
  if (listing.riskLabel === "higher_risk") {
    return {
      kind: "pass",
      label: lang === "zh" ? "建议放弃" : "Consider passing",
      note: lang === "zh"
        ? "该卖家的历史记录在本次比较中存在风险信号——除非商品页能打消这些疑虑，建议放弃这条，等更稳妥的货源。"
        : "This seller's track record carries risk signals in this comparison — consider passing unless the listing page resolves them.",
    };
  }
  const marketUsable = marketPrice !== null && marketPrice > 0 && listing.marketComparable && listing.costComplete && !listing.demo;
  if (marketUsable) {
    const delta = (listing.price - marketPrice) / marketPrice;
    if (delta > ACTION_ABOVE_MARKET_RATIO) {
      const pct = Math.round(delta * 100);
      return {
        kind: "wait",
        label: lang === "zh" ? "建议再等等" : "Consider waiting",
        note: lang === "zh"
          ? `这条商品的标价比 ${formatMoney(marketPrice)} 的市场参考价高出约 ${pct}%——除非急需，等待更接近市场价的货源是合理的。`
          : `This copy's item price runs about ${pct}% over the ${formatMoney(marketPrice)} market reference — unless you need it now, waiting for closer-to-market supply is reasonable.`,
      };
    }
  }
  if (listing.evidenceCompletenessScore < ACTION_THIN_EVIDENCE_SCORE) {
    return {
      kind: "wait",
      label: lang === "zh" ? "建议再等等" : "Consider waiting",
      note: lang === "zh"
        ? "目前可复核的材料很少——下单前先向卖家索要实物照片或更多细节。"
        : "There is very little to review here — ask the seller for item photos or more detail before committing.",
    };
  }
  return {
    kind: "buy",
    label: lang === "zh" ? "可以考虑入手" : "Reasonable to buy",
    note: lang === "zh"
      ? "数据支持这笔购买，但请先确认商品页与这些信息一致——品相仍是卖家的声明。"
      : "The numbers support this buy if the listing page matches these facts — condition is still the seller's claim.",
  };
}

export function buildVerdictCopy({
  listing,
  choice,
  alternatives,
  marketPrice,
  lang,
}: VerdictCopyInput): VerdictCopy {
  const alternative = alternatives[0] ?? null;
  return {
    why: lang === "zh" ? chineseWhy(listing, choice) : englishWhy(listing, choice),
    catch: buildListingCatch(listing, lang),
    alternative: alternative
      ? lang === "zh"
        ? chineseAlternative(listing, alternative)
        : englishAlternative(listing, alternative)
      : null,
    whyNotCheapest: buildWhyNotCheapest(listing, alternatives, lang),
    action: buildAction(listing, marketPrice, lang),
  };
}
