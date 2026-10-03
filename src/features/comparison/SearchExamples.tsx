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
    if (current.length === 0 && Array.isArray(stored) && stored.every((id) => typeof id === "string")) previousIds = stored;
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
  // Choose after hydration. Automatic rotation stays inside the leaf component
  // so it never rerenders the comparison form or changes its typed placeholder.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setSelection({ game, examples: nextExamples(game) }));
    return () => window.cancelAnimationFrame(frame);
  }, [game]);
  const examples = selection?.game === game ? selection.examples : EMPTY_EXAMPLES;
  const refreshExamples = (current?: SearchExample[]) => setSelection({ game, examples: nextExamples(game, current) });
  return { examples, refreshExamples };
}

export function SearchExamples({ examples, onSelect, onRefresh, active = true }: {
  examples: SearchExample[];
  onSelect: (example: SearchExample) => void;
  onRefresh: (current: SearchExample[]) => void;
  active?: boolean;
}) {
  const t = useT();
  const [rotation, setRotation] = useState<{ source: SearchExample[]; examples: SearchExample[] } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  // A game change or explicit refresh immediately replaces the rotating group.
  const visibleExamples = rotation?.source === examples ? rotation.examples : examples;

  useEffect(() => {
    if (!active || paused || hovered || focused || visibleExamples.length === 0) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      if (motion.matches || document.hidden) return;
      timer = window.setTimeout(() => {
        setRotation({ source: examples, examples: nextExamples(visibleExamples[0].game, visibleExamples) });
      }, 3000);
    };
    schedule();
    motion.addEventListener("change", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearTimeout(timer);
      motion.removeEventListener("change", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [active, examples, focused, hovered, paused, visibleExamples]);

  return (
    <div
      className="search-examples"
      role="group"
      aria-label={t.form.searchExamples}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className="search-examples-heading">
        <span>{t.form.trySearch}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="search-examples-pause"
            aria-label={paused ? t.form.resumeExamples : t.form.pauseExamples}
            title={paused ? t.form.resumeExamples : t.form.pauseExamples}
            onClick={() => setPaused((value) => !value)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              {paused ? <path d="M5 3 12 8 5 13Z" /> : <path d="M4 3h3v10H4zm5 0h3v10H9z" />}
            </svg>
          </button>
          <button type="button" onClick={() => onRefresh(visibleExamples)} disabled={examples.length === 0}>{t.form.moreExamples}</button>
        </div>
      </div>
      <div className="search-example-list">
        {visibleExamples.map((example, index) => (
          <button
            type="button"
            key={example.id}
            style={{ animationDelay: `${index * 35}ms` }}
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
