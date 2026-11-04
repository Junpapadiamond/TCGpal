"use client";

import { useEffect, useState, useSyncExternalStore, type ComponentProps } from "react";
import { typewriterFrame } from "./onboarding";

function subscribeMotion(notify: () => void) {
  const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  motion?.addEventListener("change", notify);
  return () => motion?.removeEventListener("change", notify);
}
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// Keep animation ticks in this leaf so the form, card rail and network effects
// never rerender for a placeholder. The actual value and accessible name stay put.
export function AnimatedSearchInput({ active, examples, placeholder, onKeyDown, onPointerDown, onBlur, ...props }: ComponentProps<"input"> & { active: boolean; examples: string[] }) {
  const reduce = useSyncExternalStore(subscribeMotion, reducedMotion, () => true);
  const [interacting, setInteracting] = useState(false);
  const [tick, setTick] = useState<number | null>(null);
  const enabled = active && !reduce && !interacting;
  useEffect(() => {
    if (!enabled) return;
    let start: number;
    let interval: number;
    const stop = () => { window.clearTimeout(start); window.clearInterval(interval); };
    const schedule = () => {
      stop();
      if (document.hidden) return;
      start = window.setTimeout(() => {
        setTick(0);
        interval = window.setInterval(() => setTick(value => (value ?? 0) + 1), 90);
      }, 900);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => { stop(); document.removeEventListener("visibilitychange", schedule); };
  }, [enabled]);
  return <input {...props}
    placeholder={enabled && tick !== null ? typewriterFrame(examples, tick) || " " : placeholder}
    onPointerDown={event => { setInteracting(true); onPointerDown?.(event); }}
    onKeyDown={event => { setInteracting(true); onKeyDown?.(event); }}
    onBlur={event => { setInteracting(false); onBlur?.(event); }}
  />;
}
