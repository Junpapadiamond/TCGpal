import { buildOfferVerdict } from "@/lib/comparison/offer-verdict";
import { rankListings } from "@/lib/comparison/ranking";
import type { NormalizedListing } from "@/lib/schemas";
import { buildListingAction, buildListingCatch, buildVerdictCopy } from "./verdict-copy";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function buildOfferVerdictCopy(listing: NormalizedListing, candidates: NormalizedListing[], lang: "en" | "zh", marketPrice: number | null = null) {
  const zh = lang === "zh";
  const assessment = buildOfferVerdict(listing, candidates);
  const missing = assessment.missingCharges.map((charge) => charge === "shipping" ? zh ? "运费" : "shipping" : zh ? "买家手续费" : "buyer fees").join(" + ");
  if (assessment.kind === "consider") {
    const peers = candidates.filter((candidate) => candidate.marketplace === listing.marketplace && buildOfferVerdict(candidate, candidates).kind === "consider");
    if (!peers.some((candidate) => candidate.id === listing.id)) peers.push(listing);
    const alternatives = peers.filter((candidate) => candidate.id !== listing.id);
    const choice = rankListings(peers).find((row) => row.listingId === listing.id);
    const action = buildListingAction(listing, marketPrice, lang, alternatives);
    const why = choice ? buildVerdictCopy({ listing, choice, alternatives, marketPrice, lang }).why
      : zh ? `这条卖家标注的商品，${listing.estimatedTax === null ? "税前总价" : "预估到手价"}为 ${money(listing.estimatedLandedCost ?? listing.preTaxTotal)}，已包含已知的运费和买家手续费。`
        : `This seller-stated listing has a complete ${listing.estimatedTax === null ? "pre-tax total" : "estimated landed total"} of ${money(listing.estimatedLandedCost ?? listing.preTaxTotal)}, including known shipping and buyer fees.`;
    return { assessment, label: action.label, why: choice ? zh ? `在本次 ${listing.marketplace} 的候选里，${why}` : `Among the comparable ${listing.marketplace} offers, ${why.replace(/ in this comparison/g, "")}` : why,
      nextStep: action.note, catch: buildListingCatch(listing, lang), tone: action.kind === "buy" ? "positive" as const : "review" as const };
  }
  if (assessment.kind === "pass") {
    return { assessment, label: zh ? "这条先跳过" : "Consider passing", tone: "neutral" as const,
      why: assessment.issues.some((issue) => issue.category === "condition")
        ? zh ? "卖家标注的品相不符合你的要求。" : "The seller's condition claim does not meet your request."
        : zh ? "这条商品未通过版本、单卡类型或在售状态核对。" : "This offer does not pass the print, raw-single or active-listing checks.",
      nextStep: zh ? "先看符合要求的其他商品。" : "Review the offers that match your request first.", catch: null };
  }
  if (assessment.kind === "inspect") {
    const why = assessment.priceNeedsReview
      ? zh ? "价格触发异常核对；先确认是不是正确版本和真实单卡。" : "The price triggered a review check; verify the print and actual raw card before treating it as a deal."
      : !assessment.identityConfirmed || assessment.issues.some((issue) => issue.category === "identity")
        ? zh ? "当前版本证据不足，不能把这条当作已确认的同款。" : "The available identity evidence does not establish this as the confirmed print."
        : !assessment.conditionConfirmed
          ? zh ? "卖家未明确标注符合要求的卡片品相。" : "The seller has not established the requested card condition."
          : zh ? "判断依据还不完整，需要回商品页核对。" : "The decision evidence is incomplete; check the listing page first.";
    return { assessment, label: assessment.priceNeedsReview ? zh ? "价格异常，先核对" : "Inspect the unusual price" : zh ? "先核对再决定" : "Inspect before deciding",
      tone: "review" as const, why,
      nextStep: missing ? zh ? `先核对版本、品相和实物照片，再确认${missing}；暂时无法比较总价。`
        : `Verify the print, condition and photos, then confirm ${missing}; checkout cost is not yet comparable.`
        : zh ? "回商品页核对版本、品相和实物照片。" : "Verify the print, seller-stated condition and actual item photos on the listing page.", catch: null };
  }
  const benchmarkId = assessment.comparison?.comparisonListingId;
  const benchmark = candidates.find((candidate) => candidate.id === benchmarkId);
  const budget = assessment.comparison?.missingCostBudget ?? null;
  if (budget !== null && budget <= 0 && benchmark) {
    const gap = Math.round((assessment.knownSubtotal - benchmark.preTaxTotal) * 100) / 100;
    return { assessment, label: zh ? "先看费用齐全的选项" : "Review the complete-cost option first", tone: "neutral" as const,
      why: zh ? `已知费用 ${money(assessment.knownSubtotal)} ${gap > 0 ? `比 ${benchmark.marketplace} 的 ${money(benchmark.preTaxTotal)} 税前总价高 ${money(gap)}` : `已达到 ${benchmark.marketplace} 的 ${money(benchmark.preTaxTotal)} 税前总价`}，还要加上未知的${missing}。`
        : `Known costs of ${money(assessment.knownSubtotal)} already ${gap > 0 ? `exceed the ${money(benchmark.preTaxTotal)} ${benchmark.marketplace} pre-tax benchmark by ${money(gap)}` : `match the ${money(benchmark.preTaxTotal)} ${benchmark.marketplace} pre-tax benchmark`}; missing ${missing} come on top.`,
      nextStep: zh ? "若更看重这条的品相或照片，先到平台确认；按已知费用看，它目前没有价格优势。"
        : "Check this listing if its condition or photos matter more to you; it has no price advantage on known costs.", catch: null };
  }
  return { assessment, label: budget !== null ? zh ? "值得核对额外费用" : "Worth checking the extra costs" : zh ? "确认费用后再决定" : "Confirm costs before deciding",
    tone: "review" as const,
    why: budget !== null && benchmark ? zh ? `${missing}低于 ${money(budget)}，税前才比 ${benchmark.marketplace} 当前最低完整总价 ${money(benchmark.preTaxTotal)} 更便宜。`
      : `Cheaper than the ${money(benchmark.preTaxTotal)} ${benchmark.marketplace} pre-tax benchmark only if ${missing} stay below ${money(budget)}.`
      : zh ? `已知费用 ${money(assessment.knownSubtotal)}；${missing}仍未知，目前也没有费用齐全的同款可作基准。`
        : `Known costs are ${money(assessment.knownSubtotal)}; ${missing} are unknown and there is no complete-cost match for a benchmark.`,
    nextStep: zh ? "去平台确认额外费用、是否仍在售，并查看完整实拍；此判断不等于购买推荐。"
      : "Confirm the extra charges and availability, then inspect the full item photos. This is a conditional verdict, not a ranked buy.", catch: null };
}
