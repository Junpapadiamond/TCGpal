"use client";

import { useState, type ReactNode } from "react";
import type { CardIdentityCandidate, CardIdentitySearchResponse, SearchIntent } from "@/lib/schemas";
import { budgetBrowseCandidates, hasBrowseReference } from "@/lib/comparison/budget-browse";
import { useLang, useT } from "./i18n";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function BuyerSearchReview({ intent, coverage, onEdit }: {
  intent: SearchIntent;
  coverage?: CardIdentitySearchResponse["priceCoverage"];
  onEdit: () => void;
}) {
  const { lang } = useLang();
  const t = useT();
  const zh = lang === "zh";
  const issues = {
    currency: zh ? "目前支持美元预算。请注明美元金额后再搜索。" : "Use a USD budget for this search.",
    graded: zh ? "目前比较未评级单卡。请去掉评级要求，或修改搜索。" : "This search compares raw singles. Edit the query to remove the grading requirement.",
    card_required: zh ? "加上想找的卡名，例如 Charizard。" : "Add the card you want, such as Charizard.",
    clarify: zh ? "有条件需要确认。请用一个美元预算上限和明确的品相重新搜索。" : "Some constraints need clarification. Use one USD budget ceiling and a clear condition preference.",
  };
  return <div className="mt-5 border-y border-[#d6ded5] py-4">
    {intent.issue ? <p role="status" className="text-sm text-[#765633]">{issues[intent.issue]}</p> : <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-bold text-[#2f6f73]">
        <span>{intent.query}</span>
        {intent.budgetMax !== null && <span>{zh ? `税前总价 ≤ ${money(intent.budgetMax)}` : `Pre-tax total ≤ ${money(intent.budgetMax)}`}</span>}
        {intent.desiredCondition && <span>{t.conditions[intent.desiredCondition]}</span>}
      </div>
      {intent.conditionAssumed && <p className="mt-2 text-sm leading-6 text-[#64736c]">{zh
        ? "“好品相”暂按卖家标注的近全新（NM）理解，你可以修改。"
        : "Good condition is interpreted as seller-stated Near Mint (NM). You can change this."}</p>}
      {intent.budgetMax !== null && <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64736c]">{zh
        ? "先用 NM 单卡参考价找版本；选定后，再核对含运费和必收费用的税前总价。参考价不代表当前可买到的价格。"
        : "Explore versions using NM item-only references. After you choose, we check item, shipping and mandatory fees against your pre-tax budget. References are not live offers."}</p>}
      {coverage && coverage.checked < coverage.total && <p className="mt-1 text-xs leading-5 text-[#64736c]">{zh
        ? `已尝试更新 ${coverage.checked}/${coverage.total} 个版本的参考价。其余保留目录价格或标为待查。`
        : `Reference refresh attempted for ${coverage.checked} of ${coverage.total} versions. Others retain catalog references or remain unknown.`}</p>}
    </>}
    <button type="button" onClick={onEdit} className="mt-2 min-h-11 text-sm font-bold text-[#2f6f73] underline underline-offset-4">{zh ? "修改搜索条件" : "Edit search preferences"}</button>
  </div>;
}

export function BudgetVersions({ cards, max, renderCard }: {
  cards: CardIdentityCandidate[];
  max: number;
  renderCard: (card: CardIdentityCandidate) => ReactNode;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [showAll, setShowAll] = useState(false);
  const groups = budgetBrowseCandidates(cards, max);
  const visible = showAll ? groups.within : groups.within.slice(0, 6);
  return <div className="mt-6 space-y-6">
    <section aria-label={zh ? "可探索的版本" : "Versions to explore"}>
      <h3 className="font-serif text-2xl font-bold text-[#2f6f73]">{zh ? "可探索的版本" : "Versions to explore"}</h3>
      <p className="mt-1 text-sm leading-6 text-[#64736c]">{groups.within.length ? (zh
        ? `${groups.within.length} 个版本的参考价不超过 ${money(max)}；运费和实际品相待核对。`
        : `${groups.within.length} versions have references at or below ${money(max)}. Shipping and listing condition still need checking.`) : (zh
        ? "暂未找到参考价在预算内的版本。你仍可查看价格待查的版本，或调整预算。"
        : "No available reference falls within this budget. Explore unpriced versions below or adjust your budget.")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map(renderCard)}</div>
      {!showAll && groups.within.length > 6 && <button type="button" className="secondary-button mt-4" onClick={() => setShowAll(true)}>{zh ? `查看其余 ${groups.within.length - 6} 个版本` : `Show ${groups.within.length - 6} more versions`}</button>}
    </section>
    {([
      { key: "unknown", cards: groups.unknown, title: zh ? "价格待查" : "Reference unavailable" },
      { key: "above", cards: groups.above, title: zh ? "参考价高于预算" : "Reference above budget" },
    ]).filter(group => group.cards.length).map(group => <details key={group.key} className="rounded-md border border-[#d6ded5] p-4">
      <summary className="cursor-pointer font-bold text-[#52635c]">{group.title} · {group.cards.length}</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{group.cards.map(renderCard)}</div>
    </details>)}
  </div>;
}

export function MarketReferencePrice({ identity }: { identity: CardIdentityCandidate }) {
  const { lang } = useLang();
  const [observedAt] = useState(() => Date.now());
  const zh = lang === "zh";
  if (!hasBrowseReference(identity)) return <p className="mt-2 text-xs text-[#64736c]">{zh ? "参考价待查" : "Reference unavailable"}</p>;
  const date = new Date(identity.marketAsOf!);
  const older = observedAt - date.getTime() > 72 * 60 * 60 * 1000;
  return <div className="mt-2">
    <p className="font-mono text-sm font-bold text-[#2f6f73]">{money(identity.marketMid!)} <span className="font-sans text-xs font-normal">{zh ? "NM 单卡参考价" : "NM item reference"}</span></p>
    <a href={identity.marketUrl!} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-[#64736c] underline underline-offset-2">
      {identity.marketSource === "tcgcsv" ? "TCGCSV / TCGplayer" : "Pokémon TCG API / TCGplayer"} · {date.toLocaleDateString(zh ? "zh-CN" : "en-US")}
    </a>
    {older && <p className="mt-1 text-xs text-[#765633]">{zh ? "参考数据较早，请在比价时核对。" : "Older reference; verify current listings."}</p>}
  </div>;
}
