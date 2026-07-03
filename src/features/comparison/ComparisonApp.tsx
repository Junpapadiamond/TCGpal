"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import {
  ArrowUpRight,
  BadgeCheck,
  Calculator,
  Camera,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  FileSearch,
  Globe2,
  Info,
  Link2,
  LoaderCircle,
  MapPin,
  ReceiptText,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import { initializeAnalytics, trackEvent } from "@/lib/analytics";
import { LanguageProvider, useLang, useT, type Dict, type Lang } from "./i18n";
import {
  comparisonReportSchema,
  type CardIdentityCandidate,
  type ComparisonReport,
  type ComparisonRequest,
  type ConditionClaim,
  type ListingEvidence,
  type Marketplace,
  type NormalizedListing,
  type RankedChoice,
  type SourceStatus,
} from "@/lib/schemas";

const marketplaces: Marketplace[] = [
  "eBay",
  "TCGplayer",
  "Facebook",
  "Reddit",
  "Mercari",
  "Whatnot",
  "Local shop",
  "Other",
];

const conditions: ConditionClaim[] = [
  "Unknown",
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
];

type ComparisonForm = {
  url: string;
  marketplace: Marketplace;
  cardName: string;
  setCode: string;
  cardNumber: string;
  listingTitle: string;
  description: string;
  price: string;
  shipping: string;
  postalCode: string;
  taxRatePercent: string;
  claimedCondition: ConditionClaim;
  desiredCondition: ConditionClaim;
  feedbackPercentage: string;
  feedbackCount: string;
  returnsAccepted: boolean;
  buyerProtection: boolean;
  photoCount: string;
  frontBackExplicit: boolean;
  closeupsExplicit: boolean;
  surfaceExplicit: boolean;
  substantiveConditionNotes: boolean;
};

const defaultValues: ComparisonForm = {
  url: "",
  marketplace: "eBay",
  cardName: "",
  setCode: "",
  cardNumber: "",
  listingTitle: "",
  description: "",
  price: "",
  shipping: "",
  postalCode: "",
  taxRatePercent: "",
  claimedCondition: "Unknown",
  desiredCondition: "Unknown",
  feedbackPercentage: "",
  feedbackCount: "",
  returnsAccepted: false,
  buyerProtection: false,
  photoCount: "0",
  frontBackExplicit: false,
  closeupsExplicit: false,
  surfaceExplicit: false,
  substantiveConditionNotes: false,
};

export function ComparisonApp() {
  return (
    <LanguageProvider>
      <ComparisonExperience />
    </LanguageProvider>
  );
}

function ComparisonExperience() {
  const t = useT();
  const form = useForm<ComparisonForm>({ defaultValues });
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [pendingRequest, setPendingRequest] = useState<ComparisonRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [listingOpen, setListingOpen] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const marketplace = useWatch({ control: form.control, name: "marketplace" });
  const sourceUrl = useWatch({ control: form.control, name: "url" });
  const postalCode = useWatch({ control: form.control, name: "postalCode" });
  const taxRatePercent = useWatch({ control: form.control, name: "taxRatePercent" });
  const cardName = useWatch({ control: form.control, name: "cardName" });
  const setCode = useWatch({ control: form.control, name: "setCode" });
  const cardNumber = useWatch({ control: form.control, name: "cardNumber" });
  const isManual = marketplace !== "eBay" || !sourceUrl.trim();

  useEffect(() => {
    initializeAnalytics();
  }, []);

  useEffect(() => {
    if (/^https:\/\/(?:www\.|m\.)?ebay\.com\//i.test(sourceUrl)) {
      form.setValue("marketplace", "eBay");
    }
  }, [form, sourceUrl]);

  // Remember buyer delivery context so it does not need re-typing each session.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("tcgpal:buyer") ?? "{}");
      if (typeof saved.postalCode === "string" && saved.postalCode) {
        form.setValue("postalCode", saved.postalCode);
      }
      if (typeof saved.taxRatePercent === "string" && saved.taxRatePercent) {
        form.setValue("taxRatePercent", saved.taxRatePercent);
      }
    } catch {
      /* ignore unavailable or malformed storage */
    }
  }, [form]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "tcgpal:buyer",
        JSON.stringify({
          postalCode: postalCode ?? "",
          taxRatePercent: taxRatePercent ?? "",
        }),
      );
    } catch {
      /* ignore unavailable storage */
    }
  }, [postalCode, taxRatePercent]);

  async function submitComparison(values: ComparisonForm, confirmedCardId?: string) {
    if (report && !confirmedCardId) {
      trackEvent("second_comparison_started", {
        marketplace: values.marketplace,
      });
    }

    const request = buildRequest(values, confirmedCardId);
    setPendingRequest(request);
    setLoading(true);
    setError(null);
    setFeedbackSent(false);
    const startedAt = Date.now();

    trackEvent(confirmedCardId ? "card_identity_confirmed" : "comparison_started", {
      marketplace: request.sourceListing.marketplace,
    });
    trackEvent("source_detected", { marketplace: request.sourceListing.marketplace });
    if (request.sourceListing.marketplace !== "eBay") {
      trackEvent("manual_candidate_added", { marketplace: request.sourceListing.marketplace });
    }

    try {
      const response = await fetch("/api/agent/listing-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Comparison failed.");
      const parsed = comparisonReportSchema.parse(json);
      setReport(parsed);
      const duration = Date.now() - startedAt;
      trackEvent("comparison_completed", {
        marketplace: request.sourceListing.marketplace,
        status: parsed.status,
        demo_mode: parsed.demoMode,
        candidate_count: parsed.candidates.length,
        duration_bucket: duration < 5000 ? "under_5s" : duration < 15000 ? "5_to_15s" : "over_15s",
      });
      window.requestAnimationFrame(() => {
        document.getElementById("comparison-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Comparison failed.";
      setError(message);
      trackEvent("comparison_failed", { marketplace: request.sourceListing.marketplace });
    } finally {
      setLoading(false);
    }
  }

  function useDemo() {
    const demo: ComparisonForm = {
      ...defaultValues,
      url: "https://www.ebay.com/itm/123456789012",
      marketplace: "eBay",
      cardName: "Umbreon VMAX",
      setCode: "SWSH7",
      cardNumber: "215/203",
      listingTitle: "Umbreon VMAX Evolving Skies 215/203 raw",
      description: "Front and back photos with corner closeups. Seller notes one tiny white dot.",
      price: "1240",
      shipping: "9.95",
      postalCode: "10001",
      taxRatePercent: "8.0",
      claimedCondition: "Near Mint",
      desiredCondition: "Unknown",
      feedbackPercentage: "99.4",
      feedbackCount: "482",
      returnsAccepted: true,
      buyerProtection: true,
      photoCount: "6",
      frontBackExplicit: true,
      closeupsExplicit: true,
      surfaceExplicit: false,
      substantiveConditionNotes: true,
    };
    form.reset(demo);
    void submitComparison(demo, "swsh7-215");
  }

  async function confirmIdentity(identity: CardIdentityCandidate) {
    if (!pendingRequest) return;
    const confirmedRequest = { ...pendingRequest, confirmedCardId: identity.id };
    setPendingRequest(confirmedRequest);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/listing-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmedRequest),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Comparison failed.");
      const parsed = comparisonReportSchema.parse(json);
      setReport(parsed);
      trackEvent("card_identity_confirmed", { confidence: identity.confidence });
      trackEvent("comparison_completed", {
        marketplace: pendingRequest.sourceListing.marketplace,
        status: parsed.status,
        demo_mode: parsed.demoMode,
        candidate_count: parsed.candidates.length,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Comparison failed.");
      trackEvent("comparison_failed", { marketplace: pendingRequest.sourceListing.marketplace });
    } finally {
      setLoading(false);
    }
  }

  // R5: a failed comparison keeps the exact request around so one tap retries
  // it — the user never has to re-type anything after a backend hiccup.
  async function retryComparison() {
    if (!pendingRequest || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/listing-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingRequest),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Comparison failed.");
      const parsed = comparisonReportSchema.parse(json);
      setReport(parsed);
      trackEvent("comparison_completed", {
        marketplace: pendingRequest.sourceListing.marketplace,
        status: parsed.status,
        demo_mode: parsed.demoMode,
        candidate_count: parsed.candidates.length,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Comparison failed.");
      trackEvent("comparison_failed", { marketplace: pendingRequest.sourceListing.marketplace });
    } finally {
      setLoading(false);
    }
  }

  function sendFeedback(changedDecision: boolean) {
    setFeedbackSent(true);
    trackEvent("decision_feedback_submitted", { changed_decision: changedDecision });
  }

  return (
    <main className="min-h-screen bg-[#f4f7f3] text-[#24312f]">
      <Header />
      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <section className="paper-panel p-5 sm:p-7">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <div className="eyebrow">
                <SearchCheck className="h-4 w-4" />
                {t.hero.eyebrow}
              </div>
              <h1 className="mt-3 max-w-4xl font-serif text-4xl font-black leading-[0.98] tracking-[-0.035em] text-[#2f6f73] sm:text-5xl">
                {t.hero.title}
              </h1>
            </div>
            <p className="max-w-xl text-sm leading-6 text-[#64736c] sm:text-base sm:leading-7">
              {t.hero.subtitle}
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-[#52635c] sm:text-sm">
            <Promise icon={ReceiptText} label={t.hero.promiseTax} />
            <Promise icon={ShieldCheck} label={t.hero.promiseSeller} />
            <Promise icon={Camera} label={t.hero.promiseEvidence} />
          </div>
        </section>

        <section id="compare" className="mt-6 rounded-md border border-[#d6ded5] bg-[#fcfbf6] shadow-[0_18px_60px_rgba(36,49,47,0.06)]">
          <div className="border-b border-[#d6ded5] px-5 py-5 sm:px-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="font-serif text-3xl font-bold text-[#2f6f73]">{t.form.heading}</h2>
              <button className="text-button" type="button" onClick={useDemo} disabled={loading}>
                <Sparkles className="h-4 w-4" />
                {t.form.runDemo}
              </button>
            </div>
          </div>

          <form className="p-5 sm:p-7" onSubmit={form.handleSubmit((values) => submitComparison(values))}>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="field">
                <span>{t.form.cardName}</span>
                <input {...form.register("cardName")} placeholder={t.form.ph.cardName} required />
              </label>
              <label className="field">
                <span>{t.form.set}</span>
                <input {...form.register("setCode")} placeholder={t.form.ph.set} />
              </label>
              <label className="field">
                <span>{t.form.collectorNumber}</span>
                <input {...form.register("cardNumber")} placeholder={t.form.ph.collectorNumber} />
              </label>
            </div>
            <CardKeyPreview name={cardName} setCode={setCode} cardNumber={cardNumber} />
            <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-[#64736c]">
              <SearchCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2f6f73]" />
              {t.form.collectorHelp}
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label className="field">
                <span>{t.form.deliveryZip}</span>
                <div className="input-with-icon">
                  <MapPin className="h-4 w-4" />
                  <input {...form.register("postalCode")} inputMode="numeric" placeholder={t.form.ph.zip} />
                </div>
              </label>
            </div>

            <button
              className="mt-4 flex w-full items-center justify-between rounded-md border border-[#d6ded5] bg-[#f4f7f3] px-4 py-3 text-left text-sm font-bold text-[#52635c]"
              type="button"
              aria-expanded={optionsOpen}
              onClick={() => setOptionsOpen((current) => !current)}
            >
              <span className="flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                {t.form.optionsToggle}
              </span>
              <ChevronDown className={`h-4 w-4 transition ${optionsOpen ? "rotate-180" : ""}`} />
            </button>
            {optionsOpen && (
              <div className="mt-4 grid gap-4 rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-5 md:grid-cols-2">
                <label className="field">
                  <span>{t.form.optionalTaxRate}</span>
                  <div className="input-suffix">
                    <input {...form.register("taxRatePercent")} inputMode="decimal" placeholder={t.form.ph.tax} />
                    <span>%</span>
                  </div>
                </label>
                <label className="field">
                  <span>{t.form.desiredCondition}</span>
                  <select {...form.register("desiredCondition")}>
                    {conditions.map((value) => <option key={value} value={value}>{t.conditions[value]}</option>)}
                  </select>
                </label>
              </div>
            )}

            <button
              className="mt-4 flex w-full items-center justify-between rounded-md border border-[#d6ded5] bg-[#f4f7f3] px-4 py-3 text-left text-sm font-bold text-[#52635c]"
              type="button"
              aria-expanded={listingOpen}
              onClick={() => setListingOpen((current) => !current)}
            >
              <span className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-[#2f6f73]" />
                {t.form.listingToggle}
              </span>
              <ChevronDown className={`h-4 w-4 transition ${listingOpen ? "rotate-180" : ""}`} />
            </button>
            {listingOpen && (
            <div className="mt-4 rounded-md border border-dashed border-[#c9d7ce] bg-[#f7f9f5] p-5">
              <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
                <label className="field">
                  <span>{t.form.listingUrl}</span>
                  <div className="input-with-icon">
                    <Globe2 className="h-4 w-4" />
                    <input
                      {...form.register("url")}
                      placeholder={t.form.ph.listingUrl}
                    />
                  </div>
                  <small>{t.form.listingUrlHelp}</small>
                </label>
                <label className="field">
                  <span>{t.form.marketplace}</span>
                  {isManual ? (
                    <select {...form.register("marketplace")}>
                      {marketplaces.map((value) => <option key={value} value={value}>{t.marketplaces[value] ?? value}</option>)}
                    </select>
                  ) : (
                    <div className="flex min-h-11 items-center gap-2 rounded-md border border-[#c9d7ce] bg-[#e7efe8] px-3 text-sm font-bold text-[#2f6f73]">
                      <BadgeCheck className="h-4 w-4" />
                      {t.form.ebayAutoDetected}
                    </div>
                  )}
                </label>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <label className="field md:col-span-2">
                  <span>{t.form.listingTitle}</span>
                  <input {...form.register("listingTitle")} placeholder={t.form.ph.listingTitle} />
                </label>
                <label className="field">
                  <span>{t.form.askingPrice}</span>
                  <div className="input-prefix">
                    <span>$</span>
                    <input {...form.register("price")} inputMode="decimal" placeholder={t.form.ph.price} />
                  </div>
                </label>
                <label className="field">
                  <span>{t.form.shipping}</span>
                  <div className="input-prefix">
                    <span>$</span>
                    <input {...form.register("shipping")} inputMode="decimal" placeholder={t.form.ph.shipping} />
                  </div>
                </label>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <label className="field">
                  <span>{t.form.sellerClaimedCondition}</span>
                  <select {...form.register("claimedCondition")}>
                    {conditions.map((value) => <option key={value} value={value}>{t.conditions[value]}</option>)}
                  </select>
                </label>
              </div>
            </div>
            )}

            <button
              className="mt-4 flex w-full items-center justify-between rounded-md border border-[#d6ded5] bg-[#f4f7f3] px-4 py-3 text-left text-sm font-bold text-[#52635c]"
              type="button"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((current) => !current)}
            >
              <span className="flex items-center gap-2">
                <FileSearch className="h-4 w-4" />
                {t.form.advancedToggle}
              </span>
              <ChevronDown className={`h-4 w-4 transition ${advancedOpen ? "rotate-180" : ""}`} />
            </button>

            {advancedOpen && (
              <div className="mt-4 grid gap-5 rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-5 lg:grid-cols-2">
                <div>
                  <label className="field">
                    <span>{t.form.sellerNotes}</span>
                    <textarea
                      {...form.register("description")}
                      rows={5}
                      placeholder={t.form.ph.sellerNotes}
                    />
                  </label>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <label className="field">
                      <span>{t.form.feedbackPct}</span>
                      <input {...form.register("feedbackPercentage")} inputMode="decimal" placeholder={t.form.ph.feedbackPct} />
                    </label>
                    <label className="field">
                      <span>{t.form.feedbackCount}</span>
                      <input {...form.register("feedbackCount")} inputMode="numeric" placeholder={t.form.ph.feedbackCount} />
                    </label>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <CheckField label={t.form.returnsAccepted} registration={form.register("returnsAccepted")} />
                    <CheckField label={t.form.buyerProtection} registration={form.register("buyerProtection")} />
                  </div>
                </div>
                <div>
                  <label className="field">
                    <span>{t.form.photoCount}</span>
                    <input {...form.register("photoCount")} inputMode="numeric" min="0" />
                  </label>
                  <p className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-[#64736c]">{t.form.explicitEvidence}</p>
                  <div className="mt-3 grid gap-2">
                    <CheckField label={t.form.evFrontBack} registration={form.register("frontBackExplicit")} />
                    <CheckField label={t.form.evCorners} registration={form.register("closeupsExplicit")} />
                    <CheckField label={t.form.evSurface} registration={form.register("surfaceExplicit")} />
                    <CheckField label={t.form.evNotes} registration={form.register("substantiveConditionNotes")} />
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-sm leading-6 text-[#64736c]">
                <Info className="mt-1 h-4 w-4 shrink-0 text-[#2f6f73]" />
                <span>{t.form.conditionDisclaimer}</span>
              </div>
              <button className="primary-button shrink-0" type="submit" disabled={loading}>
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
                {loading ? t.form.submitLoading : t.form.submitIdle}
              </button>
            </div>
          </form>
        </section>

        {!report && !loading && <HowItWorks />}

        {loading && <LoadingLoop />}
        {error && <ErrorNotice message={error} onRetry={pendingRequest ? retryComparison : undefined} />}
        {report?.status === "needs_confirmation" && !loading && (
          <IdentityConfirmation identities={report.identityCandidates} onConfirm={confirmIdentity} />
        )}
        {report && report.status !== "needs_confirmation" && !loading && (
          <ComparisonResult report={report} feedbackSent={feedbackSent} onFeedback={sendFeedback} />
        )}
      </div>
    </main>
  );
}

function Header() {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <header className="border-b border-[#d6ded5] bg-[#f7f9f5]/95">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <a className="flex items-center gap-3" href="#" aria-label={t.header.home}>
          <Image src="/tcgpal-logo-horizontal.svg" alt="TCGpal" width={142} height={41} priority />
        </a>
        <div className="flex items-center gap-3 sm:gap-6">
          <nav className="hidden items-center gap-6 text-sm font-bold text-[#64736c] sm:flex">
            <a className="hover:text-[#2f6f73]" href="#compare">{t.header.checkListing}</a>
            <a className="hover:text-[#2f6f73]" href="#method">{t.header.method}</a>
            <span className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] px-3 py-2 text-[#2f6f73]">{t.header.scopeBadge}</span>
          </nav>
          <LanguageToggle lang={lang} setLang={setLang} t={t} />
        </div>
      </div>
    </header>
  );
}

function LanguageToggle({ lang, setLang, t }: { lang: Lang; setLang: (lang: Lang) => void; t: Dict }) {
  return (
    <div
      className="inline-flex items-center rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-0.5 text-xs font-bold"
      role="group"
      aria-label={t.toggleAria}
    >
      {(["en", "zh"] as const).map((value) => {
        const active = lang === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setLang(value)}
            aria-pressed={active}
            className={`rounded px-2.5 py-1 transition ${active ? "bg-[#2f6f73] text-[#fcfbf6]" : "text-[#52635c] hover:text-[#2f6f73]"}`}
          >
            {t.langName[value]}
          </button>
        );
      })}
    </div>
  );
}

function Promise({ icon: Icon, label }: { icon: typeof ReceiptText; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[#d6ded5] bg-[#f7f9f5] px-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5 text-[#2f6f73]" />
      {label}
    </span>
  );
}

function CardKeyPreview({ name, setCode, cardNumber }: { name: string; setCode: string; cardNumber: string }) {
  const t = useT();
  if (!setCode.trim() && !cardNumber.trim()) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-[#c9d7ce] bg-[#f7f9f5] px-3 py-2.5 text-xs">
      <span className="font-black uppercase tracking-[0.1em] text-[#64736c]">{t.catalogKey.label}</span>
      {name.trim() && <span className="rounded bg-[#e7efe8] px-2 py-1 font-bold text-[#2f6f73]">{name.trim()}</span>}
      {setCode.trim() && <span className="rounded border border-[#c9d7ce] bg-[#fcfbf6] px-2 py-1 font-mono font-black uppercase text-[#2f6f73]">{setCode.trim()}</span>}
      {cardNumber.trim() && <span className="rounded border border-[#e2c879] bg-[#fff8dc] px-2 py-1 font-mono font-black text-[#6f5a22]">#{cardNumber.trim()}</span>}
      <span className="rounded border border-[#d6ded5] bg-[#fcfbf6] px-2 py-1 font-bold text-[#52635c]">{t.catalogKey.language}</span>
    </div>
  );
}

function CardIdentityRail({ identity, className = "" }: { identity: CardIdentityCandidate; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="inline-flex items-center gap-2 rounded-md border border-[#c9d7ce] bg-[#fcfbf6] px-2.5 py-1.5 text-xs font-bold text-[#2f6f73]">
        {identity.setSymbolUrl && (
          <Image src={identity.setSymbolUrl} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
        )}
        <span>{identity.setName}</span>
        {identity.setCode && <span className="font-mono font-black uppercase text-[#64736c]">{identity.setCode}</span>}
      </span>
      {identity.cardNumber && (
        <span className="rounded-md border border-[#e2c879] bg-[#fff8dc] px-2.5 py-1.5 font-mono text-xs font-black text-[#6f5a22]">
          #{identity.cardNumber}
        </span>
      )}
      {identity.rarity && (
        <span className="rounded-md border border-[#e2c879] bg-[#fff8dc] px-2.5 py-1.5 text-xs font-bold text-[#6f5a22]">
          {identity.rarity}
        </span>
      )}
      {identity.language && (
        <span className="rounded-md border border-[#d6ded5] bg-[#f7f9f5] px-2.5 py-1.5 text-xs font-bold text-[#52635c]">
          {identity.language}
        </span>
      )}
    </div>
  );
}

function LoopStep({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="grid grid-cols-[44px_1fr] gap-3 rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-4">
      <span className="font-mono text-sm font-black text-[#b26a4c]">{number}</span>
      <div>
        <p className="font-bold text-[#24312f]">{title}</p>
        <p className="mt-1 text-sm leading-5 text-[#64736c]">{description}</p>
      </div>
    </div>
  );
}

function HowItWorks() {
  const t = useT();
  return (
    <section className="mt-6 rounded-md border border-[#c9d7ce] bg-[#e7efe8] p-6 sm:p-8">
      <p className="eyebrow text-[#2f6f73]">
        <Sparkles className="h-4 w-4" />
        {t.howItWorks.eyebrow}
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <LoopStep number="01" title={t.howItWorks.s1t} description={t.howItWorks.s1d} />
        <LoopStep number="02" title={t.howItWorks.s2t} description={t.howItWorks.s2d} />
        <LoopStep number="03" title={t.howItWorks.s3t} description={t.howItWorks.s3d} />
        <LoopStep number="04" title={t.howItWorks.s4t} description={t.howItWorks.s4d} />
      </div>
      <div className="mt-5 rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-4 text-sm leading-6 text-[#64736c]">
        <strong className="text-[#24312f]">{t.howItWorks.supportedLabel}</strong>{t.howItWorks.supportedBody}
      </div>
    </section>
  );
}

function CheckField({ label, registration }: { label: string; registration: UseFormRegisterReturn }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-[#d6ded5] bg-[#fcfbf6] px-3 py-2 text-sm font-bold text-[#52635c]">
      <input className="h-4 w-4 accent-[#2f6f73]" type="checkbox" {...registration} />
      {label}
    </label>
  );
}

function LoadingLoop() {
  const t = useT();
  return (
    <section className="market-agent-panel mt-6 rounded-md border border-[#c9d7ce] bg-[#e7efe8] p-6" aria-live="polite">
      <div className="flex items-center gap-3">
        <LoaderCircle className="h-5 w-5 animate-spin text-[#2f6f73]" />
        <div>
          <p className="font-serif text-xl font-bold text-[#2f6f73]">{t.loading.title}</p>
          <p className="mt-1 text-sm text-[#64736c]">{t.loading.steps}</p>
        </div>
      </div>
      <div className="agent-progress mt-5"><span /></div>
    </section>
  );
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="mt-6 flex items-start gap-3 rounded-md border border-[#e4c0ad] bg-[#fff7f0] p-5 text-sm leading-6 text-[#7e4934]" role="alert">
      <CircleAlert className="mt-1 h-5 w-5 shrink-0" />
      <div>
        <p className="font-bold">{t.error.title}</p>
        <p>{message}</p>
        {onRetry && (
          <button className="secondary-button mt-3" type="button" onClick={onRetry}>
            {t.error.retry}
          </button>
        )}
      </div>
    </div>
  );
}

function IdentityConfirmation({ identities, onConfirm }: { identities: CardIdentityCandidate[]; onConfirm: (identity: CardIdentityCandidate) => void }) {
  const t = useT();
  return (
    <section id="comparison-result" className="mt-6 scroll-mt-6 rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5 sm:p-7">
      <div className="max-w-2xl">
        <p className="eyebrow">
          <BadgeCheck className="h-4 w-4" />
          {t.identity.eyebrow}
        </p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-[#2f6f73]">{t.identity.heading}</h2>
        <p className="mt-2 leading-7 text-[#64736c]">
          {t.identity.desc}
        </p>
      </div>
      {identities.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {identities.map((identity) => (
            <article key={identity.id} className="rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4">
              {identity.imageUrl ? (
                <HoloCardArt
                  src={identity.imageUrl}
                  alt={`${identity.name} ${identity.cardNumber}`}
                  sizes="144px"
                  className="mx-auto w-36"
                />
              ) : (
                <div className="mx-auto aspect-[2.5/3.5] w-36 rounded-md bg-[#e7efe8]" />
              )}
              <p className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-[#b26a4c]">{t.identity.confidence(identity.confidence)}</p>
              <h3 className="mt-1 font-serif text-xl font-bold text-[#2f6f73]">{identity.name}</h3>
              <CardIdentityRail identity={identity} className="mt-3" />
              <button className="secondary-button mt-4 w-full" type="button" onClick={() => onConfirm(identity)}>
                <Check className="h-4 w-4" />
                {t.identity.confirm}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-md border border-[#e5c69e] bg-[#fff8e9] p-5 text-sm leading-6 text-[#765633]">
          {t.identity.noMatch}
        </div>
      )}
    </section>
  );
}

function ComparisonResult({ report, feedbackSent, onFeedback }: { report: ComparisonReport; feedbackSent: boolean; onFeedback: (changedDecision: boolean) => void }) {
  const t = useT();
  const listingMap = useMemo(() => new Map(report.candidates.map((candidate) => [candidate.id, candidate])), [report.candidates]);
  const excluded = report.candidates.filter((candidate) => !candidate.eligible);

  // Default to the safest verified buy (the $150-buyer's first fear is getting
  // burned, not overpaying), but keep every lens one tap away.
  const defaultRole = useMemo<RankedChoice["role"] | null>(() => {
    const roles = report.rankedChoices.map((choice) => choice.role);
    return roles.includes("safest_listing") ? "safest_listing" : roles[0] ?? null;
  }, [report.rankedChoices]);
  const [roleOverride, setRoleOverride] = useState<RankedChoice["role"] | null>(null);
  // Honor the user's chosen lens, but fall back to the default when it is not
  // present in the current report (e.g. after a new comparison) — no effect/reset.
  const selectedRole = roleOverride && report.rankedChoices.some((choice) => choice.role === roleOverride)
    ? roleOverride
    : defaultRole;
  const selectedChoice = report.rankedChoices.find((choice) => choice.role === selectedRole) ?? null;
  const selectedListing = selectedChoice ? listingMap.get(selectedChoice.listingId) ?? null : null;

  return (
    <section id="comparison-result" className="mt-6 scroll-mt-6 space-y-6">
      {report.demoMode && (
        <div className="flex items-start gap-3 rounded-md border border-[#e2c879] bg-[#fff8dc] p-4 text-sm leading-6 text-[#6f5a22]">
          <Info className="mt-1 h-4 w-4 shrink-0" />
          <p><strong>{t.result.demoTitle}</strong>{t.result.demoBody}</p>
        </div>
      )}

      <SourcesStrip sources={report.sources} />

      <div className="evidence-spotlight rounded-md border border-[#c9d7ce] bg-[#e7efe8] p-5 sm:p-7">
        <div className="relative z-10 grid gap-5 md:grid-cols-[156px_1fr_auto] md:items-center">
          <div className="flex flex-col items-center gap-3">
            {report.confirmedCard?.imageUrl ? (
              <HoloCardArt
                src={report.confirmedCard.imageUrl}
                alt={`${report.confirmedCard.name} ${report.confirmedCard.cardNumber}`}
                sizes="144px"
                className="w-36"
              />
            ) : (
              <div className="aspect-[2.5/3.5] w-36 rounded-md bg-[#fcfbf6]" />
            )}
            <span className="holo-hint items-center gap-1.5 text-[0.68rem] font-black uppercase tracking-[0.1em] text-[#52635c]">
              <Sparkles className="h-3.5 w-3.5 text-[#b26a4c]" />
              {t.result.moveFoil}
            </span>
          </div>
          <div>
            <p className="eyebrow text-[#2f6f73]">
              <BadgeCheck className="h-4 w-4" />
              {t.result.versionConfirmed}
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold text-[#2f6f73]">{report.confirmedCard?.name}</h2>
            {report.confirmedCard && <CardIdentityRail identity={report.confirmedCard} className="mt-3" />}
            {typeof report.confirmedCard?.marketMid === "number" && (
              <p className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-md border border-[#c9d7ce] bg-[#fcfbf6] px-3 py-2 text-sm font-bold text-[#2f6f73]">
                <Tag className="h-4 w-4" />
                {t.result.marketApprox} {formatMoney(report.confirmedCard.marketMid)}
                {typeof report.confirmedCard.marketLow === "number" && typeof report.confirmedCard.marketHigh === "number" && (
                  <span className="font-medium text-[#64736c]">({formatMoney(report.confirmedCard.marketLow)}–{formatMoney(report.confirmedCard.marketHigh)})</span>
                )}
                <MarketFreshness card={report.confirmedCard} generatedAt={report.generatedAt} />
                {report.confirmedCard.marketUrl && (
                  <a className="underline" href={report.confirmedCard.marketUrl} target="_blank" rel="noreferrer">{t.result.view}</a>
                )}
              </p>
            )}
            <p className="mt-4 max-w-3xl leading-7 text-[#52635c]">{report.narrative.summary}</p>
          </div>
          <div className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] px-4 py-3 text-center">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#64736c]">{t.result.eligibleOptions}</p>
            <p className="mt-1 font-mono text-3xl font-black text-[#2f6f73]">{report.candidates.filter((candidate) => candidate.eligible).length}</p>
          </div>
        </div>
      </div>

      {report.rankedChoices.length > 0 && (
        <div>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">
                <Sparkles className="h-4 w-4" />
                {t.result.yourBestBuy}
              </p>
              <h2 className="mt-2 font-serif text-3xl font-bold text-[#2f6f73]">{t.result.recommendedListing}</h2>
            </div>
            <p className="text-sm text-[#64736c]">{t.result.defaultLensNote}</p>
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-1">
            {report.rankedChoices.map((choice) => {
              const active = choice.role === selectedRole;
              return (
                <button
                  key={choice.role}
                  type="button"
                  onClick={() => setRoleOverride(choice.role)}
                  aria-pressed={active}
                  title={roleToggleHint(choice.role, t)}
                  className={`rounded px-3 py-2 text-sm font-bold transition ${active ? "bg-[#2f6f73] text-[#fcfbf6]" : "text-[#52635c] hover:text-[#2f6f73]"}`}
                >
                  {roleToggleLabel(choice.role, t)}
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            {selectedChoice && selectedListing && (
              <RecommendationCard
                choice={selectedChoice}
                listing={selectedListing}
                demoMode={report.demoMode}
                marketPrice={report.confirmedCard?.marketMid ?? null}
                recommended={selectedRole === defaultRole}
              />
            )}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_0.72fr]">
        <section className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5 sm:p-6">
          <p className="eyebrow">
            <ReceiptText className="h-4 w-4" />
            {t.result.evidenceLedger}
          </p>
          <h3 className="mt-2 font-serif text-2xl font-bold text-[#2f6f73]">{t.result.everyCandidate}</h3>
          <div className="mt-5 space-y-3">
            {report.candidates.filter((candidate) => candidate.eligible).map((listing) => <CandidateRow key={listing.id} listing={listing} />)}
          </div>
          {excluded.length > 0 && (
            <details className="mt-4 rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4">
              <summary className="cursor-pointer text-sm font-bold text-[#64736c]">{t.result.excluded(excluded.length)}</summary>
              <div className="mt-3 space-y-2 text-sm text-[#64736c]">
                {excluded.map((listing) => <p key={listing.id}><strong>{listing.title}</strong>: {listing.exclusionReasons.join(" ")}</p>)}
              </div>
            </details>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5">
            <p className="eyebrow">
              <Calculator className="h-4 w-4" />
              {t.result.referenceContext}
            </p>
            <div className="mt-4 space-y-3">
              {report.references.map((reference) => (
                <div key={reference.label} className="rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold">{reference.label}</p>
                    <StatusPill status={reference.status} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#64736c]">{reference.note}</p>
                  {reference.rawMid !== null && <p className="mt-2 font-mono text-lg font-black text-[#2f6f73]">{t.result.reference(reference.rawMid.toFixed(2))}</p>}
                  {reference.links.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {reference.links.map((link) => (
                        <a
                          key={`${reference.label}-${link.label}`}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[#c9d7ce] bg-[#fcfbf6] px-2.5 py-1.5 text-xs font-bold text-[#2f6f73] hover:bg-[#e7efe8]"
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {link.label} <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  ) : reference.url && (
                    <a className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#2f6f73] underline" href={reference.url} target="_blank" rel="noreferrer">
                      {t.result.openManualCheck} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5">
            <p className="eyebrow">
              <CircleAlert className="h-4 w-4" />
              {t.result.beforeYouBuy}
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[#52635c]">
              {report.narrative.cautions.map((caution) => (
                <li key={caution} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b26a4c]" />
                  {caution}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <details id="method" className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5">
        <summary className="cursor-pointer font-bold text-[#52635c]">{t.result.technicalTrace}</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {report.trace.map((step) => (
            <div key={`${step.step}-${step.actor}`} className="rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-[#64736c]">{step.step.replaceAll("_", " ")}</p>
                <StatusPill status={step.status === "complete" ? "used" : step.status === "fallback" ? "unavailable" : "missing"} />
              </div>
              <p className="mt-2 font-bold text-[#24312f]">{step.actor}</p>
              <p className="mt-1 text-sm leading-6 text-[#64736c]">{step.summary}</p>
            </div>
          ))}
        </div>
        {report.warnings.length > 0 && (
          <div className="mt-4 rounded-md border border-[#e2c879] bg-[#fff8dc] p-4 text-sm leading-6 text-[#6f5a22]">
            {report.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        )}
      </details>

      <section className="rounded-md border border-[#d6ded5] bg-[#24312f] p-6 text-[#fcfbf6] sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#b9cbc1]">{t.result.helpValidate}</p>
          <h3 className="mt-2 font-serif text-2xl font-bold">{t.result.feedbackQuestion}</h3>
        </div>
        {feedbackSent ? (
          <p className="mt-4 inline-flex items-center gap-2 font-bold text-[#d7a84e] sm:mt-0">
            <Check className="h-5 w-5" />
            {t.result.feedbackSaved}
          </p>
        ) : (
          <div className="mt-4 flex gap-3 sm:mt-0">
            <button className="dark-button" type="button" onClick={() => onFeedback(true)}>{t.result.yes}</button>
            <button className="dark-button" type="button" onClick={() => onFeedback(false)}>{t.result.notYet}</button>
          </div>
        )}
      </section>
    </section>
  );
}

// R7: "eBay ✓ 42 · TCGplayer ✓ 17 · Mercari (user-added) ✓ 1" — exactly which
// sources were checked, which failed, and which found nothing.
function SourcesStrip({ sources }: { sources: SourceStatus[] }) {
  const t = useT();
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#d6ded5] bg-[#fcfbf6] px-4 py-3">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-[#64736c]">{t.result.sourcesChecked}</span>
      {sources.map((source) => {
        const ok = source.status === "ok" || source.status === "user_added";
        const neutral = source.status === "empty" || source.status === "no_match"
          || source.status === "not_configured" || source.status === "blocked";
        const label = source.status === "ok"
          ? t.result.sourceFound(source.count ?? 0)
          : source.status === "user_added"
            ? t.result.sourceUserAdded
            : source.status === "empty"
              ? t.result.sourceZero
              : source.status === "no_match"
                ? t.result.sourceNoMatch
                : source.status === "not_configured"
                  ? t.result.sourceNotConfigured
                  : source.status === "blocked"
                    ? t.result.sourceBlocked
                    : t.result.sourceFailed;
        return (
          <span
            key={source.platform}
            title={source.note || undefined}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${
              ok
                ? "border-[#c9d7ce] bg-[#e7efe8] text-[#2f6f73]"
                : neutral
                  ? "border-[#d6ded5] bg-[#f7f9f5] text-[#64736c]"
                  : "border-[#e4c0ad] bg-[#fff7f0] text-[#9a4a2c]"
            }`}
          >
            {ok ? <Check className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
            {source.platform} · {label}
          </span>
        );
      })}
    </div>
  );
}

// R3: the market anchor always states where it came from and how fresh it is.
// Staleness is measured against the report's own timestamp so render stays pure.
function MarketFreshness({ card, generatedAt }: { card: CardIdentityCandidate; generatedAt: string }) {
  const t = useT();
  const { lang } = useLang();
  if (card.marketSource === "tcgcsv" && card.marketAsOf) {
    const asOf = new Date(card.marketAsOf);
    const stale = new Date(generatedAt).getTime() - asOf.getTime() > 48 * 60 * 60 * 1000;
    return (
      <span className={`rounded px-2 py-0.5 text-xs font-bold ${stale ? "bg-[#fff0d5] text-[#8d6032]" : "bg-[#ecefeb] text-[#64736c]"}`}>
        {t.result.marketAsOf(asOf.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US"))}
        {stale ? ` · ${t.result.marketStale}` : ""}
      </span>
    );
  }
  return (
    <span className="rounded bg-[#ecefeb] px-2 py-0.5 text-xs font-bold text-[#64736c]">
      {t.result.marketCatalogApprox}
    </span>
  );
}

function roleToggleLabel(role: RankedChoice["role"], t: Dict) {
  return role === "lowest_landed_cost" ? t.lens.cheapest : role === "safest_listing" ? t.lens.safest : t.lens.bestDocumented;
}

function roleToggleHint(role: RankedChoice["role"], t: Dict) {
  return role === "lowest_landed_cost"
    ? t.lens.cheapestHint
    : role === "safest_listing"
      ? t.lens.safestHint
      : t.lens.bestDocumentedHint;
}

type VerdictTone = "good" | "ok" | "bad" | "neutral";

// R4: "unverified" (no seller data) renders as a neutral coverage note, never
// as a red risk verdict — unknown is not risky.
function sellerVerdict(listing: NormalizedListing, t: Dict): { label: string; tone: VerdictTone } {
  if (listing.riskLabel === "unverified") return { label: t.card.unverifiedSeller, tone: "neutral" };
  if (listing.sellerTrustScore >= 80) return { label: t.card.trustedSeller, tone: "good" };
  if (listing.sellerTrustScore >= 60) return { label: t.card.decentSeller, tone: "ok" };
  return { label: t.card.unprovenSeller, tone: "bad" };
}

function evidenceVerdict(score: number, t: Dict): { label: string; tone: VerdictTone } {
  if (score >= 80) return { label: t.card.wellDocumented, tone: "good" };
  if (score >= 50) return { label: t.card.partlyDocumented, tone: "ok" };
  return { label: t.card.thinEvidence, tone: "bad" };
}

function riskVerdict(listing: NormalizedListing, t: Dict): { label: string; tone: VerdictTone } {
  switch (listing.riskLabel) {
    case "low_risk": return { label: t.card.lowRisk, tone: "good" };
    case "some_risk": return { label: t.card.someRisk, tone: "ok" };
    case "unverified": return { label: t.card.unverified, tone: "neutral" };
    default: return { label: t.card.higherRisk, tone: "bad" };
  }
}

function VerdictTag({ verdict, icon: Icon }: { verdict: { label: string; tone: VerdictTone }; icon: typeof ShieldCheck }) {
  const cls = verdict.tone === "good"
    ? "bg-[#dcecdf] text-[#2f6f73]"
    : verdict.tone === "ok"
      ? "bg-[#fff0d5] text-[#8d6032]"
      : verdict.tone === "neutral"
        ? "bg-[#ecefeb] text-[#64736c]"
        : "bg-[#f6dcd0] text-[#9a4a2c]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-black uppercase tracking-[0.04em] ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {verdict.label}
    </span>
  );
}

function EvidenceChecklist({ evidence, compact = false }: { evidence: ListingEvidence; compact?: boolean }) {
  const t = useT();
  const items = [
    { label: t.card.photos(evidence.photoCount), available: evidence.photoCount > 0, icon: Camera },
    { label: evidence.frontBackExplicit ? t.card.frontBack : t.card.frontBackNo, available: evidence.frontBackExplicit, icon: BadgeCheck },
    { label: evidence.closeupsExplicit ? t.card.corners : t.card.cornersNo, available: evidence.closeupsExplicit, icon: SearchCheck },
    { label: evidence.surfaceExplicit ? t.card.surface : t.card.surfaceNo, available: evidence.surfaceExplicit, icon: Sparkles },
  ];

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "mt-2" : "mt-4"}`} aria-label={t.card.photoEvidenceAria}>
      {items.map(({ label, available, icon: Icon }) => (
        <span
          key={label}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold ${
            available
              ? "border-[#c9d7ce] bg-[#e7efe8] text-[#2f6f73]"
              : "border-[#d6ded5] bg-[#f7f9f5] text-[#7a8982]"
          }`}
        >
          <Icon className="h-3 w-3" />
          {label}
        </span>
      ))}
    </div>
  );
}

function RecommendationCard({ choice, listing, demoMode, marketPrice, recommended }: { choice: RankedChoice; listing: NormalizedListing; demoMode: boolean; marketPrice: number | null; recommended: boolean }) {
  const t = useT();
  const total = listing.estimatedLandedCost ?? listing.preTaxTotal;
  const marketDelta = marketPrice && marketPrice > 0 ? (total - marketPrice) / marketPrice : null;

  return (
    <article className="choice-card rounded-md border border-[#c9d7ce] bg-[#fcfbf6] p-5 shadow-[0_18px_40px_rgba(36,49,47,0.06)] sm:p-6">
      <div className="grid gap-5 sm:grid-cols-[132px_1fr]">
        <div className="mx-auto w-28 sm:mx-0 sm:w-full">
          {listing.imageUrl ? (
            <HoloCardArt src={listing.imageUrl} alt={listing.title} sizes="132px" className="w-full" />
          ) : (
            <div className="aspect-[2.5/3.5] w-full rounded-md bg-[#e7efe8]" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {recommended && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#2f6f73] px-2.5 py-1 text-xs font-black uppercase tracking-[0.06em] text-[#fcfbf6]">
                <BadgeCheck className="h-3.5 w-3.5" />
                {t.card.recommended}
              </span>
            )}
            <span className="text-xs font-black uppercase tracking-[0.1em] text-[#b26a4c]">{listing.marketplace}</span>
            {listing.userSupplied && (
              <span className="rounded-md border border-[#c9d7ce] bg-[#f7f9f5] px-2 py-0.5 text-xs font-bold text-[#52635c]">{t.card.userAdded}</span>
            )}
          </div>
          <h3 className="mt-2 line-clamp-2 font-serif text-2xl font-bold leading-tight text-[#2f6f73]">{listing.title}</h3>
          <p className="mt-1 text-sm text-[#64736c]">
            {listing.claimedCondition === "Unknown"
              ? t.card.conditionNotStated
              : t.card.sellerSays(t.conditions[listing.claimedCondition])}
          </p>
          <p className="mt-0.5 text-sm text-[#64736c]">
            {listing.seller.feedbackPercentage !== null && listing.seller.feedbackCount !== null
              ? t.card.sellerTrack(listing.seller.feedbackPercentage.toString(), listing.seller.feedbackCount.toLocaleString())
              : t.card.noSellerTrack}
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-2">
            <span className="font-mono text-3xl font-black text-[#24312f]">{formatMoney(total)}</span>
            <span className="pb-1 text-xs font-bold uppercase tracking-[0.08em] text-[#64736c]">{listing.estimatedTax === null ? t.card.preTaxTotal : t.card.estLanded}</span>
            {marketDelta !== null && !listing.demo && (
              <span className={`mb-0.5 inline-flex items-center rounded-md px-2.5 py-1 text-xs font-black uppercase tracking-[0.05em] ${marketDelta <= 0.02 ? "bg-[#dcecdf] text-[#2f6f73]" : marketDelta <= 0.15 ? "bg-[#fff0d5] text-[#8d6032]" : "bg-[#f6dcd0] text-[#9a4a2c]"}`}>
                {marketDelta <= 0 ? t.card.underMarket(Math.round(Math.abs(marketDelta) * 100)) : t.card.aboveMarket(Math.round(marketDelta * 100))}
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <VerdictTag verdict={sellerVerdict(listing, t)} icon={BadgeCheck} />
            <VerdictTag verdict={evidenceVerdict(listing.evidenceCompletenessScore, t)} icon={Camera} />
            <VerdictTag verdict={riskVerdict(listing, t)} icon={ShieldCheck} />
          </div>
          <p className="mt-2 text-xs text-[#64736c]">
            {t.card.scoreLine(listing.sellerTrustScore, listing.evidenceCompletenessScore, listing.safetyScore)}<span className="text-[#94a59c]">{t.card.ofHundred}</span>
          </p>
          {listing.trustNotes.length > 0 && (
            <p className="mt-1 text-xs leading-5 text-[#94a59c]">{listing.trustNotes.join(" ")}</p>
          )}
          <EvidenceChecklist evidence={listing.evidence} />

          <p className="mt-4 text-sm leading-6 text-[#52635c]">{choice.reason}</p>

          <div className="mt-5">
            {listing.url ? (
              <a
                className="primary-button w-full sm:w-auto"
                href={listing.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackEvent("choice_opened", { choice_role: choice.role, marketplace: listing.marketplace, demo_mode: demoMode })}
              >
                {t.card.goToListing} <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : (
              <span className="flex min-h-11 items-center justify-center rounded-md border border-[#d6ded5] bg-[#f7f9f5] text-sm font-bold text-[#64736c]">{t.card.userSupplied}</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function HoloCardArt({
  src,
  alt,
  sizes,
  className = "",
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
}) {
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;

    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));

    card.style.setProperty("--holo-x", `${x}%`);
    card.style.setProperty("--holo-y", `${y}%`);
    card.style.setProperty("--holo-rx", `${(50 - y) / 5}deg`);
    card.style.setProperty("--holo-ry", `${(x - 50) / 5}deg`);
    card.style.setProperty("--holo-scale", "1.045");
    card.dataset.active = "true";
  };

  const resetTilt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const card = event.currentTarget;
    card.style.setProperty("--holo-x", "50%");
    card.style.setProperty("--holo-y", "50%");
    card.style.setProperty("--holo-rx", "0deg");
    card.style.setProperty("--holo-ry", "0deg");
    card.style.setProperty("--holo-scale", "1");
    delete card.dataset.active;
  };

  return (
    <div
      className={`holo-card ${className}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
    >
      <Image src={src} alt={alt} fill className="holo-card-image" sizes={sizes} />
    </div>
  );
}

function CandidateRow({ listing }: { listing: NormalizedListing }) {
  const t = useT();
  const { lang } = useLang();
  return (
    <article className="grid gap-3 rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4 sm:grid-cols-[52px_minmax(0,1fr)] lg:grid-cols-[52px_minmax(0,1fr)_auto] lg:items-center">
      <div className="relative aspect-[2.5/3.5] w-[52px] overflow-hidden rounded border border-[#d6ded5] bg-[#e7efe8]">
        {listing.imageUrl ? (
          <Image src={listing.imageUrl} alt="" fill sizes="52px" className="object-contain" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[#94a59c]"><ReceiptText className="h-5 w-5" /></span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-[#24312f]">{listing.marketplace}</span>
          {listing.demo && <span className="rounded bg-[#fff0b8] px-2 py-0.5 text-xs font-black uppercase text-[#6f5a22]">{t.candidate.demo}</span>}
          {listing.userSupplied && <span className="rounded border border-[#c9d7ce] bg-[#fcfbf6] px-2 py-0.5 text-xs font-bold text-[#52635c]">{t.card.userAdded}</span>}
          {listing.riskLabel === "unverified" && <span className="rounded bg-[#ecefeb] px-2 py-0.5 text-xs font-bold text-[#64736c]">{t.card.unverified}</span>}
          {listing.raw && <span className="rounded border border-[#c9d7ce] bg-[#fcfbf6] px-2 py-0.5 text-xs font-bold text-[#52635c]">{t.candidate.rawSingle}</span>}
          <span className="rounded border border-[#d6ded5] bg-[#fcfbf6] px-2 py-0.5 text-xs font-bold text-[#52635c]">{t.conditions[listing.claimedCondition]}</span>
          <span className="rounded bg-[#e7efe8] px-2 py-0.5 text-xs font-bold text-[#2f6f73]">{t.candidate.match(listing.matchConfidence)}</span>
        </div>
        <p className="mt-1 line-clamp-1 text-sm text-[#64736c]">{listing.title}</p>
        <EvidenceChecklist evidence={listing.evidence} compact />
        <p className="mt-2 text-xs text-[#64736c]">{t.candidate.observed(new Date(listing.observedAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US"))}</p>
      </div>
      <div className="col-span-2 grid grid-cols-3 gap-3 border-t border-[#d6ded5] pt-3 text-right lg:col-span-1 lg:border-0 lg:pt-0">
        <Metric compact label={t.candidate.preTax} value={formatMoney(listing.preTaxTotal)} />
        <Metric compact label={t.candidate.safety} value={`${listing.safetyScore}`} />
        <Metric compact label={t.candidate.evidence} value={`${listing.evidenceCompletenessScore}`} />
      </div>
    </article>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={compact ? "" : "rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-3"}>
      <p className="text-[10px] font-black uppercase tracking-[0.09em] text-[#64736c]">{label}</p>
      <p className={`${compact ? "text-sm" : "text-lg"} mt-1 font-mono font-black text-[#2f6f73]`}>{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: "used" | "unavailable" | "missing" }) {
  const t = useT();
  const className = status === "used"
    ? "bg-[#dcecdf] text-[#2f6f73]"
    : status === "unavailable"
      ? "bg-[#fff0d5] text-[#8d6032]"
      : "bg-[#ecefeb] text-[#64736c]";
  return <span className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${className}`}>{t.status[status]}</span>;
}

function buildRequest(values: ComparisonForm, confirmedCardId?: string): ComparisonRequest {
  const description = values.description.trim();
  const taxPercent = nullableNumber(values.taxRatePercent);
  const cardNumber = /\d/.test(values.cardNumber) ? values.cardNumber.trim() : "";
  return {
    sourceListing: {
      marketplace: values.marketplace,
      url: values.url.trim(),
      title: values.listingTitle.trim(),
      description,
      price: nullableNumber(values.price),
      shipping: nullableNumber(values.shipping),
      claimedCondition: values.claimedCondition,
      active: true,
      seller: {
        feedbackPercentage: nullableNumber(values.feedbackPercentage),
        feedbackCount: nullableInteger(values.feedbackCount),
        returnsAccepted: values.returnsAccepted ? true : null,
        topRated: null,
        buyerProtection: values.buyerProtection ? true : null,
      },
      evidence: {
        photoCount: nullableInteger(values.photoCount) ?? 0,
        frontBackExplicit: values.frontBackExplicit,
        closeupsExplicit: values.closeupsExplicit,
        surfaceExplicit: values.surfaceExplicit,
        identityExplicit: Boolean(cardNumber),
        substantiveConditionNotes: values.substantiveConditionNotes || hasSubstantiveConditionNotes(description),
        missing: [],
      },
    },
    buyer: {
      country: "US",
      postalCode: values.postalCode.trim(),
      taxRate: taxPercent === null ? null : taxPercent / 100,
      desiredCondition: values.desiredCondition,
    },
    cardHint: {
      name: values.cardName.trim(),
      setCode: values.setCode.trim(),
      cardNumber,
      language: "English",
    },
    confirmedCardId,
  };
}

function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nullableInteger(value: string) {
  const number = nullableNumber(value);
  return number === null ? null : Math.round(number);
}

function hasSubstantiveConditionNotes(value: string) {
  return /scratch|whitening|dent|crease|print line|off[- ]?center|clean/i.test(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}
