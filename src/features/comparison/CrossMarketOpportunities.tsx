"use client";

import { incompleteCostOpportunity } from "@/lib/comparison/incomplete-cost";
import type { NormalizedListing } from "@/lib/schemas";
import { useLang } from "./i18n";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

// An inline explanation on the existing offer, never a second recommendation.
export function CrossMarketCostNote({ listing, candidates }: {
  listing: NormalizedListing;
  candidates: NormalizedListing[];
}) {
  const { lang } = useLang();
  const comparison = incompleteCostOpportunity(listing, candidates);
  if (!comparison) return null;
  const zh = lang === "zh";
  const budget = comparison.missingCostBudget;
  const verdict = budget === null
    ? zh ? "还没有费用齐全的商品能拿来比，请先确认缺失费用。" : "Confirm missing charges; no complete-cost listing is available as a benchmark."
    : budget > 0
      ? zh ? `额外运费和手续费低于 ${money(budget)}，才比当前最低价更便宜。` : `Cheaper only if the missing shipping and fees stay below ${money(budget)}.`
      : zh ? "已知费用已达到或超过当前最低价；还需加上缺失费用。" : "Known costs already meet or exceed the cheapest complete listing; missing charges come on top.";
  return <p className="mt-2 text-xs leading-5 text-[#806521]">
    <span className="font-bold">{zh ? "税前费用对比：" : "Pre-tax cost check: "}</span>{verdict}
  </p>;
}
