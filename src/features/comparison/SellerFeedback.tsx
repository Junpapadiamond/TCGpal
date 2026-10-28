"use client";

import { useEffect, useId, useRef, useState } from "react";
import { sellerFeedbackResponseSchema, type NormalizedListing, type SellerFeedbackResponse } from "@/lib/schemas";
import { useLang, useT } from "./i18n";

export function SellerFeedback({ listing }: { listing: Pick<NormalizedListing, "marketplace" | "url" | "demo"> }) {
  if (listing.demo || listing.marketplace !== "eBay" || !listing.url) return null;
  return <FeedbackDisclosure key={listing.url} listingUrl={listing.url} />;
}

function FeedbackDisclosure({ listingUrl }: { listingUrl: string }) {
  const t = useT().sellerFeedback;
  const { lang } = useLang();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SellerFeedbackResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function check() {
    if (controller.current) return;
    const pending = new AbortController();
    controller.current = pending;
    setLoading(true); setFailed(false);
    const timeout = setTimeout(() => pending.abort(), 9000);
    try {
      const response = await fetch("/api/agent/seller-feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingUrl }), signal: pending.signal,
      });
      if (!response.ok) throw new Error();
      const parsed = sellerFeedbackResponseSchema.parse(await response.json());
      if (!pending.signal.aborted) setResult(parsed);
    } catch { setFailed(true); }
    finally { clearTimeout(timeout); controller.current = null; setLoading(false); }
  }

  return <div className="mt-3 border-t border-[#e4ebe3] pt-2 text-xs text-[#52635c]">
    <button type="button" className="min-h-11 rounded px-1 font-bold text-[#2f6f73] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73]"
      aria-expanded={open} aria-controls={id} onClick={() => {
        setOpen(!open);
        if (!open && !result && !loading && !failed) void check();
      }}>{t.title}</button>
    <div id={id} hidden={!open} aria-live="polite" aria-busy={loading} className="space-y-2 pb-2 leading-5">
      {loading && <p>{t.loading}</p>}
      {result?.status === "complete" && <dl className="grid gap-2 sm:grid-cols-2">
        {result.periods.map(period => <div key={period.days}>
          <dt className="font-semibold">{t.period(period.days)}</dt>
          <dd className="tabular-nums">{t.counts(period.positive, period.neutral, period.negative)}</dd>
        </div>)}
      </dl>}
      {result?.status === "no_data" && <p>{t.empty}</p>}
      {result?.status === "disabled" && <p>{t.disabled}</p>}
      {(failed || result?.status === "unavailable") && <p>{t.unavailable}</p>}
      {!loading && (failed || result?.status === "unavailable") && <button className="min-h-11 rounded px-1 font-bold text-[#2f6f73] underline focus-visible:outline-2" type="button" onClick={() => void check()}>{t.retry}</button>}
      {result && <p className="text-[#64736c]">{result.source} · {t.checked} <time dateTime={result.observedAt}>
        {new Date(result.observedAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { timeZoneName: "short" })}
      </time></p>}
      <p className="max-w-prose text-[#64736c]">{t.disclaimer}</p>
    </div>
  </div>;
}
