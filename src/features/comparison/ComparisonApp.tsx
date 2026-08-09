"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useFieldArray, useForm, useWatch, type UseFormRegisterReturn, type UseFormReturn } from "react-hook-form";
import {
  IconArrowUpRight,
  IconCardSearch,
  IconCaution,
  IconCheck,
  IconChevronDown,
  IconExternal,
  IconInfo,
  IconLink,
  IconPhotoProof,
  IconPlus,
  IconReceipt,
  IconSeal,
  IconSpinner,
  IconX,
} from "./icons";
import { initializeAnalytics, trackEvent } from "@/lib/analytics";
import { parseAgentSearchParams, parseJourneySearchParams } from "@/lib/agent-search-link";
import { estimateSalesTaxRateFromZip } from "@/lib/comparison/us-sales-tax";
import { deriveMarketRead, SAFETY_WEIGHTS, VALUE_WEIGHTS } from "@/lib/comparison/ranking";
import { parseCardQuery } from "@/lib/comparison/query-parser";
import { detectMarketplaceFromUrl } from "@/lib/comparison/marketplace-url";
import { LanguageProvider, localizeVariantLabel, useLang, useT, type Dict, type Lang } from "./i18n";
import { buildReceiptSummaryLine } from "./receipt-summary";
import { groupIdentitiesBySet, IDENTITY_GROUP_THRESHOLD } from "./identity-grouping";
import {
  applyIdentityFilterChange,
  clearIdentityFilters,
  computeIdentityFacets,
  type IdentityFilters,
} from "./identity-filters";
import { buildVerdictCopy, type VerdictCopy } from "./verdict-copy";
import { ListingPhoto } from "./SellerPhotoGallery";
import { AI_VERDICT_NOTE_UI_ENABLED, PASTE_LISTING_UI_ENABLED } from "./ui-feature-flags";
import { useAiVerdictNote } from "./use-ai-verdict-note";
import { cardImageSource } from "@/lib/external/card-image";
import {
  defaultComparisonFormValues,
  emptyLedgerRow,
  resetForNewCardSearch,
  type ComparisonForm,
  type LensRole,
} from "./comparison-form-state";
import {
  cardIdentitySearchResponseSchema,
  comparisonReportSchema,
  type CardIdentityCandidate,
  type CardIdentitySearchResponse,
  type ComparisonReport,
  type ComparisonQuestionResponse,
  type ComparisonRequest,
  type ConditionClaim,
  type Marketplace,
  type NormalizedListing,
  type RankedChoice,
  type TcgGame,
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

const conditions: ConditionClaim[] = [
  "Unknown",
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
];

const RECENT_CONFIRMED_CARDS_KEY = "tcgpal:recent-confirmed-cards";
// Kept as an exported compatibility name for callers that imported the former
// cap. The default rail is intentionally unbounded; a finite value can still
// be passed to buildRail by a constrained embedding surface.
export const RAIL_SLOTS = Number.POSITIVE_INFINITY;

export type RecentCarouselCard = {
  id: string;
  game: TcgGame;
  name: string;
  setName: string;
  setCode: string;
  cardNumber: string;
  imageUrl: string | null;
  variant?: string | null;
  lastSeenAt: number;
};

// Onboarding seed only: these are stable, exact prints that make the rail useful
// before the buyer has searched. Once a buyer searches, their own history leads;
// the seed remains as a small fallback pool after it.
export const DEFAULT_MARQUEE_CARDS: RecentCarouselCard[] = [
  { id: "curated-swsh7-215", game: "pokemon", name: "Umbreon VMAX", setName: "Evolving Skies", setCode: "SWSH7", cardNumber: "215/203", imageUrl: "https://images.pokemontcg.io/swsh7/215_hires.png", lastSeenAt: 0 },
  { id: "curated-base1-4", game: "pokemon", name: "Charizard", setName: "Base", setCode: "BS", cardNumber: "4/102", imageUrl: "https://images.pokemontcg.io/base1/4_hires.png", lastSeenAt: 0 },
  { id: "curated-base1-58", game: "pokemon", name: "Pikachu", setName: "Base", setCode: "BS", cardNumber: "58/102", imageUrl: "https://images.pokemontcg.io/base1/58_hires.png", lastSeenAt: 0 },
  { id: "curated-swsh11-186", game: "pokemon", name: "Giratina V", setName: "Lost Origin", setCode: "SWSH11", cardNumber: "186/196", imageUrl: "https://images.pokemontcg.io/swsh11/186_hires.png", lastSeenAt: 0 },
  { id: "curated-sm11-222", game: "pokemon", name: "Mewtwo & Mew-GX", setName: "Unified Minds", setCode: "UNM", cardNumber: "222/236", imageUrl: "https://images.pokemontcg.io/sm11/222_hires.png", lastSeenAt: 0 },
  { id: "OP05-119_p2", game: "onePiece", name: "Monkey.D.Luffy", setName: "Awakening Of The New Era", setCode: "OP-05", cardNumber: "OP05-119", imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP05-119_p2.png", variant: "Manga Art", lastSeenAt: 0 },
  { id: "OP06-118_p2", game: "onePiece", name: "Roronoa Zoro", setName: "Wings Of The Captain", setCode: "OP-06", cardNumber: "OP06-118", imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP06-118_p2.png", variant: "Manga Art", lastSeenAt: 0 },
  { id: "OP01-016_p8", game: "onePiece", name: "Nami", setName: "Awakening Of The New Era", setCode: "OP-01", cardNumber: "OP01-016", imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016_p8.png", variant: "Manga Art", lastSeenAt: 0 },
];

export type RailItem = {
  card: RecentCarouselCard & { imageUrl: string };
  source: "chase" | "recent";
};

/**
 * The rail is a history surface first: the cards the buyer already checked lead,
 * newest first, and curated chase cards fill whatever is left.
 *
 * This replaces a share-based blend that interleaved the two pools by a ramping
 * percentage. With a short history that cycled one recent card into several
 * slots, so the rail showed the same card three or four times instead of
 * reading as "what you looked at".
 */
export function buildRail(
  recent: RecentCarouselCard[],
  curated: RecentCarouselCard[],
  slots = RAIL_SLOTS,
): RailItem[] {
  if (slots <= 0) return [];
  const byCard = new Map<string, RailItem>();

  const add = (card: RecentCarouselCard, source: "chase" | "recent") => {
    const imageUrl = safeCarouselImageUrl(card.imageUrl);
    if (!imageUrl) return;
    // Identity, not id or URL: a checked card and its curated twin carry
    // different ids and different image sizes, and should occupy one slot.
    // The set code is deliberately excluded — the catalog and the curated pool
    // use different vocabularies for one set (SV6 vs TWM), which let the same
    // card sit in the rail twice. Name plus printed number is the stable pair.
    const key = recentCarouselCardKey(card);
    if (!byCard.has(key)) byCard.set(key, { card: { ...card, imageUrl }, source });
  };

  for (const card of recent) add(card, "recent");
  for (const card of curated) add(card, "chase");

  return Array.from(byCard.values()).slice(0, slots);
}

type JourneyStep = "search" | "confirmation" | "result";
type JourneySnapshot = {
  form: ComparisonForm;
  report: ComparisonReport | null;
  identityResult: CardIdentitySearchResponse | null;
  selectedIdentity: CardIdentityCandidate | null;
  pendingRequest: ComparisonRequest | null;
  journeyState: "idle" | "confirming" | "result";
};

type ResultSnapshot = {
  id: string | null;
  durable: boolean;
  restored: boolean;
  savedAt: string;
  reportGeneratedAt: string;
};

class ApiResponseError extends Error {
  readonly retriable: boolean;

  constructor(message: string, retriable: boolean) {
    super(message);
    this.name = "ApiResponseError";
    this.retriable = retriable;
  }
}

async function requestComparisonReport(request: ComparisonRequest, fallbackMessage: string, signal?: AbortSignal) {
  const json = await postJsonWithRetry("/api/agent/listing-compare", request, fallbackMessage, signal);
  return comparisonReportSchema.parse(json);
}

async function requestCardIdentity(request: ComparisonRequest, fallbackMessage: string, signal?: AbortSignal) {
  const json = await postJsonWithRetry("/api/agent/card-identity", {
    query: request.query || request.cardHint.name,
    cardHint: request.cardHint,
  }, fallbackMessage, signal, 1);
  return cardIdentitySearchResponseSchema.parse(json);
}

async function postJsonWithRetry(
  path: string,
  body: unknown,
  fallbackMessage: string,
  signal?: AbortSignal,
  maxAttempts = 2,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      return await readJsonResponse(response, fallbackMessage);
    } catch (error) {
      lastError = error;
      if (signal?.aborted || isAbortError(error)) throw error;
      const retriable = error instanceof ApiResponseError ? error.retriable : error instanceof TypeError;
      if (!retriable || attempt === maxAttempts - 1) break;
      await sleep(650);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(fallbackMessage);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
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
    variant: identity.variant ?? null,
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
    && (typeof candidate.variant === "string" || candidate.variant === null || candidate.variant === undefined)
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
        || host === "onepiece-cardgame.com"
        || host === "optcgapi.com"
        || host === "www.optcgapi.com"
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
      .filter((card) => card.imageUrl !== null)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  } catch {
    return [];
  }
}

function writeRecentCarouselCards(cards: RecentCarouselCard[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_CONFIRMED_CARDS_KEY, JSON.stringify(cards));
  } catch {
    /* ignore unavailable storage */
  }
}

export function recentCarouselCardKey(card: RecentCarouselCard) {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  // One Piece alternate arts share a printed number, so their stable catalog
  // print id must remain part of the key. Pokémon's catalog id can vary across
  // adapters while name + printed number remains the useful crosswalk identity.
  const identity = card.game === "onePiece"
    ? normalize(card.id)
    : `${normalize(card.name)}:${normalize(card.cardNumber)}`;
  return `${card.game}:${identity}`;
}

export function mergeRecentCarouselCard(cards: RecentCarouselCard[], card: RecentCarouselCard) {
  const key = recentCarouselCardKey(card);
  return [card, ...cards.filter((existing) => recentCarouselCardKey(existing) !== key)];
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

export function ComparisonApp({
  runtimeEnvironment = process.env.NODE_ENV,
}: {
  runtimeEnvironment?: "development" | "production" | "test";
} = {}) {
  return (
    <LanguageProvider>
      <ComparisonExperience runtimeEnvironment={runtimeEnvironment} />
    </LanguageProvider>
  );
}

function ComparisonExperience({ runtimeEnvironment }: { runtimeEnvironment: "development" | "production" | "test" }) {
  const t = useT();
  const { lang } = useLang();
  const form = useForm<ComparisonForm>({ defaultValues: defaultComparisonFormValues });
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [identityResult, setIdentityResult] = useState<CardIdentitySearchResponse | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<CardIdentityCandidate | null>(null);
  const [recentCarouselCards, setRecentCarouselCards] = useState<RecentCarouselCard[]>([]);
  const [pendingRequest, setPendingRequest] = useState<ComparisonRequest | null>(null);
  const [journeyState, setJourneyState] = useState<"idle" | "identifying" | "confirming" | "comparing" | "restoring" | "result" | "error">("idle");
  const [resultSnapshot, setResultSnapshot] = useState<ResultSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Two doors below the hero search, grouped by intent: refine what we search
  // for, or bring a listing you already found (with its evidence and any
  // manual candidates from unsupported marketplaces).
  const [refineOpen, setRefineOpen] = useState(false);
  const [listingOpen, setListingOpen] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [compactSearchOpen, setCompactSearchOpen] = useState(false);
  const [inspectorEnabled, setInspectorEnabled] = useState(false);
  const agentHandoffHandled = useRef(false);
  const requestGeneration = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const journeySnapshots = useRef(new Map<number, JourneySnapshot>());
  const nextJourneyId = useRef(1);
  const snapshotAttempts = useRef(new Set<string>());
  const ledger = useFieldArray({ control: form.control, name: "manualCandidates" });
  const loading = journeyState === "identifying" || journeyState === "comparing";

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
      setInspectorEnabled(
        runtimeEnvironment === "development"
        && new URLSearchParams(window.location.search).get("inspect") === "1",
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [runtimeEnvironment]);

  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      const id = (event.state as { tcgpalJourneyId?: unknown } | null)?.tcgpalJourneyId;
      if (typeof id !== "number") return;
      const snapshot = journeySnapshots.current.get(id);
      if (!snapshot) return;
      activeRequest.current?.abort();
      requestGeneration.current += 1;
      form.reset(snapshot.form);
      setReport(snapshot.report);
      setIdentityResult(snapshot.identityResult);
      setSelectedIdentity(snapshot.selectedIdentity);
      setPendingRequest(snapshot.pendingRequest);
      setJourneyState(snapshot.journeyState);
      setError(null);
      setCompactSearchOpen(false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [form]);

  useEffect(() => {
    if (journeyState !== "result" || !report?.confirmedCard) return;
    const reportKey = `${report.generatedAt}|${report.confirmedCard.id}`;
    if (resultSnapshot?.reportGeneratedAt === report.generatedAt || snapshotAttempts.current.has(reportKey)) return;
    snapshotAttempts.current.add(reportKey);
    let cancelled = false;
    void fetch("/api/comparison-snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: report.request,
        confirmedCardId: report.confirmedCard.id,
        generatedAt: report.generatedAt,
      }),
    }).then(async (response) => {
      if (!response.ok) return null;
      return response.json() as Promise<{ receiptId?: unknown; savedAt?: unknown; durable?: unknown }>;
    }).then((payload) => {
      if (cancelled || !payload || typeof payload.receiptId !== "string" || typeof payload.savedAt !== "string") return;
      const durable = payload.durable === true;
      const next: ResultSnapshot = {
        id: payload.receiptId,
        durable,
        restored: false,
        savedAt: payload.savedAt,
        reportGeneratedAt: report.generatedAt,
      };
      setResultSnapshot(next);
      if (!durable) return;
      trackEvent("receipt_created");
      const url = new URL(window.location.href);
      url.searchParams.set("receipt", payload.receiptId);
      window.history.replaceState(window.history.state, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
    }).catch(() => {
      // Snapshot creation is additive. A comparison result stays usable when
      // durable storage is unavailable; the receipt button falls back to text.
    });
    return () => { cancelled = true; };
  }, [journeyState, report, resultSnapshot?.reportGeneratedAt]);

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

  function beginRequest() {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    return { generation: ++requestGeneration.current, controller };
  }

  function requestIsCurrent(operation: { generation: number; controller: AbortController }) {
    return operation.generation === requestGeneration.current && !operation.controller.signal.aborted;
  }

  function writeJourney(step: JourneyStep, mode: "push" | "replace", snapshot: JourneySnapshot) {
    const id = nextJourneyId.current++;
    journeySnapshots.current.set(id, snapshot);
    const params = new URLSearchParams();
    const query = snapshot.form.heroQuery.trim();
    if (query) params.set("query", query);
    params.set("game", snapshot.form.game);
    params.set("step", step);
    params.set("condition", snapshot.form.desiredCondition);
    const cardId = snapshot.selectedIdentity?.id ?? snapshot.pendingRequest?.confirmedCardId;
    if (cardId) params.set("card", cardId);
    window.history[mode === "push" ? "pushState" : "replaceState"](
      { tcgpalJourneyId: id, step },
      "",
      `?${params.toString()}`,
    );
  }

  function currentSnapshot(overrides: Partial<JourneySnapshot> = {}): JourneySnapshot {
    return {
      form: form.getValues(), report, identityResult, selectedIdentity, pendingRequest,
      journeyState: journeyState === "confirming" ? "confirming" : journeyState === "result" ? "result" : "idle",
      ...overrides,
    };
  }

  function preserveSearchBeforeSubmit(values: ComparisonForm) {
    const currentStep = (window.history.state as { step?: unknown } | null)?.step;
    writeJourney("search", currentStep === "search" || currentStep == null ? "replace" : "push", currentSnapshot({
      form: values,
      report: null,
      identityResult: null,
      selectedIdentity: null,
      pendingRequest: null,
      journeyState: "idle",
    }));
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

    preserveSearchBeforeSubmit(values);
    const operation = beginRequest();
    const request = buildRequest(values, confirmedCardId);
    setResultSnapshot(null);
    setPendingRequest(request);
    setError(null);
    setFeedbackSent(false);
    try {
      if (confirmedCardId) {
        await runConfirmedComparison(request, selectedIdentity, operation);
        return;
      }
      if (hasListingSubmission(request)) {
        await runListingSubmission(request, operation);
        return;
      }
      setReport(null);
      setIdentityResult(null);
      setSelectedIdentity(null);
      setJourneyState("identifying");
      trackEvent("card_search_started");
      const identity = await requestCardIdentity(request, t.error.identityTemporary, operation.controller.signal);
      if (!requestIsCurrent(operation)) return;
      setIdentityResult(identity);
      if (identity.status === "resolved" && identity.confirmedCard) {
        const confirmedRequest = { ...request, confirmedCardId: identity.confirmedCard.id };
        setPendingRequest(confirmedRequest);
        setSelectedIdentity(identity.confirmedCard);
        rememberConfirmedCard(identity.confirmedCard, request.cardHint.game);
        writeJourney("confirmation", "push", currentSnapshot({
          form: values, report: null, identityResult: identity, selectedIdentity: identity.confirmedCard,
          pendingRequest: confirmedRequest, journeyState: "confirming",
        }));
        await runConfirmedComparison(confirmedRequest, identity.confirmedCard, operation);
      } else {
        setJourneyState("confirming");
        writeJourney("confirmation", "push", currentSnapshot({
          form: values, report: null, identityResult: identity, selectedIdentity: null,
          pendingRequest: request, journeyState: "confirming",
        }));
        trackEvent("identity_gallery_viewed", { status: identity.status });
        focusComparisonTarget();
      }
    } catch (caught) {
      if (!requestIsCurrent(operation) || isAbortError(caught)) return;
      const message = caught instanceof Error ? caught.message : t.error.temporary;
      setError(message);
      setJourneyState("error");
      trackEvent("comparison_failed", { marketplace: request.sourceListing.marketplace });
    }
  }

  async function runListingSubmission(request: ComparisonRequest, operation: { generation: number; controller: AbortController }) {
    setJourneyState("comparing");
    trackEvent("comparison_started", { marketplace: request.sourceListing.marketplace });
    trackEvent("source_detected", { marketplace: request.sourceListing.marketplace });
    const parsed = await requestComparisonReport(request, t.error.temporary, operation.controller.signal);
    if (!requestIsCurrent(operation)) return;
    setPendingRequest(parsed.request);
    if (parsed.status === "needs_confirmation") {
      setIdentityResult({
        identityContractVersion: 1,
        status: parsed.identityCandidates.length > 0 ? "needs_confirmation" : "not_found",
        candidates: parsed.identityCandidates,
        confirmedCard: null,
        warnings: parsed.warnings,
        generatedAt: parsed.generatedAt,
      });
      setJourneyState("confirming");
      writeJourney("confirmation", "push", currentSnapshot({
        report: null,
        identityResult: {
          identityContractVersion: 1,
          status: parsed.identityCandidates.length > 0 ? "needs_confirmation" : "not_found",
          candidates: parsed.identityCandidates,
          confirmedCard: null,
          warnings: parsed.warnings,
          generatedAt: parsed.generatedAt,
        },
        pendingRequest: parsed.request,
        journeyState: "confirming",
      }));
      trackEvent("identity_gallery_viewed", { status: parsed.status });
      return;
    }
    setReport(parsed);
    setJourneyState("result");
    writeJourney("result", "push", currentSnapshot({ report: parsed, pendingRequest: parsed.request, journeyState: "result" }));
    trackEvent("comparison_completed", {
      marketplace: request.sourceListing.marketplace,
      status: parsed.status,
      demo_mode: parsed.demoMode,
      candidate_count: parsed.candidates.length,
    });
    focusComparisonTarget();
  }

  async function runConfirmedComparison(request: ComparisonRequest, identity: CardIdentityCandidate | null, operation = beginRequest()) {
    const startedAt = readTimestamp();
    setSelectedIdentity(identity);
    setJourneyState("comparing");
    trackEvent("comparison_started", { marketplace: request.sourceListing.marketplace });
    trackEvent("source_detected", { marketplace: request.sourceListing.marketplace });
    const parsed = await requestComparisonReport(request, t.error.temporary, operation.controller.signal);
    if (!requestIsCurrent(operation)) return;
    setReport(parsed);
    setPendingRequest(parsed.request);
    if (parsed.confirmedCard) rememberConfirmedCard(parsed.confirmedCard, request.cardHint.game);
    setJourneyState("result");
    writeJourney("result", "push", currentSnapshot({
      report: parsed,
      selectedIdentity: parsed.confirmedCard ?? identity,
      pendingRequest: parsed.request,
      journeyState: "result",
    }));
    const duration = readTimestamp() - startedAt;
    trackEvent("comparison_completed", {
      marketplace: request.sourceListing.marketplace,
      status: parsed.status,
      demo_mode: parsed.demoMode,
      candidate_count: parsed.candidates.length,
      duration_bucket: duration < 5000 ? "under_5s" : duration < 15000 ? "5_to_15s" : "over_15s",
    });
    focusComparisonTarget();
  }

  // ChatGPT/Codex and other trusted interfaces can hand the buyer directly into
  // the existing deterministic search flow. The URL contains card identity only
  // (never marketplace credentials or private listing data), remains editable,
  // and still passes through the same Zod-validated API and exact-print gates.
  useEffect(() => {
    if (agentHandoffHandled.current) return;
    agentHandoffHandled.current = true;
    const searchParams = new URLSearchParams(window.location.search);
    const restoreSnapshot = (payload: unknown, expectedReceiptId?: string) => {
      if (!payload || typeof payload !== "object" || !("snapshot" in payload)) throw new Error(t.error.temporary);
      const rawSnapshot = (payload as { snapshot?: unknown }).snapshot;
      if (!rawSnapshot || typeof rawSnapshot !== "object") throw new Error(t.error.temporary);
      const snapshot = rawSnapshot as { id?: unknown; report?: unknown; savedAt?: unknown };
      const restoredReport = comparisonReportSchema.parse(snapshot.report);
      if (typeof snapshot.id !== "string" || !/^[a-f0-9]{32}$/.test(snapshot.id) || typeof snapshot.savedAt !== "string") {
        throw new Error(t.error.temporary);
      }
      if (expectedReceiptId && snapshot.id !== expectedReceiptId) throw new Error(t.error.temporary);
      setReport(restoredReport);
      setPendingRequest(restoredReport.request);
      setSelectedIdentity(restoredReport.confirmedCard);
      form.setValue("heroQuery", restoredReport.request.query ?? restoredReport.request.cardHint.name);
      form.setValue("game", restoredReport.request.cardHint.game);
      form.setValue("desiredCondition", restoredReport.request.buyer.desiredCondition);
      setResultSnapshot({
        id: snapshot.id,
        durable: true,
        restored: true,
        savedAt: snapshot.savedAt,
        reportGeneratedAt: restoredReport.generatedAt,
      });
      setJourneyState("result");
    };
    const receiptId = searchParams.get("receipt");
    if (receiptId && /^[a-f0-9]{32}$/.test(receiptId)) {
      queueMicrotask(() => setJourneyState("restoring"));
      void fetch(`/api/comparison-snapshots?id=${encodeURIComponent(receiptId)}`)
        .then((response) => readJsonResponse(response, t.error.temporary))
        .then((payload) => restoreSnapshot(payload, receiptId))
        .catch((caught) => {
          setError(caught instanceof Error ? caught.message : t.error.temporary);
          setJourneyState("error");
        });
      return;
    }
    const handoff = parseAgentSearchParams(searchParams);
    const journey = handoff ? null : parseJourneySearchParams(searchParams);
    const restored = handoff ?? (journey ? {
      query: journey.query,
      game: journey.game,
      confirmedCardId: journey.confirmedCardId,
      autoSubmit: journey.step !== "search",
      desiredCondition: journey.desiredCondition,
    } : null);
    if (!restored) return;

    form.setValue("heroQuery", restored.query);
    form.setValue("game", restored.game);
    if (restored.desiredCondition) form.setValue("desiredCondition", restored.desiredCondition);
    if (!restored.autoSubmit) return;

    if (!handoff && journey?.step === "result" && journey.confirmedCardId && journey.desiredCondition) {
      const runFreshComparison = () => {
        void form.handleSubmit((values) => submitComparison(values, restored.confirmedCardId))();
      };
      const lookupUrl = `/api/comparison-snapshots?card=${encodeURIComponent(journey.confirmedCardId)}`
        + `&game=${encodeURIComponent(journey.game)}`
        + `&condition=${encodeURIComponent(journey.desiredCondition)}`;
      queueMicrotask(() => setJourneyState("restoring"));
      void fetch(lookupUrl)
        .then(async (response) => {
          if (response.status === 404) {
            runFreshComparison();
            return null;
          }
          return readJsonResponse(response, t.error.temporary);
        })
        .then((payload) => {
          if (payload) restoreSnapshot(payload);
        })
        .catch(runFreshComparison);
      return;
    }

    void form.handleSubmit((values) => submitComparison(values, restored.confirmedCardId))();
    // This is intentionally mount-only: a handoff must run at most once even as
    // form state and localized copy change during the comparison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmIdentity(identity: CardIdentityCandidate) {
    if (!pendingRequest || loading) return;
    const confirmedRequest = { ...pendingRequest, confirmedCardId: identity.id };
    setPendingRequest(confirmedRequest);
    setReport(null);
    setError(null);
    setSelectedIdentity(identity);
    form.setValue("cardName", identity.name);
    form.setValue("setCode", identity.setCode);
    form.setValue("cardNumber", identity.cardNumber);
    rememberConfirmedCard(identity, pendingRequest.cardHint.game);
    trackEvent("card_identity_confirmed", { confidence: identity.confidence });
    const operation = beginRequest();
    try {
      await runConfirmedComparison(confirmedRequest, identity, operation);
    } catch (caught) {
      if (!requestIsCurrent(operation) || isAbortError(caught)) return;
      setError(caught instanceof Error ? caught.message : t.error.temporary);
      setJourneyState("error");
      trackEvent("comparison_failed", { marketplace: confirmedRequest.sourceListing.marketplace });
    }
  }

  // One-tap switch to a sibling print suggested by a zero-recommendation
  // abstention (e.g. "no SP listings — compare the Alternate Art instead").
  // Reuses the pending request exactly, only swapping the confirmed print id.
  async function compareSuggestedPrint(cardId: string) {
    if (!pendingRequest || loading) return;
    const suggestedRequest = { ...pendingRequest, confirmedCardId: cardId };
    setPendingRequest(suggestedRequest);
    setError(null);
    const operation = beginRequest();
    try {
      await runConfirmedComparison(suggestedRequest, null, operation);
      trackEvent("card_identity_confirmed", { confidence: "high" });
    } catch (caught) {
      if (!requestIsCurrent(operation) || isAbortError(caught)) return;
      setError(caught instanceof Error ? caught.message : t.error.temporary);
      setJourneyState("error");
      trackEvent("comparison_failed", { marketplace: suggestedRequest.sourceListing.marketplace });
    }
  }

  // R5: a failed comparison keeps the exact request around so one tap retries
  // it — the buyer never re-types anything after a backend hiccup.
  async function retryComparison() {
    if (!pendingRequest || loading) return;
    setError(null);
    try {
      if (pendingRequest.confirmedCardId) {
        await runConfirmedComparison(pendingRequest, selectedIdentity);
      } else {
        await submitComparison(form.getValues());
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.error.temporary);
      setJourneyState("error");
      trackEvent("comparison_failed", { marketplace: pendingRequest.sourceListing.marketplace });
    }
  }

  function sendFeedback(changedDecision: boolean) {
    setFeedbackSent(true);
    trackEvent("decision_feedback_submitted", { changed_decision: changedDecision });
  }

  const compactMode = Boolean(pendingRequest || report);
  const activeCard = report?.confirmedCard ?? null;
  const railItems = buildRail(recentCarouselCards, DEFAULT_MARQUEE_CARDS);
  const headerQuery = activeCard
    ? [activeCard.name, activeCard.cardNumber, activeCard.variant, activeCard.setName].filter(Boolean).join(" · ")
    : heroQuery.trim() || pendingRequest?.query || cardName.trim() || t.form.heroSearchLabel;
  const selectedConditionLabel = desiredCondition === "Unknown"
    ? t.form.anyCondition
    : t.conditions[desiredCondition];
  const appliedCondition = pendingRequest?.buyer.desiredCondition ?? desiredCondition;
  const headerContext = [
    (pendingRequest?.cardHint.game ?? game) === "onePiece" ? t.form.onePieceBetaLabel : t.form.games.pokemon,
    (pendingRequest?.buyer.postalCode ?? postalCode) ? `ZIP ${pendingRequest?.buyer.postalCode ?? postalCode}` : null,
    appliedCondition === "Unknown"
      ? t.form.anyCondition
      : t.conditions[appliedCondition],
  ].filter(Boolean).join(" · ");
  const hasCardStarter = Boolean(heroQuery.trim().length >= 2 || cardName.trim().length >= 2 || cardNumber.trim());
  const hasExplicitCardKey = Boolean(
    hasCardStarter
    && (heroPreview?.cardNumber || cardNumber.trim())
  );

  function startNewSearch() {
    activeRequest.current?.abort();
    requestGeneration.current += 1;
    setReport(null);
    setPendingRequest(null);
    setError(null);
    setIdentityResult(null);
    setSelectedIdentity(null);
    setResultSnapshot(null);
    setJourneyState("idle");
    setCompactSearchOpen(false);
    const reset = resetForNewCardSearch(form.getValues());
    form.reset(reset);
    writeJourney("search", "push", currentSnapshot({
      form: reset, report: null, identityResult: null, selectedIdentity: null, pendingRequest: null, journeyState: "idle",
    }));
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('input[name="heroQuery"]')?.focus();
    });
  }

  function startPasteListing() {
    setReport(null);
    setPendingRequest(null);
    setError(null);
    setCompactSearchOpen(false);
    setListingOpen(true);
    form.reset(resetForNewCardSearch(form.getValues()));
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('input[name="url"]')?.focus();
    });
  }

  function checkCardFromRail(card: RecentCarouselCard, source: "chase" | "recent") {
    const values = resetForNewCardSearch(form.getValues());
    form.reset({
      ...values,
      game: card.game,
      heroQuery: [card.name, card.cardNumber, card.variant].filter(Boolean).join(" ").trim(),
      cardName: card.name,
      setCode: card.setCode,
      cardNumber: card.cardNumber,
    });
    trackEvent("rail_card_clicked", { game: card.game, source });
    void submitComparison(form.getValues());
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
              id="results-edit-panel"
              className="mx-auto grid max-h-[calc(100dvh-8rem)] max-w-[1180px] gap-3 overflow-y-auto overscroll-contain border-t border-[#d6ded5] px-4 py-4 sm:grid-cols-2 sm:items-end sm:px-6 lg:max-h-none lg:grid-cols-[minmax(220px,1fr)_140px_minmax(220px,240px)_120px_auto] lg:overflow-visible lg:px-8"
              onSubmit={form.handleSubmit((values) => {
                setCompactSearchOpen(false);
                // This panel only lets the buyer edit the free-text query — clear the
                // previously confirmed card's locked identity fields so the new query
                // drives identity resolution again instead of re-matching the old card
                // (buildRequest's cardHint would otherwise win over the fresh parse).
                form.setValue("cardName", "");
                form.setValue("setCode", "");
                form.setValue("cardNumber", "");
                void submitComparison({ ...values, cardName: "", setCode: "", cardNumber: "" });
              })}
            >
              <label className="field sm:col-span-2 lg:col-span-1">
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
                  <option value="onePiece">{t.form.onePieceBetaLabel}</option>
                </select>
              </label>
              <DesiredConditionField form={form} />
              <label className="field">
                <span>{t.form.deliveryZip}</span>
                <input {...form.register("postalCode")} inputMode="numeric" />
              </label>
              <button className="primary-button" type="submit" disabled={loading}>
                {loading ? <IconSpinner className="h-4 w-4 animate-spin" /> : <IconCardSearch className="h-4 w-4" />}
                {loading ? t.form.submitLoading : heroPreview?.cardNumber ? t.form.submitIdle : t.form.browseVersions}
              </button>
            </form>
          ) : null}
        />
      ) : (
        <Header onLogoClick={startNewSearch} />
      )}
      <div className={`mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8 ${compactMode ? "pb-14 pt-5" : "pb-24 pt-6 sm:pt-8"}`}>
        {!compactMode && (
          <>
        <section id="compare" className="mx-auto max-w-[720px] pt-4 text-center sm:pt-7">
          <h1 className="display-soft mx-auto max-w-2xl font-serif text-3xl font-black leading-[1.08] tracking-normal text-[#24312f] sm:text-4xl lg:text-[42px]">
            {t.hero.title}
          </h1>

          <form className="paper-panel mt-6 p-4 text-left shadow-[0_14px_40px_rgba(36,49,47,0.07)] sm:p-5" onSubmit={form.handleSubmit((values) => submitComparison(values))}>
            <label className="block">
              <span className="sr-only">{t.form.heroSearchLabel}</span>
              <span className="landing-search-row">
                <IconCardSearch className="landing-search-icon h-[22px] w-[22px]" />
                <input
                  {...form.register("heroQuery")}
                  aria-label={t.form.heroSearchLabel}
                  placeholder={t.form.heroSearchPlaceholder}
                  autoFocus
                />
                <button type="submit" disabled={loading}>
                  {loading ? <IconSpinner className="h-4 w-4 animate-spin" /> : <IconCardSearch className="h-4 w-4" />}
                  {loading ? t.form.submitLoading : hasExplicitCardKey ? t.form.submitIdle : t.form.browseVersions}
                </button>
              </span>
            </label>
            {form.formState.errors.heroQuery && (
              <p className="mt-2 text-sm font-bold text-[#9a4a2c]">{form.formState.errors.heroQuery.message}</p>
            )}

            <ParsedPreview preview={heroPreview} game={game} lang={lang} t={t} />

            <div className="landing-control-row">
              <fieldset>
                <legend className="sr-only">{t.form.gameLabel}</legend>
                <div className="landing-game-segment">
                  {(["pokemon", "onePiece"] as const).map((id) => {
                    const active = game === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          form.setValue("game", id);
                          trackEvent("game_selected", { game: id });
                        }}
                      >
                        <Image
                          src={id === "pokemon" ? "/logo-pokemon-tcg.png" : "/logo-one-piece-card-game.png"}
                          alt={id === "pokemon" ? "Pokémon TCG" : "One Piece Card Game"}
                          width={id === "pokemon" ? 58 : 66}
                          height={24}
                          className="landing-game-logo"
                        />
                        <span>{t.form.games[id]}</span>
                        {id === "onePiece" && <span className="landing-beta-label">Beta</span>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="landing-zip">
                <span>{t.form.deliveryZip}</span>
                <input {...form.register("postalCode")} inputMode="numeric" placeholder={t.form.ph.zip} />
              </label>

              <button
                className="landing-link-button"
                type="button"
                aria-expanded={refineOpen}
                aria-controls="search-refinement-panel"
                aria-label={`${t.form.refineToggle}, ${t.form.desiredCondition}: ${selectedConditionLabel}`}
                onClick={() => setRefineOpen((current) => !current)}
              >
                {selectedConditionLabel}
                <IconChevronDown className={`h-3.5 w-3.5 transition ${refineOpen ? "rotate-180" : ""}`} />
              </button>

              {PASTE_LISTING_UI_ENABLED && <button
                className="landing-link-button"
                type="button"
                aria-expanded={listingOpen}
                onClick={() => setListingOpen((current) => !current)}
              >
                <IconLink className="h-3.5 w-3.5" />
                {t.form.pasteListingInstead}
              </button>}
            </div>

            {game === "onePiece" && <p className="mt-2 text-xs font-semibold text-[#7a8982]">{t.form.onePieceBetaNote}</p>}

            {refineOpen && (
              <div id="search-refinement-panel" className="mt-4 border-t border-[#d6ded5] pt-4">
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
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <DesiredConditionField form={form} />
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

            {PASTE_LISTING_UI_ENABLED && listingOpen && (
            <div className="mt-4 border-t border-[#d6ded5] pt-4">
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

        <CardMarquee items={railItems} onCheck={checkCardFromRail} />
        <p className="mt-1 text-center text-[12.5px] font-semibold text-[#7a8982]">
          {t.hero.scope}
        </p>

          </>
        )}

        {journeyState === "identifying" && <IdentityLoading query={pendingRequest?.cardHint.name || pendingRequest?.query || ""} />}
        {journeyState === "restoring" && <SnapshotLoading />}
        {journeyState === "comparing" && (selectedIdentity
          ? <ComparisonLoading identity={selectedIdentity} />
          : pendingRequest?.confirmedCardId
            ? <ComparisonReplayLoading query={pendingRequest.query || pendingRequest.cardHint.name} />
            : <ListingSubmissionLoading />)}
        {error && <ErrorNotice message={error} onRetry={pendingRequest ? retryComparison : undefined} />}
        {journeyState === "confirming" && identityResult && (
          <IdentityConfirmation
            identities={identityResult.candidates}
            warnings={identityResult.warnings}
            onConfirm={confirmIdentity}
            onRetry={() => void retryComparison()}
            onRefine={() => {
              setCompactSearchOpen(true);
              window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#results-edit-panel input[name="heroQuery"]')?.focus());
            }}
          />
        )}
        {journeyState === "result" && report && report.status !== "needs_confirmation" && (
          <ComparisonResult
            report={report}
            preferredRole={preferredRole}
            feedbackSent={feedbackSent}
            onFeedback={sendFeedback}
            onCompareSuggestedPrint={compareSuggestedPrint}
            onRefineSearch={() => setCompactSearchOpen(true)}
            onRetrySources={() => void retryComparison()}
            onPasteListing={startPasteListing}
            snapshot={resultSnapshot}
            inspectorEnabled={inspectorEnabled}
          />
        )}
      </div>
      <Footer />
    </main>
  );
}

function SnapshotLoading() {
  const t = useT();
  return (
    <section className="market-agent-panel mt-6 flex items-center gap-3 rounded-md border border-[#c9d7ce] bg-[#e7efe8] p-5" aria-live="polite" aria-busy="true">
      <IconSpinner className="h-5 w-5 animate-spin text-[#2f6f73] motion-reduce:animate-none" />
      <h2 className="font-serif text-xl font-bold text-[#2f6f73]">{t.result.restoringSnapshot}</h2>
    </section>
  );
}

function Header({ onLogoClick }: { onLogoClick: () => void }) {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <header className="border-b border-[#d6ded5] bg-[#f7f9f5]/95">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <button className="flex items-center gap-3" type="button" onClick={onLogoClick} aria-label={t.header.home}>
          <Image src="/lens-logo-horizontal.svg" alt="Lens TCG" width={140} height={40} priority />
        </button>
        <div className="flex items-center gap-3 sm:gap-6">
          <nav className="hidden items-center gap-6 text-sm font-bold text-[#64736c] sm:flex">
            <a className="hover:text-[#2f6f73]" href="/method">{t.header.method}</a>
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
        <button className="shrink-0" type="button" onClick={onNewSearch} aria-label={t.header.home}>
          <Image src="/lens-logo-horizontal.svg" alt="Lens TCG" width={105} height={30} priority />
        </button>
        <button
          className="order-3 flex min-w-0 basis-full items-center gap-2 rounded-lg border border-[#d6ded5] bg-[#f4f3ec] px-3 py-2 text-left transition hover:border-[#2f6f73] focus:outline-none focus:ring-2 focus:ring-[#2f6f73]/20 sm:order-none sm:basis-auto sm:flex-1 lg:max-w-[610px]"
          type="button"
          aria-expanded={editOpen}
          aria-controls="results-edit-panel"
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

type MarqueeItem = RailItem & { clone: boolean };

/** The loop is the rail twice over; the second pass is the seam-free clone. */
function buildMarqueeItems(items: RailItem[]): MarqueeItem[] {
  return [
    ...items.map((item) => ({ ...item, clone: false })),
    ...items.map((item) => ({ ...item, clone: true })),
  ];
}

function CardMarquee({
  items,
  onCheck,
}: {
  items: RailItem[];
  onCheck: (card: RecentCarouselCard, source: "chase" | "recent") => void;
}) {
  const t = useT();
  const marqueeItems = buildMarqueeItems(items);
  if (marqueeItems.length === 0) return null;
  // Keep the card pitch stable as history grows: the track gets longer and the
  // duration scales with it, so cards do not accelerate into a blur after a
  // buyer has checked many unique prints.
  const durationSeconds = Math.max(46, items.length * 5.75);
  return (
    <section className="card-marquee-wrap mt-8 sm:mt-10" aria-label={t.rail.ariaLabel}>
      {/*
        Pausing is CSS-only (`.card-marquee:hover`). Driving it from React state
        put a re-render between "pointer entered" and "motion stopped", and in
        those frames the card slid out from under a stationary cursor — the rail
        froze with no card hovered, so the check button never appeared.
      */}
      <div className="card-marquee">
        <div
          className="card-marquee-track"
          style={{ "--card-marquee-duration": `${durationSeconds}s` } as CSSProperties}
        >
          {marqueeItems.map((item, index) => (
            <CardMarqueeItem
              key={`${item.card.id}-${item.clone ? "clone" : "real"}-${index}`}
              item={item}
              source={item.source}
              onCheck={onCheck}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function CardMarqueeItem({
  item,
  source,
  onCheck,
}: {
  item: MarqueeItem;
  source: "chase" | "recent";
  onCheck: (card: RecentCarouselCard, source: "chase" | "recent") => void;
}) {
  const t = useT();
  const { card, clone } = item;
  return (
    <button
      type="button"
      className="card-marquee-card"
      data-clone={clone ? "true" : undefined}
      data-rail-source={source}
      tabIndex={clone ? -1 : undefined}
      aria-hidden={clone ? true : undefined}
      aria-label={t.rail.checkCard(card.name, card.setName, card.cardNumber)}
      onClick={() => onCheck(card, source)}
    >
      <span className="card-marquee-art">
        <Image
          src={cardImageSource(card.imageUrl) ?? card.imageUrl}
          alt=""
          fill
          sizes="132px"
          className="object-contain"
          loading="eager"
          unoptimized={card.game === "pokemon"}
        />
        <span className="card-marquee-veil" />
        <span className="card-marquee-go">
          {t.rail.checkThisCard}
          <IconArrowUpRight className="h-3 w-3" />
        </span>
        <span className="card-marquee-gloss" />
      </span>
      <span className="card-marquee-caption">
        <strong>{card.name}</strong>
        <span className="card-marquee-meta">{card.cardNumber}</span>
      </span>
    </button>
  );
}

function ParsedPreview({
  preview,
  game,
  lang,
  t,
}: {
  preview: ReturnType<typeof parseCardQuery> | null;
  game: TcgGame;
  lang: Lang;
  t: Dict;
}) {
  const chips = [
    preview?.game && { label: t.form.games[preview.game], tone: "blue" },
    preview?.name && { label: preview.name, tone: "green" },
    preview?.cardNumber && { label: `#${preview.cardNumber}`, tone: "gold" },
    preview?.language && { label: preview.language, tone: "neutral" },
    preview?.variant && { label: localizeVariantLabel(lang, preview.variant), tone: "neutral" },
    preview?.gradingClaim && { label: preview.gradingClaim, tone: "neutral" },
  ].filter(Boolean) as Array<{ label: string; tone: "blue" | "green" | "gold" | "neutral" }>;

  if (chips.length === 0) {
    chips.push({ label: t.form.games[game], tone: "blue" });
  }

  return (
    <div className="mt-2 flex min-h-9 items-center" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-1.5 text-xs font-bold text-[#64736c]">
        {chips.map((chip, index) => (
          <span key={`${chip.tone}-${chip.label}`} className="inline-flex items-center gap-1.5">
            <span className={chip.tone === "green" ? "text-[#2f6f73]" : chip.tone === "gold" ? "font-mono text-[#6f5a22]" : ""}>
              {chip.label}
            </span>
            {index < chips.length - 1 && <span aria-hidden="true" className="text-[#9fb3a8]">·</span>}
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

function IdentityLoading({ query }: { query: string }) {
  const t = useT();
  const parsed = parseCardQuery(query);
  const label = parsed.cardNumber || parsed.name || query;
  return (
    <section id="comparison-result" tabIndex={-1} className="mt-6 scroll-mt-6 rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5 outline-none sm:p-7" aria-live="polite" aria-busy="true">
      <div className="max-w-2xl">
        <p className="eyebrow"><IconSpinner className="h-4 w-4 animate-spin" />{t.identity.findingEyebrow}</p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-[#2f6f73]">{t.identity.findingHeading(label)}</h2>
        <p className="mt-2 leading-7 text-[#64736c]">{t.identity.findingDesc}</p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="animate-pulse rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4 motion-reduce:animate-none" aria-hidden="true">
            <div className="mx-auto aspect-[2.5/3.5] w-32 rounded-md bg-[#dfe8e1]" />
            <div className="mt-4 h-4 w-2/3 rounded bg-[#dfe8e1]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-[#e7ede7]" />
          </div>
        ))}
      </div>
    </section>
  );
}

function ComparisonLoading({ identity }: { identity: CardIdentityCandidate }) {
  const t = useT();
  return (
    <section className="market-agent-panel mt-6 rounded-md border border-[#c9d7ce] bg-[#e7efe8] p-5 sm:p-6" aria-live="polite" aria-busy="true">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_280px] sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <IconSpinner className="h-5 w-5 animate-spin text-[#2f6f73]" />
            <div>
              <h2 className="font-serif text-xl font-bold text-[#2f6f73]">{t.loading.comparing(identity.name)}</h2>
              <p className="mt-1 text-sm text-[#64736c]">{t.loading.steps}</p>
            </div>
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {t.loading.checks.map((check) => (
              <li key={check} className="flex items-center gap-2 rounded-md border border-[#d6ded5] bg-[#fcfbf6] px-3 py-2 text-sm font-bold text-[#52635c]">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#2f6f73]" aria-hidden="true" />
                {check}
              </li>
            ))}
          </ul>
        </div>
        <ConfirmedCardMotion key={identity.imageUrl ?? identity.id} identity={identity} />
      </div>
    </section>
  );
}

function ComparisonReplayLoading({ query }: { query: string }) {
  const t = useT();
  return (
    <section className="market-agent-panel mt-6 rounded-md border border-[#c9d7ce] bg-[#e7efe8] p-5 sm:p-6" aria-live="polite" aria-busy="true">
      <div className="flex items-start gap-3">
        <IconSpinner className="mt-1 h-5 w-5 animate-spin text-[#2f6f73] motion-reduce:animate-none" />
        <div>
          <h2 className="font-serif text-xl font-bold text-[#2f6f73]">{t.loading.comparingQuery(query)}</h2>
          <p className="mt-1 text-sm leading-6 text-[#64736c]">{t.loading.steps}</p>
        </div>
      </div>
    </section>
  );
}

function ConfirmedCardMotion({ identity }: { identity: CardIdentityCandidate }) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const imageSrc = cardImageSource(identity.imageUrl);
  return (
    <div
      data-testid="confirmed-card-motion"
      className="confirmed-card-motion relative isolate min-h-[220px] overflow-hidden rounded-lg border border-[#c9d7ce] bg-[#fcfbf6] p-3 text-center"
    >
      <style>{`
        .confirmed-card-motion::before {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(90deg, #fcfbf6 0%, transparent 24%, transparent 76%, #fcfbf6 100%);
          content: "";
          pointer-events: none;
        }
        .confirmed-card-motion-track {
          position: absolute;
          left: 50%;
          top: 50%;
          display: flex;
          width: max-content;
          gap: .65rem;
          opacity: .34;
          transform: translate3d(-72%, -50%, 0);
          animation: tcglens-confirmed-card-scroll 2.4s linear infinite alternate;
          will-change: transform;
        }
        .confirmed-card-motion-copy {
          display: block;
          width: 78px;
          flex: 0 0 auto;
          overflow: hidden;
          border-radius: .45rem;
          filter: saturate(.72) contrast(.94);
          box-shadow: 0 10px 24px rgba(36, 49, 47, .12);
        }
        .confirmed-card-motion-anchor {
          position: relative;
          z-index: 2;
          width: 132px;
          margin-inline: auto;
          filter: drop-shadow(0 12px 18px rgba(36, 49, 47, .18));
        }
        @keyframes tcglens-confirmed-card-scroll {
          to { transform: translate3d(-38%, -50%, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .confirmed-card-motion-track { display: none; }
        }
      `}</style>
      {imageSrc && !failed ? (
        <>
          <div className="confirmed-card-motion-track" aria-hidden="true">
            {Array.from({ length: 3 }, (_, index) => (
              <span className="confirmed-card-motion-copy" key={index}>
                <Image src={imageSrc} alt="" width={78} height={109} className="h-auto w-full" />
              </span>
            ))}
          </div>
          <div className="confirmed-card-motion-anchor">
            <Image src={imageSrc} alt={`${identity.name} ${identity.cardNumber}`} width={132} height={185} className="h-auto w-full" onError={() => setFailed(true)} />
          </div>
        </>
      ) : (
        <div className="relative z-[2] mx-auto grid aspect-[2.5/3.5] w-[132px] place-items-center rounded-md bg-[#e7efe8] p-3 text-xs font-black text-[#64736c]">
          {t.identity.imageUnavailable}
        </div>
      )}
      <p className="relative z-[2] mt-2 text-xs font-black text-[#52635c]">{identity.cardNumber}</p>
    </div>
  );
}

function ListingSubmissionLoading() {
  const t = useT();
  return (
    <section className="market-agent-panel mt-6 rounded-md border border-[#c9d7ce] bg-[#e7efe8] p-5 sm:p-6" aria-live="polite" aria-busy="true">
      <div className="flex items-start gap-3">
        <IconSpinner className="mt-1 h-5 w-5 animate-spin text-[#2f6f73] motion-reduce:animate-none" />
        <div>
          <h2 className="font-serif text-xl font-bold text-[#2f6f73]">{t.loading.listingSubmissionTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-[#64736c]">{t.loading.listingSubmissionDesc}</p>
        </div>
      </div>
    </section>
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

function DesiredConditionField({ form }: { form: UseFormReturn<ComparisonForm> }) {
  const t = useT();
  const value = useWatch({
    control: form.control,
    name: "desiredCondition",
    defaultValue: defaultComparisonFormValues.desiredCondition,
  });

  return (
    <label className="field">
      <span>{t.form.desiredCondition}</span>
      <select {...form.register("desiredCondition")} value={value}>
        {conditions.map((condition) => (
          <option key={condition} value={condition}>
            {condition === "Unknown" ? t.form.anyCondition : t.conditions[condition]}
          </option>
        ))}
      </select>
    </label>
  );
}

function IdentityConfirmation({
  identities,
  warnings = [],
  onConfirm,
  onRetry,
  onRefine,
}: {
  identities: CardIdentityCandidate[];
  warnings?: string[];
  onConfirm: (identity: CardIdentityCandidate) => void;
  onRetry: () => void;
  onRefine: () => void;
}) {
  const t = useT();
  const [filters, setFilters] = useState<IdentityFilters>({ setFilter: "", rarityFilter: "", printTypeFilter: "" });
  // A print's rarity and its print-type bucket are not independent (SP CARD
  // rarity is always Special Art, SEC never coexists with Special Art, ...), so
  // each dropdown's options are computed against the OTHER active filters —
  // picking one narrows the others instead of leaving a combination on screen
  // that can only ever show "0 versions".
  const facets = useMemo(
    () => computeIdentityFacets(identities, filters, t.identity.basePrint),
    [identities, filters, t.identity.basePrint],
  );
  // "Should the filter bar show at all" is a static question about the full,
  // unfiltered list — unrelated to how the active filters narrow each other.
  const showFilters = identities.length > 4 && (() => {
    const empty = computeIdentityFacets(identities, { setFilter: "", rarityFilter: "", printTypeFilter: "" }, t.identity.basePrint);
    return empty.setOptions.length > 1 || empty.rarityOptions.length > 1 || empty.printTypeOptions.length > 1;
  })();
  const { setOptions, rarityOptions, printTypeOptions, filteredIdentities } = facets;
  function updateFilter(key: keyof IdentityFilters, value: string) {
    setFilters((current) => applyIdentityFilterChange(current, key, value, identities, t.identity.basePrint));
  }
  const grouped = filteredIdentities.length > IDENTITY_GROUP_THRESHOLD;
  const groups = useMemo(() => (grouped ? groupIdentitiesBySet(filteredIdentities) : []), [grouped, filteredIdentities]);
  const likelyMatches = useMemo(
    () => (grouped ? filteredIdentities.filter((identity) => identity.confidence !== "low").slice(0, 4) : []),
    [grouped, filteredIdentities],
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
  const sharedNumber = identities.length > 1 && identities.every((identity) => identity.cardNumber === identities[0]?.cardNumber)
    ? identities[0]?.cardNumber ?? ""
    : "";
  const heading = identities.length === 0
    ? (lookupUnavailable ? t.identity.lookupUnavailableTitle : t.identity.noMatchTitle)
    : t.identity.chooseHeading(identities[0]?.name ?? "card", sharedNumber);
  return (
    <section id="comparison-result" tabIndex={-1} className="mt-6 scroll-mt-6 rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5 outline-none sm:p-7">
      <div className="max-w-2xl">
        <p className="eyebrow">
          <IconSeal className="h-4 w-4" />
          {identities.length === 0
            ? (lookupUnavailable ? t.identity.lookupUnavailableEyebrow : t.identity.noMatchEyebrow)
            : t.identity.eyebrow}
        </p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-[#2f6f73]">{heading}</h2>
        <p className="mt-2 leading-7 text-[#64736c]">
          {identities.length === 0 ? (lookupUnavailable ? t.identity.lookupUnavailable : t.identity.noMatch) : t.identity.desc}
        </p>
      </div>
      {showFilters && (
        <div className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-[#d6ded5] bg-[#f7f9f5] p-3">
          {setOptions.length > 1 && (
            <label className="field !gap-1">
              <span className="text-xs">{t.identity.filterSetLabel}</span>
              <select value={filters.setFilter} onChange={(event) => updateFilter("setFilter", event.target.value)}>
                <option value="">{t.identity.filterAllSets}</option>
                {setOptions.map((setName) => (
                  <option key={setName} value={setName}>{setName}</option>
                ))}
              </select>
            </label>
          )}
          {rarityOptions.length > 1 && (
            <label className="field !gap-1">
              <span className="text-xs">{t.identity.filterRarityLabel}</span>
              <select value={filters.rarityFilter} onChange={(event) => updateFilter("rarityFilter", event.target.value)}>
                <option value="">{t.identity.filterAllRarities}</option>
                {rarityOptions.map((rarity) => (
                  <option key={rarity} value={rarity}>{rarity}</option>
                ))}
              </select>
            </label>
          )}
          {printTypeOptions.length > 1 && (
            <label className="field !gap-1">
              <span className="text-xs">{t.identity.filterPrintTypeLabel}</span>
              <select value={filters.printTypeFilter} onChange={(event) => updateFilter("printTypeFilter", event.target.value)}>
                <option value="">{t.identity.filterAllPrintTypes}</option>
                {printTypeOptions.map((printType) => (
                  <option key={printType} value={printType}>{printType}</option>
                ))}
              </select>
            </label>
          )}
          <p className="ml-auto text-xs font-bold text-[#64736c]">
            {t.identity.filterShowingCount(filteredIdentities.length, identities.length)}
          </p>
          {(filters.setFilter || filters.rarityFilter || filters.printTypeFilter) && (
            <button
              type="button"
              className="text-xs font-black text-[#2f6f73] hover:underline"
              onClick={() => setFilters(clearIdentityFilters())}
            >
              {t.identity.filterClear}
            </button>
          )}
        </div>
      )}
      {identities.length === 0 ? (
        <div className="mt-6 rounded-md border border-[#e5c69e] bg-[#fff8e9] p-5 text-sm leading-6 text-[#765633]">
          {lookupUnavailable ? (
            <button className="secondary-button" type="button" onClick={onRetry}>{t.identity.retryCatalog}</button>
          ) : (
            <>
              <ul className="list-disc space-y-1 pl-5">
                {t.identity.noMatchSuggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}
              </ul>
              <button className="secondary-button mt-4" type="button" onClick={onRefine}>{t.identity.editSearch}</button>
            </>
          )}
        </div>
      ) : filteredIdentities.length === 0 ? (
        <div className="mt-6 rounded-md border border-[#e5c69e] bg-[#fff8e9] p-5 text-sm leading-6 text-[#765633]">
          {t.identity.filterNoMatches}
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
          {remainingGroups.map((group, index) => (
            <LazyIdentityGroup
              key={group.setName}
              group={group}
              defaultOpen={index < 2}
              headingId={`identity-set-${index}`}
              onConfirm={onConfirm}
            />
          ))}
          </div>
        </div>
      ) : (
        <div className={identities.length === 1 ? "mx-auto mt-6 max-w-sm" : "mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3"}>
          {filteredIdentities.map((identity) => (
            <IdentityCard key={identity.id} identity={identity} onConfirm={onConfirm} titleAs="h3" />
          ))}
        </div>
      )}
    </section>
  );
}

function LazyIdentityGroup({
  group,
  defaultOpen,
  headingId,
  onConfirm,
}: {
  group: ReturnType<typeof groupIdentitiesBySet>[number];
  defaultOpen: boolean;
  headingId: string;
  onConfirm: (identity: CardIdentityCandidate) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="rounded-lg border border-[#d6ded5] bg-[#fffef9] p-3"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary id={headingId} className="cursor-pointer text-sm font-black uppercase tracking-[0.12em] text-[#52635c]">
        {group.setName}
        <span className="ml-2 font-bold normal-case tracking-normal text-[#8a978f]">{t.identity.versions(group.items.length)}</span>
      </summary>
      {open && (
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {group.items.map((identity) => (
            <IdentityCard key={identity.id} identity={identity} onConfirm={onConfirm} titleAs="h4" />
          ))}
        </div>
      )}
    </details>
  );
}

function IdentityCard({ identity, onConfirm, titleAs, compact = false }: { identity: CardIdentityCandidate; onConfirm: (identity: CardIdentityCandidate) => void; titleAs: "h3" | "h4"; compact?: boolean }) {
  const t = useT();
  const titleClass = "font-serif text-xl font-bold text-[#2f6f73]";
  const titleDetails = [
    identity.cardNumber ? `#${identity.cardNumber}` : null,
    identity.variant,
  ].filter(Boolean).join(" / ");
  return (
    <article className="rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4">
      {identity.imageUrl ? (
        <HoloCardArt
          key={identity.imageUrl}
          src={identity.imageUrl}
          alt={[identity.name, identity.cardNumber, identity.variant, identity.setName].filter(Boolean).join(" · ")}
          sizes={compact ? "112px" : "144px"}
          className={`mx-auto ${compact ? "w-28" : "w-36"}`}
        />
      ) : (
        <div className={`mx-auto aspect-[2.5/3.5] ${compact ? "w-28" : "w-36"} rounded-md bg-[#e7efe8]`} />
      )}
      {titleAs === "h4" ? <h4 className={`${titleClass} mt-4`}>{identity.name}</h4> : <h3 className={`${titleClass} mt-4`}>{identity.name}</h3>}
      {titleDetails && <p className="mt-1 text-sm font-black text-[#24312f]">{titleDetails}</p>}
      {typeof identity.marketMid === "number" && (
        <p className="mt-2 font-mono text-sm font-black text-[#2f6f73]">{t.identity.marketReference(formatMoney(identity.marketMid))}</p>
      )}
      <CardIdentityRail identity={identity} className="mt-3" />
      <button
        className="secondary-button mt-4 w-full"
        type="button"
        aria-label={t.identity.selectAria(identity.name, identity.cardNumber, identity.variant ?? "")}
        onClick={() => onConfirm(identity)}
      >
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
  onCompareSuggestedPrint,
  onRefineSearch,
  onRetrySources,
  onPasteListing,
  snapshot,
  inspectorEnabled,
}: {
  report: ComparisonReport;
  preferredRole: LensRole;
  feedbackSent: boolean;
  onFeedback: (changedDecision: boolean) => void;
  onCompareSuggestedPrint: (cardId: string) => void;
  onRefineSearch: () => void;
  onRetrySources: () => void;
  onPasteListing: () => void;
  snapshot: ResultSnapshot | null;
  inspectorEnabled: boolean;
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
  const rankedChoice = report.rankedChoices.find((choice) => choice.role === selectedRole) ?? null;
  const rankedListing = rankedChoice ? listingMap.get(rankedChoice.listingId) ?? null : null;
  const requestedInspectListing = report.inspectListingId ? listingMap.get(report.inspectListingId) ?? null : null;
  const outcome = report.outcome ?? (rankedListing ? "best_buy" : requestedInspectListing ? "inspect_first" : "next_moves");
  const selectedChoice = outcome === "best_buy" ? rankedChoice : null;
  const selectedListing = outcome === "best_buy" ? rankedListing : null;
  const inspectListing = outcome === "inspect_first" ? requestedInspectListing : null;

  const eligibleCount = eligibleListings.length;
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
  const livePlatforms = report.platforms.filter((platform) => platform.configured && platform.status === "complete");
  const connectedSourceLabels = livePlatforms.map((platform) => platform.marketplace).join(" + ");
  const marketReferenceAvailable = typeof report.confirmedCard?.marketMid === "number";
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
  // The Q&A panel is on-demand: closed (and costing zero attention) until the
  // buyer asks — via the hero's "Why is this the top pick?", a row's Ask link,
  // or the standalone opener under the alternatives fold.
  const [qaOpen, setQaOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<"url" | "text" | null>(null);

  // Fold-rate signals, once per report: a buyer opening Layer-2/3 folds is
  // measurable re-research behavior (see the analytics event union).
  const foldEventsFired = useRef({ reportKey: "", fired: new Set<string>() });
  function trackFoldOpened(event: "alternatives_expanded" | "qa_opened") {
    if (foldEventsFired.current.reportKey !== report.generatedAt) {
      foldEventsFired.current = { reportKey: report.generatedAt, fired: new Set() };
    }
    if (foldEventsFired.current.fired.has(event)) return;
    foldEventsFired.current.fired.add(event);
    trackEvent(event, { demo_mode: report.demoMode });
  }

  function openQaPanel() {
    trackFoldOpened("qa_opened");
    setQaOpen(true);
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById("comparison-qa");
      if (!target) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
      target.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    });
  }

  function closeQaPanel() {
    setQaOpen(false);
    setQaQuestion("");
    setQaAnswer(null);
    setQaError(null);
    setQaTarget(null);
  }
  // Deterministic copy first, always. The AI note (flag-gated, verified
  // server-side against a fact sheet) only replaces the sentence under the
  // action label once it arrives; nothing else in the verdict changes.
  const aiVerdictNote = useAiVerdictNote({
    enabled: AI_VERDICT_NOTE_UI_ENABLED && outcome === "best_buy",
    report,
    role: selectedChoice ? selectedRole : null,
    lang,
  });
  const deterministicVerdictCopy = selectedChoice && selectedListing
    ? buildVerdictCopy({
      listing: selectedListing,
      choice: selectedChoice,
      alternatives: alternativeListings,
      marketPrice: report.demoMode ? null : report.confirmedCard?.marketMid ?? null,
      lang,
    })
    : null;
  const selectedVerdictCopy = deterministicVerdictCopy && aiVerdictNote
    ? { ...deterministicVerdictCopy, action: { ...deterministicVerdictCopy.action, note: aiVerdictNote } }
    : deterministicVerdictCopy;
  const selectedChoiceReason = selectedVerdictCopy
    ? [selectedVerdictCopy.why, selectedVerdictCopy.catch, selectedVerdictCopy.whyNotCheapest ?? selectedVerdictCopy.alternative]
      .filter(Boolean)
      .join(" ")
    : null;

  async function copyComparisonReceipt() {
    if (!selectedListing || !selectedChoice) return;
    const total = selectedListing.estimatedLandedCost ?? selectedListing.preTaxTotal;
    const totalLabel = selectedListing.estimatedTax === null ? t.card.preTaxTotal : t.card.estLanded;
    const receipt = [
      "TCGlens result",
      report.confirmedCard
        ? `${report.confirmedCard.name} · ${report.confirmedCard.setCode} #${report.confirmedCard.cardNumber}`
        : selectedListing.title,
      `${roleToggleLabel(selectedChoice.role, t)}: ${selectedListing.marketplace} · ${t.conditions[selectedListing.claimedCondition]}`,
      `${totalLabel}: ${formatMoney(total)}`,
      `${sellerVerdict(selectedListing, t).label} · ${evidenceVerdict(selectedListing.evidenceCompletenessScore, t).label}`,
      selectedChoiceReason ?? selectedChoice.reason,
      selectedVerdictCopy ? `${t.result.actionLabel}: ${selectedVerdictCopy.action.label} — ${selectedVerdictCopy.action.note}` : "",
      selectedListing.url ? `Listing: ${selectedListing.url}` : "",
      `Generated ${new Date(report.generatedAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")}`,
    ].filter(Boolean).join("\n");
    try {
      const shareUrl = snapshot?.id && snapshot.durable
        ? (() => {
            const url = new URL(`/r/${snapshot.id}`, window.location.origin);
            return url.toString();
          })()
        : null;
      await navigator.clipboard.writeText(shareUrl ?? receipt);
      const shareMethod = shareUrl ? "url" : "text";
      setShareFeedback(shareMethod);
      trackEvent("result_shared", { share_method: shareMethod, result_state: outcome });
      window.setTimeout(() => setShareFeedback(null), 4000);
    } catch {
      setShareFeedback(null);
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
    openQaPanel();
    void askQuestion({ question, targetListing: listing });
  }

  return (
    <section id="comparison-result" tabIndex={-1} className="scroll-mt-24 space-y-4 outline-none">
      {snapshot?.restored && (
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2c879] bg-[#fff8dc] px-4 py-3 text-sm text-[#6f5a22]">
          <p>
            <strong>{t.result.savedSnapshot}{lang === "zh" ? "。" : "."}</strong>{" "}
            {t.result.savedSnapshotBody(new Date(snapshot.savedAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US"))}
          </p>
          <button className="secondary-button" type="button" onClick={onRetrySources}>{t.result.refreshLive}</button>
        </div>
      )}
      {report.demoMode && (
        <div className="flex items-start gap-3 rounded-md border border-[#e2c879] bg-[#fff8dc] p-4 text-sm leading-6 text-[#6f5a22]">
          <IconInfo className="mt-1 h-4 w-4 shrink-0" />
          <p><strong>{t.result.demoTitle}</strong>{t.result.demoBody}</p>
        </div>
      )}

      {report.request.cardHint.game === "onePiece" && <GameBetaNotice />}

      {outcome === "next_moves" && (
        <div className="rounded-xl border border-[#e2c879] bg-[#fff8dc] p-5 text-[#6f5a22]">
          <h3 className="font-serif text-xl font-black">{t.result.nextMovesTitle}</h3>
          <p className="mt-2 text-sm leading-6">{t.result.nextMovesBody}</p>
          {report.abstention?.suggestedCardId && (
            <button
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-[#2f6f73] px-4 text-sm font-black text-[#fcfbf6] transition hover:bg-[#24585c] focus:outline-none focus:ring-2 focus:ring-[#2f6f73]/25"
              type="button"
              onClick={() => onCompareSuggestedPrint(report.abstention!.suggestedCardId!)}
            >
              {t.result.compareSuggestedPrint(lang === "zh" ? t.result.compareSuggestedFallbackLabel : report.abstention.suggestedLabel ?? t.result.compareSuggestedFallbackLabel)}
              <IconArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="secondary-button" type="button" onClick={onRefineSearch}>{t.result.refineSearch}</button>
            <button className="secondary-button" type="button" onClick={onRetrySources}>{t.result.retrySources}</button>
            {PASTE_LISTING_UI_ENABLED && <button className="secondary-button" type="button" onClick={onPasteListing}>{t.result.pasteListing}</button>}
          </div>
        </div>
      )}

      {outcome === "inspect_first" && inspectListing && (
        <InspectFirstHero listing={inspectListing} confirmedCard={report.confirmedCard} />
      )}

      <div className="mx-auto max-w-[860px] space-y-3">
          {selectedListing && selectedChoice && (
            <RecommendedBuyHero
              listing={selectedListing}
              choice={selectedChoice}
              verdict={selectedVerdictCopy ?? buildVerdictCopy({
                listing: selectedListing,
                choice: selectedChoice,
                alternatives: alternativeListings,
                marketPrice: report.demoMode ? null : report.confirmedCard?.marketMid ?? null,
                lang,
              })}
              confirmedCard={report.confirmedCard}
              marketPrice={report.demoMode ? null : report.confirmedCard?.marketMid ?? null}
              demoMode={report.demoMode}
              onAsk={askAboutListing}
              shareFeedback={shareFeedback}
              shareReady={Boolean(snapshot?.id && snapshot.durable)}
              onShare={() => void copyComparisonReceipt()}
            />
          )}

          {outcome === "best_buy" && report.rankedChoices.length > 0 && (
            <LensControls
              choices={report.rankedChoices}
              selectedRole={selectedRole}
              onSelect={(role) => {
                setRoleOverride(role);
                closeQaPanel();
                trackEvent("lens_selected", { choice_role: role });
              }}
            />
          )}

          {outcome === "best_buy" && alternativeListings.length > 0 && (
            <details
              className="rounded-xl border border-[#d6ded5] bg-[#fcfbf6]"
              open={!selectedListing}
              onToggle={(event) => {
                if ((event.target as HTMLDetailsElement).open) trackFoldOpened("alternatives_expanded");
              }}
            >
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-black text-[#2f6f73] transition hover:text-[#24585c]">
                {t.result.compareOthers(alternativeListings.length)}
                <IconChevronDown className="h-4 w-4 shrink-0" />
              </summary>
              <div className="overflow-hidden border-t border-[#d6ded5]">
                {alternativeListings.map((listing) => (
                  <CompactCandidateRow
                    key={listing.id}
                    listing={listing}
                    confirmedCard={report.confirmedCard}
                    marketPrice={report.demoMode ? null : report.confirmedCard?.marketMid ?? null}
                    demoMode={report.demoMode}
                    onAsk={askAboutListing}
                  />
                ))}
              </div>
            </details>
          )}

          {qaOpen ? (
            <div id="comparison-qa" tabIndex={-1} className="scroll-mt-24 outline-none">
              <ComparisonQuestionBox
                question={qaQuestion}
                answer={qaAnswer}
                error={qaError}
                loading={qaLoading}
                targetLabel={qaTarget?.label ?? null}
                onQuestionChange={setQaQuestion}
                onAsk={askQuestion}
                onClose={closeQaPanel}
              />
            </div>
          ) : (
            <button
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#c9d7ce] px-3 py-3 text-sm font-black text-[#2f6f73] transition hover:border-[#2f6f73] hover:bg-[#e7efe8]"
              type="button"
              onClick={() => openQaPanel()}
            >
              <IconInfo className="h-4 w-4" />
              {t.result.askTitle}
            </button>
          )}

          <BuyerSourceNotice report={report} hasComparableListings={eligibleCount > 0} />

          <OtherMarketplaces report={report} />

          <DecisionReceipt
            card={report.confirmedCard}
            generatedAt={report.generatedAt}
            listedRange={listedRange}
            liveSources={connectedSourceLabels}
            hasMarketReference={marketReferenceAvailable}
            observedTime={observedTime}
            excluded={excluded}
            cautions={report.narrative.cautions}
          />

          {inspectorEnabled && <DevelopmentInspector report={report} selectedListing={selectedListing} />}

          {/* Pilot signal: one quiet row, always visible (never folded) so
              decision_feedback_submitted keeps flowing without shouting. */}
          <section id="feedback" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d6ded5] bg-[#fcfbf6] px-4 py-3">
            <h3 className="text-sm font-bold text-[#52635c]">{t.result.feedbackQuestion}</h3>
            {feedbackSent ? (
              <p className="inline-flex items-center gap-2 text-sm font-bold text-[#2f6f73]">
                <IconCheck className="h-4 w-4" />
                {t.result.feedbackSaved}
              </p>
            ) : (
              <div className="flex gap-2">
                <button className="secondary-button min-h-9 px-3 py-1.5 text-xs" type="button" onClick={() => onFeedback(true)}>{t.result.yes}</button>
                <button className="secondary-button min-h-9 px-3 py-1.5 text-xs" type="button" onClick={() => onFeedback(false)}>{t.result.notYet}</button>
              </div>
            )}
          </section>
      </div>
    </section>
  );
}

function InspectFirstHero({ listing, confirmedCard }: { listing: NormalizedListing; confirmedCard: CardIdentityCandidate | null }) {
  const t = useT();
  return (
    <article className="mx-auto max-w-[860px] rounded-xl border-2 border-[#d7a84e] bg-[#fffaf0] p-4 shadow-[0_4px_8px_rgba(36,49,47,0.06)] sm:p-5">
      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center">
        <div>
          <ListingPhoto listing={listing} />
        </div>
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.08em] text-[#8d6032]">{t.result.inspectFirstTitle}</h2>
          <h3 className="mt-2 font-serif text-xl font-black text-[#24312f]">{listing.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#64736c]">{t.result.inspectFirstBody}</p>
          <PrintIdentitySummary listing={listing} confirmedCard={confirmedCard} />
        </div>
        <div className="col-span-2 sm:col-span-1 sm:text-right">
          <p className="font-mono text-2xl font-black text-[#24312f]">{formatMoney(listing.estimatedLandedCost ?? listing.preTaxTotal)}</p>
          {listing.url && (
            <a className="secondary-button mt-3 inline-flex" href={listing.url} target="_blank" rel="noreferrer">
              {t.result.inspectListing}
              <IconArrowUpRight className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </article>
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
  onClose,
}: {
  question: string;
  answer: ComparisonQuestionResponse | null;
  error: string | null;
  loading: boolean;
  targetLabel: string | null;
  onQuestionChange: (value: string) => void;
  onAsk: () => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <section className="rounded-xl border border-[#d6ded5] bg-[#fcfbf6] p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-black text-[#24312f]">{t.result.askTitle}</h3>
        <button
          className="inline-flex min-h-8 items-center rounded-md px-2 text-xs font-bold text-[#64736c] transition hover:bg-[#e7efe8] hover:text-[#24312f] focus:outline-none focus:ring-2 focus:ring-[#2f6f73]/25"
          type="button"
          onClick={onClose}
        >
          {t.result.askClose}
        </button>
      </div>
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

function roleToggleHint(role: RankedChoice["role"], t: Dict) {
  switch (role) {
    case "best_value": return t.lens.bestValueHint;
    case "lowest_landed_cost": return t.lens.cheapestHint;
    case "safest_listing": return t.lens.safestHint;
    case "best_condition_evidence": return t.lens.bestDocumentedHint;
  }
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
          ? t.card.mathVs(formatMoney(listing.price), formatMoney(anchor))
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
  const t = useT();
  const [failed, setFailed] = useState(false);
  const imageSrc = cardImageSource(src) ?? src;
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
      {failed ? (
        <div className="absolute inset-0 grid place-items-center bg-[#e7efe8] p-3 text-center text-xs font-black text-[#64736c]">
          {t.identity.imageUnavailable}
        </div>
      ) : (
        <Image src={imageSrc} alt={alt} fill className="holo-card-image" sizes={sizes} onError={() => setFailed(true)} />
      )}
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

function formatObservedAt(value: string, lang: Lang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MarketplaceBrand({ marketplace }: { marketplace: Marketplace }) {
  const t = useT();
  const assetIncludesName = marketplace === "eBay" || marketplace === "TCGplayer" || marketplace === "SNKRDUNK";
  const asset = marketplace === "eBay"
    ? { src: "/marketplace-ebay.png", width: 55, height: 23 }
    : marketplace === "TCGplayer"
      ? { src: "/marketplace-tcgplayer.svg", width: 92, height: 28 }
      : marketplace === "Mercari"
        ? { src: "/marketplace-mercari.png", width: 28, height: 28 }
        : marketplace === "SNKRDUNK"
          ? { src: "/marketplace-snkrdunk.png", width: 116, height: 18 }
          : null;

  return (
    <span className="inline-flex min-h-6 items-center gap-2 font-black text-[#24312f]">
      {asset && <Image src={asset.src} alt="" width={asset.width} height={asset.height} className="max-h-6 w-auto object-contain" />}
      <span className={assetIncludesName ? "sr-only" : undefined}>{t.marketplaces[marketplace] ?? marketplace}</span>
    </span>
  );
}

function GameBetaNotice() {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-2 rounded-md border border-[#e2c879] bg-[#fff8dc] px-4 py-2 text-xs font-semibold text-[#6f5a22]">
      <strong>{t.form.onePieceBetaLabel}</strong>
      <span>{t.form.onePieceBetaNote}</span>
    </div>
  );
}

function BuyerSourceNotice({ report, hasComparableListings }: { report: ComparisonReport; hasComparableListings: boolean }) {
  const t = useT();
  const messages = report.platforms
    .filter((platform) => platform.configured && platform.status === "fallback")
    .map((platform) => platform.marketplace === "eBay"
      ? t.result.ebayUnavailable
      : t.result.marketplaceUnavailable(platform.marketplace));
  const ebay = report.platforms.find((platform) => platform.id === "ebay");
  if (!hasComparableListings && ebay?.status === "complete") messages.push(t.result.ebayNoComparable);
  if (messages.length === 0) return null;

  return (
    <div className="rounded-xl border border-[#e2c879] bg-[#fff8dc] px-4 py-3 text-sm leading-6 text-[#6f5a22]">
      {Array.from(new Set(messages)).map((message) => <p key={message}>{message}</p>)}
    </div>
  );
}

function OtherMarketplaces({ report }: { report: ComparisonReport }) {
  const t = useT();
  const card = report.confirmedCard;
  if (!card) return null;
  const query = [card.name, card.cardNumber, card.variant, card.setName].filter(Boolean).join(" ");
  const tcgplayerUrl = card.tcgplayerProductId && card.marketUrl ? card.marketUrl : null;
  const rows = [
    {
      marketplace: "TCGplayer" as const,
      label: t.result.marketReferenceLabel,
      detail: typeof card.marketMid === "number"
        ? `${formatMoney(card.marketMid)} · ${marketFreshnessText(card, report.generatedAt, t)}`
        : t.result.marketReferenceUnavailable,
      note: t.result.aggregateReferenceOnly,
      url: tcgplayerUrl,
    },
    {
      marketplace: "Mercari" as const,
      label: t.result.manualCheck,
      detail: t.result.notChecked,
      note: t.result.mercariManualNote,
      url: `https://www.mercari.com/search/?keyword=${encodeURIComponent(query)}`,
    },
    {
      marketplace: "SNKRDUNK" as const,
      label: t.result.japanManualCheck,
      detail: t.result.notChecked,
      note: t.result.snkrdunkManualNote,
      url: `https://snkrdunk.com/search?keyword=${encodeURIComponent(query)}`,
    },
  ];

  return (
    <section className="rounded-xl border border-[#d6ded5] bg-[#fcfbf6]" aria-label={t.result.otherMarketplacesTitle}>
      <div className="border-b border-[#d6ded5] px-4 py-3">
        <h3 className="font-serif text-lg font-black text-[#24312f]">{t.result.otherMarketplacesTitle}</h3>
      </div>
      <div className="divide-y divide-[#e4ebe3]">
        {rows.map((row) => (
          <div key={row.marketplace} className="grid gap-3 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center">
            <MarketplaceBrand marketplace={row.marketplace} />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.08em] text-[#64736c]">{row.label}</p>
              <p className="mt-0.5 text-sm font-bold text-[#24312f]">{row.detail}</p>
              <p className="mt-0.5 text-xs leading-5 text-[#7a8982]">{row.note}</p>
            </div>
            {row.url ? (
              <a
                className="secondary-button min-h-10 justify-center px-3 py-2 text-xs"
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("other_marketplace_clicked", {
                  marketplace: row.marketplace,
                  game: report.request.cardHint.game,
                })}
              >
                {t.result.openMarketplace(row.marketplace)}
                <IconExternal className="h-3.5 w-3.5" />
              </a>
            ) : <span className="text-xs font-bold text-[#7a8982]">{t.result.noExactLink}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function marketFreshnessText(card: CardIdentityCandidate, generatedAt: string, t: Dict) {
  if (!card.marketAsOf) return t.result.marketCatalogApprox;
  const asOf = new Date(card.marketAsOf);
  if (Number.isNaN(asOf.getTime())) return t.result.marketCatalogApprox;
  const label = asOf.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const stale = new Date(generatedAt).getTime() - asOf.getTime() > 48 * 60 * 60 * 1000;
  return `${t.result.marketAsOf(label)}${stale ? ` · ${t.result.marketStale}` : ""}`;
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
  const read = deriveMarketRead(listing, marketPrice);
  if (!read) {
    // A missing catalog crosswalk is a real source state, not a zero delta. Keep
    // it visible beside the price so the buyer knows why no under/above read is
    // present and can distinguish it from a bug or a hidden calculation.
    if (marketPrice === null && !listing.demo && listing.costComplete) {
      return (
        <span className="inline-flex items-center rounded-md border border-[#d6ded5] bg-[#f7f9f5] px-2.5 py-1 text-sm font-black text-[#64736c]">
          {t.card.marketReferenceUnavailable}
        </span>
      );
    }
    return null;
  }
  const { delta: marketDelta, conditionMatched } = read;
  const nearMarket = Math.abs(marketDelta) < 0.005;
  const pct = Math.max(1, Math.round(Math.abs(marketDelta) * 100));
  // A played copy is compared against a condition-blind (effectively NM) anchor,
  // so the number is a reference point rather than a bargain verdict: it says so
  // in the label, carries the caveat in its title, and stays visually neutral
  // instead of borrowing the green "under market" tone that reads as a deal.
  const label = conditionMatched
    ? nearMarket ? t.card.nearMarket : marketDelta < 0 ? t.card.underMarket(pct) : t.card.aboveMarket(pct)
    : nearMarket ? t.card.nearNmReference : marketDelta < 0 ? t.card.underNmReference(pct) : t.card.aboveNmReference(pct);
  const prefix = nearMarket ? "≈" : marketDelta < 0 ? "▼" : "▲";
  const neutral = nearMarket || !conditionMatched;
  const tone = neutral
    ? "border-[#d6ded5] bg-[#f7f9f5] text-[#64736c]"
    : marketDelta < 0
      ? "border-[#c9d7ce] bg-[#dcecdf] text-[#2f6f73]"
      : "border-[#e5b8a3] bg-[#fcefe8] text-[#9a4a2c]";
  const title = conditionMatched ? undefined : t.card.nmReferenceHint;

  if (compact) {
    return (
      <span
        title={title}
        className={`text-xs font-black ${neutral ? "text-[#64736c]" : marketDelta < 0 ? "text-[#2f6f73]" : "text-[#9a4a2c]"}`}
      >
        {prefix} {label}
      </span>
    );
  }

  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-black ${tone}`}>
      {prefix} {label}
    </span>
  );
}

// Compact segmented control: label-only pills, one row, hints on hover/focus
// via title. The full lens descriptions live at the settings stage; the result
// page keeps lenses one tap away without a panel competing with the verdict.
function LensControls({
  choices,
  selectedRole,
  onSelect,
}: {
  choices: RankedChoice[];
  selectedRole: RankedChoice["role"] | null;
  onSelect: (role: RankedChoice["role"]) => void;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={t.result.optimizeInsteadFor} className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-black uppercase tracking-[0.08em] text-[#64736c]">{t.result.optimizeInsteadFor}</span>
      {choices.map((choice) => {
        const active = choice.role === selectedRole;
        return (
          <button
            key={choice.role}
            type="button"
            onClick={() => onSelect(choice.role)}
            aria-pressed={active}
            title={roleToggleHint(choice.role, t)}
            className={`min-h-10 rounded-full border px-3.5 py-1.5 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-[#2f6f73]/25 ${
              active
                ? "border-[#2f6f73] bg-[#2f6f73] text-[#fcfbf6]"
                : "border-[#d6ded5] bg-[#fcfbf6] text-[#52635c] hover:border-[#9fb3a8] hover:bg-[#e7efe8] hover:text-[#2f6f73]"
            }`}
          >
            {roleToggleLabel(choice.role, t)}
          </button>
        );
      })}
    </div>
  );
}

function RecommendedBuyHero({
  listing,
  choice,
  verdict,
  confirmedCard,
  marketPrice,
  demoMode,
  onAsk,
  shareFeedback,
  shareReady,
  onShare,
}: {
  listing: NormalizedListing;
  choice: RankedChoice;
  verdict: VerdictCopy;
  confirmedCard: CardIdentityCandidate | null;
  marketPrice: number | null;
  demoMode: boolean;
  onAsk: (listing: NormalizedListing) => void;
  shareFeedback: "url" | "text" | null;
  shareReady: boolean;
  onShare: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const total = listing.estimatedLandedCost ?? listing.preTaxTotal;
  const totalLabel = listing.shipping === null
    ? t.card.estBeforeShipping
    : listing.estimatedTax === null ? t.card.preTaxTotal : t.card.estLanded;

  return (
    <article
      aria-live="polite"
      aria-label={t.result.bestSupportedBuy}
      className="rounded-xl border-2 border-[#2f6f73] bg-[#fcfbf6] p-4 shadow-[0_4px_8px_rgba(36,49,47,0.08)] sm:p-5"
      title={`${verdict.why} ${verdict.catch}`}
    >
      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 sm:grid-cols-[72px_minmax(0,1fr)] lg:grid-cols-[72px_minmax(0,1fr)_auto] lg:items-center">
        <div>
          <ListingPhoto listing={listing} />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[#2f6f73] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#fcfbf6]">
              {t.result.ourPick}
            </span>
            <span className="rounded-md border border-[#c9d7ce] bg-[#e7efe8] px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#2f6f73]">
              {roleToggleLabel(choice.role, t)}
            </span>
            {listing.demo && <span className="rounded border border-[#e2c879] bg-[#fff8dc] px-1.5 py-0.5 text-[10px] font-black uppercase text-[#6f5a22]">{t.candidate.demo}</span>}
            {listing.userSupplied && <span className="rounded border border-[#c9d7ce] bg-[#f7f9f5] px-1.5 py-0.5 text-[10px] font-bold text-[#52635c]">{t.card.userAdded}</span>}
            {listing.webDiscovered && <span className="rounded border border-[#e2c879] bg-[#fff8dc] px-1.5 py-0.5 text-[10px] font-bold text-[#6f5a22]">{t.card.webDiscovered}</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-[#64736c]">
            <MarketplaceBrand marketplace={listing.marketplace} />
            {listing.marketplace === "eBay" && !listing.userSupplied && !listing.demo && <span>{t.result.liveEbayListing}</span>}
            <span>{t.candidate.observed(formatObservedAt(listing.observedAt, lang))}</span>
          </div>
          <h2 className="mt-2 font-serif text-xl font-bold leading-tight text-[#24312f] sm:text-2xl">
            {listing.title}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#52635c]">
            {t.result.sellerClaimedCondition(t.conditions[listing.claimedCondition])}
          </p>
          <p className="mt-1 text-xs font-black text-[#2f6f73]">{t.result.confidenceLabel(choice.confidence)}</p>
          <PrintIdentitySummary listing={listing} confirmedCard={confirmedCard} />
        </div>

        <div className="col-span-2 grid gap-3 sm:col-span-1 sm:col-start-2 lg:col-start-auto lg:min-w-[178px] lg:justify-items-end lg:text-right">
          <div>
            <p className="font-mono text-3xl font-black leading-none text-[#24312f]">{formatMoney(total)}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#7a8982]">{totalLabel}</p>
            <p className="mt-2 max-w-[230px] text-xs font-semibold leading-5 text-[#64736c] lg:text-right">
              {t.result.priceFacts(
                formatMoney(listing.price),
                listing.shipping === null ? t.card.shippingUnknown : listing.shipping === 0 ? t.card.freeShipping : formatMoney(listing.shipping),
                listing.estimatedTax === null ? null : formatMoney(listing.estimatedTax),
              )}
            </p>
          </div>
          <MarketDeltaBadge listing={listing} marketPrice={marketPrice} />
        </div>
      </div>

      <div className="mt-4 border-t border-[#e4ebe3] pt-4">
        <p
          className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border px-3 py-2.5 text-sm leading-6 ${
            verdict.action.kind === "buy"
              ? "border-[#c9d7ce] bg-[#e7efe8] text-[#24585c]"
              : verdict.action.kind === "wait"
                ? "border-[#e2c879] bg-[#fff8dc] text-[#6f5a22]"
                : "border-[#dcb9a4] bg-[#f9efe7] text-[#9a4a2c]"
          }`}
        >
          <span className="text-xs font-black uppercase tracking-[0.08em]">{t.result.actionLabel}</span>
          <strong className="font-black">{verdict.action.label}</strong>
          <span className="basis-full font-semibold sm:basis-auto">{verdict.action.note}</span>
        </p>
        <div className="mt-3 space-y-2 text-sm leading-6 text-[#52635c]">
          <p>
            <span className="mr-2 text-xs font-black uppercase tracking-[0.08em] text-[#2f6f73]">{t.result.whyItStandsOut}</span>
            {verdict.why}
          </p>
          <p className="border-l-2 border-[#d8a03a] pl-3">
            <span className="mr-2 text-xs font-black uppercase tracking-[0.08em] text-[#8d6032]">{t.result.whatToKnow}</span>
            {verdict.catch}
          </p>
          <p className="border-t border-[#e4ebe3] pt-2 text-xs leading-5 text-[#64736c]">
            <span className="mr-2 font-black uppercase tracking-[0.08em]">
              {verdict.whyNotCheapest ? t.result.whyNotCheapest : t.result.nextBestOption}
            </span>
            {verdict.whyNotCheapest ?? verdict.alternative ?? t.result.noAlternative}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap gap-2">
            <button className="secondary-button min-h-10 px-3 py-2 text-xs" type="button" onClick={onShare}>
              <IconReceipt className="h-4 w-4" />
              {t.result.shareResult}
            </button>
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
        {shareFeedback && (
          <p aria-live="polite" className="mt-2 text-right text-xs font-bold text-[#2f6f73]">
            {shareFeedback === "url" && shareReady ? t.result.shareUrlCopied : t.result.shareTextCopied}
          </p>
        )}
      </div>
    </article>
  );
}

export function PrintIdentitySummary({
  listing,
  confirmedCard,
  compact = false,
}: {
  listing: NormalizedListing;
  confirmedCard: CardIdentityCandidate | null;
  compact?: boolean;
}) {
  const t = useT();
  if (!confirmedCard) return null;

  const identity = confirmedCard.printIdentity;
  const metadata = t.result.exactPrintMeta(
    identity?.setName ?? confirmedCard.setName,
    identity?.collectorNumber ?? confirmedCard.cardNumber,
    identity?.rarity ?? confirmedCard.rarity ?? "",
    identity?.variantLabel ?? confirmedCard.variant ?? "",
  );
  const reasons = listing.printMatchReasons ?? [];
  const genericCompactEvidence = compact
    && reasons.length > 0
    && reasons.every((reason) => reason === "pokemon_full_number_and_name_match" || reason === "pokemon_full_number_and_set_match");

  if (genericCompactEvidence) {
    const accessibleLabel = `${t.result.exactPrintDetails}: ${metadata}`;
    return (
      <span
        className="mt-1.5 inline-flex items-center rounded border border-[#c9d7ce] bg-[#f7f9f5] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#2f6f73] focus:outline-none focus:ring-2 focus:ring-[#2f6f73]/25"
        aria-label={accessibleLabel}
        title={accessibleLabel}
        tabIndex={0}
      >
        ✓ {t.result.printConfirmedShort}
      </span>
    );
  }

  return (
    <div className={`${compact ? "mt-1.5" : "mt-3"} rounded-md border border-[#d6ded5] bg-[#f7f9f5] px-3 py-2 text-xs leading-5 text-[#52635c]`}>
      <p>
        <span className="font-black text-[#24312f]">{t.result.exactPrintDetails}:</span>{" "}
        {metadata}
      </p>
      {reasons.length > 0 && (
        <ul aria-label={t.result.printCheck} className="mt-1 list-disc pl-4">
          {reasons.map((reason) => <li key={reason}>{t.result.printReason(reason)}</li>)}
        </ul>
      )}
    </div>
  );
}

function DecisionReceipt({
  card,
  generatedAt,
  listedRange,
  liveSources,
  hasMarketReference,
  observedTime,
  excluded,
  cautions,
}: {
  card: CardIdentityCandidate | null;
  generatedAt: string;
  listedRange: string;
  liveSources: string;
  hasMarketReference: boolean;
  observedTime: string;
  excluded: NormalizedListing[];
  cautions: string[];
}) {
  const t = useT();
  const { lang } = useLang();
  // Folded by default: the closed summary still carries the guardrail facts
  // (sources · market + freshness · exclusions · observed time) in one line.
  const summaryLine = buildReceiptSummaryLine({
    liveSources,
    marketMid: card?.marketMid ?? null,
    marketAsOf: card?.marketAsOf ?? null,
    observedTime,
    lang,
  });
  return (
    <details className="rounded-xl border border-[#d6ded5] bg-[#fcfbf6]" aria-label={t.result.decisionReceipt}>
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#52635c]" title={summaryLine}>{summaryLine}</span>
        <IconChevronDown className="h-4 w-4 shrink-0 text-[#64736c]" />
      </summary>

      <div className="px-4 pb-4 sm:px-5">
      <h3 className="font-serif text-lg font-black text-[#24312f]">{t.result.decisionReceipt}</h3>

      <div className="mt-3 grid gap-2">
        <MarketReferenceLine card={card} generatedAt={generatedAt} listedRange={listedRange} />
        <SourceStatusLine
          liveSources={liveSources}
          hasMarketReference={hasMarketReference}
          observedTime={observedTime}
        />
      </div>

      {cautions.length > 0 && (
        <div className="mt-4 rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4">
          <h4 className="text-sm font-black text-[#24312f]">{t.result.beforeYouBuy}</h4>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[#52635c]">
            {cautions.map((caution) => (
              <li key={caution} className="flex gap-2">
                <IconCaution className="mt-1 h-4 w-4 shrink-0 text-[#8d6032]" />
                <span>{lang === "en" ? caution : localizedCaution(caution, t)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {excluded.length > 0 && (
        <details className="mt-3 rounded-md border border-[#d6ded5] bg-[#f7f9f5] p-4">
          <summary className="cursor-pointer text-sm font-bold text-[#64736c]">{t.result.importantExclusions}</summary>
          <div className="mt-3 space-y-2 text-sm leading-6 text-[#64736c]">
            {excluded.map((listing) => (
              <p key={listing.id}>
                <span className="font-black uppercase tracking-[0.04em] text-[#9a4a2c]">{t.result.tooRiskySkip}</span>
                {": "}
                <strong>{listing.title}</strong>: {listing.eligibilityIssues
                  .filter((issue) => issue.disposition === "exclude")
                  .map((issue) => localizeEligibilityIssue(issue.code, issue.message, lang))
                  .join(" ") || listing.exclusionReasons.join(" ")}
              </p>
            ))}
          </div>
        </details>
      )}
      </div>
    </details>
  );
}

function localizeEligibilityIssue(code: string, fallback: string, lang: Lang) {
  if (lang === "en") return fallback;
  const messages: Record<string, string> = {
    not_raw_single: "这不是裸卡。",
    excluded_product_type: "标题显示这是评级卡、卡组、原盒或定制品，不在支持范围里。",
    condition_unstated: "卖家没写品相，达不到你设的最低品相。",
    condition_below_requested: "卖家标注的品相低于你设的最低品相。",
    title_condition_below_requested: "标题里写了更低的品相；给出区间时按差的那一端算。",
    unsupported_currency: "这条不是美元计价。",
    shipping_unknown: "运费未知，结账总价没法安全比较。",
    listing_inactive: "这条目前不在售。",
    price_far_below_market: "价格远低于市场参考价，可能是复制品、定制品，或者标错了。",
    language_conflict: "商品写明的语言和已确认卡片对不上。",
    identity_sibling_mismatch: "证据指向同卡号的另一种卡图。",
    identity_unverified: "商品文字还证明不了是已确认卡图，先核对一下。",
    identity_price_guard: "价格远低于确切版本参考价，商品也没证明是所选卡图。",
    identity_variant_mismatch: "商品写的是另一个版本。",
    identity_low_confidence: "卡片或版本的匹配把握太低。",
  };
  return messages[code] ?? fallback;
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
  observedTime,
}: {
  liveSources: string;
  hasMarketReference: boolean;
  observedTime: string;
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
      </p>
    </div>
  );
}

// Compact alternative row: the decision layer stays singular, so the ledger
// inside the fold shows just enough to compare — title, condition,
// photos, total, vs-market — with view/ask one tap away.
function CompactCandidateRow({
  listing,
  confirmedCard,
  marketPrice,
  demoMode,
  onAsk,
}: {
  listing: NormalizedListing;
  confirmedCard: CardIdentityCandidate | null;
  marketPrice: number | null;
  demoMode: boolean;
  onAsk: (listing: NormalizedListing) => void;
}) {
  const t = useT();
  const total = listing.estimatedLandedCost ?? listing.preTaxTotal;
  const totalLabel = listing.shipping === null
    ? t.card.estBeforeShipping
    : listing.estimatedTax === null ? t.card.preTaxTotal : t.card.estLanded;

  return (
    <article className="border-b border-[#d6ded5] px-4 py-2 transition-colors last:border-b-0 hover:bg-[#f7f9f5]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="shrink-0">
          <ListingPhoto listing={listing} />
        </div>
        <div className="min-w-0 flex-1 basis-52">
          <div className="flex min-w-0 items-start gap-2">
            {listing.demo && <span className="shrink-0 rounded border border-[#e2c879] bg-[#fff8dc] px-1.5 py-0.5 text-[10px] font-black uppercase text-[#6f5a22]">{t.candidate.demo}</span>}
            {listing.userSupplied && <span className="shrink-0 rounded border border-[#c9d7ce] bg-[#f7f9f5] px-1.5 py-0.5 text-[10px] font-bold text-[#52635c]">{t.card.userAdded}</span>}
            {listing.webDiscovered && <span className="shrink-0 rounded border border-[#e2c879] bg-[#fff8dc] px-1.5 py-0.5 text-[10px] font-bold text-[#6f5a22]">{t.card.webDiscovered}</span>}
            <h3 className="min-w-0 break-words text-sm font-bold leading-snug text-[#24312f]">{listing.title}</h3>
          </div>
          <p className="mt-0.5 truncate text-xs font-semibold leading-5 text-[#64736c]">
            {t.conditions[listing.claimedCondition]} · {t.card.photos(listing.evidence.photoCount)}
            {" · "}
            <button
              aria-label={t.candidate.askAbout(listing.title)}
              className="inline-flex min-h-11 items-center underline decoration-[#9fb3a8] underline-offset-2 hover:text-[#2f6f73]"
              type="button"
              onClick={() => onAsk(listing)}
            >
              {t.candidate.askListing}
            </button>
          </p>
          <PrintIdentitySummary listing={listing} confirmedCard={confirmedCard} compact />
        </div>
        <div className="text-right">
          <p className="font-mono text-base font-black leading-tight text-[#24312f]">{formatMoney(total)}</p>
          <p className="text-[10px] font-black uppercase tracking-[0.06em] text-[#7a8982]">{totalLabel}</p>
        </div>
        <MarketDeltaBadge listing={listing} marketPrice={marketPrice} compact />
        {listing.url ? (
          <a
            className="inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#c9d7ce] px-3 text-xs font-black text-[#2f6f73] transition hover:border-[#2f6f73] hover:bg-[#e7efe8] focus:outline-none focus:ring-2 focus:ring-[#2f6f73]/25"
            href={listing.url}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackEvent("choice_opened", { choice_role: "candidate", marketplace: listing.marketplace, demo_mode: demoMode })}
          >
            {t.card.viewListing} <IconArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span className="text-xs font-bold text-[#7a8982]">{t.card.userSupplied}</span>
        )}
      </div>
    </article>
  );
}

function DevelopmentInspector({
  report,
  selectedListing,
}: {
  report: ComparisonReport;
  selectedListing: NormalizedListing | null;
}) {
  const eligible = report.candidates.filter((candidate) => candidate.eligible);
  const excluded = report.candidates.filter((candidate) => !candidate.eligible);
  const queried = report.platforms.reduce((total, platform) => total + platform.count, 0);
  const diagnostic = useMemo(() => sanitizeDiagnosticReport(report), [report]);

  function downloadDiagnostic() {
    const blob = new Blob([JSON.stringify(diagnostic, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `tcglens-diagnostic-${report.generatedAt.replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
    <section className="rounded-xl border-2 border-dashed border-[#8d6032] bg-[#fffaf0] p-5" role="region" aria-label="Development inspector">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.1em] text-[#8d6032]">Development only</p>
          <h3 className="mt-1 font-serif text-xl font-black text-[#24312f]">Result inspector</h3>
        </div>
        <button className="secondary-button min-h-10 px-3 py-2 text-xs" type="button" onClick={downloadDiagnostic}>
          <IconReceipt className="h-4 w-4" />
          Download diagnostic JSON
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["Queried", queried],
          ["Eligible", eligible.length],
          ["Excluded", excluded.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-3">
            <p className="font-mono text-xl font-black text-[#24312f]">{value}</p>
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#64736c]">{label}</p>
          </div>
        ))}
      </div>

      {selectedListing && (
        <div className="mt-5">
          <p className="text-sm font-black text-[#24312f]">Ranking breakdown</p>
          <p className="mt-1 text-xs text-[#64736c]"><ListingMetaLine listing={selectedListing} /></p>
          <VerdictMath listing={selectedListing} marketPrice={report.demoMode ? null : report.confirmedCard?.marketMid ?? null} />
        </div>
      )}

      {report.platforms.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-black text-[#24312f]">Provider status and source mode</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {report.platforms.map((platform) => (
              <div key={platform.id} className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-3 text-sm">
                <p className="font-black text-[#24312f]">{platform.label}</p>
                <p className="mt-1 text-[#64736c]">{platform.status} · <span>{platform.sourceMode}</span></p>
                <p className="mt-1">{platform.count} · {platform.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.references.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-black text-[#24312f]">Reference diagnostics</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {report.references.map((reference) => (
              <div key={reference.label} className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-black text-[#24312f]">{reference.label}</p>
                  <StatusPill status={reference.status} />
                </div>
                <p className="mt-1 text-[#64736c]">{reference.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {excluded.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-black text-[#24312f]">Exclusions</p>
          <ul className="mt-2 space-y-2 text-sm text-[#64736c]">
            {excluded.map((listing) => <li key={listing.id}><strong>{listing.title}</strong>: {listing.exclusionReasons.join(" ")}</li>)}
          </ul>
        </div>
      )}

      {report.warnings.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-black text-[#24312f]">Raw warnings</p>
          {report.warnings.map((warning) => <p key={warning} className="mt-1 text-sm text-[#64736c]">{warning}</p>)}
        </div>
      )}

      {report.trace.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-black text-[#24312f]">Validation trace</p>
          <div className="mt-2 space-y-2">
            {report.trace.map((step) => (
              <div key={`${step.step}-${step.actor}`} className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-3 text-sm">
                <p className="font-black text-[#24312f]">{step.step} · {step.actor} · {step.status}</p>
                <p className="mt-1 text-[#64736c]">{step.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="mt-5 rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-3">
        <summary className="cursor-pointer text-sm font-black text-[#24312f]">Sanitized payload preview</summary>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-[#52635c]">{JSON.stringify(diagnostic, null, 2)}</pre>
      </details>
    </section>
  );
}

function sanitizeDiagnosticReport(report: ComparisonReport) {
  return {
    generatedAt: report.generatedAt,
    status: report.status,
    outcome: report.outcome,
    demoMode: report.demoMode,
    request: {
      query: report.request.query,
      cardHint: report.request.cardHint,
      confirmedCardId: report.request.confirmedCardId,
      desiredCondition: report.request.buyer.desiredCondition,
      webDiscoveryMode: report.request.webDiscoveryMode,
    },
    confirmedCard: report.confirmedCard,
    platforms: report.platforms,
    references: report.references.map((reference) => ({ ...reference, url: null })),
    rankedChoices: report.rankedChoices,
    candidates: report.candidates.map((candidate) => ({
      id: candidate.id,
      marketplace: candidate.marketplace,
      title: candidate.title,
      eligible: candidate.eligible,
      matchConfidence: candidate.matchConfidence,
      printMatch: candidate.printMatch,
      costComplete: candidate.costComplete,
      sellerTrustScore: candidate.sellerTrustScore,
      evidenceCompletenessScore: candidate.evidenceCompletenessScore,
      conditionCompatibilityScore: candidate.conditionCompatibilityScore,
      priceScore: candidate.priceScore,
      safetyScore: candidate.safetyScore,
      valueScore: candidate.valueScore,
      eligibilityIssues: candidate.eligibilityIssues,
      exclusionReasons: candidate.exclusionReasons,
    })),
    abstention: report.abstention,
    warnings: report.warnings,
    trace: report.trace,
  };
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

function hasListingSubmission(request: ComparisonRequest) {
  const source = request.sourceListing;
  return Boolean(
    source.url?.trim()
    || source.title.trim()
    || source.description.trim()
    || source.price !== null
    || request.manualCandidates.length > 0
  );
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
