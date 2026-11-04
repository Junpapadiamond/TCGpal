"use client";

import { requiresRecommendationReview, type NormalizedListing } from "@/lib/schemas";
import { summarizeExclusions } from "./exclusion-summary";
import { useT } from "./i18n";
import { IconChevronDown } from "./icons";

export function SearchSummary({ candidates }: { candidates: NormalizedListing[] }) {
  const t = useT();
  const summary = summarizeExclusions(candidates);
  const review = candidates.filter(row => row.eligible && requiresRecommendationReview(row)).length;
  return <details className="group/search-summary text-xs text-[#64736c] sm:text-sm">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 focus-visible:outline-2 focus-visible:outline-[#2f6f73] [&::-webkit-details-marker]:hidden">
      <span>{t.result.sawSummary(summary.found, summary.excluded - summary.incomplete, summary.incomplete, review)}</span>
      <IconChevronDown className="h-3.5 w-3.5 shrink-0 group-open/search-summary:rotate-180" />
    </summary>
    <ul className="space-y-1 pb-3">{summary.groups.map(group => <li key={group.code}>{(t.result.exclusionGroups[group.code] ?? t.result.exclusionGroups.other)(group.count)}</li>)}</ul>
  </details>;
}
