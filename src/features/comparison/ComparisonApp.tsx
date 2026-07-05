"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useFieldArray, useForm, useWatch, type UseFormRegisterReturn, type UseFormReturn } from "react-hook-form";
import {
  IconArrowUpRight,
  IconCardCheck,
  IconCardFan,
  IconCardSearch,
  IconCaution,
  IconCheck,
  IconChevronDown,
  IconExternal,
  IconInfo,
  IconLink,
  IconPhotoProof,
  IconPin,
  IconPlus,
  IconReceipt,
  IconSeal,
  IconSpinner,
  IconTag,
  IconX,
} from "./icons";
import { initializeAnalytics, trackEvent } from "@/lib/analytics";
import { estimateSalesTaxRateFromZip } from "@/lib/comparison/us-sales-tax";
import { calculatePriceComponent, SAFETY_WEIGHTS, VALUE_WEIGHTS } from "@/lib/comparison/ranking";
import { parseCardQuery } from "@/lib/comparison/query-parser";
import { detectMarketplaceFromUrl } from "@/lib/comparison/marketplace-url";
import { LanguageProvider, useLang, useT, type Dict, type Lang } from "./i18n";
import { groupIdentitiesBySet, IDENTITY_GROUP_THRESHOLD } from "./identity-grouping";
import { buildVerdictCopy, type VerdictCopy } from "./verdict-copy";
import {
  defaultComparisonFormValues,
  emptyLedgerRow,
  resetForNewCardSearch,
  type ComparisonForm,
  type LensRole,
} from "./comparison-form-state";
import {
  comparisonReportSchema,
  type CardIdentityCandidate,
  type ComparisonReport,
  type ComparisonQuestionResponse,
  type ComparisonRequest,
  type ConditionClaim,
  type Marketplace,
  type NormalizedListing,
  type RankedChoice,
  type TcgGame,
  type WebDiscovery,
} from "@/lib/schemas";

const marketplaces: Marketplace[] = [
  "eBay",
  "TCGplayer",
  "Cardmarket",
  "Facebook",
  "Reddit",
  "Mercari",
  "Whatnot",
  "SNKRDUNK",
  "Yahoo Auctions JP",
  "Xianyu",
  "集换社",
  "Shopee Taiwan",
  "Local shop",
  "Other",
];

// Branded selector tiles per game: the official logo (operator-supplied
// assets in /public; marks belong to their respective owners) plus the game's
// signature accent. Adding a TCG later = one more entry here plus its catalog
// adapter. logoZoom compensates for built-in whitespace in an asset.
const gameTiles: Array<{ id: TcgGame; logo: string; accent: string; tint: string; logoZoom: number }> = [
  { id: "pokemon", logo: "/logo-pokemon-tcg.png", accent: "#2a75bb", tint: "#eef4fb", logoZoom: 1 },
  { id: "onePiece", logo: "/logo-one-piece-card-game.png", accent: "#d0202e", tint: "#fdf0ef", logoZoom: 2.1 },
];

const conditions: ConditionClaim[] = [
  "Unknown",
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
];

const LEDGER_PREVIEW_COUNT = 4;
const RECENT_CONFIRMED_CARDS_KEY = "tcgpal:recent-confirmed-cards";
const MAX_RECENT_CONFIRMED_CARDS = 10;
const MAX_MARQUEE_REAL_CARDS = 8;

type RecentCarouselCard = {
  id: string;
  game: TcgGame;
  name: string;
  setName: string;
  setCode: string;
  cardNumber: string;
  imageUrl: string | null;
  lastSeenAt: number;
};

class ApiResponseError extends Error {
  readonly retriable: boolean;

  constructor(message: string, retriable: boolean) {
    super(message);
    this.name = "ApiResponseError";
    this.retriable = retriable;
  }
}

async function requestComparisonReport(request: ComparisonRequest, fallbackMessage: string) {
  const json = await postJsonWithRetry("/api/agent/listing-compare", request, fallbackMessage);
  return comparisonReportSchema.parse(json);
}

async function postJsonWithRetry(path: string, body: unknown, fallbackMessage: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return await readJsonResponse(response, fallbackMessage);
    } catch (error) {
      lastError = error;
      const retriable = error instanceof ApiResponseError ? error.retriable : error instanceof TypeError;
      if (!retriable || attempt === 1) break;
      await sleep(650);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(fallbackMessage);
}

async function readJsonResponse(response: Response, fallbackMessage: string) {
  const text = await response.text();
  let json: unknown = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      throw new ApiResponseError(nonJsonMessage(text, fallbackMessage), true);
    }
  }
  if (!response.ok) {
    throw new ApiResponseError(apiErrorMessage(json, fallbackMessage), isRetriableStatus(response.status));
  }
  return json;
}

function apiErrorMessage(json: unknown, fallbackMessage: string) {
  if (json && typeof json === "object" && "error" in json) {
    const message = String((json as { error?: unknown }).error ?? "").trim();
    if (message) return message;
  }
  return fallbackMessage;
}

function nonJsonMessage(text: string, fallbackMessage: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact || /^an error/i.test(compact) || /^<!doctype/i.test(compact) || /^</.test(compact)) return fallbackMessage;
  return `${fallbackMessage} (${compact.slice(0, 160)})`;
}

function isRetriableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function sleep(ms: number) {
  return new globalThis.Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toRecentCarouselCard(identity: CardIdentityCandidate, game: TcgGame): RecentCarouselCard {
  return {
    id: identity.id,
    game,
    name: identity.name,
    setName: identity.setName,
    setCode: identity.setCode,
    cardNumber: identity.cardNumber,
    imageUrl: identity.imageUrl ?? null,
    lastSeenAt: Date.now(),
  };
}

function isRecentCarouselCard(value: unknown): value is RecentCarouselCard {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecentCarouselCard>;
  return typeof candidate.id === "string"
    && (candidate.game === "pokemon" || candidate.game === "onePiece")
    && typeof candidate.name === "string"
    && typeof candidate.setName === "string"
    && typeof candidate.setCode === "string"
    && typeof candidate.cardNumber === "string"
    && (typeof candidate.imageUrl === "string" || candidate.imageUrl === null)
    && typeof candidate.lastSeenAt === "number";
}

function safeCarouselImageUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = url.protocol === "https:"
      && (
        host === "images.pokemontcg.io"
        || host === "images.scrydex.com"
        || host === "en.onepiece-cardgame.com"
        || host.endsWith(".optcgapi.com")
      );
    return allowed ? value : null;
  } catch {
    return null;
  }
}

function readRecentCarouselCards(): RecentCarouselCard[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_CONFIRMED_CARDS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecentCarouselCard)
      .map((card) => ({ ...card, imageUrl: safeCarouselImageUrl(card.imageUrl) }))
      .slice(0, MAX_RECENT_CONFIRMED_CARDS);
  } catch {
    return [];
  }
}

function writeRecentCarouselCards(cards: RecentCarouselCard[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_CONFIRMED_CARDS_KEY, JSON.stringify(cards.slice(0, MAX_RECENT_CONFIRMED_CARDS)));
  } catch {
    /* ignore unavailable storage */
  }
}

function mergeRecentCarouselCard(cards: RecentCarouselCard[], card: RecentCarouselCard) {
  return [card, ...cards.filter((existing) => existing.id !== card.id)].slice(0, MAX_RECENT_CONFIRMED_CARDS);
}

function composeCarouselCards(current: RecentCarouselCard | null, recent: RecentCarouselCard[]) {
  const ordered = current ? [current, ...recent] : recent;
  const deduped = new Map<string, RecentCarouselCard>();
  for (const card of ordered) {
    if (!deduped.has(card.id)) deduped.set(card.id, card);
  }
  return Array.from(deduped.values()).slice(0, MAX_MARQUEE_REAL_CARDS);
}

function focusComparisonTarget() {
  window.requestAnimationFrame(() => {
    const target = document.getElementById("comparison-result");
    if (!target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  });
}

function readTimestamp() {
  return Date.now();
}

export function ComparisonApp() {
  return (
    <LanguageProvider>
      <ComparisonExperience />
    </LanguageProvider>
  );
}

function ComparisonExperience() {
  const t = useT();
  const form = useForm<ComparisonForm>({ defaultValues: defaultComparisonFormValues });
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [confirmedIdentityForSettings, setConfirmedIdentityForSettings] = useState<CardIdentityCandidate | null>(null);
  const [recentCarouselCards, setRecentCarouselCards] = useState<RecentCarouselCard[]>([]);
  const [pendingRequest, setPendingRequest] = useState<ComparisonRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two doors below the hero search, grouped by intent: refine what we search
  // for, or bring a listing you already found (with its evidence and any
  // manual candidates from unsupported marketplaces).
  const [refineOpen, setRefineOpen] = useState(false);
  const [listingOpen, setListingOpen] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [comparingDiscoveryId, setComparingDiscoveryId] = useState<string | null>(null);
  const [compactSearchOpen, setCompactSearchOpen] = useState(false);
  const ledger = useFieldArray({ control: form.control, name: "manualCandidates" });

  const heroQuery = useWatch({ control: form.control, name: "heroQuery" });
  const marketplace = useWatch({ control: form.control, name: "marketplace" });
  const sourceUrl = useWatch({ control: form.control, name: "url" });
  const postalCode = useWatch({ control: form.control, name: "postalCode" });
  const taxRatePercent = useWatch({ control: form.control, name: "taxRatePercent" });
  const cardName = useWatch({ control: form.control, name: "cardName" });
  const setCode = useWatch({ control: form.control, name: "setCode" });
  const cardNumber = useWatch({ control: form.control, name: "cardNumber" });
  const game = useWatch({ control: form.control, name: "game" });
  const desiredCondition = useWatch({ control: form.control, name: "desiredCondition" });
  const preferredRole = useWatch({ control: form.control, name: "preferredRole" });
  const ph = game === "onePiece" ? t.form.phOnePiece : t.form.ph;
  const isManual = marketplace !== "eBay" || !sourceUrl.trim();
  // Live, client-side preview of the same deterministic parse the server runs —
  // shows the buyer what TCGpal understood from their search before submitting,
  // so a wrong read is obvious immediately rather than after a round trip.
  const heroPreview = useMemo(() => (heroQuery.trim().length >= 2 ? parseCardQuery(heroQuery) : null), [heroQuery]);

  // Keep the visible game toggle in lockstep with what the search text implies
  // (e.g. "Luffy OP01-024" flips it to One Piece). The toggle stays clickable —
  // a manual tap simply wins until the text next implies a game.
  const detectedGame = heroPreview?.game ?? null;
  useEffect(() => {
    if (detectedGame) form.setValue("game", detectedGame);
  }, [detectedGame, form]);

  useEffect(() => {
    initializeAnalytics();
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setRecentCarouselCards(readRecentCarouselCards());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!sourceUrl.trim()) return;
    form.setValue("marketplace", detectMarketplaceFromUrl(sourceUrl));
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

  function rememberConfirmedCard(identity: CardIdentityCandidate, resolvedGame: TcgGame) {
    const card = toRecentCarouselCard(identity, resolvedGame);
    setRecentCarouselCards((current) => {
      const next = mergeRecentCarouselCard(current, card);
      writeRecentCarouselCards(next);
      return next;
    });
  }

  async function submitComparison(values: ComparisonForm, confirmedCardId?: string) {
    if (!values.heroQuery.trim() && !values.cardName.trim()) {
      form.setError("heroQuery", { type: "required", message: t.form.heroSearchRequired });
      return;
    }

    if (report && !confirmedCardId) {
      trackEvent("second_comparison_started", {
        marketplace: values.marketplace,
      });
    }

    const request = buildRequest(values, confirmedCardId);
    if (!confirmedCardId) setConfirmedIdentityForSettings(null);
    setPendingRequest(request);
    setLoading(true);
    setError(null);
    setFeedbackSent(false);
    const startedAt = readTimestamp();

    trackEvent(confirmedCardId ? "card_identity_confirmed" : "comparison_started", {
      marketplace: request.sourceListing.marketplace,
    });
    trackEvent("source_detected", { marketplace: request.sourceListing.marketplace });
    if (request.sourceListing.marketplace !== "eBay") {
      trackEvent("manual_candidate_added", { marketplace: request.sourceListing.marketplace });
    }

    try {
      const parsed = await requestComparisonReport(request, t.error.temporary);
      setReport(parsed);
      setConfirmedIdentityForSettings(null);
      if (parsed.confirmedCard) {
        rememberConfirmedCard(parsed.confirmedCard, request.cardHint.game);
      }
      const duration = readTimestamp() - startedAt;
      trackEvent("comparison_completed", {
        marketplace: request.sourceListing.marketplace,
        status: parsed.status,
        demo_mode: parsed.demoMode,
        candidate_count: parsed.candidates.length,
        duration_bucket: duration < 5000 ? "under_5s" : duration < 15000 ? "5_to_15s" : "over_15s",
      });
      focusComparisonTarget();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t.error.temporary;
      setError(message);
      trackEvent("comparison_failed", { marketplace: request.sourceListing.marketplace });
    } finally {
      setLoading(false);
    }
  }

  async function confirmIdentity(identity: CardIdentityCandidate) {
    if (!pendingRequest) return;
    const confirmedRequest = { ...pendingRequest, confirmedCardId: identity.id };
    setPendingRequest(confirmedRequest);
    setConfirmedIdentityForSettings(identity);
    setReport(null);
    setError(null);
    form.setValue("cardName", identity.name);
    form.setValue("setCode", identity.setCode);
    form.setValue("cardNumber", identity.cardNumber);
    rememberConfirmedCard(identity, pendingRequest.cardHint.game);
    trackEvent("card_identity_confirmed", { confidence: identity.confidence });
    focusComparisonTarget();
  }

  // R5: a failed comparison keeps the exact request around so one tap retries
  // it — the buyer never re-types anything after a backend hiccup.
  async function retryComparison() {
    if (!pendingRequest || loading) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = await requestComparisonReport(pendingRequest, t.error.temporary);
      setReport(parsed);
      setConfirmedIdentityForSettings(null);
      if (parsed.confirmedCard) {
        rememberConfirmedCard(parsed.confirmedCard, pendingRequest.cardHint.game);
      }
      trackEvent("comparison_completed", {
        marketplace: pendingRequest.sourceListing.marketplace,
        status: parsed.status,
        demo_mode: parsed.demoMode,
        candidate_count: parsed.candidates.length,
      });
      focusComparisonTarget();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.error.temporary);
      trackEvent("comparison_failed", { marketplace: pendingRequest.sourceListing.marketplace });
    } finally {
      setLoading(false);
    }
  }

  async function compareWebDiscovery(discovery: WebDiscovery) {
    if (loading || !report?.confirmedCard) return;
    const confirmedCard = report.confirmedCard;
    const cardQuery = `${confirmedCard.name} ${confirmedCard.setCode} ${confirmedCard.cardNumber}`.trim();
    const currentValues = form.getValues();
    const baseRequest = pendingRequest ?? buildRequest(currentValues, confirmedCard.id);
    const request: ComparisonRequest = {
      ...baseRequest,
      query: baseRequest.query || cardQuery,
      sourceListing: {
        marketplace: discovery.marketplace,
        url: discovery.url,
        title: discovery.title,
        description: discovery.snippet,
        price: discovery.priceHintUsd,
        shipping: null,
        claimedCondition: "Unknown",
        active: true,
        seller: {
          feedbackPercentage: null,
          feedbackCount: null,
          returnsAccepted: null,
          topRated: null,
          buyerProtection: null,
          subRatings: null,
        },
        evidence: {
          photoCount: 0,
          frontBackExplicit: false,
          closeupsExplicit: false,
          surfaceExplicit: false,
          identityExplicit: Boolean(confirmedCard.cardNumber && discovery.title.includes(confirmedCard.cardNumber)),
          substantiveConditionNotes: false,
          missing: [],
        },
      },
      cardHint: {
        ...baseRequest.cardHint,
        name: confirmedCard.name,
        setCode: confirmedCard.setCode,
        cardNumber: confirmedCard.cardNumber,
        language: confirmedCard.language,
        variant: confirmedCard.variant ?? "",
        gradingClaim: "",
      },
      confirmedCardId: confirmedCard.id,
      webDiscoveryMode: "off",
    };

    form.setValue("url", discovery.url);
    form.setValue("marketplace", discovery.marketplace);
    form.setValue("listingTitle", discovery.title);
    form.setValue("description", discovery.snippet);
    form.setValue("price", discovery.priceHintUsd === null ? "" : String(discovery.priceHintUsd));
    form.setValue("shipping", "");
    form.setValue("cardName", confirmedCard.name);
    form.setValue("setCode", confirmedCard.setCode);
    form.setValue("cardNumber", confirmedCard.cardNumber);
    if (!currentValues.heroQuery.trim()) form.setValue("heroQuery", cardQuery);
    setPendingRequest(request);
    setLoading(true);
    setError(null);
    setFeedbackSent(false);
    setComparingDiscoveryId(discovery.id);
    const startedAt = readTimestamp();
    trackEvent("second_comparison_started", { marketplace: discovery.marketplace });
    trackEvent("source_detected", { marketplace: discovery.marketplace });
    if (discovery.marketplace !== "eBay") {
      trackEvent("manual_candidate_added", { marketplace: discovery.marketplace });
    }

    try {
      const parsed = await requestComparisonReport(request, t.error.temporary);
      setReport(parsed);
      setConfirmedIdentityForSettings(null);
      if (parsed.confirmedCard) {
        rememberConfirmedCard(parsed.confirmedCard, request.cardHint.game);
      }
      const duration = readTimestamp() - startedAt;
      trackEvent("comparison_completed", {
        marketplace: discovery.marketplace,
        status: parsed.status,
        demo_mode: parsed.demoMode,
        candidate_count: parsed.candidates.length,
        duration_bucket: duration < 5000 ? "under_5s" : duration < 15000 ? "5_to_15s" : "over_15s",
      });
      focusComparisonTarget();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.error.temporary);
      trackEvent("comparison_failed", { marketplace: discovery.marketplace });
    } finally {
      setLoading(false);
      setComparingDiscoveryId(null);
    }
  }

  function sendFeedback(changedDecision: boolean) {
    setFeedbackSent(true);
    trackEvent("decision_feedback_submitted", { changed_decision: changedDecision });
  }

  const compactMode = Boolean(pendingRequest || report || confirmedIdentityForSettings);
  const activeCard = report?.confirmedCard ?? null;
  const currentCarouselCard = confirmedIdentityForSettings
    ? toRecentCarouselCard(confirmedIdentityForSettings, pendingRequest?.cardHint.game ?? game)
    : activeCard
      ? toRecentCarouselCard(activeCard, pendingRequest?.cardHint.game ?? game)
      : null;
  const carouselCards = composeCarouselCards(currentCarouselCard, recentCarouselCards);
  const headerQuery = activeCard
    ? [activeCard.name, activeCard.cardNumber, activeCard.setName].filter(Boolean).join(" · ")
    : heroQuery.trim() || pendingRequest?.query || cardName.trim() || t.form.heroSearchLabel;
  const headerContext = [
    t.form.games[pendingRequest?.cardHint.game ?? game],
    (pendingRequest?.buyer.postalCode ?? postalCode) ? `ZIP ${pendingRequest?.buyer.postalCode ?? postalCode}` : null,
    (pendingRequest?.buyer.desiredCondition ?? desiredCondition) === "Unknown"
      ? t.form.anyCondition
      : t.conditions[pendingRequest?.buyer.desiredCondition ?? desiredCondition],
  ].filter(Boolean).join(" · ");
  const hasCardStarter = Boolean(heroQuery.trim().length >= 2 || cardName.trim().length >= 2 || cardNumber.trim());
  const hasExplicitCardKey = Boolean(
    hasCardStarter
    && (heroPreview?.cardNumber || cardNumber.trim())
  );

  function startNewSearch() {
    setReport(null);
    setPendingRequest(null);
    setConfirmedIdentityForSettings(null);
    setError(null);
    setCompactSearchOpen(false);
    form.reset(resetForNewCardSearch(form.getValues()));
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('input[name="heroQuery"]')?.focus();
    });
  }

  return (
    <main className="min-h-screen bg-[#f4f7f3] text-[#24312f]">
      {compactMode ? (
        <ResultsHeader
          query={headerQuery}
          context={headerContext}
          editOpen={compactSearchOpen}
          onEditToggle={() => setCompactSearchOpen((current) => !current)}
          onNewSearch={startNewSearch}
          editPanel={compactSearchOpen ? (
            <form
              className="mx-auto grid max-w-[1180px] gap-3 border-t border-[#d6ded5] px-4 py-4 sm:grid-cols-[minmax(0,1fr)_160px_140px_auto] sm:items-end sm:px-6 lg:px-8"
              onSubmit={form.handleSubmit((values) => {
                setCompactSearchOpen(false);
                void submitComparison(values);
              })}
            >
              <label className="field">
                <span>{t.form.heroSearchLabel}</span>
                <div className="input-with-icon">
                  <IconCardSearch className="h-4 w-4" />
                  <input {...form.register("heroQuery")} autoFocus />
                </div>
              </label>
              <label className="field">
                <span>{t.form.gameLabel}</span>
                <select {...form.register("game")}>
                  <option value="pokemon">{t.form.games.pokemon}</option>
                  <option value="onePiece">{t.form.games.onePiece}</option>
                </select>
              </label>
              <label className="field">
                <span>{t.form.deliveryZip}</span>
                <input {...form.register("postalCode")} inputMode="numeric" />
              </label>
              <button className="primary-button" type="submit" disabled={loading}>
                {loading ? <IconSpinner className="h-4 w-4 animate-spin" /> : <IconCardSearch className="h-4 w-4" />}
                {t.form.submitIdle}
              </button>
            </form>
          ) : null}
        />
      ) : (
        <Header />
      )}
      <div className={`mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8 ${compactMode ? "pb-14 pt-5" : "pb-24 pt-6 sm:pt-8"}`}>
        {!compactMode && (
          <>
        <section id="compare" className="paper-panel overflow-hidden shadow-[0_18px_60px_rgba(36,49,47,0.06)]">
          <form className="p-4 sm:p-6 lg:p-7" onSubmit={form.handleSubmit((values) => submitComparison(values))}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
              <div className="flex min-h-full min-w-0 flex-col justify-between gap-5">
                <div>
                  <h1 className="display-soft max-w-2xl font-serif text-3xl font-black leading-[1.04] tracking-[-0.03em] text-[#2f6f73] sm:text-4xl lg:text-5xl">
                    {t.hero.title}
                  </h1>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-[#52635c] sm:text-base">
                    {t.hero.subtitle}
                  </p>
                </div>
                <CardMarquee cards={carouselCards} />
              </div>

              <div className="min-w-0 space-y-4">
              <section className="rounded-xl border border-[#d6ded5] bg-[#fffef9] p-4 shadow-[0_8px_24px_rgba(36,49,47,0.04)] sm:p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#64736c]">{t.form.stepOne}</p>
                <h2 className="mt-2 font-serif text-2xl font-black leading-none text-[#24312f] sm:text-3xl">
                  {t.form.cardQuestion}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[#64736c]">{t.form.cardQuestionHelp}</p>

                <label className="field mt-4">
                  <span className="sr-only">{t.form.heroSearchLabel}</span>
                  <div className="input-with-icon rounded-lg border-[#2f6f73] bg-[#fffef9] px-3 py-1.5 shadow-[0_0_0_3px_rgba(47,111,115,0.09)]">
                    <IconCardSearch className="h-5 w-5 text-[#2f6f73]" />
                    <input
                      {...form.register("heroQuery")}
                      placeholder={t.form.heroSearchPlaceholder}
                      className="text-lg font-semibold"
                      autoFocus
                    />
                  </div>
                </label>
                {form.formState.errors.heroQuery && (
                  <p className="mt-2 text-sm font-bold text-[#9a4a2c]">{form.formState.errors.heroQuery.message}</p>
                )}

                <ParsedPreview preview={heroPreview} game={game} t={t} />

                <fieldset className="mt-4">
                  <legend className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#64736c]">{t.form.gameLabel}</legend>
                  {/* Each game gets its own branded tile (TCGpal-drawn emblem +
                      signature accent), Collectr-style, instead of a plain text
                      toggle. The parser still auto-selects from the search text. */}
                  <div className="grid grid-cols-2 gap-2">
                    {gameTiles.map(({ id, logo, accent, tint, logoZoom }) => {
                      const active = game === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={active}
                          aria-label={t.form.games[id]}
                          onClick={() => form.setValue("game", id)}
                          style={active ? { borderColor: accent, background: tint } : undefined}
                          className={`relative flex min-h-16 flex-col items-center justify-center gap-1 overflow-hidden rounded-md border-2 px-3 py-2 transition ${
                            active ? "shadow-[0_2px_0_rgba(36,49,47,0.12)]" : "border-[#d6ded5] bg-[#fffef9] opacity-70 grayscale-[0.35] hover:opacity-100 hover:grayscale-0"
                          }`}
                        >
                          <span className="relative block h-8 w-full">
                            <Image
                              src={logo}
                              alt={t.form.games[id]}
                              fill
                              sizes="176px"
                              className="object-contain mix-blend-multiply"
                              style={logoZoom !== 1 ? { transform: `scale(${logoZoom})` } : undefined}
                            />
                          </span>
                          <span className="relative z-10 text-[11px] font-black uppercase tracking-[0.08em] text-[#24312f]">{t.form.games[id]}</span>
                          {active && <IconCheck className="absolute right-2 top-2 h-4 w-4 shrink-0 text-[#24312f]" />}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button className="primary-button flex-1 justify-center" type="submit" disabled={loading}>
                    {loading ? <IconSpinner className="h-4 w-4 animate-spin" /> : <IconCardSearch className="h-4 w-4" />}
                    {loading ? t.form.submitLoading : hasExplicitCardKey ? t.form.submitIdle : t.form.findExactCard}
                  </button>
                  <button
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-2 text-sm font-black text-[#2f6f73] underline decoration-[#9fb3a8] underline-offset-4 hover:text-[#24585c]"
                    type="button"
                    aria-expanded={listingOpen}
                    onClick={() => setListingOpen((current) => !current)}
                  >
                    <IconLink className="h-4 w-4" />
                    {t.form.pasteListingInstead}
                  </button>
                </div>
              </section>

              {hasExplicitCardKey && (
              <section className="stage-reveal rounded-xl border border-[#d6ded5] bg-[#f7f9f5] p-4 shadow-[0_8px_24px_rgba(36,49,47,0.04)] sm:p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#64736c]">{t.form.stepTwo}</p>
                <h2 className="mt-2 font-serif text-2xl font-black leading-none text-[#24312f]">
                  {t.form.preferenceQuestion}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#64736c]">{t.form.preferenceHelp}</p>

                <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
                  <legend className="sr-only">{t.form.preferenceQuestion}</legend>
                  {(["best_value", "lowest_landed_cost", "safest_listing", "best_condition_evidence"] as LensRole[]).map((role) => {
                    const active = preferredRole === role;
                    return (
                      <label
                        key={role}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                          active ? "border-2 border-[#2f6f73] bg-[#eef7ef]" : "border-[#d6ded5] bg-[#fcfbf6] hover:border-[#9fb3a8]"
                        }`}
                      >
                        <input className="sr-only" type="radio" value={role} {...form.register("preferredRole")} />
                        <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${active ? "border-[#2f6f73]" : "border-[#c9d7ce]"}`}>
                          {active && <span className="h-2 w-2 rounded-full bg-[#2f6f73]" />}
                        </span>
                        <span>
                          <span className="block text-sm font-black text-[#24312f]">{rolePreferenceLabel(role, t)}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-[#64736c]">{roleToggleHint(role, t)}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="field">
                    <span>{t.form.deliveryZip}</span>
                    <div className="input-with-icon">
                      <IconPin className="h-4 w-4" />
                      <input {...form.register("postalCode")} inputMode="numeric" placeholder={t.form.ph.zip} />
                    </div>
                    <small>{t.form.deliveryZipHelp}</small>
                  </label>
                  <label className="field">
                    <span>{t.form.desiredCondition}</span>
                    <select {...form.register("desiredCondition")}>
                      {conditions.map((value) => (
                        <option key={value} value={value}>
                          {value === "Unknown" ? t.form.anyCondition : t.conditions[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
              )}
              </div>
            </div>

            <button
              className="mt-4 flex w-full items-center justify-between rounded-md border border-[#d6ded5] bg-[#f4f7f3] px-4 py-3 text-left text-sm font-bold text-[#52635c]"
              type="button"
              aria-expanded={refineOpen}
              onClick={() => setRefineOpen((current) => !current)}
            >
              <span className="flex items-center gap-2">
                <IconTag className="h-4 w-4 text-[#2f6f73]" />
                {t.form.refineToggle}
              </span>
              <IconChevronDown className={`h-4 w-4 transition ${refineOpen ? "rotate-180" : ""}`} />
            </button>
            {refineOpen && (
              <div className="mt-4 rounded-md border border-dashed border-[#c9d7ce] bg-[#f7f9f5] p-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="field">
                    <span>{t.form.cardName}</span>
                    <input {...form.register("cardName")} placeholder={ph.cardName} />
                  </label>
                  <label className="field">
                    <span>{t.form.set}</span>
                    <input {...form.register("setCode")} placeholder={ph.set} />
                  </label>
                  <label className="field">
                    <span>{t.form.collectorNumber}</span>
                    <input {...form.register("cardNumber")} placeholder={ph.collectorNumber} />
                  </label>
                </div>
                <CardKeyPreview name={cardName} setCode={setCode} cardNumber={cardNumber} />
                <div className="mt-4 grid gap-4">
                  <label className="field">
                    <span>{t.form.optionalTaxRate}</span>
                    <div className="input-suffix">
                      <input {...form.register("taxRatePercent")} inputMode="decimal" placeholder={t.form.ph.tax} />
                      <span>%</span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {listingOpen && (
            <div className="mt-4 rounded-md border border-dashed border-[#c9d7ce] bg-[#f7f9f5] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[#64736c]">
                  <IconLink className="h-4 w-4 text-[#2f6f73]" />
                  {t.form.listingToggle}
                </p>
                <button className="text-xs font-black text-[#2f6f73] hover:text-[#24585c]" type="button" onClick={() => setListingOpen(false)}>
                  {t.header.closeSearch}
                </button>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
                <label className="field">
                  <span>{t.form.listingUrl}</span>
                  <div className="input-with-icon">
                    <IconLink className="h-4 w-4" />
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
                      <IconSeal className="h-4 w-4" />
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

              <div className="mt-6 border-t border-[#d6ded5] pt-5">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[#64736c]">
                  <IconPhotoProof className="h-4 w-4 text-[#2f6f73]" />
                  {t.form.evidenceSubhead}
                </p>
                <div className="mt-4 grid gap-5 lg:grid-cols-2">
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
              </div>

              <div className="mt-6 border-t border-[#d6ded5] pt-5">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[#64736c]">
                  <IconReceipt className="h-4 w-4 text-[#2f6f73]" />
                  {t.form.ledgerSubhead}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#64736c]">{t.form.ledgerHelp}</p>
                {ledger.fields.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {ledger.fields.map((field, index) => (
                      <div key={field.id} className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-4">
                        <div className="grid gap-3 md:grid-cols-[1fr_0.8fr_1fr_auto] md:items-end">
                          <label className="field">
                            <span>{t.form.marketplace}</span>
                            <select {...form.register(`manualCandidates.${index}.marketplace` as const)}>
                              {marketplaces.map((value) => <option key={value} value={value}>{t.marketplaces[value] ?? value}</option>)}
                            </select>
                          </label>
                          <label className="field">
                            <span>{t.form.askingPrice}</span>
                            <div className="input-prefix">
                              <span>$</span>
                              <input inputMode="decimal" placeholder={t.form.ph.price} {...form.register(`manualCandidates.${index}.price` as const)} />
                            </div>
                          </label>
                          <label className="field">
                            <span>{t.form.sellerClaimedCondition}</span>
                            <select {...form.register(`manualCandidates.${index}.claimedCondition` as const)}>
                              {conditions.map((value) => <option key={value} value={value}>{t.conditions[value]}</option>)}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="mb-1 inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-[#d6ded5] px-3 text-sm font-bold text-[#9a4a2c] hover:bg-[#f6dcd0]"
                            onClick={() => ledger.remove(index)}
                          >
                            <IconX className="h-4 w-4" />
                            {t.form.ledgerRemove}
                          </button>
                        </div>
                        <label className="field mt-3">
                          <span>{t.form.listingTitle}</span>
                          <input placeholder={t.form.ph.listingTitle} {...form.register(`manualCandidates.${index}.title` as const)} />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="secondary-button mt-4"
                  onClick={() => {
                    ledger.append(emptyLedgerRow);
                    trackEvent("manual_candidate_added", { marketplace: emptyLedgerRow.marketplace });
                  }}
                >
                  <IconPlus className="h-4 w-4" />
                  {t.form.ledgerAdd}
                </button>
              </div>
            </div>
            )}

          </form>
        </section>

          </>
        )}

        {loading && <LoadingLoop cards={carouselCards} />}
        {error && <ErrorNotice message={error} onRetry={pendingRequest ? retryComparison : undefined} />}
        {report?.status === "needs_confirmation" && !loading && !confirmedIdentityForSettings && (
          <IdentityConfirmation identities={report.identityCandidates} warnings={report.warnings} onConfirm={confirmIdentity} />
        )}
        {confirmedIdentityForSettings && !loading && !report && (
          <ConfirmedSettingsStage
            identity={confirmedIdentityForSettings}
            form={form}
            onRun={form.handleSubmit((values) => {
              void submitComparison(values, confirmedIdentityForSettings.id);
            })}
            loading={loading}
          />
        )}
        {report && report.status !== "needs_confirmation" && !loading && (
          <ComparisonResult
            report={report}
            preferredRole={preferredRole}
            feedbackSent={feedbackSent}
            onFeedback={sendFeedback}
            onCompareDiscovery={compareWebDiscovery}
            comparingDiscoveryId={comparingDiscoveryId}
          />
        )}
      </div>
      <Footer />
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
            <a className="hover:text-[#2f6f73]" href="/method">{t.header.method}</a>
            <span className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] px-3 py-2 text-[#2f6f73]">{t.header.scopeBadge}</span>
          </nav>
          <LanguageToggle lang={lang} setLang={setLang} t={t} />
        </div>
      </div>
    </header>
  );
}

function ResultsHeader({
  query,
  context,
  editOpen,
  editPanel,
  onEditToggle,
  onNewSearch,
}: {
  query: string;
  context: string;
  editOpen: boolean;
  editPanel: ReactNode;
  onEditToggle: () => void;
  onNewSearch: () => void;
}) {
  const t = useT();
  const { lang, setLang } = useLang();

  return (
    <header className="sticky top-0 z-50 border-b border-[#d6ded5] bg-[#fcfbf6]/95 shadow-[0_1px_10px_rgba(36,49,47,0.04)] backdrop-blur">
      <div className="relative mx-auto flex max-w-[1240px] flex-wrap items-center gap-2 px-4 py-2.5 sm:gap-3 sm:px-6 lg:flex-nowrap lg:px-8">
        <a className="shrink-0" href="#" aria-label={t.header.home}>
          <Image src="/tcgpal-logo-horizontal.svg" alt="TCGpal" width={104} height={30} priority />
        </a>
        <button
          className="order-3 flex min-w-0 basis-full items-center gap-2 rounded-lg border border-[#d6ded5] bg-[#f4f3ec] px-3 py-2 text-left transition hover:border-[#2f6f73] focus:outline-none focus:ring-2 focus:ring-[#2f6f73]/20 sm:order-none sm:basis-auto sm:flex-1 lg:max-w-[610px]"
          type="button"
          aria-expanded={editOpen}
          onClick={onEditToggle}
        >
          <IconCardSearch className="h-4 w-4 shrink-0 text-[#2f6f73]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black leading-5 text-[#24312f]">{query}</span>
            {context && <span className="mt-0.5 block truncate text-xs font-bold leading-4 text-[#64736c]">{context}</span>}
          </span>
          <span className="shrink-0 text-xs font-black text-[#2f6f73]">{editOpen ? t.header.closeSearch : t.header.editSearch}</span>
        </button>
        <nav className="ml-auto flex items-center gap-2 text-xs font-black text-[#64736c] sm:gap-4">
          <button className="hover:text-[#2f6f73]" type="button" onClick={onNewSearch}>{t.header.newSearch}</button>
          <a className="hidden hover:text-[#2f6f73] sm:inline" href="/method">{t.header.method}</a>
          <LanguageToggle lang={lang} setLang={setLang} t={t} />
        </nav>
      </div>
      {editPanel}
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

function Footer() {
  const t = useT();
  return (
    <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#d6ded5] px-4 py-6 text-xs font-bold text-[#7a8982] sm:px-6 lg:px-8">
      <span>{t.footer.copyright}</span>
      <a className="hover:text-[#2f6f73]" href="/method">{t.header.method}</a>
      <a className="hover:text-[#2f6f73]" href="/method">{t.footer.dataSources}</a>
      <a className="hover:text-[#2f6f73]" href="/method">{t.footer.boundaries}</a>
      <a className="hover:text-[#2f6f73]" href="#feedback">{t.footer.feedback}</a>
    </footer>
  );
}

// Stylized card backs stay as first-run fallback; real card art is used only
// after a card has been confirmed, so the rail never reflects raw typed guesses.
const fallbackCardBacks = [
  "linear-gradient(150deg, #2f6f73, #24585c)",
  "linear-gradient(150deg, #d8a03a, #b97f24)",
  "linear-gradient(150deg, #9a4a2c, #7c3a22)",
  "linear-gradient(150deg, #4a7d55, #38623f)",
  "linear-gradient(150deg, #3d5a80, #2c4360)",
  "linear-gradient(150deg, #6d5a8c, #544370)",
];

type MarqueeItem =
  | { kind: "real"; card: RecentCarouselCard }
  | { kind: "back"; background: string };

function buildMarqueeItems(cards: RecentCarouselCard[], minimum = 8): MarqueeItem[] {
  const realCards = cards.filter((card) => card.imageUrl);
  const source: MarqueeItem[] = realCards.length > 0
    ? realCards.map((card) => ({ kind: "real" as const, card }))
    : fallbackCardBacks.map((background) => ({ kind: "back" as const, background }));
  const base: MarqueeItem[] = [];
  while (base.length < Math.max(minimum, source.length)) {
    base.push(...source);
  }
  const loopBase = base.slice(0, Math.max(minimum, source.length));
  return [...loopBase, ...loopBase];
}

function CardMarquee({ cards }: { cards: RecentCarouselCard[] }) {
  const items = buildMarqueeItems(cards);
  return (
    <div aria-hidden="true" className="card-marquee relative hidden h-[128px] overflow-hidden lg:block">
      <div className="card-marquee-track flex w-max items-center">
        {items.map((item, index) => (
          <CardMarqueeItem key={`${item.kind}-${item.kind === "real" ? item.card.id : item.background}-${index}`} item={item} index={index} />
        ))}
      </div>
    </div>
  );
}

function CardMarqueeItem({ item, index }: { item: MarqueeItem; index: number }) {
  const rotation = `${index % 2 ? 3 : -3}deg`;
  if (item.kind === "real") {
    return (
      <span
        className="card-marquee-card card-marquee-card-real relative mx-1.5 block h-[110px] w-[78px] shrink-0 overflow-hidden rounded-[9px] border border-[rgba(36,49,47,0.13)] bg-[#fcfbf6] shadow-[0_10px_22px_rgba(36,49,47,0.18)]"
        style={{ transform: `rotate(${rotation})` }}
      >
        {item.card.imageUrl && (
          <Image
            src={item.card.imageUrl}
            alt=""
            fill
            sizes="80px"
            className="object-contain"
          />
        )}
        <span className="card-marquee-gloss absolute inset-0 rounded-[inherit] bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.2)_45%,transparent_60%)]" />
      </span>
    );
  }
  return (
    <span
      className="card-marquee-card relative mx-1.5 block h-[110px] w-[78px] shrink-0 overflow-hidden rounded-[9px] border border-[rgba(255,255,255,0.55)] shadow-[0_10px_22px_rgba(36,49,47,0.18)]"
      style={{ background: item.background, transform: `rotate(${rotation})` }}
    >
      <span className="card-marquee-inner absolute inset-[6px] rounded-[6px] border border-[rgba(255,255,255,0.35)]" />
      <span className="card-marquee-orb absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[rgba(255,255,255,0.45)]" />
      <span className="card-marquee-gloss absolute inset-0 rounded-[inherit] bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.2)_45%,transparent_60%)]" />
    </span>
  );
}

function ParsedPreview({
  preview,
  game,
  t,
}: {
  preview: ReturnType<typeof parseCardQuery> | null;
  game: TcgGame;
  t: Dict;
}) {
  if (!preview) {
    return <p className="mt-3 text-sm leading-6 text-[#7a8982]">{t.form.heroParsedNothing}</p>;
  }

  const chips = [
    preview.game && { label: t.form.games[preview.game], tone: "blue" },
    preview.name && { label: preview.name, tone: "green" },
    preview.cardNumber && { label: `#${preview.cardNumber}`, tone: "gold" },
    preview.language && { label: preview.language, tone: "neutral" },
    preview.variant && { label: preview.variant, tone: "neutral" },
    preview.gradingClaim && { label: preview.gradingClaim, tone: "neutral" },
  ].filter(Boolean) as Array<{ label: string; tone: "blue" | "green" | "gold" | "neutral" }>;

  if (chips.length === 0) {
    chips.push({ label: t.form.games[game], tone: "blue" });
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-[#c9d7ce] bg-[#f7f9f5] px-3 py-2.5">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#64736c]">{t.form.heroParsedPrefix}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span
            key={`${chip.tone}-${chip.label}`}
            className={`rounded-md px-2.5 py-1 text-xs font-black ${
              chip.tone === "blue"
                ? "border border-[#cfe0f2] bg-[#eef4fb] text-[#2a6099]"
                : chip.tone === "gold"
                  ? "border border-[#e2c879] bg-[#fff8dc] font-mono text-[#6f5a22]"
                  : chip.tone === "green"
                    ? "border border-[#c9d7ce] bg-[#e7efe8] text-[#2f6f73]"
                    : "border border-[#d6ded5] bg-[#fcfbf6] text-[#52635c]"
            }`}
          >
            {chip.label}
          </span>
        ))}
      </div>
    </div>
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
      {identity.variant && (
        <span className="rounded-md border border-[#c9d7ce] bg-[#e7efe8] px-2.5 py-1.5 text-xs font-bold text-[#2f6f73]">
          {identity.variant}
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

function CheckField({ label, registration }: { label: string; registration: UseFormRegisterReturn }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-[#d6ded5] bg-[#fcfbf6] px-3 py-2 text-sm font-bold text-[#52635c]">
      <input className="h-4 w-4 accent-[#2f6f73]" type="checkbox" {...registration} />
      {label}
    </label>
  );
}

function LoadingLoop({ cards }: { cards: RecentCarouselCard[] }) {
  const t = useT();
  return (
    <section className="market-agent-panel mt-6 rounded-md border border-[#c9d7ce] bg-[#e7efe8] p-5 sm:p-6" aria-live="polite">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
        <div>
          <div className="flex items-center gap-3">
            <IconSpinner className="h-5 w-5 animate-spin text-[#2f6f73]" />
            <div>
              <p className="font-serif text-xl font-bold text-[#2f6f73]">{t.loading.title}</p>
              <p className="mt-1 text-sm text-[#64736c]">{t.loading.steps}</p>
            </div>
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {t.loading.checks.map((check) => (
              <li key={check} className="flex items-center gap-2 rounded-md border border-[#d6ded5] bg-[#fcfbf6] px-3 py-2 text-sm font-bold text-[#52635c]">
                <IconCheck className="h-4 w-4 text-[#2f6f73]" />
                {check}
              </li>
            ))}
          </ul>
          <div className="agent-progress mt-5"><span /></div>
        </div>
        <LoadingCardRail labels={t.loading.cardLabels} cards={cards} />
      </div>
    </section>
  );
}

function LoadingCardRail({ labels, cards }: { labels: string[]; cards: RecentCarouselCard[] }) {
  const items = buildMarqueeItems(cards, 4).slice(0, 4);
  return (
    <div className="loading-card-rail" aria-hidden="true">
      <style>{`
        .loading-card-rail {
          min-height: 9.5rem;
          overflow: hidden;
          border-radius: 0.75rem;
          border: 1px solid #c9d7ce;
          background: linear-gradient(135deg, rgba(255,255,255,.58), transparent 50%), #f7f9f5;
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 11%, #000 89%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 11%, #000 89%, transparent);
        }
        .loading-card-track {
          display: flex;
          min-height: 9.5rem;
          align-items: center;
          gap: .75rem;
          padding-inline: 1rem;
          animation: tcgpal-loading-card-roll 2.8s cubic-bezier(.22,1,.36,1) infinite;
          will-change: transform;
        }
        .loading-card {
          position: relative;
          display: grid;
          height: 7.4rem;
          width: 5.25rem;
          flex: 0 0 auto;
          place-items: center;
          overflow: hidden;
          border-radius: .6rem;
          border: 1px solid rgba(255,255,255,.62);
          box-shadow: 0 14px 28px rgba(36,49,47,.18);
        }
        .loading-card:nth-child(odd) { transform: translateY(-.2rem) rotate(-2deg); }
        .loading-card:nth-child(even) { transform: translateY(.2rem) rotate(2deg); }
        .loading-card-real { background: #fcfbf6; }
        .loading-card-real img {
          padding: .18rem;
          filter: saturate(.96) contrast(1.02);
        }
        .loading-card-inner {
          position: absolute;
          inset: .45rem;
          border-radius: .42rem;
          border: 1px solid rgba(255,255,255,.38);
        }
        .loading-card-gloss {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(115deg, transparent 28%, rgba(255,255,255,.22) 44%, transparent 60%);
          pointer-events: none;
        }
        .loading-card-label {
          position: relative;
          z-index: 2;
          border-radius: 999px;
          background: rgba(252,251,246,.86);
          padding: .26rem .48rem;
          color: #24312f;
          font-size: .62rem;
          font-weight: 900;
          letter-spacing: .04em;
          text-transform: uppercase;
        }
        @keyframes tcgpal-loading-card-roll {
          0% { transform: translateX(0); }
          46% { transform: translateX(-3.4rem); }
          100% { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .loading-card-track { animation: none; }
        }
      `}</style>
      <div className="loading-card-track">
        {items.map((item, index) => (
          <span
            key={`${item.kind}-${item.kind === "real" ? item.card.id : item.background}-${index}`}
            className={`loading-card ${item.kind === "real" ? "loading-card-real" : ""}`}
            style={{
              background: item.kind === "back" ? item.background : undefined,
              zIndex: items.length - index,
            }}
          >
            {item.kind === "real" && item.card.imageUrl ? (
              <Image src={item.card.imageUrl} alt="" fill sizes="84px" className="object-contain" />
            ) : (
              <span className="loading-card-inner" />
            )}
            <span className="loading-card-gloss" />
            <span className="loading-card-label">{labels[index] ?? ""}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="mt-6 flex items-start gap-3 rounded-md border border-[#e4c0ad] bg-[#fff7f0] p-5 text-sm leading-6 text-[#7e4934]" role="alert">
      <IconCaution className="mt-1 h-5 w-5 shrink-0" />
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

function ConfirmedSettingsStage({
  identity,
  form,
  onRun,
  loading,
}: {
  identity: CardIdentityCandidate;
  form: UseFormReturn<ComparisonForm>;
  onRun: () => void;
  loading: boolean;
}) {
  const t = useT();
  const preferredRole = useWatch({ control: form.control, name: "preferredRole" });
  const postalCode = useWatch({ control: form.control, name: "postalCode" });
  const desiredCondition = useWatch({ control: form.control, name: "desiredCondition" });
  const taxRatePercent = useWatch({ control: form.control, name: "taxRatePercent" });
  const stickyRunContext = [
    desiredCondition === "Unknown" ? t.form.anyCondition : t.conditions[desiredCondition],
    postalCode ? `ZIP ${postalCode}` : t.card.preTaxTotal,
    taxRatePercent ? `${taxRatePercent}%` : null,
  ].filter(Boolean).join(" · ");
  return (
    <section
      id="comparison-result"
      tabIndex={-1}
      className="stage-reveal mt-6 scroll-mt-6 rounded-md border border-[#2f6f73] bg-[#fcfbf6] p-5 pb-28 outline-none shadow-[0_14px_34px_rgba(36,49,47,0.08)] sm:p-7"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:items-start">
        <article className="rounded-xl border border-[#d6ded5] bg-[#f7f9f5] p-4">
          <p className="eyebrow text-[#2f6f73]">
            <IconCheck className="h-4 w-4" />
            {t.form.confirmedSettingsEyebrow}
          </p>
          <div className="mt-4 grid grid-cols-[72px_minmax(0,1fr)] gap-4">
            {identity.imageUrl ? (
              <HoloCardArt
                src={identity.imageUrl}
                alt={`${identity.name} ${identity.cardNumber}`}
                sizes="72px"
                className="w-[72px]"
              />
            ) : (
              <div className="aspect-[2.5/3.5] w-[72px] rounded-md bg-[#e7efe8]" />
            )}
            <div className="min-w-0">
              <h2 className="font-serif text-2xl font-black leading-tight text-[#2f6f73]">{identity.name}</h2>
              <p className="mt-1 text-sm font-black text-[#24312f]">#{identity.cardNumber}</p>
              <CardIdentityRail identity={identity} className="mt-3" />
            </div>
          </div>
        </article>

        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#64736c]">{t.form.stepTwo}</p>
          <h3 className="mt-2 font-serif text-3xl font-black leading-none text-[#24312f]">
            {t.form.confirmedSettingsHeading}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64736c]">{t.form.confirmedSettingsHelp}</p>

          <fieldset className="mt-5 grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">{t.form.preferenceQuestion}</legend>
            {(["best_value", "lowest_landed_cost", "safest_listing", "best_condition_evidence"] as LensRole[]).map((role) => {
              const active = preferredRole === role;
              return (
                <label
                  key={role}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                    active ? "border-2 border-[#2f6f73] bg-[#eef7ef]" : "border-[#d6ded5] bg-[#fffef9] hover:border-[#9fb3a8]"
                  }`}
                >
                  <input className="sr-only" type="radio" value={role} {...form.register("preferredRole")} />
                  <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${active ? "border-[#2f6f73]" : "border-[#c9d7ce]"}`}>
                    {active && <span className="h-2 w-2 rounded-full bg-[#2f6f73]" />}
                  </span>
                  <span>
                    <span className="block text-sm font-black text-[#24312f]">{rolePreferenceLabel(role, t)}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[#64736c]">{roleToggleHint(role, t)}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="field">
              <span>{t.form.deliveryZip}</span>
              <div className="input-with-icon">
                <IconPin className="h-4 w-4" />
                <input {...form.register("postalCode")} inputMode="numeric" placeholder={t.form.ph.zip} />
              </div>
              <small>{t.form.deliveryZipHelp}</small>
            </label>
            <label className="field">
              <span>{t.form.desiredCondition}</span>
              <select {...form.register("desiredCondition")}>
                {conditions.map((value) => (
                  <option key={value} value={value}>
                    {value === "Unknown" ? t.form.anyCondition : t.conditions[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t.form.optionalTaxRate}</span>
              <div className="input-suffix">
                <input {...form.register("taxRatePercent")} inputMode="decimal" placeholder={t.form.ph.tax} />
                <span>%</span>
              </div>
            </label>
          </div>

          <button className="primary-button mt-5 w-full justify-center sm:w-auto" type="button" disabled={loading} onClick={onRun}>
            {loading ? <IconSpinner className="h-4 w-4 animate-spin" /> : <IconCardSearch className="h-4 w-4" />}
            {loading ? t.form.submitLoading : t.form.confirmedSettingsSubmit}
          </button>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#c9d7ce] bg-[#fcfbf6]/96 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-8px_22px_rgba(36,49,47,0.10)] backdrop-blur sm:hidden">
        <p className="mb-2 truncate text-xs font-bold text-[#64736c]">{stickyRunContext}</p>
        <button className="primary-button w-full justify-center" type="button" disabled={loading} onClick={onRun}>
          {loading ? <IconSpinner className="h-4 w-4 animate-spin" /> : <IconCardSearch className="h-4 w-4" />}
          {loading ? t.form.submitLoading : t.form.confirmedSettingsSubmit}
        </button>
      </div>
    </section>
  );
}

function IdentityConfirmation({ identities, warnings = [], onConfirm }: { identities: CardIdentityCandidate[]; warnings?: string[]; onConfirm: (identity: CardIdentityCandidate) => void }) {
  const t = useT();
  const grouped = identities.length > IDENTITY_GROUP_THRESHOLD;
  const groups = useMemo(() => (grouped ? groupIdentitiesBySet(identities) : []), [grouped, identities]);
  const likelyMatches = useMemo(
    () => (grouped ? identities.filter((identity) => identity.confidence !== "low").slice(0, 4) : []),
    [grouped, identities],
  );
  const likelyMatchIds = useMemo(() => new Set(likelyMatches.map((identity) => identity.id)), [likelyMatches]);
  const remainingGroups = useMemo(
    () => groups
      .map((group) => ({ ...group, items: group.items.filter((identity) => !likelyMatchIds.has(identity.id)) }))
      .filter((group) => group.items.length > 0),
    [groups, likelyMatchIds],
  );
  // A failed catalog lookup must not read as "no such card" — distinguish it so the
  // empty state says "temporarily unavailable, try again" instead of "no match".
  const lookupUnavailable = identities.length === 0 && warnings.some((warning) => /catalog lookup unavailable/i.test(warning));
  return (
    <section id="comparison-result" tabIndex={-1} className="mt-6 scroll-mt-6 rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5 outline-none sm:p-7">
      <div className="max-w-2xl">
        <p className="eyebrow">
          <IconSeal className="h-4 w-4" />
          {t.identity.eyebrow}
        </p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-[#2f6f73]">{t.identity.heading}</h2>
        <p className="mt-2 leading-7 text-[#64736c]">
          {t.identity.desc}
        </p>
      </div>
      {identities.length === 0 ? (
        <div className="mt-6 rounded-md border border-[#e5c69e] bg-[#fff8e9] p-5 text-sm leading-6 text-[#765633]">
          {lookupUnavailable ? t.identity.lookupUnavailable : t.identity.noMatch}
        </div>
      ) : grouped ? (
        <div className="mt-6 space-y-7">
          {likelyMatches.length > 0 && (
            <section aria-labelledby="identity-likely-matches">
              <h3 id="identity-likely-matches" className="text-sm font-black uppercase tracking-[0.12em] text-[#52635c]">
                {t.identity.bestMatches}
              </h3>
              <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {likelyMatches.map((identity) => (
                  <IdentityCard key={identity.id} identity={identity} onConfirm={onConfirm} titleAs="h4" compact />
                ))}
              </div>
            </section>
          )}
          <div aria-label={t.identity.otherVersions} className="space-y-3">
          {remainingGroups.map((group, index) => {
            const headingId = `identity-set-${index}`;
            return (
              <details key={group.setName} className="rounded-lg border border-[#d6ded5] bg-[#fffef9] p-3" open={index < 2}>
                <summary id={headingId} className="cursor-pointer text-sm font-black uppercase tracking-[0.12em] text-[#52635c]">
                  {group.setName}
                  <span className="ml-2 font-bold normal-case tracking-normal text-[#8a978f]">{t.identity.versions(group.items.length)}</span>
                </summary>
                <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((identity) => (
                    <IdentityCard key={identity.id} identity={identity} onConfirm={onConfirm} titleAs="h4" />
                  ))}
                </div>
              </details>
            );
          })}
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {identities.map((identity) => (
            <IdentityCard key={identity.id} identity={identity} onConfirm={onConfirm} titleAs="h3" />
          ))}
        </div>
      )}
    </section>
  );
}

function IdentityCard({ identity, onConfirm, titleAs, compact = false }: { identity: CardIdentityCandidate; onConfirm: (identity: CardIdentityCandidate) => void; titleAs: "h3" | "h4"; compact?: boolean }) {
  const t = useT();
  const titleClass = "mt-1 font-serif text-xl font-bold text-[#2f6f73]";
  const titleDetails = [
    identity.cardNumber ? `#${identity.cardNumber}` : null,
    identity.variant,
  ].filter(Boolean).join(" / ");
  return (
    <article className="rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4">
      {identity.imageUrl ? (
        <HoloCardArt
          src={identity.imageUrl}
          alt={`${identity.name} ${identity.cardNumber}`}
          sizes={compact ? "112px" : "144px"}
          className={`mx-auto ${compact ? "w-28" : "w-36"}`}
        />
      ) : (
        <div className={`mx-auto aspect-[2.5/3.5] ${compact ? "w-28" : "w-36"} rounded-md bg-[#e7efe8]`} />
      )}
      <p className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-[#b26a4c]">{t.identity.confidence(identity.confidence)}</p>
      {titleAs === "h4" ? <h4 className={titleClass}>{identity.name}</h4> : <h3 className={titleClass}>{identity.name}</h3>}
      {titleDetails && <p className="mt-1 text-sm font-black text-[#24312f]">{titleDetails}</p>}
      <CardIdentityRail identity={identity} className="mt-3" />
      <button className="secondary-button mt-4 w-full" type="button" onClick={() => onConfirm(identity)}>
        <IconCheck className="h-4 w-4" />
        {t.identity.confirm}
      </button>
    </article>
  );
}

function ComparisonResult({
  report,
  preferredRole,
  feedbackSent,
  onFeedback,
  onCompareDiscovery,
  comparingDiscoveryId,
}: {
  report: ComparisonReport;
  preferredRole: LensRole;
  feedbackSent: boolean;
  onFeedback: (changedDecision: boolean) => void;
  onCompareDiscovery: (discovery: WebDiscovery) => void;
  comparingDiscoveryId: string | null;
}) {
  const t = useT();
  const { lang } = useLang();
  const listingMap = useMemo(() => new Map(report.candidates.map((candidate) => [candidate.id, candidate])), [report.candidates]);
  const eligibleListings = useMemo(() => report.candidates.filter((candidate) => candidate.eligible), [report.candidates]);
  const excluded = report.candidates.filter((candidate) => !candidate.eligible);

  // Default to Best Value — the flagship "which one do I buy" recommendation,
  // a composite of price-vs-market, seller trust, and evidence — but keep every
  // lens (Cheapest / Safest / Best-documented) one tap away.
  const defaultRole = useMemo<RankedChoice["role"] | null>(() => {
    const roles = report.rankedChoices.map((choice) => choice.role);
    return roles.includes(preferredRole)
      ? preferredRole
      : roles.includes("best_value")
        ? "best_value"
        : roles.includes("safest_listing")
          ? "safest_listing"
          : roles[0] ?? null;
  }, [preferredRole, report.rankedChoices]);
  const [roleOverride, setRoleOverride] = useState<RankedChoice["role"] | null>(null);
  // Honor the user's chosen lens, but fall back to the default when it is not
  // present in the current report (e.g. after a new comparison) — no effect/reset.
  const selectedRole = roleOverride && report.rankedChoices.some((choice) => choice.role === roleOverride)
    ? roleOverride
    : defaultRole;
  const selectedChoice = report.rankedChoices.find((choice) => choice.role === selectedRole) ?? null;
  const selectedListing = selectedChoice ? listingMap.get(selectedChoice.listingId) ?? null : null;

  const eligibleCount = eligibleListings.length;
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const orderedEligibleListings = useMemo(
    () => sortListingsForRole(eligibleListings, selectedRole),
    [eligibleListings, selectedRole],
  );
  const prioritizedEligibleListings = useMemo(
    () => selectedListing
      ? [selectedListing, ...orderedEligibleListings.filter((listing) => listing.id !== selectedListing.id)]
      : orderedEligibleListings,
    [orderedEligibleListings, selectedListing],
  );
  const alternativeListings = selectedListing
    ? prioritizedEligibleListings.filter((listing) => listing.id !== selectedListing.id)
    : prioritizedEligibleListings;
  const visibleAlternativeListings = showAllCandidates
    ? alternativeListings
    : alternativeListings.slice(0, selectedListing ? Math.max(1, LEDGER_PREVIEW_COUNT - 1) : LEDGER_PREVIEW_COUNT);
  const hiddenEligibleCount = Math.max(0, alternativeListings.length - visibleAlternativeListings.length);
  const webDiscoveries = report.webDiscoveries ?? [];
  const visiblePlatforms = report.platforms.filter((platform) => platform.configured || platform.status === "fallback");
  const livePlatforms = visiblePlatforms.filter((platform) => platform.status === "complete");
  const connectedSourceLabels = livePlatforms.map((platform) => platform.marketplace).join(" + ");
  const unavailablePlatformCount = visiblePlatforms.filter((platform) => platform.status !== "complete").length;
  const marketReferenceAvailable = typeof report.confirmedCard?.marketMid === "number";
  const samePickRoles = selectedChoice
    ? report.rankedChoices
      .filter((choice) => choice.listingId === selectedChoice.listingId && choice.role !== selectedChoice.role)
      .map((choice) => roleToggleLabel(choice.role, t))
    : [];
  const listingTotals = eligibleListings.map((listing) => listing.estimatedLandedCost ?? listing.preTaxTotal);
  const listedRange = listingTotals.length > 0
    ? `${formatMoney(Math.min(...listingTotals))} to ${formatMoney(Math.max(...listingTotals))}`
    : t.result.unavailableRange;
  const observedTime = new Date(report.generatedAt).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaAnswer, setQaAnswer] = useState<ComparisonQuestionResponse | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaTarget, setQaTarget] = useState<{ id: string; label: string } | null>(null);
  const [receiptCopied, setReceiptCopied] = useState(false);
  const selectedVerdictCopy = selectedChoice && selectedListing
    ? buildVerdictCopy({
      listing: selectedListing,
      choice: selectedChoice,
      alternatives: alternativeListings,
      lang,
    })
    : null;
  const selectedChoiceReason = selectedVerdictCopy
    ? [selectedVerdictCopy.why, selectedVerdictCopy.catch, selectedVerdictCopy.alternative].filter(Boolean).join(" ")
    : null;

  async function copyComparisonReceipt() {
    if (!selectedListing || !selectedChoice) return;
    const total = selectedListing.estimatedLandedCost ?? selectedListing.preTaxTotal;
    const totalLabel = selectedListing.estimatedTax === null ? t.card.preTaxTotal : t.card.estLanded;
    const receipt = [
      "TCGpal comparison",
      report.confirmedCard
        ? `${report.confirmedCard.name} · ${report.confirmedCard.setCode} #${report.confirmedCard.cardNumber}`
        : selectedListing.title,
      `${roleToggleLabel(selectedChoice.role, t)}: ${selectedListing.marketplace} · ${t.conditions[selectedListing.claimedCondition]}`,
      `${totalLabel}: ${formatMoney(total)}`,
      `Seller trust ${selectedListing.sellerTrustScore}/100 · Evidence ${selectedListing.evidenceCompletenessScore}/100`,
      selectedChoiceReason ?? selectedChoice.reason,
      selectedListing.url ? `Listing: ${selectedListing.url}` : "",
      `Generated ${new Date(report.generatedAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")}`,
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(receipt);
      setReceiptCopied(true);
      trackEvent("comparison_receipt_copied");
      window.setTimeout(() => setReceiptCopied(false), 2000);
    } catch {
      setReceiptCopied(false);
    }
  }

  async function askQuestion(options: { question?: string; targetListing?: NormalizedListing | null } = {}) {
    const question = (options.question ?? qaQuestion).trim();
    if (!question || qaLoading) return;
    const targetListing = options.targetListing === undefined
      ? qaTarget ? listingMap.get(qaTarget.id) ?? null : null
      : options.targetListing;
    if (targetListing) {
      setQaQuestion(question);
      setQaTarget({ id: targetListing.id, label: `${targetListing.marketplace} · ${formatMoney(targetListing.estimatedLandedCost ?? targetListing.preTaxTotal)}` });
    }
    setQaLoading(true);
    setQaError(null);
    try {
      const json = await postJsonWithRetry(
        "/api/agent/listing-compare/explain",
        { report, question, targetListingId: targetListing?.id, activeRole: selectedRole ?? undefined, webContext: "auto" },
        t.result.askError,
      );
      setQaAnswer(json as ComparisonQuestionResponse);
    } catch (error) {
      setQaError(error instanceof Error && error.message !== "Failed to fetch" ? error.message : t.result.askError);
    } finally {
      setQaLoading(false);
    }
  }

  function askAboutListing(listing: NormalizedListing) {
    const selectedListingId = selectedChoice?.listingId;
    const question = listing.id === selectedListingId
      ? t.result.askWhyThis
      : t.result.askWhyNotListing(listing.marketplace, formatMoney(listing.estimatedLandedCost ?? listing.preTaxTotal));
    void askQuestion({ question, targetListing: listing });
  }

  return (
    <section id="comparison-result" tabIndex={-1} className="scroll-mt-24 space-y-4 outline-none">
      {report.demoMode && (
        <div className="flex items-start gap-3 rounded-md border border-[#e2c879] bg-[#fff8dc] p-4 text-sm leading-6 text-[#6f5a22]">
          <IconInfo className="mt-1 h-4 w-4 shrink-0" />
          <p><strong>{t.result.demoTitle}</strong>{t.result.demoBody}</p>
        </div>
      )}

      {report.rankedChoices.length === 0 && (
        <div className="rounded-xl border border-[#e2c879] bg-[#fff8dc] p-5 text-[#6f5a22]">
          <h3 className="font-serif text-xl font-black">{t.result.noRecommendationTitle}</h3>
          <p className="mt-2 text-sm leading-6">{t.result.noRecommendationBody}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-3">
          {selectedListing && selectedChoice && (
            <RecommendedBuyHero
              listing={selectedListing}
              choice={selectedChoice}
              verdict={selectedVerdictCopy ?? buildVerdictCopy({
                listing: selectedListing,
                choice: selectedChoice,
                alternatives: alternativeListings,
                lang,
              })}
              comparableCount={eligibleCount}
              fallbackImageUrl={report.confirmedCard?.imageUrl ?? null}
              marketPrice={report.demoMode ? null : report.confirmedCard?.marketMid ?? null}
              demoMode={report.demoMode}
              onAsk={askAboutListing}
            />
          )}

          {report.rankedChoices.length > 0 && (
            <LensControls
              choices={report.rankedChoices}
              selectedRole={selectedRole}
              samePickRoles={samePickRoles}
              onSelect={(role) => {
                setRoleOverride(role);
                setQaQuestion("");
                setQaAnswer(null);
                setQaError(null);
                setQaTarget(null);
                trackEvent("lens_selected", { choice_role: role });
              }}
            />
          )}

          <div className="space-y-2.5">
            {visibleAlternativeListings.map((listing) => (
              <CandidateRow
                key={listing.id}
                listing={listing}
                fallbackImageUrl={report.confirmedCard?.imageUrl ?? null}
                marketPrice={report.demoMode ? null : report.confirmedCard?.marketMid ?? null}
                choice={listing.id === selectedChoice?.listingId ? selectedChoice : null}
                lead={!selectedListing && listing.id === prioritizedEligibleListings[0]?.id}
                demoMode={report.demoMode}
                onAsk={askAboutListing}
              />
            ))}
            {hiddenEligibleCount > 0 && !showAllCandidates && (
              <button
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#c9d7ce] px-3 py-3 text-sm font-black text-[#2f6f73] transition hover:border-[#2f6f73] hover:bg-[#e7efe8]"
                type="button"
                onClick={() => setShowAllCandidates(true)}
              >
                {t.result.showAll(eligibleCount)}
                <IconChevronDown className="h-4 w-4" />
              </button>
            )}
            {showAllCandidates && eligibleCount > LEDGER_PREVIEW_COUNT && (
              <button
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#c9d7ce] px-3 py-3 text-sm font-black text-[#2f6f73] transition hover:border-[#2f6f73] hover:bg-[#e7efe8]"
                type="button"
                onClick={() => setShowAllCandidates(false)}
              >
                {t.result.showFewer}
              </button>
            )}
          </div>

          <DecisionReceipt
            card={report.confirmedCard}
            generatedAt={report.generatedAt}
            listedRange={listedRange}
            liveSources={connectedSourceLabels}
            hasMarketReference={marketReferenceAvailable}
            unavailableCount={unavailablePlatformCount}
            observedTime={observedTime}
            warningsCount={report.warnings.length}
            excluded={excluded}
            cautions={report.narrative.cautions}
            receiptCopied={receiptCopied}
            canCopy={Boolean(selectedListing && selectedChoice)}
            onCopy={() => void copyComparisonReceipt()}
          />

          <details id="method" className="rounded-xl border border-[#d6ded5] bg-[#fcfbf6] p-5">
            <summary className="cursor-pointer font-bold text-[#52635c]">{t.result.howWeChecked}</summary>

            {report.platforms.length > 0 && <SourcesChecked platforms={report.platforms} />}

            {report.references.length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-black text-[#24312f]">{t.result.referenceContext}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {report.references.map((reference) => (
                    <div key={reference.label} className="rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-bold">{reference.label}</p>
                        <StatusPill status={reference.status} />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#64736c]">{reference.note}</p>
                      {reference.rawMid !== null && <p className="mt-2 font-mono text-lg font-black text-[#2f6f73]">{t.result.reference(reference.rawMid.toFixed(2))}</p>}
                      {reference.url && (
                        <a className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#2f6f73] underline" href={reference.url} target="_blank" rel="noreferrer">
                          {t.result.openManualCheck} <IconExternal className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5">
              <p className="text-sm font-black text-[#24312f]">{t.result.technicalTrace}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {report.trace.map((step) => (
                  <div key={`${step.step}-${step.actor}`} className="rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black text-[#64736c]">{step.step.replaceAll("_", " ")}</p>
                      <StatusPill status={step.status === "complete" ? "used" : step.status === "fallback" ? "unavailable" : "missing"} />
                    </div>
                    <p className="mt-2 font-bold text-[#24312f]">{step.actor}</p>
                    <p className="mt-1 text-sm leading-6 text-[#64736c]">{step.summary}</p>
                  </div>
                ))}
              </div>
            </div>
            {report.warnings.length > 0 && (
              <div className="mt-4 rounded-md border border-[#e2c879] bg-[#fff8dc] p-4 text-sm leading-6 text-[#6f5a22]">
                {report.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            )}
          </details>

          <section id="feedback" className="rounded-xl border border-[#d6ded5] bg-[#24312f] p-5 text-[#fcfbf6] sm:flex sm:items-center sm:justify-between sm:gap-6">
            <h3 className="font-serif text-xl font-bold">{t.result.feedbackQuestion}</h3>
            {feedbackSent ? (
              <p className="mt-4 inline-flex items-center gap-2 font-bold text-[#d7a84e] sm:mt-0">
                <IconCheck className="h-5 w-5" />
                {t.result.feedbackSaved}
              </p>
            ) : (
              <div className="mt-4 flex gap-3 sm:mt-0">
                <button className="dark-button" type="button" onClick={() => onFeedback(true)}>{t.result.yes}</button>
                <button className="dark-button" type="button" onClick={() => onFeedback(false)}>{t.result.notYet}</button>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-24">
          <ComparisonQuestionBox
            question={qaQuestion}
            answer={qaAnswer}
            error={qaError}
            loading={qaLoading}
            targetLabel={qaTarget?.label ?? null}
            onQuestionChange={setQaQuestion}
            onAsk={askQuestion}
          />
          {webDiscoveries.length > 0 && (
            <WebDiscoveryPanel
              discoveries={webDiscoveries}
              onCompare={onCompareDiscovery}
              comparingDiscoveryId={comparingDiscoveryId}
            />
          )}
        </aside>
      </div>
    </section>
  );
}

function WebDiscoveryPanel({
  discoveries,
  onCompare,
  comparingDiscoveryId,
}: {
  discoveries: ComparisonReport["webDiscoveries"];
  onCompare: (discovery: WebDiscovery) => void;
  comparingDiscoveryId: string | null;
}) {
  const t = useT();
  return (
    <section className="rounded-xl border border-[#e2c879] bg-[#fff8dc] p-4">
      <h3 className="text-sm font-black text-[#6f5a22]">{t.result.webDiscoveryTitle}</h3>
      <p className="mt-3 text-sm leading-6 text-[#6f5a22]">{t.result.webDiscoveryBody}</p>
      <div className="mt-4 grid gap-2">
        {discoveries.slice(0, 12).map((discovery) => (
          <article
            key={discovery.id}
            className="rounded-md border border-[#d9c27b] bg-[#fcfbf6] px-3 py-2 text-sm text-[#52635c]"
          >
            <a
              className="block transition hover:text-[#2f6f73]"
              href={discovery.url}
              target="_blank"
              rel="noreferrer"
              title={discovery.note}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[10px] font-black uppercase tracking-[0.09em] text-[#8d6032]">
                    {discovery.platformLabel} · {discovery.listingLike ? t.result.webDiscoveryPossibleListing : t.result.webDiscoveryReference}
                  </span>
                  <span className="mt-1 line-clamp-2 font-bold leading-5 text-[#2f6f73]">{discovery.title}</span>
                </span>
                <IconArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-[#2f6f73]" />
              </span>
            </a>
            <span className="mt-2 flex flex-wrap gap-1.5">
              {discovery.providers.map((provider) => (
                <span key={provider} className="rounded border border-[#d9c27b] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-[#8d6032]">
                  {provider}
                </span>
              ))}
              {discovery.freshness === "within_3_days" && (
                <span className="rounded border border-[#c9d7ce] bg-[#e7efe8] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-[#2f6f73]">
                  {t.result.webDiscoveryRecent}
                </span>
              )}
              {discovery.availability === "available_hint" && (
                <span className="rounded border border-[#c9d7ce] bg-[#e7efe8] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-[#2f6f73]">
                  {t.result.webDiscoveryAvailable}
                </span>
              )}
              {discovery.rankedCandidateId && (
                <span className="rounded border border-[#c9d7ce] bg-[#e7efe8] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-[#2f6f73]">
                  {t.result.webDiscoveryRanked}
                </span>
              )}
              {discovery.priceHintUsd !== null && (
                <span className="rounded border border-[#d9c27b] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-[#8d6032]">
                  {formatMoney(discovery.priceHintUsd)}
                </span>
              )}
            </span>
            {discovery.listingLike && (
              <button
                className="mt-3 flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-[#c9d7ce] bg-[#e7efe8] px-3 py-2 text-xs font-black uppercase tracking-[0.06em] text-[#2f6f73] transition hover:border-[#2f6f73] hover:bg-[#dcecdf] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={comparingDiscoveryId !== null}
                onClick={() => onCompare(discovery)}
                title={t.result.webDiscoveryCompareTitle}
              >
                {comparingDiscoveryId === discovery.id ? (
                  <IconSpinner className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <IconCardCheck className="h-3.5 w-3.5" />
                )}
                {comparingDiscoveryId === discovery.id ? t.result.webDiscoveryCompareLoading : t.result.webDiscoveryCompare}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ComparisonQuestionBox({
  question,
  answer,
  error,
  loading,
  targetLabel,
  onQuestionChange,
  onAsk,
}: {
  question: string;
  answer: ComparisonQuestionResponse | null;
  error: string | null;
  loading: boolean;
  targetLabel: string | null;
  onQuestionChange: (value: string) => void;
  onAsk: () => void | Promise<void>;
}) {
  const t = useT();
  return (
    <section className="rounded-xl border border-[#d6ded5] bg-[#fcfbf6] p-4">
      <h3 className="text-sm font-black text-[#24312f]">{t.result.askTitle}</h3>
      {targetLabel && (
        <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-md border border-[#c9d7ce] bg-[#e7efe8] px-2.5 py-1.5 text-xs font-bold text-[#2f6f73]">
          <IconReceipt className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">{t.result.askTarget(targetLabel)}</span>
        </p>
      )}
      <div className="mt-3 grid gap-2">
        <label className="sr-only" htmlFor="comparison-question">{t.result.askTitle}</label>
        <textarea
          id="comparison-question"
          className="min-h-20 rounded-md border border-[#c9d7ce] bg-[#fffef9] px-3 py-2 text-sm text-[#24312f] outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20"
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder={t.result.askPlaceholder}
        />
        <button className="primary-button justify-center" type="button" disabled={loading || !question.trim()} onClick={() => onAsk()}>
          {loading ? <IconSpinner className="h-4 w-4 animate-spin" /> : <IconCardSearch className="h-4 w-4" />}
          {loading ? t.result.askLoading : t.result.askSubmit}
        </button>
      </div>
      {answer && (
        <div aria-live="polite" className="mt-4 rounded-md border border-[#c9d7ce] bg-[#f7f9f5] p-4 text-sm leading-6 text-[#52635c]">
          {answer.webContextChecked && (
            <p className="mb-2 inline-flex items-center gap-2 rounded-md border border-[#d9c27b] bg-[#fff8dc] px-2.5 py-1 text-xs font-black uppercase tracking-[0.08em] text-[#6f5a22]">
              <IconExternal className="h-3.5 w-3.5" />
              {t.result.webContextChecked}
            </p>
          )}
          <p>{answer.answer}</p>
          {answer.webCitations.length > 0 && (
            <div className="mt-3 border-t border-[#d6ded5] pt-3">
              <p className="text-xs font-black uppercase tracking-[0.08em] text-[#64736c]">{t.result.webSources}</p>
              <ul className="mt-2 space-y-2">
                {answer.webCitations.map((citation) => (
                  <li key={citation.url}>
                    <a
                      className="inline-flex max-w-full items-center gap-1.5 font-bold text-[#2f6f73] underline-offset-4 hover:underline"
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="min-w-0 truncate">{citation.title}</span>
                      <IconArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                    </a>
                    {citation.snippet && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#64736c]">{citation.snippet}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {answer.cautions.length > 0 && (
            <ul className="mt-3 space-y-2">
              {answer.cautions.map((caution) => (
                <li key={caution} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b26a4c]" />
                  {caution}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-sm font-bold text-[#9a4a2c]">{error}</p>}
    </section>
  );
}

function roleToggleLabel(role: RankedChoice["role"], t: Dict) {
  switch (role) {
    case "best_value": return t.lens.bestValue;
    case "lowest_landed_cost": return t.lens.cheapest;
    case "safest_listing": return t.lens.safest;
    case "best_condition_evidence": return t.lens.bestDocumented;
  }
}

function rolePreferenceLabel(role: RankedChoice["role"], t: Dict) {
  switch (role) {
    case "best_value": return t.lens.bestValuePreference;
    case "lowest_landed_cost": return t.lens.cheapestPreference;
    case "safest_listing": return t.lens.safestPreference;
    case "best_condition_evidence": return t.lens.bestDocumentedPreference;
  }
}

function roleToggleHint(role: RankedChoice["role"], t: Dict) {
  switch (role) {
    case "best_value": return t.lens.bestValueHint;
    case "lowest_landed_cost": return t.lens.cheapestHint;
    case "safest_listing": return t.lens.safestHint;
    case "best_condition_evidence": return t.lens.bestDocumentedHint;
  }
}

function choiceReasonText(choice: RankedChoice, listing: NormalizedListing, lang: Lang) {
  if (lang === "en") return choice.reason;

  const total = listing.estimatedLandedCost ?? listing.preTaxTotal;
  const base = (() => {
    switch (choice.role) {
      case "best_value":
        return `完整总价、品相匹配、卖家可信度与证据的综合最优（${listing.valueScore}/100）。`;
      case "lowest_landed_cost":
        return listing.estimatedTax === null
          ? `税前合计最低，为 ${formatMoney(listing.preTaxTotal)}；未包含税费。`
          : `预估到手价最低，为 ${formatMoney(total)}。`;
      case "safest_listing":
        return `卖家记录与商品证据综合分最高（${listing.safetyScore}/100）。`;
      case "best_condition_evidence":
        return `照片与品相证据最完整（${listing.evidenceCompletenessScore}/100）；这不是评级预测。`;
    }
  })();

  const overMarket = choice.reason.match(/\+(\d+)% over the \$([0-9.]+) TCGplayer market reference/i);
  if (overMarket) {
    return `${base} 注意：这张高于 $${overMarket[2]} TCGplayer 参考价 ${overMarket[1]}%，它领先本次候选，不代表低于市场。`;
  }
  const thinSupply = choice.reason.match(/cheapest eligible copy is \+(\d+)% over the \$([0-9.]+) TCGplayer market reference/i);
  if (thinSupply) {
    return `${base} 当前供应偏少，最低可比商品仍高于 $${thinSupply[2]} TCGplayer 参考价 ${thinSupply[1]}%。`;
  }
  return base;
}

function sortListingsForRole(listings: NormalizedListing[], role: RankedChoice["role"] | null) {
  return [...listings].sort((a, b) => {
    switch (role) {
      case "lowest_landed_cost":
        return listingCost(a) - listingCost(b) || b.safetyScore - a.safetyScore;
      case "safest_listing":
        return b.safetyScore - a.safetyScore || listingCost(a) - listingCost(b);
      case "best_condition_evidence":
        return b.evidenceCompletenessScore - a.evidenceCompletenessScore
          || b.sellerTrustScore - a.sellerTrustScore
          || listingCost(a) - listingCost(b);
      default:
        return b.valueScore - a.valueScore || listingCost(a) - listingCost(b);
    }
  });
}

function listingCost(listing: NormalizedListing) {
  return listing.estimatedLandedCost ?? listing.preTaxTotal;
}

function localizedCaution(caution: string, t: Dict) {
  if (caution.startsWith("One listing may lead several lenses")) return t.result.cautionMultiLens;
  if (caution.startsWith("Recent sold transactions")) return t.result.cautionSoldManual;
  if (caution.startsWith("Reference prices can lag")) return t.result.cautionReferenceLag;
  if (caution.startsWith("Fewer than three decision lenses")) return t.result.cautionFewLenses;
  return caution;
}

// R3: the market anchor states where it came from and how fresh it is.
// Staleness is measured against the report's own timestamp so render stays pure.
function MarketFreshness({ card, generatedAt }: { card: CardIdentityCandidate; generatedAt: string }) {
  const t = useT();
  const { lang } = useLang();
  if (card.marketSource === "tcgcsv" && card.marketAsOf) {
    const asOf = new Date(card.marketAsOf);
    const stale = new Date(generatedAt).getTime() - asOf.getTime() > 48 * 60 * 60 * 1000;
    return (
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${stale ? "bg-[#fff0d5] text-[#8d6032]" : "bg-[#ecefeb] text-[#64736c]"}`}>
        {t.result.marketAsOf(asOf.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US"))}
        {stale ? ` · ${t.result.marketStale}` : ""}
      </span>
    );
  }
  return (
    <span className="rounded bg-[#ecefeb] px-1.5 py-0.5 text-[10px] font-bold text-[#64736c]">
      {t.result.marketCatalogApprox}
    </span>
  );
}

type VerdictTone = "good" | "ok" | "bad" | "neutral";

// R4: "unverified" (no seller data at all) renders as a neutral coverage note,
// never as a red risk verdict — unknown is not risky.
function sellerVerdict(listing: NormalizedListing, t: Dict): { label: string; tone: VerdictTone } {
  if (listing.riskLabel === "unverified") return { label: t.card.unverifiedSeller, tone: "neutral" };
  if (listing.sellerTrustScore >= 80) return { label: t.card.trustedSeller, tone: "good" };
  if (listing.sellerTrustScore >= 60) return { label: t.card.decentSeller, tone: "ok" };
  return { label: t.card.unprovenSeller, tone: "bad" };
}

function evidenceVerdict(score: number, t: Dict): { label: string; tone: VerdictTone } {
  // Photo-led score: 8+ photos (or a fully-asserted manual listing) clears "good".
  if (score >= 50) return { label: t.card.wellDocumented, tone: "good" };
  if (score >= 25) return { label: t.card.partlyDocumented, tone: "ok" };
  return { label: t.card.thinEvidence, tone: "bad" };
}

// The displayed formulas derive from the same exported weight constants the
// ranking math uses, so tuning a weight in ranking.ts updates the receipt too.
function riskFormula(t: Dict) {
  return t.card.mathRiskFormula(Math.round(SAFETY_WEIGHTS.seller * 100), Math.round(SAFETY_WEIGHTS.evidence * 100));
}

function valueFormula(t: Dict) {
  return t.card.mathValueFormula(
    Math.round(VALUE_WEIGHTS.price * 100),
    Math.round(VALUE_WEIGHTS.condition * 100),
    Math.round(VALUE_WEIGHTS.seller * 100),
    Math.round(VALUE_WEIGHTS.evidence * 100),
  );
}

// Builds the human-readable inputs behind the seller-trust and evidence scores.
// The same strings feed the tag tooltips and the "check the math" receipt, so
// the two can never tell different stories.
function sellerInputsLine(listing: NormalizedListing, t: Dict) {
  const bits = [
    listing.seller.feedbackPercentage !== null && t.card.mathFeedback(listing.seller.feedbackPercentage),
    listing.seller.feedbackCount !== null && t.card.mathRatings(listing.seller.feedbackCount),
    listing.seller.returnsAccepted === true ? t.card.mathReturns : t.card.mathReturnsUnknown,
    listing.seller.buyerProtection === true && t.card.mathProtection,
  ].filter(Boolean) as string[];
  return bits.length ? bits.join(" · ") : t.card.mathNoSellerData;
}

function conditionInputsLine(listing: NormalizedListing, t: Dict) {
  return listing.claimedCondition === "Unknown"
    ? t.card.conditionNotStated
    : t.card.sellerSays(t.conditions[listing.claimedCondition]);
}

function evidenceInputsLine(listing: NormalizedListing, t: Dict) {
  const bits = [
    conditionInputsLine(listing, t),
    t.card.photos(listing.evidence.photoCount),
    listing.evidence.frontBackExplicit && t.card.frontBack,
    listing.evidence.closeupsExplicit && t.card.corners,
    listing.evidence.surfaceExplicit && t.card.surface,
    listing.evidence.substantiveConditionNotes && t.card.mathConditionNotes,
  ].filter(Boolean) as string[];
  return bits.join(" · ");
}

// The verifiability receipt: every verdict label above it, recomputed from the
// listing's stored deterministic inputs, one row per component, with the exact
// composite formulas. A buyer can check any row against the live listing page.
function VerdictMath({ listing, marketPrice }: { listing: NormalizedListing; marketPrice: number | null }) {
  const t = useT();
  const total = listing.estimatedLandedCost ?? listing.preTaxTotal;
  // Demo listings are scored market-free end to end (the server ranks them the
  // same way), so no vs-market read — not even a bare score — can be
  // reconstructed from fabricated demo prices.
  const anchor = listing.demo ? null : marketPrice;
  const priceComponent = listing.priceScore;
  const rows: Array<{ label: string; inputs: string; score: number; note?: string }> = [
    {
      label: t.card.mathPrice,
      inputs: listing.demo
        ? t.card.mathDemoHidden
        : listing.marketComparable && anchor && anchor > 0
          ? t.card.mathVs(formatMoney(total), formatMoney(anchor))
          : listing.costComplete ? t.card.mathNoMarket : t.card.estBeforeShipping,
      score: priceComponent,
    },
    {
      label: t.form.desiredCondition,
      inputs: conditionInputsLine(listing, t),
      score: listing.conditionCompatibilityScore,
    },
    { label: t.card.mathSeller, inputs: sellerInputsLine(listing, t), score: listing.sellerTrustScore, note: t.card.thTrusted },
    { label: t.card.mathEvidence, inputs: evidenceInputsLine(listing, t), score: listing.evidenceCompletenessScore, note: t.card.thDocumented },
    { label: t.card.mathRisk, inputs: riskFormula(t), score: listing.safetyScore, note: t.card.thRisk },
    { label: t.card.mathValue, inputs: valueFormula(t), score: listing.valueScore },
  ];

  return (
    <details className="mt-2">
      <summary className="w-fit cursor-pointer text-xs font-bold text-[#52635c] underline decoration-[#9fb3a8] underline-offset-2">
        {t.card.checkMath}
      </summary>
      <div className="mt-3 rounded-md border border-dashed border-[#c9d7ce] bg-[#f7f9f5] px-4 py-2">
        <div className="divide-y divide-dashed divide-[#c9d7ce]">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-bold text-[#24312f]">{row.label}</span>
                <span className="ml-2 text-[#64736c]">{row.inputs}</span>
                {row.note && <span className="ml-2 text-xs text-[#8a978f]">({row.note})</span>}
              </div>
              <span className="font-mono font-bold text-[#2f6f73]">{row.score}/100</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs leading-5 text-[#64736c]">{t.card.mathHint}</p>
      </div>
    </details>
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

function ListingMetaLine({ listing }: { listing: NormalizedListing }) {
  const t = useT();
  const seller = sellerVerdict(listing, t).label;
  const evidence = evidenceVerdict(listing.evidenceCompletenessScore, t).label;
  return (
    <span>
      {listing.marketplace} · {t.conditions[listing.claimedCondition]} · {t.card.photos(listing.evidence.photoCount)} ·{" "}
      <span className={listing.riskLabel === "unverified" ? "text-[#64736c]" : "text-[#2f6f73]"}>{seller}</span> ·{" "}
      <span className={listing.evidenceCompletenessScore < 25 ? "text-[#9a4a2c]" : "text-[#2f6f73]"}>{evidence}</span>
      {listing.listingLanguage ? ` · ${listing.listingLanguage}` : ""}
    </span>
  );
}

function MarketDeltaBadge({
  listing,
  marketPrice,
  compact = false,
}: {
  listing: NormalizedListing;
  marketPrice: number | null;
  compact?: boolean;
}) {
  const t = useT();
  const total = listing.estimatedLandedCost ?? listing.preTaxTotal;
  const marketDelta = listing.marketComparable && listing.costComplete && marketPrice && marketPrice > 0
    ? (total - marketPrice) / marketPrice
    : null;
  if (marketDelta === null || listing.demo) return null;
  const nearMarket = Math.abs(marketDelta) < 0.005;
  const label = nearMarket
    ? t.card.nearMarket
    : marketDelta < 0
      ? t.card.underMarket(Math.max(1, Math.round(Math.abs(marketDelta) * 100)))
      : t.card.aboveMarket(Math.max(1, Math.round(marketDelta * 100)));
  const prefix = nearMarket ? "≈" : marketDelta < 0 ? "▼" : "▲";
  const tone = nearMarket
    ? "border-[#d6ded5] bg-[#f7f9f5] text-[#64736c]"
    : marketDelta < 0
      ? "border-[#c9d7ce] bg-[#dcecdf] text-[#2f6f73]"
      : "border-[#e5b8a3] bg-[#fcefe8] text-[#9a4a2c]";

  if (compact) {
    return (
      <span className={`text-xs font-black ${nearMarket ? "text-[#64736c]" : marketDelta < 0 ? "text-[#2f6f73]" : "text-[#9a4a2c]"}`}>
        {prefix} {label}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-black ${tone}`}>
      {prefix} {label}
    </span>
  );
}

function LensControls({
  choices,
  selectedRole,
  samePickRoles,
  onSelect,
}: {
  choices: RankedChoice[];
  selectedRole: RankedChoice["role"] | null;
  samePickRoles: string[];
  onSelect: (role: RankedChoice["role"]) => void;
}) {
  const t = useT();
  return (
    <section className="rounded-xl border border-[#d6ded5] bg-[#f7f9f5] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-[#24312f]">{t.result.optimizeInsteadFor}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#64736c]">{t.result.defaultLensNote}</p>
        </div>
        {samePickRoles.length > 0 && (
          <span className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] px-2.5 py-1 text-xs font-bold text-[#64736c]">
            {t.result.samePickAs(samePickRoles.join(" · "))}
          </span>
        )}
      </div>
      <div
        className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4"
        style={choices.length === 4 ? undefined : { gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}
      >
        {choices.map((choice) => {
          const active = choice.role === selectedRole;
          return (
            <button
              key={choice.role}
              type="button"
              onClick={() => onSelect(choice.role)}
              aria-pressed={active}
              title={roleToggleHint(choice.role, t)}
              className={`min-h-12 rounded-md border px-3 py-2 text-left transition ${
                active
                  ? "border-[#2f6f73] bg-[#2f6f73] text-[#fcfbf6]"
                  : "border-[#d6ded5] bg-[#fcfbf6] text-[#52635c] hover:border-[#9fb3a8] hover:bg-[#e7efe8] hover:text-[#2f6f73]"
              }`}
            >
              <span className="block text-sm font-black">{roleToggleLabel(choice.role, t)}</span>
              <span className={`mt-1 block text-xs leading-4 ${active ? "text-[#dcecdf]" : "text-[#7a8982]"}`}>
                {roleToggleHint(choice.role, t)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RecommendedBuyHero({
  listing,
  choice,
  verdict,
  comparableCount,
  fallbackImageUrl,
  marketPrice,
  demoMode,
  onAsk,
}: {
  listing: NormalizedListing;
  choice: RankedChoice;
  verdict: VerdictCopy;
  comparableCount: number;
  fallbackImageUrl: string | null;
  marketPrice: number | null;
  demoMode: boolean;
  onAsk: (listing: NormalizedListing) => void;
}) {
  const t = useT();
  const total = listing.estimatedLandedCost ?? listing.preTaxTotal;
  const totalLabel = listing.shipping === null
    ? t.card.estBeforeShipping
    : listing.estimatedTax === null ? t.card.preTaxTotal : t.card.estLanded;
  const imageUrl = listing.imageUrl ?? fallbackImageUrl;
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const imageLoaded = imageUrl !== null && loadedImageUrl === imageUrl;

  return (
    <article
      aria-live="polite"
      aria-label={t.result.bestSupportedBuy}
      className="rounded-xl border-2 border-[#2f6f73] bg-[#fcfbf6] p-4 shadow-[0_4px_8px_rgba(36,49,47,0.08)] sm:p-5"
      title={`${verdict.why} ${verdict.catch}`}
    >
      <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-4 lg:grid-cols-[92px_minmax(0,1fr)_auto] lg:items-center">
        <div className="relative aspect-[2.5/3.5] w-[76px] overflow-hidden rounded-lg border border-[#c9d7ce] bg-[#e7efe8] sm:w-[84px] lg:w-[92px]">
          {imageUrl ? (
            <>
              <span
                aria-hidden="true"
                className={`absolute inset-0 bg-[linear-gradient(135deg,#e7efe8,#fcfbf6_52%,#f4e7bf)] transition-opacity duration-150 motion-reduce:transition-none ${
                  imageLoaded ? "opacity-0" : "opacity-100"
                }`}
              />
              <Image
              src={imageUrl}
              alt={listing.imageUrl ? `${listing.title} listing image` : `${listing.title} reference card image`}
              fill
              loading="eager"
              fetchPriority="high"
              sizes="(min-width: 1024px) 92px, (min-width: 640px) 84px, 76px"
              onLoad={() => setLoadedImageUrl(imageUrl)}
              className={`object-contain transition-opacity duration-150 motion-reduce:transition-none ${imageLoaded ? "opacity-100" : "opacity-0"}`}
            />
            </>
          ) : (
            <span className="absolute inset-0 grid place-items-center text-[#94a59c]"><IconReceipt className="h-6 w-6" /></span>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[#2f6f73] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#fcfbf6]">
              {t.result.ourPick}
            </span>
            <span className="rounded-md border border-[#c9d7ce] bg-[#e7efe8] px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#2f6f73]">
              {roleToggleLabel(choice.role, t)}
            </span>
            <span className="text-xs font-bold text-[#7a8982]">{verdict.strength}</span>
            <span className="text-xs font-bold text-[#7a8982]">{t.result.oneOfComparable(comparableCount)}</span>
            {listing.demo && <span className="rounded border border-[#e2c879] bg-[#fff8dc] px-1.5 py-0.5 text-[10px] font-black uppercase text-[#6f5a22]">{t.candidate.demo}</span>}
            {listing.userSupplied && <span className="rounded border border-[#c9d7ce] bg-[#f7f9f5] px-1.5 py-0.5 text-[10px] font-bold text-[#52635c]">{t.card.userAdded}</span>}
            {listing.webDiscovered && <span className="rounded border border-[#e2c879] bg-[#fff8dc] px-1.5 py-0.5 text-[10px] font-bold text-[#6f5a22]">{t.card.webDiscovered}</span>}
          </div>
          <h2 className="mt-2 font-serif text-xl font-bold leading-tight text-[#24312f] sm:text-2xl">
            {listing.title}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#52635c]">
            <ListingMetaLine listing={listing} />
          </p>
        </div>

        <div className="col-span-2 grid gap-3 sm:col-start-2 lg:col-span-1 lg:col-start-auto lg:min-w-[178px] lg:justify-items-end lg:text-right">
          <div>
            <p className="font-mono text-3xl font-black leading-none text-[#24312f]">{formatMoney(total)}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#7a8982]">{totalLabel}</p>
          </div>
          <MarketDeltaBadge listing={listing} marketPrice={marketPrice} />
        </div>
      </div>

      <div className="mt-4 border-t border-[#e4ebe3] pt-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.08em] text-[#2f6f73]">{t.result.whyItStandsOut}</h3>
            <p className="mt-1 text-sm leading-6 text-[#52635c]">{verdict.why}</p>
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.08em] text-[#8d6032]">{t.result.whatToKnow}</h3>
            <p className="mt-1 text-sm leading-6 text-[#52635c]">{verdict.catch}</p>
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.08em] text-[#64736c]">{t.result.nextBestOption}</h3>
            <p className="mt-1 text-sm leading-6 text-[#52635c]">{verdict.alternative ?? t.result.noAlternative}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <VerdictMath listing={listing} marketPrice={marketPrice} />
          <div className="flex flex-wrap gap-2">
            <button className="secondary-button min-h-10 px-3 py-2 text-xs" type="button" onClick={() => onAsk(listing)}>
              <IconInfo className="h-4 w-4" />
              {t.result.askWhyThis}
            </button>
            {listing.url ? (
              <a
                className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-[#2f6f73] px-4 text-xs font-black text-[#fcfbf6] transition hover:bg-[#24585c] focus:outline-none focus:ring-2 focus:ring-[#2f6f73]/25"
                href={listing.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackEvent("choice_opened", { choice_role: choice.role, marketplace: listing.marketplace, demo_mode: demoMode })}
              >
                {t.result.reviewListing} <IconArrowUpRight className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="inline-flex min-h-10 items-center text-xs font-bold text-[#7a8982]">{t.card.userSupplied}</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function DecisionReceipt({
  card,
  generatedAt,
  listedRange,
  liveSources,
  hasMarketReference,
  unavailableCount,
  observedTime,
  warningsCount,
  excluded,
  cautions,
  receiptCopied,
  canCopy,
  onCopy,
}: {
  card: CardIdentityCandidate | null;
  generatedAt: string;
  listedRange: string;
  liveSources: string;
  hasMarketReference: boolean;
  unavailableCount: number;
  observedTime: string;
  warningsCount: number;
  excluded: NormalizedListing[];
  cautions: string[];
  receiptCopied: boolean;
  canCopy: boolean;
  onCopy: () => void;
}) {
  const t = useT();
  return (
    <section className="rounded-xl border border-[#d6ded5] bg-[#fcfbf6] p-4 sm:p-5" aria-labelledby="decision-receipt-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="decision-receipt-title" className="font-serif text-xl font-black text-[#24312f]">{t.result.decisionReceipt}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#64736c]">{t.result.decisionReceiptHelp}</p>
        </div>
        <button
          className="secondary-button min-h-10 px-3 py-2 text-xs"
          type="button"
          disabled={!canCopy}
          onClick={onCopy}
          title={!canCopy ? t.result.shareUnavailable : undefined}
        >
          <IconReceipt className="h-4 w-4" />
          {receiptCopied ? t.result.receiptCopied : t.result.shareReceipt}
        </button>
      </div>

      <div className="mt-4 grid gap-2">
        <MarketReferenceLine card={card} generatedAt={generatedAt} listedRange={listedRange} />
        <SourceStatusLine
          liveSources={liveSources}
          hasMarketReference={hasMarketReference}
          unavailableCount={unavailableCount}
          observedTime={observedTime}
          warningsCount={warningsCount}
        />
      </div>

      {cautions.length > 0 && (
        <div className="mt-4 rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4">
          <h4 className="text-sm font-black text-[#24312f]">{t.result.beforeYouBuy}</h4>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[#52635c]">
            {cautions.map((caution) => (
              <li key={caution} className="flex gap-2">
                <IconCaution className="mt-1 h-4 w-4 shrink-0 text-[#8d6032]" />
                <span>{localizedCaution(caution, t)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {excluded.length > 0 && (
        <details className="mt-3 rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4">
          <summary className="cursor-pointer text-sm font-bold text-[#64736c]">{t.result.excluded(excluded.length)}</summary>
          <div className="mt-3 space-y-2 text-sm leading-6 text-[#64736c]">
            {excluded.map((listing) => (
              <p key={listing.id}>
                <span className="font-black uppercase tracking-[0.04em] text-[#9a4a2c]">{t.result.tooRiskySkip}</span>
                {": "}
                <strong>{listing.title}</strong>: {listing.exclusionReasons.join(" ")}
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function MarketReferenceLine({
  card,
  generatedAt,
  listedRange,
}: {
  card: CardIdentityCandidate | null;
  generatedAt: string;
  listedRange: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#d6ded5] bg-[#f7f9f5] px-4 py-3 text-sm text-[#64736c]">
      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#64736c]">{t.result.marketReferenceShort}</span>
      <strong className="font-mono text-[#24312f]">
        {typeof card?.marketMid === "number" ? formatMoney(card.marketMid) : t.result.unavailableRange}
      </strong>
      {card && <MarketFreshness card={card} generatedAt={generatedAt} />}
      <span className="text-[#7a8982]">· {t.result.listedRange}: {listedRange}</span>
    </div>
  );
}

function SourceStatusLine({
  liveSources,
  hasMarketReference,
  unavailableCount,
  observedTime,
  warningsCount,
}: {
  liveSources: string;
  hasMarketReference: boolean;
  unavailableCount: number;
  observedTime: string;
  warningsCount: number;
}) {
  const t = useT();
  const summary = liveSources
    ? t.result.sourceCalmSummary(liveSources, hasMarketReference, observedTime)
    : t.result.sourceNoLiveSummary(hasMarketReference, observedTime);
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[#dcecdf] bg-[#f2f7f2] px-4 py-3 text-sm leading-6 text-[#52635c]">
      <IconCheck className="mt-1 h-4 w-4 shrink-0 text-[#2f6f73]" />
      <p>
        {summary}
        {(unavailableCount > 0 || warningsCount > 0) && <> {t.result.someSourcesSatOut}</>}
        {" "}
        <a className="font-black text-[#2f6f73] underline decoration-[#9fb3a8] underline-offset-4" href="#method">
          {t.result.seeHowChecked}
        </a>
      </p>
    </div>
  );
}

function CandidateRow({
  listing,
  fallbackImageUrl,
  marketPrice,
  choice,
  lead,
  demoMode,
  onAsk,
}: {
  listing: NormalizedListing;
  fallbackImageUrl: string | null;
  marketPrice: number | null;
  choice: RankedChoice | null;
  lead: boolean;
  demoMode: boolean;
  onAsk: (listing: NormalizedListing) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const total = listing.estimatedLandedCost ?? listing.preTaxTotal;
  const totalLabel = listing.shipping === null
    ? t.card.estBeforeShipping
    : listing.estimatedTax === null ? t.card.preTaxTotal : t.card.estLanded;
  const roleScore = choice?.role === "lowest_landed_cost"
    ? Math.round(calculatePriceComponent(total, marketPrice))
    : choice?.role === "safest_listing"
      ? listing.safetyScore
      : choice?.role === "best_condition_evidence"
        ? listing.evidenceCompletenessScore
        : listing.valueScore;
  const imageUrl = listing.imageUrl ?? fallbackImageUrl;
  const reason = choice ? choiceReasonText(choice, listing, lang) : null;

  return (
    <article
      aria-live={lead ? "polite" : undefined}
      className={`result-row rounded-xl bg-[#fcfbf6] transition ${
        lead
          ? "border-2 border-[#2f6f73] p-4 shadow-[0_10px_28px_rgba(36,49,47,0.08)] sm:p-5"
          : "border border-[#d6ded5] p-3.5 hover:border-[#9fb3a8] hover:shadow-[0_6px_18px_rgba(36,49,47,0.06)] sm:p-4"
      }`}
      title={reason ?? undefined}
    >
      <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-3.5 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:items-center">
        <div className={`relative aspect-[2.5/3.5] overflow-hidden rounded-md border border-[#d6ded5] bg-[#e7efe8] ${lead ? "w-14" : "w-[52px]"}`}>
          {imageUrl ? (
            <Image src={imageUrl} alt="" fill sizes="56px" className="object-contain" />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-[#94a59c]"><IconReceipt className="h-5 w-5" /></span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {lead && (
              <span className="rounded-md bg-[#2f6f73] px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#fcfbf6]">
                {roleToggleLabel(choice?.role ?? "best_value", t)}
              </span>
            )}
            {listing.demo && <span className="rounded border border-[#e2c879] bg-[#fff8dc] px-1.5 py-0.5 text-[10px] font-black uppercase text-[#6f5a22]">{t.candidate.demo}</span>}
            {listing.userSupplied && <span className="rounded border border-[#c9d7ce] bg-[#f7f9f5] px-1.5 py-0.5 text-[10px] font-bold text-[#52635c]">{t.card.userAdded}</span>}
            {listing.webDiscovered && <span className="rounded border border-[#e2c879] bg-[#fff8dc] px-1.5 py-0.5 text-[10px] font-bold text-[#6f5a22]">{t.card.webDiscovered}</span>}
          </div>
          <h3 className={`mt-1.5 min-w-0 font-bold leading-snug text-[#24312f] ${lead ? "font-serif text-lg sm:text-xl" : "truncate text-sm sm:text-[15px]"}`}>
            {listing.title}
          </h3>
          <p className="mt-2 text-xs font-semibold leading-5 text-[#64736c]">
            <ListingMetaLine listing={listing} />
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-[#64736c]">
            {lead && <span>{roleToggleLabel(choice?.role ?? "best_value", t)} {roleScore}/100</span>}
            <button className="underline decoration-[#9fb3a8] underline-offset-2 hover:text-[#2f6f73]" type="button" onClick={() => onAsk(listing)}>
              {t.candidate.ask}
            </button>
          </div>
        </div>
        <div className="col-span-2 flex items-end justify-between gap-3 sm:col-span-1 sm:grid sm:min-w-[142px] sm:justify-items-end sm:gap-1.5">
          <div className="sm:text-right">
            <p className={`font-mono font-black text-[#24312f] ${lead ? "text-2xl" : "text-lg"}`}>{formatMoney(total)}</p>
            <p className="text-[10px] font-black uppercase tracking-[0.06em] text-[#7a8982]">{totalLabel}</p>
          </div>
          <MarketDeltaBadge listing={listing} marketPrice={marketPrice} compact />
          {listing.url ? (
            <a
              className={`result-row-cta inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-[#2f6f73] px-3 text-xs font-black text-[#fcfbf6] transition hover:bg-[#24585c] focus:outline-none focus:ring-2 focus:ring-[#2f6f73]/25 ${lead ? "is-lead" : ""}`}
              href={listing.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackEvent("choice_opened", { choice_role: choice?.role ?? "candidate", marketplace: listing.marketplace, demo_mode: demoMode })}
            >
              {t.card.viewListing} <IconArrowUpRight className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className="text-xs font-bold text-[#7a8982]">{t.card.userSupplied}</span>
          )}
        </div>
      </div>
      {lead && <VerdictMath listing={listing} marketPrice={marketPrice} />}
    </article>
  );
}

// The cross-platform fan-out is transparent: show every marketplace agent and
// whether it was queried, was unavailable, or sat out because its API is not
// connected. Lives inside the "How we checked" drawer so it informs without
// competing with the verdict.
function SourcesChecked({ platforms }: { platforms: ComparisonReport["platforms"] }) {
  const t = useT();
  const visiblePlatforms = platforms.filter((platform) => platform.configured || platform.status === "fallback");
  if (visiblePlatforms.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="eyebrow">
        <IconCardFan className="h-4 w-4" />
        {t.result.sourcesTitle}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {visiblePlatforms.map((platform) => {
          const tone = platform.status === "complete"
            ? "bg-[#dcecdf] text-[#2f6f73]"
            : platform.status === "fallback"
              ? "bg-[#fff0d5] text-[#8d6032]"
              : "bg-[#ecefeb] text-[#64736c]";
          const label = platform.status === "complete"
            ? t.result.sourceQueried
            : platform.status === "fallback"
              ? t.result.sourceUnavailable
              : t.result.sourceNotConnected;
          return (
            <div
              key={platform.id}
              className="inline-flex items-center gap-2 rounded-md border border-[#d6ded5] bg-[#f7f9f5] px-3 py-1.5 text-sm"
            >
              <span className="font-bold text-[#24312f]">{platform.marketplace}</span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${tone}`}>{label}</span>
              {platform.status === "complete" && (
                <span className="text-xs text-[#64736c]">{t.result.sourceCount(platform.count)}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-[#64736c]">{t.result.sourcesHint}</p>
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
    query: values.heroQuery.trim(),
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
        subRatings: null,
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
      // Manual rate wins as an override; otherwise estimate from the buyer's ZIP so
      // landed cost reflects roughly what eBay charges. Null (unknown ZIP) → pre-tax total.
      taxRate: taxPercent === null ? estimateSalesTaxRateFromZip(values.postalCode.trim()) : taxPercent / 100,
      desiredCondition: values.desiredCondition,
    },
    cardHint: {
      game: values.game,
      name: values.cardName.trim(),
      setCode: values.setCode.trim(),
      cardNumber,
      language: "English",
      variant: "",
      gradingClaim: "",
    },
    manualCandidates: values.manualCandidates
      .filter((row) => row.price.trim() !== "")
      .map((row) => ({
        marketplace: row.marketplace,
        url: row.url.trim(),
        title: row.title.trim(),
        price: nullableNumber(row.price),
        shipping: nullableNumber(row.shipping),
        claimedCondition: row.claimedCondition,
      })),
    webDiscoveryMode: "off",
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
