import type { RecallCoverage } from "@/lib/schemas";

export function recallHeadline(status: RecallCoverage["status"], lang: "en" | "zh") {
  const text = {
    cheaper_found: ["Search check found a cheaper match", "搜索抽查发现了更便宜的合格结果"],
    additional_match: ["Search check found an additional match", "搜索抽查发现了新增合格结果"],
    no_cheaper_found: ["No cheaper match in this sample", "本次抽查未发现更便宜的合格结果"],
    inconclusive: ["Search check: more evidence needed", "搜索抽查：仍需补充证据"],
    failed: ["Search check unavailable", "搜索抽查未完成"],
    disabled: ["Search check is off", "搜索抽查未启用"],
  };
  return text[status][lang === "zh" ? 1 : 0];
}

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const zhReasons: Record<string, string> = {
  condition_unstated: "卖家未标注品相", condition_below_requested: "品相低于要求", title_condition_below_requested: "标题品相低于要求",
  shipping_unknown: "运费未知", buyer_fee_unknown: "必付买家费用未知", identity_unverified: "确切卡图未获证实",
  identity_sibling_mismatch: "同卡号的其他版本", identity_variant_mismatch: "版本不符", identity_low_confidence: "卡片身份不确定",
  identity_price_guard: "价格与确切版本不符", price_far_below_market: "价格远低于参考价", price_far_above_exact_market: "价格过高，需复核",
  excluded_product_type: "不支持的商品类型", not_raw_single: "不是裸卡单张", listing_inactive: "当前不在售",
  language_conflict: "语言不符", language_unverified: "商品未标注语言，请在原页面核对", over_budget: "含必付费用的税前总价超预算",
};

export function SearchCoverage({ coverage, lang }: { coverage?: RecallCoverage[]; lang: "en" | "zh" }) {
  const zh = lang === "zh";
  return coverage?.map((check, index) => (
    <section key={`${check.marketplace}-${index}`} aria-label={zh ? "搜索覆盖抽查" : "Search coverage check"} className="mt-4 rounded-lg border border-[#d6ded5] bg-[#f7f9f5] p-4 text-sm leading-6 text-[#52635c]">
      <h3 className="font-bold text-[#24312f]">{recallHeadline(check.status, lang)}</h3>
      <p className="mt-1 text-xs">{check.marketplace} · {new Date(check.observedAt).toLocaleString(zh ? "zh-CN" : "en-US", { timeZone: "UTC" })} UTC</p>
      <p className="mt-2">{zh ? "最多抽查 10 条低价搜索摘要；这不能证明搜索已覆盖全部商品。缺少费用、品相或版本证据的结果不会被当作合格低价。" : "Up to 10 low-price search summaries checked; this does not prove that the search is complete. Missing cost, condition or print evidence cannot establish a cheaper match."}</p>
      {check.listing && (
        <div className="mt-3 border-l-2 border-[#2f6f73] pl-3">
          <p className="font-bold text-[#24312f]">{check.listing.title}</p>
          <p>{money(check.listing.preTaxTotal)} {zh ? "税前总价" : "pre-tax total"}
            {check.baselineCheapestTotal !== null && ` · ${zh ? "原候选集最低" : "Original cheapest"} ${money(check.baselineCheapestTotal)}`}</p>
          <p className="text-xs">{zh ? "商品" : "Item"} {money(check.listing.price)} + {zh ? "运费" : "shipping"} {check.listing.shipping === null ? "?" : money(check.listing.shipping)} + {zh ? "必付费用" : "mandatory fees"} {check.listing.buyerFee === null ? "?" : money(check.listing.buyerFee)}</p>
          <p className="mt-1 text-xs">{zh ? "通过相同规则校验，尚未替换原推荐。品相为卖家声明，照片内容未经验证，请查看商品并核对结账费用。" : "Passed the same checks; the original recommendation is unchanged. Condition is seller-claimed and photos are unverified. Review the listing and checkout costs."}</p>
          {check.listing.url && <a className="mt-2 inline-flex min-h-11 items-center font-bold text-[#2f6f73] underline underline-offset-4" href={check.listing.url} target="_blank" rel="noopener noreferrer">{zh ? "查看新增合格商品 ↗" : "Review additional match ↗"}</a>}
        </div>
      )}
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 font-bold">{zh ? "查看抽查范围与排除理由" : "Check coverage and exclusions"}</summary>
        <p>{zh ? `${check.returnedCount} 条抽样 · ${check.newCount} 条新增 · ${check.comparableCount} 条可比 · ${check.unresolvedCount} 条证据不足` : `${check.returnedCount} sampled · ${check.newCount} new · ${check.comparableCount} comparable · ${check.unresolvedCount} unresolved`}</p>
        {check.query && <p className="mt-2 break-words">{zh ? "低价抽查查询" : "Price-sorted query"}: {check.query.value}</p>}
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {check.attempts.map((attempt, i) => <li key={i} className="break-words">
            {attempt.kind === "epid" ? "ePID" : zh ? attempt.kind === "padded" ? "补零查询" : "关键词" : attempt.kind === "padded" ? "Padded query" : "Keyword"}: {attempt.value}
            {" — "}{attempt.status === "failed" ? zh ? "失败，条数未知" : "failed, count unknown" : zh ? `${attempt.returnedCount} 条返回 · ${attempt.usdCount} 条美元` : `${attempt.returnedCount} returned · ${attempt.usdCount} USD`}
          </li>)}
        </ol>
        {check.excluded.length > 0 && <div className="mt-3">
          <h4 className="font-bold">{zh ? "抽查中商品价最低的 3 条排除结果（最多）" : "Up to 3 lowest item-price exclusions in the sample"}</h4>
          <ul className="mt-2 space-y-2">{check.excluded.map(row => <li key={row.id}>
            <p>{money(row.price)} {zh ? "商品价" : "item price"} · {row.title}</p>
            <p className="text-xs">{row.eligibilityIssues.map(issue => zh ? zhReasons[issue.code] ?? issue.message : issue.message).join(" · ")}</p>
          </li>)}</ul>
        </div>}
      </details>
    </section>
  ));
}
