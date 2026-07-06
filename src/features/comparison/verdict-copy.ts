import type { ConditionClaim, NormalizedListing, RankedChoice } from "@/lib/schemas";

export type VerdictCopy = {
  why: string;
  catch: string;
  alternative: string | null;
  strength: string;
};

type VerdictCopyInput = {
  listing: NormalizedListing;
  choice: RankedChoice;
  alternatives: NormalizedListing[];
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
    return "The listing has only partial review material; TCGpal did not inspect photo content.";
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
    return "这条商品只有部分可复核材料；TCGpal 没有检查照片内容。";
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

function roleScore(listing: NormalizedListing, role: RankedChoice["role"]) {
  switch (role) {
    case "best_value":
      return listing.valueScore;
    case "lowest_landed_cost":
      return listing.priceScore;
    case "safest_listing":
      return listing.safetyScore;
    case "best_condition_evidence":
      return listing.evidenceCompletenessScore;
  }
}

function strengthLabel(score: number, lang: VerdictCopyInput["lang"]) {
  if (lang === "zh") {
    if (score >= 80) return "整体表现强";
    if (score >= 65) return "整体表现稳健";
    return "有取舍，建议复核";
  }
  if (score >= 80) return "Strong overall";
  if (score >= 65) return "Solid overall";
  return "Tradeoffs to review";
}

export function buildVerdictCopy({
  listing,
  choice,
  alternatives,
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
    strength: strengthLabel(roleScore(listing, choice.role), lang),
  };
}
