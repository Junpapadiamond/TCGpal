"use client";

import { useEffect, useState } from "react";
import type { TcgGame } from "@/lib/schemas";
import { useT } from "./i18n";
import { pickSearchExamples, type SearchExample } from "./search-examples";

const EMPTY_EXAMPLES: SearchExample[] = [];

function nextExamples(game: TcgGame, current: SearchExample[] = []): SearchExample[] {
  const key = `tcglens:search-examples:${game}`;
  let previousIds = current.map((item) => item.id);
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (Array.isArray(stored) && stored.every((id) => typeof id === "string")) previousIds = stored;
  } catch { /* Examples remain usable when browser storage is unavailable. */ }
  const examples = pickSearchExamples(game, previousIds);
  try {
    // Only public example ids, never a buyer's query, listing, or delivery data.
    sessionStorage.setItem(key, JSON.stringify(examples.map((item) => item.id)));
  } catch { /* Keep the current group in memory for the next shuffle. */ }
  return examples;
}

export function useSearchExamples(game: TcgGame) {
  const [selection, setSelection] = useState<{ game: TcgGame; examples: SearchExample[] } | null>(null);
  // Choose after hydration. No random render, timed reshuffling, or layout
  // changes while someone reads or tabs through the examples.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setSelection({ game, examples: nextExamples(game) }));
    return () => window.cancelAnimationFrame(frame);
  }, [game]);
  const examples = selection?.game === game ? selection.examples : EMPTY_EXAMPLES;
  const refreshExamples = () => setSelection({ game, examples: nextExamples(game, examples) });
  return { examples, refreshExamples };
}

export function SearchExamples({ examples, onSelect, onRefresh }: {
  examples: SearchExample[];
  onSelect: (example: SearchExample) => void;
  onRefresh: () => void;
}) {
  const t = useT();
  return (
    <div className="search-examples" role="group" aria-label={t.form.searchExamples}>
      <div className="search-examples-heading">
        <span>{t.form.trySearch}</span>
        <button type="button" onClick={onRefresh} disabled={examples.length === 0}>{t.form.moreExamples}</button>
      </div>
      <div className="search-example-list">
        {examples.map((example) => (
          <button
            type="button"
            key={example.id}
            data-example-id={example.id}
            aria-label={t.form.useExample(example.query, example.desiredCondition ? t.conditions[example.desiredCondition] : null)}
            onClick={() => onSelect(example)}
          >
            {example.query}
            {example.desiredCondition && <span className="search-example-condition"> · {example.desiredCondition === "Lightly Played" ? t.form.exampleLp : t.form.exampleNm}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
