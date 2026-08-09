"use client";

import { useEffect, useRef, useState } from "react";
import type { ComparisonReport, RankedChoice } from "@/lib/schemas";
import type { Lang } from "./i18n";

type UseAiVerdictNoteInput = {
  enabled: boolean;
  report: ComparisonReport;
  role: RankedChoice["role"] | null;
  lang: Lang;
};

function noteKey(report: ComparisonReport, role: RankedChoice["role"], lang: Lang) {
  return `${report.generatedAt}|${role}|${lang}`;
}

// Fetches the AI-written Action note for the lens currently on screen. Every
// failure path — flag off, request error, model rejected by the checker — returns
// null, and the caller keeps rendering the deterministic sentence. The note is
// only ever an upgrade to copy that already exists.
export function useAiVerdictNote({ enabled, report, role, lang }: UseAiVerdictNoteInput): string | null {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !role) return;
    const key = noteKey(report, role, lang);
    if (requested.current.has(key)) return;
    requested.current.add(key);

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/agent/listing-compare/verdict-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report, role, lang }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const json = (await response.json()) as { note?: string | null };
        const note = typeof json.note === "string" ? json.note.trim() : "";
        if (note) setNotes((current) => ({ ...current, [key]: note }));
      } catch {
        // Silent by design: the deterministic note is already on screen.
      }
    })();

    return () => controller.abort();
  }, [enabled, report, role, lang]);

  if (!enabled || !role) return null;
  return notes[noteKey(report, role, lang)] ?? null;
}
