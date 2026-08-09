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
  // Where this pick sits among the copies we actually found. Unlike the market
  // badge it needs no external anchor, so it renders for the cards TCGCSV does
  // not cover, and it cannot be thrown off by a stale dump or a bad crosswalk.
  pricePosition: string | null;
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
  Unknown: "未标注品相",
  "Near Mint": "近全新（NM）",
  "Lightly Played": "微瑕（LP）",
  "Moderately Played": "明显瑕疵（MP）",
  "Heavily Played": "重度瑕疵（HP）",
  Damaged: "损卡",
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
    ? "这条没标品相的商品"
    : `这条卖家标注${zhConditions[listing.claimedCondition]}的商品`;
}

function englishTotal(listing: NormalizedListing) {
  const label = listing.estimatedTax === null ? "pre-tax total" : "estimated landed total";
  return `${formatMoney(listingCost(listing))} ${label}`;
}

function chineseTotal(listing: NormalizedListing) {
  const label = listing.estimatedTax === null ? "税前总价" : "预估到手价";
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
      return `${condition}，${total}。价格、卖家记录和可查证据合起来看，它在这批里最好。`;
    case "lowest_landed_cost":
      return `${condition}，${total}，是这批可比商品里最低的。`;
    case "safest_listing":
      return `${condition}，${total}。卖家记录加商品证据，这次它最稳。`;
    case "best_condition_evidence":
      return `${condition}，${total}，有 ${listing.evidence.photoCount} 张实物照片，是这次能查的材料最多的一条。`;
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
    return "这条用的是你自己填的信息，下单前回商品页逐项核一遍。";
  }
  if (listing.riskLabel === "unverified") {
    return "来源没给卖家历史记录，所以这里保持中性，标为信息不足。";
  }
  if (listing.evidence.photoCount <= 3) {
    return `只列了 ${listing.evidence.photoCount} 张实物照片，卖家说的品相没多少材料可查。`;
  }
  if (listing.seller.returnsAccepted === false) {
    return "卖家不接受退货。";
  }
  if (listing.seller.returnsAccepted === null) {
    return "退货政策没核实。";
  }
  if (listing.evidenceCompletenessScore < 50) {
    return "这条只有一部分材料可查；Lens TCG 没看照片内容。";
  }
  return "品相是卖家自己说的，下单前去商品页再看一眼。";
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
    return `想多看点材料的话，下一条 ${alternative.marketplace} 商品有 ${alternative.evidence.photoCount} 张实物照片，${difference}。`;
  }
  if (alternative.sellerTrustScore > listing.sellerTrustScore) {
    return `更看重卖家信号的话，下一条 ${alternative.marketplace} 商品${difference}。`;
  }
  if (listingCost(alternative) < listingCost(listing)) {
    return `想再压压总价的话，下一条 ${alternative.marketplace} 商品${difference}。`;
  }
  return `下一条可比的 ${alternative.marketplace} 商品${difference}。`;
}

// Measured 2026-08-10: same-day eBay asks for one card spread 33-36 points
// (Umbreon -22.7%..+13.9%, Giratina -16.0%..+16.9%), and 5 of 8 sampled cards
// had no TCGCSV anchor at all. So "where does this sit among the copies we
// found" is both more available and more stable than "how far from reference".
function ordinal(value: number) {
  const rest = value % 100;
  if (rest >= 11 && rest <= 13) return `${value}th`;
  switch (value % 10) {
    case 1: return `${value}st`;
    case 2: return `${value}nd`;
    case 3: return `${value}rd`;
    default: return `${value}th`;
  }
}

function buildPricePosition(
  listing: NormalizedListing,
  alternatives: NormalizedListing[],
  lang: VerdictCopyInput["lang"],
): string | null {
  if (alternatives.length === 0) return null;
  const total = alternatives.length + 1;
  // Rank on comparable cost, the same number the buyer is shown, not item price.
  const cost = listingCost(listing);
  const rank = alternatives.filter((alternative) => listingCost(alternative) < cost).length + 1;
  if (lang === "zh") {
    return rank === 1
      ? `${total} 条可比商品里最便宜`
      : `${total} 条可比商品里第 ${rank} 便宜`;
  }
  return rank === 1
    ? `Cheapest of ${total} comparable copies`
    : `${ordinal(rank)} cheapest of ${total} comparable copies`;
}

// The cheaper-option line. Earlier copy argued against the cheaper listing —
// which is incoherent, because that same listing is what the Cheapest lens
// recommends one tap away. State the saving and the specific weakness, pass no
// judgement, and let the buyer choose. Deterministic facts only.
const CHEAPER_TRADEOFF_MARGIN = 10;

function cheaperTradeoffs(cheapest: NormalizedListing, listing: NormalizedListing, lang: VerdictCopyInput["lang"]) {
  const reasons: string[] = [];
  if (cheapest.evidenceCompletenessScore + CHEAPER_TRADEOFF_MARGIN <= listing.evidenceCompletenessScore) {
    reasons.push(lang === "zh"
      ? `能查的材料更少（${cheapest.evidence.photoCount} 张对 ${listing.evidence.photoCount} 张实物照片）`
      : `less to review (${cheapest.evidence.photoCount} vs ${listing.evidence.photoCount} item-specific photos)`);
  }
  if (cheapest.riskLabel === "higher_risk") {
    reasons.push(lang === "zh" ? "卖家记录上有风险信号" : "risk signals on its seller track record");
  } else if (cheapest.sellerTrustScore + CHEAPER_TRADEOFF_MARGIN <= listing.sellerTrustScore) {
    reasons.push(lang === "zh" ? "卖家记录更弱" : "a weaker seller record");
  }
  if (cheapest.seller.returnsAccepted === false && listing.seller.returnsAccepted !== false) {
    reasons.push(lang === "zh" ? "不接受退货" : "no returns accepted");
  }
  if (reasons.length === 0) {
    reasons.push(lang === "zh" ? "综合价值分更低" : "a lower combined value read");
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
    return `${formatMoney(listingCost(cheapest))} 能省 ${formatMoney(savings)} —— ${reasons.join("、")}。`;
  }
  return `${formatMoney(listingCost(cheapest))} saves ${formatMoney(savings)} — ${reasons.join(" and ")}.`;
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
  alternatives: NormalizedListing[] = [],
): VerdictAction {
  if (listing.riskLabel === "higher_risk") {
    return {
      kind: "pass",
      label: lang === "zh" ? "建议放弃" : "Consider passing",
      note: lang === "zh"
        ? "这个卖家的记录在本次比较里有风险信号。除非商品页能打消疑虑，不如先放掉这条。"
        : "This seller's track record carries risk signals in this comparison — consider passing unless the listing page resolves them.",
    };
  }
  const marketUsable = marketPrice !== null && marketPrice > 0 && listing.marketComparable && listing.costComplete && !listing.demo;
  if (marketUsable) {
    const delta = (listing.price - marketPrice) / marketPrice;
    if (delta > ACTION_ABOVE_MARKET_RATIO) {
      const pct = Math.round(delta * 100);
      // Never imply that cheaper supply will appear later — we hold no restock
      // or price-history data. Point at the cheaper rows we can actually see,
      // or at the buyer's own urgency.
      const cheaperHere = alternatives.some((alternative) => listingCost(alternative) < listingCost(listing));
      return {
        kind: "wait",
        label: lang === "zh" ? "建议再等等" : "Consider waiting",
        note: lang === "zh"
          ? cheaperHere
            ? `这条标价比 ${formatMoney(marketPrice)} 的市场参考价高出约 ${pct}%。先看看这次比较里更便宜的几条。`
            : `这条标价比 ${formatMoney(marketPrice)} 的市场参考价高出约 ${pct}%。不是急着要的话，可以先不下手。`
          : cheaperHere
            ? `About ${pct}% over the ${formatMoney(marketPrice)} market reference — check the cheaper copies in this comparison first.`
            : `About ${pct}% over the ${formatMoney(marketPrice)} market reference. No rush unless you need this exact copy.`,
      };
    }
  }
  if (listing.evidenceCompletenessScore < ACTION_THIN_EVIDENCE_SCORE) {
    const photos = listing.evidence.photoCount;
    return {
      kind: "wait",
      label: lang === "zh" ? "建议再等等" : "Consider waiting",
      note: lang === "zh"
        ? photos === 0
          ? "没有实物照片可看。下单前先找卖家要正反面照片。"
          : `只有 ${photos} 张实物照片可看。下单前先找卖家要正反面照片。`
        : photos === 0
          ? "No item-specific photos to review — ask the seller for front and back before you commit."
          : `Only ${photos} item-specific photo${photos === 1 ? "" : "s"} to review — ask the seller for front and back before you commit.`,
    };
  }
  // The note is the next step, not a summary. "What to know" already states the
  // single biggest caveat, and repeating it there is what made every buy result
  // read identically.
  const photos = listing.evidence.photoCount;
  return {
    kind: "buy",
    label: lang === "zh" ? "可以考虑入手" : "Reasonable to buy",
    note: lang === "zh"
      ? photos === 0
        ? "下单前回商品页确认版本和品相说明对得上。"
        : `下单前把 ${photos} 张实物照片过一遍，确认版本对得上。`
      : photos === 0
        ? "Confirm the print and condition notes on the listing page before you commit."
        : `Open the ${photos} photo${photos === 1 ? "" : "s"} and confirm the print before you commit.`,
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
    pricePosition: buildPricePosition(listing, alternatives, lang),
    action: buildAction(listing, marketPrice, lang, alternatives),
  };
}
