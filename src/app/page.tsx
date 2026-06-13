"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  Calculator,
  Check,
  ClipboardList,
  Clock3,
  ExternalLink,
  Layers3,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogIn,
  ShoppingBag,
  Save,
  SearchCheck,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  getJournalBasedRecommendations,
  pokemonCardToRecommendation,
  toListingRiskInput,
  toRawVsSlabInput,
  type CuratedCardRecommendation,
  type JournalBasedRecommendation,
} from "@/lib/curated-recommendations";
import { getTodayRemaining, getTodaySpent } from "@/lib/budget-ledger";
import { getGradingCalibration, type GradingCalibration } from "@/lib/journal-calibration";
import { runFomoCheck } from "@/lib/fomo-check";
import { analyzeListingRisk } from "@/lib/listing-risk";
import { calculateRawVsSlab } from "@/lib/raw-vs-slab";
import {
  defaultProfile,
  defaultRawVsSlabInput,
} from "@/lib/sample-data";
import {
  actualGradeOptions,
  budgetRangeOptions,
  decisionJournalEntrySchema,
  decisionPlanItemSchema,
  decisionSourceOptions,
  favoriteTcgOptions,
  goalOptions,
  gradingOptions,
  hermesResponseSchema,
  holdingOptions,
  ipOptions,
  journalActionOptions,
  journalDraftSchema,
  journalReviewStatusOptions,
  journalSentimentOptions,
  listingRiskReportSchema,
  listingRiskInputSchema,
  marketOptions,
  marketCheckResponseSchema,
  playerTypeOptions,
  rawVsSlabInputSchema,
  riskOptions,
  userProfileSchema,
  type CooldownTicket,
  type DemoSession,
  type DecisionJournalEntry,
  type DecisionPlanItem,
  type FomoCheckResult,
  type HermesResponse,
  type JournalDraft,
  type ListingEvidence,
  type ListingRiskInput,
  type ListingRiskReport,
  type MarketCheckResponse,
  type PipelineCriticResult,
  type PipelineMathResult,
  type RawVsSlabInput,
  type RawVsSlabResult,
  type RiskScore,
  type TcgPurchase,
  type UserProfile,
} from "@/lib/schemas";
import {
  loadCooldownTickets,
  loadDemoSession,
  loadDecisionPlanItems,
  loadJournalEntries,
  loadLatestRawResult,
  loadProfile,
  loadTodayPurchases,
  saveCooldownTickets,
  saveDemoSession,
  saveDecisionPlanItems,
  saveJournalEntries,
  saveLatestRawResult,
  saveProfile,
  saveTodayPurchases,
} from "@/lib/storage";

type View = "landing" | "onboarding" | "dashboard" | "risk" | "raw" | "journal";
type Locale = "en" | "zh";

type JournalForm = Omit<DecisionJournalEntry, "id" | "createdAt">;
type OnboardingStep = "tcg" | "persona" | "budget";
type AiHealth = {
  ok: boolean;
  warning?: string;
  models?: { role: string; model: string; ok: boolean; status?: number; warning?: string }[];
};

type PipelineTraceStep = {
  step: string;
  agent: string;
  model: string;
  summary: string;
  toolsUsed: string[];
};

type ListingPipelineState = {
  listingInput: ListingRiskInput | null;
  evidence: ListingEvidence | null;
  riskScore: RiskScore | null;
  math: PipelineMathResult | null;
  critic: PipelineCriticResult | null;
  trace: PipelineTraceStep[];
  warnings: string[];
  fallbackUsed: boolean;
};

type RawDecisionContext = {
  cardName: string;
};

type ReadyToBuyResult = {
  card: CuratedCardRecommendation;
  askingPrice: number;
  feelingText: string;
  evidenceText: string;
  fomoResult: FomoCheckResult;
};

const localeStorageKey = "cardplan.locale";

const views: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "risk", label: "Risk", icon: SearchCheck },
  { id: "raw", label: "Raw vs Slab", icon: Calculator },
  { id: "journal", label: "Journal", icon: BookOpenCheck },
];

const listingDefaults: ListingRiskInput = {
  title: "Umbreon VMAX 215/203 Evolving Skies Alternate Art Near Mint",
  description: "Beautiful card. Front and back photos shown. Ships insured.",
  price: 1300,
  marketplace: "eBay",
  userGoal: "Self-collection",
};

const journalDefaults: JournalForm = {
  tcg: "Pokemon",
  cardName: "Umbreon VMAX",
  version: "Evolving Skies Alternate Art 215/203",
  date: new Date().toISOString().slice(0, 10),
  actionType: "Considering purchase",
  price: 1300,
  userGoal: "Collection + resale",
  tags: "Pokemon, Evolving Skies, alt art, grading discipline",
  sentiment: "Cautious",
  thesis: "I want a grail-level Pokemon card without letting icon premium override condition evidence.",
  watchReason: "Umbreon is a durable collector chase, but raw entry price needs discipline.",
  buyCondition: "Only review copies with front/back photos, clean edges, and recent sold comp support.",
  sellCondition: "Review if net profit exceeds 30% after fees or if I need to rotate budget.",
  stopCondition: "Skip if condition photos are weak or the raw-vs-slab math only works with an optimistic PSA10 assumption.",
  risks: "Icon premium, condition uncertainty, and PSA10 margin compression.",
  missingInfo: "Corner closeups, surface video, recent sold comps.",
  reviewDate: "",
  reviewStatus: "Needs review",
  finalOutcome: "",
  lessonsLearned: "",
  assumedPsa10Probability: 0.16,
  actualGrade: "UNKNOWN",
  source: "manual",
};

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [locale, setLocale] = useState<Locale>("en");
  const [demoSession, setDemoSession] = useState<DemoSession | null>(null);
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [riskReport, setRiskReport] = useState<ListingRiskReport | null>(null);
  const [rawResult, setRawResult] = useState<RawVsSlabResult>(() => calculateRawVsSlab(defaultRawVsSlabInput));
  const [rawDecisionContext, setRawDecisionContext] = useState<RawDecisionContext>({ cardName: "Current raw-vs-slab decision" });
  const [journalEntries, setJournalEntries] = useState<DecisionJournalEntry[]>([]);
  const [decisionPlanItems, setDecisionPlanItems] = useState<DecisionPlanItem[]>([]);
  const [todayPurchases, setTodayPurchases] = useState<TcgPurchase[]>([]);
  const [cooldownTickets, setCooldownTickets] = useState<CooldownTicket[]>([]);
  const [selectedCard, setSelectedCard] = useState<CuratedCardRecommendation | null>(null);
  const [readyToBuyOpen, setReadyToBuyOpen] = useState(false);
  const [prefilledDecision, setPrefilledDecision] = useState<ReadyToBuyResult | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("tcg");
  const [journalFilter, setJournalFilter] = useState<DecisionJournalEntry["actionType"] | "All">("All");
  const [aiRiskResponse, setAiRiskResponse] = useState<HermesResponse | null>(null);
  const [, setJournalAgentResponse] = useState<HermesResponse | null>(null);
  const [, setJournalAgentDraft] = useState<JournalDraft | null>(null);
  const [aiLoading, setAiLoading] = useState<"risk" | "journal" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showRiskAdvanced, setShowRiskAdvanced] = useState(false);
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState<"evidence" | "risk_math_critic" | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [listingPipeline, setListingPipeline] = useState<ListingPipelineState>({
    listingInput: null,
    evidence: null,
    riskScore: null,
    math: null,
    critic: null,
    trace: [],
    warnings: [],
    fallbackUsed: false,
  });

  const profileForm = useForm<UserProfile>({ defaultValues: defaultProfile });
  const riskForm = useForm<ListingRiskInput>({ defaultValues: listingDefaults });
  const rawForm = useForm<RawVsSlabInput>({ defaultValues: defaultRawVsSlabInput });
  const journalForm = useForm<JournalForm>({ defaultValues: journalDefaults });
  const onboardingProfile = useWatch({ control: profileForm.control });
  const watchedPsa10Probability = useWatch({ control: rawForm.control, name: "psa10Probability" });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedProfile = loadProfile();
      const storedSession = loadDemoSession();
      const storedLocale = window.localStorage.getItem(localeStorageKey);
      const storedDecisionPlanItems = loadDecisionPlanItems();
      const storedRawResult = loadLatestRawResult();
      const storedEntries = loadJournalEntries();
      const storedPurchases = loadTodayPurchases();
      const storedCooldownTickets = loadCooldownTickets();

      if (storedLocale === "en" || storedLocale === "zh") {
        setLocale(storedLocale);
      }

      if (storedSession) {
        setDemoSession(storedSession);
      }

      if (storedProfile) {
        setProfile(storedProfile);
        profileForm.reset(storedProfile);
        setView(storedSession ? "dashboard" : "landing");
      }

      if (storedDecisionPlanItems.length) {
        setDecisionPlanItems(storedDecisionPlanItems);
      }

      if (storedRawResult) {
        setRawResult(storedRawResult);
      }

      if (storedEntries.length) {
        setJournalEntries(storedEntries);
      }

      if (storedPurchases.length) {
        setTodayPurchases(storedPurchases);
      }

      if (storedCooldownTickets.length) {
        setCooldownTickets(storedCooldownTickets);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [journalForm, profileForm]);

  useEffect(() => {
    window.localStorage.setItem(localeStorageKey, locale);
  }, [locale]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    fetch("/api/ai/health")
      .then((response) => response.json())
      .then((data: AiHealth) => setAiHealth(data))
      .catch((error: unknown) => {
        console.warn("AI health check failed", error);
        setAiHealth({
          ok: false,
          warning: "AI health check failed. AI actions may use local fallback.",
        });
      });
  }, []);

  const filteredEntries = useMemo(() => {
    const activeEntries = journalEntries.filter((entry) => profile.favoriteTcgs.includes(entry.tcg));
    if (journalFilter === "All") return activeEntries;
    return activeEntries.filter((entry) => entry.actionType === journalFilter);
  }, [journalEntries, journalFilter, profile.favoriteTcgs]);

  const visibleJournalEntries = useMemo(() => {
    return journalEntries.filter((entry) => profile.favoriteTcgs.includes(entry.tcg));
  }, [journalEntries, profile.favoriteTcgs]);

  const gradingCalibration = useMemo(() => {
    return getGradingCalibration(visibleJournalEntries, Number(watchedPsa10Probability) || defaultRawVsSlabInput.psa10Probability);
  }, [visibleJournalEntries, watchedPsa10Probability]);

  const journalRecommendations = useMemo(() => {
    return getJournalBasedRecommendations(profile, visibleJournalEntries);
  }, [profile, visibleJournalEntries]);

  const todaySpent = useMemo(() => {
    return getTodaySpent(todayPurchases);
  }, [todayPurchases]);

  const todayRemaining = getTodayRemaining(profile.todayBudget, todayPurchases);

  function navigateTo(nextView: View) {
    setView(nextView);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function handleDemoAuth(mode: DemoSession["mode"]) {
    const session = {
      signedIn: true,
      mode,
      createdAt: new Date().toISOString(),
    } satisfies DemoSession;
    setDemoSession(session);
    saveDemoSession(session);
    setView("landing");
  }

  function handleProfileSubmit(data: UserProfile) {
    const parsed = userProfileSchema.parse(data);
    setProfile(parsed);
    saveProfile(parsed);
    navigateTo("dashboard");
  }

  function toggleFavoriteTcg(tcg: UserProfile["favoriteTcgs"][number]) {
    const current = profileForm.getValues("favoriteTcgs") ?? [];
    const isDefaultOnly = current.length === 1 && current[0] === defaultProfile.favoriteTcgs[0];
    const next = current.includes(tcg)
      ? current.filter((item) => item !== tcg)
      : isDefaultOnly
        ? [tcg]
        : [...current, tcg];
    profileForm.setValue("favoriteTcgs", next.length ? next : [tcg], { shouldDirty: true });
  }

  function handleSelectBudgetRange(budgetRange: UserProfile["budgetRange"]) {
    const monthlyBudget = budgetRangeToMonthlyBudget(budgetRange);
    profileForm.setValue("budgetRange", budgetRange, { shouldDirty: true });
    profileForm.setValue("monthlyBudget", monthlyBudget, { shouldDirty: true });
    profileForm.setValue("todayBudget", Math.min(monthlyBudget, 300), { shouldDirty: true });
  }

  function finishFirstRun() {
    const formValues = profileForm.getValues();
    const favoriteTcgs = formValues.favoriteTcgs?.length ? formValues.favoriteTcgs : ["Pokemon"];
    const primaryTcg = favoriteTcgs[0] === "Pokemon" ? "Pokemon" : favoriteTcgs[0] === "Yu-Gi-Oh" ? "Yu-Gi-Oh" : favoriteTcgs[0] === "Other" ? "Other" : "One Piece";
    const budget = budgetRangeToMonthlyBudget(formValues.budgetRange);
    const todayBudget = formValues.todayBudget || Math.min(budget, 300);
    const nextProfile = userProfileSchema.parse({
      ...defaultProfile,
      ...formValues,
      favoriteTcgs,
      ip: primaryTcg,
      todayBudget,
      monthlyBudget: budget,
      goal: personaToGoal(formValues.playerType),
      riskLevel: formValues.playerType === "Seller / Vendor" ? "Medium" : defaultProfile.riskLevel,
    });

    setProfile(nextProfile);
    profileForm.reset(nextProfile);
    saveProfile(nextProfile);
    navigateTo("dashboard");
  }

  function handleReadyToBuySubmit(input: {
    card: CuratedCardRecommendation;
    askingPrice: number;
    feelingText: string;
    evidenceText: string;
  }) {
    const result = runFomoCheck({
      cardName: input.card.cardName,
      cardVersion: input.card.version,
      askingPrice: input.askingPrice,
      todayBudget: Math.max(todayRemaining, 0),
      monthlyBudget: profile.monthlyBudget,
      budgetRange: profile.budgetRange,
      versionConfirmed: true,
      feelingText: input.feelingText,
      evidenceText: input.evidenceText,
    });
    const readyResult = {
      card: input.card,
      askingPrice: input.askingPrice,
      feelingText: input.feelingText,
      evidenceText: input.evidenceText,
      fomoResult: result,
    } satisfies ReadyToBuyResult;

    setPrefilledDecision(readyResult);
    setSelectedCard(input.card);
    setReadyToBuyOpen(false);
  }

  function handleCreateCooldownTicket(input: ReadyToBuyResult) {
    const ticket = {
      id: crypto.randomUUID(),
      cardId: input.card.id,
      cardName: input.card.cardName,
      cardVersion: input.card.version,
      askingPrice: input.askingPrice,
      originalThesis: input.feelingText,
      missingEvidence: input.evidenceText.trim() ? input.evidenceText : "Add photos, comps, condition proof, seller context, or version evidence before revisiting.",
      decisionPosture: input.fomoResult.decisionPosture,
      nextStep: input.fomoResult.nextStep,
      createdAt: new Date().toISOString(),
      revisitDate: getDateOffset(1),
      status: "cooling",
    } satisfies CooldownTicket;
    const nextTickets = [ticket, ...cooldownTickets];
    setCooldownTickets(nextTickets);
    saveCooldownTickets(nextTickets);
  }

  function handleMarkBought(input: ReadyToBuyResult) {
    const purchase = {
      id: crypto.randomUUID(),
      cardId: input.card.id,
      cardName: input.card.cardName,
      cardVersion: input.card.version,
      askingPrice: input.askingPrice,
      boughtAt: new Date().toISOString(),
    } satisfies TcgPurchase;
    const nextPurchases = [purchase, ...todayPurchases];
    setTodayPurchases(nextPurchases);
    saveTodayPurchases(nextPurchases);
  }

  function handleRiskSubmit(data: ListingRiskInput) {
    const parsed = listingRiskInputSchema.parse(data);
    setRiskReport(analyzeListingRisk(parsed));
    setAiRiskResponse(null);
  }

  function handleRawSubmit(data: RawVsSlabInput) {
    const parsed = rawVsSlabInputSchema.parse(data);
    const result = calculateRawVsSlab(parsed);
    setRawResult(result);
    saveLatestRawResult(result);
  }

  function handleJournalSubmit(data: JournalForm) {
    const entry = decisionJournalEntrySchema.parse({
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    const nextEntries = [entry, ...journalEntries];
    setJournalEntries(nextEntries);
    saveJournalEntries(nextEntries);
    journalForm.reset({ ...journalDefaults, date: new Date().toISOString().slice(0, 10) });
  }

  async function handleJournalAgent(entry: DecisionJournalEntry) {
    setAiLoading("journal");
    setAiError(null);
    setJournalAgentResponse(null);
    setJournalAgentDraft(buildLocalJournalReflection(entry));

    try {
      const response = await callHermes({
        taskHint: "JOURNAL_DRAFT",
        profile,
        journalEntry: entry,
        journalSummary: summarizeJournal(journalEntries),
      });
      setJournalAgentResponse(response);
      setJournalAgentDraft(journalDraftSchema.parse(response.result));
    } catch (error) {
      console.error("Journal agent failed", error);
      setAiError("Journal agent temporarily unavailable. Showing a local reflection instead.");
    } finally {
      setAiLoading(null);
    }
  }

  function handleAddJournalReviewToPlan(entry: DecisionJournalEntry) {
    addDecisionPlanItem({
      source: "journal",
      title: `Review ${entry.cardName}`,
      cardName: `${entry.cardName} ${entry.version}`.trim(),
      summary: buildJournalReviewSummary(entry),
    });
  }

  async function handleRiskAiSubmit(data: ListingRiskInput) {
    const parsed = listingRiskInputSchema.parse(data);
    setAiLoading("risk");
    setAiError(null);

    try {
      const response = await callHermes({
        taskHint: "LISTING_RISK_CHECK",
        profile,
        listingInput: parsed,
        journalSummary: summarizeJournal(journalEntries),
      });
      const report = listingRiskReportSchema.parse(response.result);
      setRiskReport(report);
      setAiRiskResponse(response);
    } catch (error) {
      console.error("AI listing analysis failed", error);
      setAiError("AI temporarily unavailable, using local fallback.");
    } finally {
      setAiLoading(null);
    }
  }

  async function handlePipelineEvidenceSubmit(data: ListingRiskInput) {
    const parsed = listingRiskInputSchema.parse(data);
    setPipelineLoading("evidence");
    setPipelineError(null);
    setListingPipeline({
      listingInput: parsed,
      evidence: null,
      riskScore: null,
      math: null,
      critic: null,
      trace: [],
      warnings: [],
      fallbackUsed: false,
    });

    try {
      await callListingRiskPipeline({ listingInput: parsed, onStage: applyPipelineStage });
    } catch (error) {
      console.error("Listing risk pipeline failed", error);
      setPipelineError("AI pipeline temporarily unavailable. Showing local fallback where possible.");
    } finally {
      setPipelineLoading(null);
    }
  }

  async function handlePipelineContinue(evidence: ListingEvidence) {
    const listingInput = listingPipeline.listingInput ?? listingRiskInputSchema.parse(riskForm.getValues());
    setPipelineLoading("risk_math_critic");
    setPipelineError(null);
    setListingPipeline((current) => ({ ...current, listingInput, evidence, riskScore: null, math: null, critic: null }));

    try {
      await callListingRiskPipeline({ listingInput, evidence, continueFromEvidence: true, onStage: applyPipelineStage });
    } catch (error) {
      console.error("Listing risk pipeline continue failed", error);
      setPipelineError("Pipeline continue failed. Keep using the local Listing Risk result for now.");
    } finally {
      setPipelineLoading(null);
    }
  }

  function applyPipelineStage(stage: PipelineStreamStage) {
    if (stage.stage === "error") {
      setPipelineError(stage.message);
      return;
    }
    if (stage.stage === "done") return;

    setListingPipeline((current) => ({
      ...current,
      evidence: stage.stage === "evidence" ? stage.evidence : current.evidence,
      riskScore: stage.stage === "risk" ? stage.riskScore : current.riskScore,
      math: stage.stage === "math" ? stage.math : current.math,
      critic: stage.stage === "critic" ? stage.critic : current.critic,
      trace: [...current.trace.filter((item) => item.step !== stage.trace.step), stage.trace],
      warnings: [...current.warnings, ...stage.warnings.map((message) => sanitizeTraceMessage(message))],
      fallbackUsed: current.fallbackUsed || stage.fallbackUsed,
    }));

    if (stage.stage === "risk") {
      const report = analyzeListingRisk(listingPipeline.listingInput ?? listingRiskInputSchema.parse(riskForm.getValues()));
      setRiskReport({
        ...report,
        score: stage.riskScore.overall >= 70 ? "High" : stage.riskScore.overall >= 50 ? "Medium-High" : stage.riskScore.overall >= 35 ? "Medium" : "Low",
        cautiousSummary: stage.riskScore.verdict,
      });
    }
  }

  function handleApplyCalibration() {
    rawForm.setValue("psa10Probability", gradingCalibration.suggestedProbability, { shouldDirty: true });
    const nextInput = rawVsSlabInputSchema.parse({
      ...rawForm.getValues(),
      psa10Probability: gradingCalibration.suggestedProbability,
    });
    const result = calculateRawVsSlab(nextInput);
    setRawResult(result);
    saveLatestRawResult(result);
  }

  function handleAddRiskToPlan() {
    if (!riskReport) return;
    const listing = riskForm.getValues();
    addDecisionPlanItem({
      source: "listing_risk",
      title: "Resolve listing risk before buying",
      cardName: listing.title,
      summary: `${riskReport.score} risk. ${riskReport.suitability}`,
    });
  }

  function handleAddRawToPlan() {
    addDecisionPlanItem({
      source: "raw_vs_slab",
      title: rawResult.expectedProfit >= 0 ? "Verify condition before raw purchase" : "Wait for a better raw entry",
      cardName: rawDecisionContext.cardName,
      summary: `${formatMoney(rawResult.expectedProfit)} EV. ${rawResult.recommendation}`,
    });
  }

  function handleAddCardToPlan(card: CuratedCardRecommendation) {
    addDecisionPlanItem({
      source: "raw_vs_slab",
      title: `Review ${card.cardName} within 30 days`,
      cardName: `${card.cardName} ${card.version}`,
      summary: `${card.buyTone} Snapshot: raw ${formatMoney(card.suggestedRawPrice)}, PSA10 ${formatMoney(card.suggestedPsa10Price)}.`,
    });
    setSelectedCard(null);
  }

  function handleSendCardToRaw(card: CuratedCardRecommendation) {
    const input = toRawVsSlabInput(card);
    rawForm.reset(input);
    const result = calculateRawVsSlab(input);
    setRawResult(result);
    setRawDecisionContext({ cardName: `${card.cardName} ${card.version}`.trim() });
    saveLatestRawResult(result);
    setSelectedCard(null);
    navigateTo("raw");
  }

  function handleSendCardToRisk(card: CuratedCardRecommendation) {
    const input = toListingRiskInput(card);
    riskForm.reset(input);
    setRiskReport(analyzeListingRisk(input));
    setAiRiskResponse(null);
    setSelectedCard(null);
    navigateTo("risk");
  }

  function addDecisionPlanItem(input: Pick<DecisionPlanItem, "source" | "title" | "cardName" | "summary">) {
    const item = decisionPlanItemSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      dueDate: getDateOffset(30),
      status: "open",
    });
    const nextItems = [item, ...decisionPlanItems];
    setDecisionPlanItems(nextItems);
    saveDecisionPlanItems(nextItems);
  }

  return (
    <main className="min-h-screen bg-[#f4f7f3] text-[#24312f]">
      <Header activeView={view} locale={locale} onLocaleChange={setLocale} onNavigate={navigateTo} />
      {aiHealth && !aiHealth.ok && <AiHealthBanner locale={locale} health={aiHealth} />}

      {view === "landing" && !demoSession && (
        <DemoAuthGate locale={locale} onEnter={handleDemoAuth} />
      )}

      {view === "landing" && demoSession && (
        <FirstRunExperience
          locale={locale}
          step={onboardingStep}
          profile={userProfileSchema.parse({ ...defaultProfile, ...onboardingProfile })}
          onToggleTcg={toggleFavoriteTcg}
          onSelectPersona={(playerType) => profileForm.setValue("playerType", playerType, { shouldDirty: true })}
          onSelectBudget={handleSelectBudgetRange}
          onStepChange={setOnboardingStep}
          onFinish={finishFirstRun}
        />
      )}

      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8 lg:px-10">
        {view === "onboarding" && (
          <ToolSurface
            icon={ListChecks}
            eyebrow={getLocaleCopy(locale).profile.eyebrow}
            title={getLocaleCopy(locale).profile.title}
            description={getLocaleCopy(locale).profile.description}
          >
            <form className="form-grid" onSubmit={profileForm.handleSubmit(handleProfileSubmit)}>
              <SelectField label={getLocaleCopy(locale).profile.favoriteIp} {...profileForm.register("ip")} options={ipOptions} locale={locale} />
              <SelectField label={getLocaleCopy(locale).profile.primaryGoal} {...profileForm.register("goal")} options={goalOptions} locale={locale} />
              <InputField label={getLocaleCopy(locale).profile.todayBudget} type="number" {...profileForm.register("todayBudget", { valueAsNumber: true })} />
              <InputField label={getLocaleCopy(locale).profile.monthlyBudget} type="number" {...profileForm.register("monthlyBudget", { valueAsNumber: true })} />
              <SelectField label={getLocaleCopy(locale).profile.riskLevel} {...profileForm.register("riskLevel")} options={riskOptions} locale={locale} />
              <SelectField label={getLocaleCopy(locale).profile.holdingPeriod} {...profileForm.register("holdingPeriod")} options={holdingOptions} locale={locale} />
              <SelectField label={getLocaleCopy(locale).profile.gradingPreference} {...profileForm.register("gradingPreference")} options={gradingOptions} locale={locale} />
              <SelectField label={getLocaleCopy(locale).profile.preferredMarket} {...profileForm.register("preferredMarket")} options={marketOptions} locale={locale} />
              <TextAreaField className="md:col-span-2" label={getLocaleCopy(locale).profile.favoriteCharacters} {...profileForm.register("favoriteCharacters")} />
              <div className="md:col-span-2">
                <button className="primary-button" type="submit">
                  <Save className="h-4 w-4" />
                  {getLocaleCopy(locale).profile.save}
                </button>
              </div>
            </form>
          </ToolSurface>
        )}

        {view === "dashboard" && (
          <section className="space-y-5">
            <RecommendationGrid
              locale={locale}
              recommendations={journalRecommendations}
              profile={profile}
              todaySpent={todaySpent}
              todayRemaining={todayRemaining}
              cooldownTickets={cooldownTickets}
              hasJournalEntries={visibleJournalEntries.length > 0}
              onReadyToBuy={() => setReadyToBuyOpen(true)}
              onSelectCard={setSelectedCard}
            />
          </section>
        )}

        {view === "risk" && (
          <ToolSurface
            icon={SearchCheck}
            eyebrow={getLocaleCopy(locale).risk.eyebrow}
            title={getLocaleCopy(locale).risk.title}
            description={getLocaleCopy(locale).risk.description}
          >
            <form className="form-grid" onSubmit={riskForm.handleSubmit(handleRiskSubmit)}>
              <InputField className="md:col-span-2" label={getLocaleCopy(locale).risk.listingTitle} {...riskForm.register("title")} />
              <TextAreaField className="md:col-span-2" label={getLocaleCopy(locale).risk.descriptionLabel} {...riskForm.register("description")} />
              <InputField label={getLocaleCopy(locale).risk.listedPrice} type="number" {...riskForm.register("price", { valueAsNumber: true })} />
              <SelectField label={getLocaleCopy(locale).risk.marketplace} {...riskForm.register("marketplace")} options={marketOptions} locale={locale} />
              <SelectField label={getLocaleCopy(locale).risk.userGoal} {...riskForm.register("userGoal")} options={["Self-collection", "Grading", "Resale"]} locale={locale} />
              <div className="flex flex-col gap-3 md:col-span-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button className="primary-button" type="submit">
                    <AlertTriangle className="h-4 w-4" />
                    {getLocaleCopy(locale).risk.analyzeLocal}
                  </button>
                  <button
                    className="text-left text-sm font-semibold text-[#2f6f73] underline-offset-2 hover:underline"
                    type="button"
                    aria-expanded={showRiskAdvanced}
                    onClick={() => setShowRiskAdvanced((value) => !value)}
                  >
                    {showRiskAdvanced ? getLocaleCopy(locale).risk.advancedHide : getLocaleCopy(locale).risk.advancedShow}
                  </button>
                </div>
                {showRiskAdvanced && (
                  <div className="flex flex-col gap-3 rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-3 sm:flex-row">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={aiLoading === "risk"}
                      onClick={riskForm.handleSubmit(handleRiskAiSubmit)}
                    >
                      <Sparkles className="h-4 w-4" />
                      {aiLoading === "risk" ? getLocaleCopy(locale).risk.runningHermes : getLocaleCopy(locale).risk.analyzeAi}
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={pipelineLoading !== null}
                      onClick={riskForm.handleSubmit(handlePipelineEvidenceSubmit)}
                    >
                      <ListChecks className="h-4 w-4" />
                      {pipelineLoading === "evidence" ? getLocaleCopy(locale).risk.evidenceAgentLoading : getLocaleCopy(locale).risk.analyzePipeline}
                    </button>
                  </div>
                )}
              </div>
            </form>
            {aiError && <AiError locale={locale} message={aiError} />}
            {pipelineError && <AiError locale={locale} message={pipelineError} />}
            <ListingRiskPipeline
              locale={locale}
              state={listingPipeline}
              loading={pipelineLoading}
              onEvidenceChange={(evidence) => setListingPipeline((current) => ({ ...current, evidence }))}
              onContinue={handlePipelineContinue}
              onAddToPlan={handleAddRiskToPlan}
            />
            {aiRiskResponse && <AgentTrace locale={locale} response={aiRiskResponse} />}
            {riskReport && (
              <RiskReport
                locale={locale}
                report={riskReport}
                onContinue={() => navigateTo("raw")}
                onAddToPlan={handleAddRiskToPlan}
              />
            )}
          </ToolSurface>
        )}

        {view === "raw" && (
          <ToolSurface
            icon={Calculator}
            eyebrow={getLocaleCopy(locale).raw.eyebrow}
            title={getLocaleCopy(locale).raw.title}
            description={getLocaleCopy(locale).raw.description}
          >
            <CalibrationCard locale={locale} calibration={gradingCalibration} onApply={handleApplyCalibration} />
            <form className="form-grid" onSubmit={rawForm.handleSubmit(handleRawSubmit)}>
              <InputField label={getLocaleCopy(locale).raw.rawPrice} type="number" step="0.01" {...rawForm.register("rawPrice", { valueAsNumber: true })} />
              <InputField label={getLocaleCopy(locale).raw.psa10Price} type="number" step="0.01" {...rawForm.register("psa10Price", { valueAsNumber: true })} />
              <InputField label={getLocaleCopy(locale).raw.psa9Price} type="number" step="0.01" {...rawForm.register("psa9Price", { valueAsNumber: true })} />
              <InputField label={getLocaleCopy(locale).raw.otherPrice} type="number" step="0.01" {...rawForm.register("otherPrice", { valueAsNumber: true })} />
              <InputField label={getLocaleCopy(locale).raw.gradingCost} type="number" step="0.01" {...rawForm.register("gradingCost", { valueAsNumber: true })} />
              <InputField label={getLocaleCopy(locale).raw.feeRate} type="number" step="0.01" {...rawForm.register("marketplaceFeeRate", { valueAsNumber: true })} />
              <InputField label={getLocaleCopy(locale).raw.shipping} type="number" step="0.01" {...rawForm.register("shippingCost", { valueAsNumber: true })} />
              <InputField label={getLocaleCopy(locale).raw.psa10Probability} type="number" step="0.01" {...rawForm.register("psa10Probability", { valueAsNumber: true })} />
              <InputField label={getLocaleCopy(locale).raw.psa9Probability} type="number" step="0.01" {...rawForm.register("psa9Probability", { valueAsNumber: true })} />
              <div className="md:col-span-2">
                <button className="primary-button" type="submit">
                  <Calculator className="h-4 w-4" />
                  {getLocaleCopy(locale).raw.recalculate}
                </button>
              </div>
            </form>
            <RawResult locale={locale} result={rawResult} context={rawDecisionContext} onAddToPlan={handleAddRawToPlan} />
          </ToolSurface>
        )}

        {view === "journal" && (
          <ToolSurface
            icon={BookOpenCheck}
            eyebrow={getLocaleCopy(locale).journal.eyebrow}
            title={getLocaleCopy(locale).journal.title}
            description={getLocaleCopy(locale).journal.description}
          >
            <form className="form-grid" onSubmit={journalForm.handleSubmit(handleJournalSubmit)}>
              <SelectField label="TCG" {...journalForm.register("tcg")} options={favoriteTcgOptions} locale={locale} />
              <InputField label={getLocaleCopy(locale).journal.cardName} {...journalForm.register("cardName")} />
              <InputField label={getLocaleCopy(locale).journal.version} {...journalForm.register("version")} />
              <InputField label={getLocaleCopy(locale).journal.date} type="date" {...journalForm.register("date")} />
              <SelectField label={getLocaleCopy(locale).journal.actionType} {...journalForm.register("actionType")} options={journalActionOptions} locale={locale} />
              <InputField label={getLocaleCopy(locale).journal.price} type="number" step="0.01" {...journalForm.register("price", { valueAsNumber: true })} />
              <SelectField label={getLocaleCopy(locale).journal.goal} {...journalForm.register("userGoal")} options={goalOptions} locale={locale} />
              <InputField label={getLocaleCopy(locale).journal.tags} placeholder={getLocaleCopy(locale).journal.tagsPlaceholder} {...journalForm.register("tags")} />
              <SelectField label={getLocaleCopy(locale).journal.sentiment} {...journalForm.register("sentiment")} options={journalSentimentOptions} locale={locale} />
              <TextAreaField className="md:col-span-2" label={getLocaleCopy(locale).journal.thesis} {...journalForm.register("thesis")} />
              <TextAreaField className="md:col-span-2" label={getLocaleCopy(locale).journal.watchReason} {...journalForm.register("watchReason")} />
              <TextAreaField label={getLocaleCopy(locale).journal.buyCondition} {...journalForm.register("buyCondition")} />
              <TextAreaField label={getLocaleCopy(locale).journal.sellCondition} {...journalForm.register("sellCondition")} />
              <TextAreaField label={getLocaleCopy(locale).journal.stopCondition} {...journalForm.register("stopCondition")} />
              <TextAreaField label={getLocaleCopy(locale).journal.risks} {...journalForm.register("risks")} />
              <InputField label={getLocaleCopy(locale).journal.reviewDate} type="date" {...journalForm.register("reviewDate")} />
              <SelectField label={getLocaleCopy(locale).journal.reviewStatus} {...journalForm.register("reviewStatus")} options={journalReviewStatusOptions} locale={locale} />
              <TextAreaField label={getLocaleCopy(locale).journal.missingInfo} {...journalForm.register("missingInfo")} />
              <TextAreaField label={getLocaleCopy(locale).journal.finalOutcome} {...journalForm.register("finalOutcome")} />
              <TextAreaField label={getLocaleCopy(locale).journal.lessons} {...journalForm.register("lessonsLearned")} />
              <InputField
                label={getLocaleCopy(locale).journal.assumedPsa10}
                type="number"
                step="0.01"
                {...journalForm.register("assumedPsa10Probability", {
                  setValueAs: (value) => (value === "" ? undefined : Number(value)),
                })}
              />
              <SelectField label={getLocaleCopy(locale).journal.actualGrade} {...journalForm.register("actualGrade")} options={actualGradeOptions} locale={locale} />
              <SelectField label={getLocaleCopy(locale).journal.decisionSource} {...journalForm.register("source")} options={decisionSourceOptions} locale={locale} />
              <div className="md:col-span-2">
                <button className="primary-button" type="submit">
                  <Save className="h-4 w-4" />
                  {getLocaleCopy(locale).journal.save}
                </button>
              </div>
            </form>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <button className={filterClass(journalFilter === "All")} onClick={() => setJournalFilter("All")}>
                {getLocaleCopy(locale).journal.all}
              </button>
              {journalActionOptions.map((action) => (
                <button key={action} className={filterClass(journalFilter === action)} onClick={() => setJournalFilter(action)}>
                  {localizeOption(action, locale)}
                </button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filteredEntries.map((entry) => (
                <JournalEntry
                  locale={locale}
                  key={entry.id}
                  entry={entry}
                  onAskAgent={handleJournalAgent}
                  onAddToPlan={handleAddJournalReviewToPlan}
                  loading={aiLoading === "journal"}
                />
              ))}
            </div>
          </ToolSurface>
        )}
      </div>
      {selectedCard && (
        <CardDecisionSheet
          locale={locale}
          card={selectedCard}
          profile={profile}
          readyToBuyResult={prefilledDecision?.card.id === selectedCard.id ? prefilledDecision : null}
          todayRemaining={todayRemaining}
          onClose={() => setSelectedCard(null)}
          onRunRaw={handleSendCardToRaw}
          onCheckRisk={handleSendCardToRisk}
          onAddToPlan={handleAddCardToPlan}
          onCreateCooldownTicket={handleCreateCooldownTicket}
          onMarkBought={handleMarkBought}
        />
      )}

      {readyToBuyOpen && (
        <ReadyToBuyModal
          locale={locale}
          recommendations={journalRecommendations.map((recommendation) => recommendation.card)}
          profile={profile}
          todaySpent={todaySpent}
          todayRemaining={todayRemaining}
          onClose={() => setReadyToBuyOpen(false)}
          onSubmit={handleReadyToBuySubmit}
        />
      )}
    </main>
  );
}

function Header({
  activeView,
  locale,
  onLocaleChange,
  onNavigate,
}: {
  activeView: View;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onNavigate: (view: View) => void;
}) {
  const t = getLocaleCopy(locale);

  return (
    <header className="sticky top-0 z-20 border-b border-[#d6ded5] bg-[#f4f7f3]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-8 lg:px-10">
        <button className="flex w-fit items-center gap-3 text-left" onClick={() => onNavigate("landing")} aria-label="TCGpal home">
          <BrandMark variant="horizontal" />
          <span className="sr-only">{t.headerSubtitle}</span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex gap-2 overflow-x-auto">
            {views.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`nav-button ${activeView === item.id ? "nav-button-active" : ""}`}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  {t.nav[item.id]}
                </button>
              );
            })}
          </nav>
          <div className="flex rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-1">
            {(["en", "zh"] as const).map((option) => (
              <button
                key={option}
                className={`min-h-8 rounded px-3 text-xs font-black uppercase ${locale === option ? "bg-[#2f6f73] text-[#f4f7f3]" : "text-[#64736c]"}`}
                type="button"
                onClick={() => onLocaleChange(option)}
              >
                {option === "en" ? "EN" : "中文"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

function DemoAuthGate({ locale, onEnter }: { locale: Locale; onEnter: (mode: DemoSession["mode"]) => void }) {
  const t = getLocaleCopy(locale).auth;

  return (
    <section className="border-b border-[#d6ded5] bg-[#e7efe8]">
      <div className="mx-auto grid min-h-[620px] max-w-7xl grid-cols-1 gap-8 px-5 py-10 md:grid-cols-[0.9fr_1.1fr] md:px-8 lg:px-10">
        <div className="flex flex-col justify-center">
          <BrandMark variant="icon" size="lg" />
          <Badge icon={ShoppingBag}>{t.badge}</Badge>
          <h1 className="mt-5 max-w-3xl font-serif text-5xl font-bold leading-tight text-[#2f6f73] md:text-7xl">
            {t.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#64736c]">
            {t.description}
          </p>
        </div>
        <div className="flex items-center">
          <div className="w-full rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5 shadow-[0_18px_50px_rgba(45,38,32,0.12)] md:p-6">
            <p className="text-xs font-semibold uppercase text-[#64736c]">{t.eyebrow}</p>
            <h2 className="mt-2 font-serif text-3xl font-bold text-[#2f6f73]">{t.panelTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-[#64736c]">
              {t.panelDescription}
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button className="primary-button" type="button" onClick={() => onEnter("login")}>
                <LogIn className="h-4 w-4" />
                {t.login}
              </button>
              <button className="secondary-button" type="button" onClick={() => onEnter("signup")}>
                <Sparkles className="h-4 w-4" />
                {t.signup}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BrandMark({ variant = "icon", size = "sm" }: { variant?: "icon" | "horizontal"; size?: "sm" | "lg" }) {
  const large = size === "lg";
  const dimensions = variant === "horizontal"
    ? { width: 173, height: 50, className: "h-[50px] w-[173px]" }
    : large
      ? { width: 96, height: 96, className: "mb-5 h-20 w-20" }
      : { width: 40, height: 40, className: "h-10 w-10" };

  return (
    <Image
      className={`shrink-0 ${dimensions.className}`}
      src={variant === "horizontal" ? "/tcgpal-logo-horizontal.svg" : "/tcgpal-icon.svg"}
      alt="TCGpal"
      width={dimensions.width}
      height={dimensions.height}
      priority={variant === "horizontal"}
    />
  );
}

function FirstRunExperience({
  locale,
  step,
  profile,
  onToggleTcg,
  onSelectPersona,
  onSelectBudget,
  onStepChange,
  onFinish,
}: {
  locale: Locale;
  step: OnboardingStep;
  profile: UserProfile;
  onToggleTcg: (tcg: UserProfile["favoriteTcgs"][number]) => void;
  onSelectPersona: (playerType: UserProfile["playerType"]) => void;
  onSelectBudget: (budgetRange: UserProfile["budgetRange"]) => void;
  onStepChange: (step: OnboardingStep) => void;
  onFinish: () => void;
}) {
  const t = getLocaleCopy(locale).onboarding;

  return (
    <section className="border-b border-[#d6ded5] bg-[#e7efe8]">
      <div className="mx-auto grid min-h-[680px] max-w-7xl grid-cols-1 gap-8 px-5 py-10 md:grid-cols-[0.86fr_1.14fr] md:px-8 lg:px-10">
        <div className="flex flex-col justify-center">
          <Badge icon={Layers3}>{t.badge}</Badge>
          <h1 className="mt-5 max-w-3xl font-serif text-5xl font-bold leading-tight text-[#2f6f73] md:text-7xl">
            {t.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#64736c]">
            {t.description}
          </p>
          <div className="mt-8 flex gap-2">
            {(["tcg", "persona", "budget"] as const).map((item, index) => (
              <button
                key={item}
                className={`h-2 flex-1 rounded-full ${step === item ? "bg-[#b26a4c]" : "bg-[#fcfbf6]"}`}
                aria-label={`Step ${index + 1}`}
                onClick={() => onStepChange(item)}
              />
            ))}
          </div>
        </div>
        <div className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5 shadow-[0_18px_50px_rgba(45,38,32,0.12)] md:p-6">
          {step === "tcg" && (
            <div>
              <p className="text-xs font-semibold uppercase text-[#64736c]">{t.step1}</p>
              <h2 className="mt-2 font-serif text-3xl font-bold text-[#2f6f73]">{t.tcgTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-[#64736c]">{t.tcgDescription}</p>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {favoriteTcgOptions.map((tcg) => {
                  const active = profile.favoriteTcgs.includes(tcg);
                  return (
                    <button key={tcg} className={`choice-card ${active ? "choice-card-active" : ""}`} onClick={() => onToggleTcg(tcg)}>
                      <span>{tcg}</span>
                      {active && (
                        <span className="choice-check" aria-hidden="true">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button className="primary-button mt-6 w-full" onClick={() => onStepChange("persona")}>
                {t.continue}
              </button>
            </div>
          )}
          {step === "persona" && (
            <div>
              <p className="text-xs font-semibold uppercase text-[#64736c]">{t.step2}</p>
              <h2 className="mt-2 font-serif text-3xl font-bold text-[#2f6f73]">{t.personaTitle}</h2>
              <div className="mt-6 grid grid-cols-1 gap-3">
                {playerTypeOptions.map((playerType) => (
                  <button
                    key={playerType}
                    className={`choice-card items-start ${profile.playerType === playerType ? "choice-card-active" : ""}`}
                    onClick={() => onSelectPersona(playerType)}
                  >
                    <span>
                      <span className="block text-base">{localizeOption(playerType, locale)}</span>
                      <span className="mt-1 block text-sm font-medium leading-6 text-[#64736c]">{personaDescription(playerType, locale)}</span>
                    </span>
                    {profile.playerType === playerType && (
                      <span className="choice-check" aria-hidden="true">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex gap-3">
                <button className="secondary-button flex-1" onClick={() => onStepChange("tcg")}>
                  {t.back}
                </button>
                <button className="primary-button flex-1" onClick={() => onStepChange("budget")}>
                  {t.continue}
                </button>
              </div>
            </div>
          )}
          {step === "budget" && (
            <div>
              <p className="text-xs font-semibold uppercase text-[#64736c]">{t.step3}</p>
              <h2 className="mt-2 font-serif text-3xl font-bold text-[#2f6f73]">{t.budgetTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-[#64736c]">
                {t.budgetDescription}
              </p>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InputField label={t.todayBudget} type="number" min="0" step="1" value={profile.todayBudget} onChange={() => undefined} readOnly />
                <InputField label={t.monthlyBenchmark} type="number" min="0" step="1" value={profile.monthlyBudget} onChange={() => undefined} readOnly />
              </div>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {budgetRangeOptions.map((budgetRange) => (
                  <button
                    key={budgetRange}
                    className={`choice-card ${profile.budgetRange === budgetRange ? "choice-card-active" : ""}`}
                    onClick={() => onSelectBudget(budgetRange)}
                  >
                    <span>{localizeOption(budgetRange, locale)}</span>
                    {profile.budgetRange === budgetRange && (
                      <span className="choice-check" aria-hidden="true">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex gap-3">
                <button className="secondary-button flex-1" onClick={() => onStepChange("persona")}>
                  {t.back}
                </button>
                <button className="primary-button flex-1" onClick={onFinish}>
                  {t.start}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RecommendationGrid({
  locale,
  recommendations,
  profile,
  todaySpent,
  todayRemaining,
  cooldownTickets,
  hasJournalEntries,
  onReadyToBuy,
  onSelectCard,
}: {
  locale: Locale;
  recommendations: JournalBasedRecommendation[];
  profile: UserProfile;
  todaySpent: number;
  todayRemaining: number;
  cooldownTickets: CooldownTicket[];
  hasJournalEntries: boolean;
  onReadyToBuy: () => void;
  onSelectCard: (card: CuratedCardRecommendation) => void;
}) {
  const t = getLocaleCopy(locale).home;
  const coolingCount = cooldownTickets.filter((ticket) => ticket.status === "cooling").length;

  return (
    <section className="bg-[#f4f7f3]">
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5">
          <p className="text-xs font-semibold uppercase text-[#64736c]">{hasJournalEntries ? t.eyebrowRadar : t.eyebrowStart}</p>
          <h1 className="mt-1 max-w-3xl font-serif text-4xl font-bold leading-tight text-[#2f6f73] md:text-6xl">{t.title}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[#64736c]">
            {t.description}
          </p>
          <button className="primary-button mt-5 text-base" type="button" onClick={onReadyToBuy}>
            <ShoppingBag className="h-5 w-5" />
            {t.cta}
          </button>
        </div>
        <div className="rounded-md border border-[#d6ded5] bg-[#e7efe8] p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase text-[#64736c]">{t.guardrail}</p>
            <span className="rounded-md bg-[#d7a84e] px-3 py-1 text-xs font-bold uppercase text-[#4a3f24]">{profile.favoriteTcgs.join(", ")}</span>
          </div>
          <DetailGrid
            items={[
              [t.todayBudget, formatMoney(profile.todayBudget)],
              [t.spentToday, formatMoney(todaySpent)],
              [t.remaining, formatMoney(todayRemaining)],
              [t.monthlyBenchmark, formatMoney(profile.monthlyBudget)],
            ]}
            dangerLabels={todayRemaining <= 0 ? [t.remaining] : []}
          />
          {coolingCount > 0 && (
            <div className="mt-4 rounded-md bg-[#fcfbf6] p-3">
              <p className="text-xs font-bold uppercase text-[#64736c]">{t.coolingDown}</p>
              <p className="mt-1 text-sm font-semibold text-[#36413d]">
                {t.savedForReview(coolingCount)}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="mb-4 flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase text-[#64736c]">{t.quickPicks}</p>
        <p className="text-sm leading-6 text-[#64736c]">{t.quickPicksDescription}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {recommendations.map((recommendation, index) => {
          const card = recommendation.card;
          return (
            <button
              key={card.id}
              className="group text-left"
              onClick={() => onSelectCard(card)}
            >
              <article className="flex h-full flex-col rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-4 transition group-hover:-translate-y-1 group-hover:border-[#bccbc2] group-hover:shadow-lg">
                <div className="mx-auto">
                  <DesignedCard card={card} large />
                </div>
                <div className="mt-4 flex flex-1 flex-col">
                  <p className="text-xs font-semibold uppercase text-[#64736c]">{index + 1} · {localizeCardText(card.rarity, locale)}</p>
                  <h2 className="mt-1 font-serif text-2xl font-bold leading-tight text-[#2f6f73]">{card.cardName}</h2>
                  <p className="mt-1 text-sm leading-5 text-[#64736c]">{card.version}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded bg-[#d7a84e] px-2 py-1 font-mono text-xs font-bold text-[#4a3f24]">{formatMoney(card.suggestedRawPrice)} {t.raw}</span>
                    <span className="rounded bg-[#e7efe8] px-2 py-1 font-mono text-xs font-bold text-[#2f6f73]">{formatPercent(card.psa10Probability)} {t.psa10}</span>
                  </div>
                  <p className="mt-auto pt-5 text-sm font-bold text-[#b26a4c]">{t.review}</p>
                </div>
              </article>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ReadyToBuyModal({
  locale,
  recommendations,
  profile,
  todaySpent,
  todayRemaining,
  onClose,
  onSubmit,
}: {
  locale: Locale;
  recommendations: CuratedCardRecommendation[];
  profile: UserProfile;
  todaySpent: number;
  todayRemaining: number;
  onClose: () => void;
  onSubmit: (input: { card: CuratedCardRecommendation; askingPrice: number; feelingText: string; evidenceText: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<CuratedCardRecommendation | null>(null);
  const [askingPrice, setAskingPrice] = useState("");
  const [feelingText, setFeelingText] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [pokemonCards, setPokemonCards] = useState<CuratedCardRecommendation[]>([]);
  const [pokemonPage, setPokemonPage] = useState(1);
  const [pokemonTotal, setPokemonTotal] = useState<number | null>(null);
  const [pokemonLoading, setPokemonLoading] = useState(false);
  const [pokemonError, setPokemonError] = useState<string | null>(null);
  const t = getLocaleCopy(locale).readyModal;
  const canUsePokemonApi = profile.favoriteTcgs.includes("Pokemon") || profile.ip === "Pokemon";
  const canLoadMorePokemon = canUsePokemonApi && (pokemonTotal === null || pokemonCards.length < pokemonTotal);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const apiIds = new Set(pokemonCards.map((card) => card.id));
    const combined = [...pokemonCards, ...recommendations.filter((card) => !apiIds.has(card.id))];
    if (!normalized) return combined;

    return combined.filter((card) =>
      [card.cardName, card.version, card.rarity, card.id]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [pokemonCards, query, recommendations]);

  function handleSelectCard(card: CuratedCardRecommendation) {
    setSelectedCard(card);
    setAskingPrice(card.suggestedRawPrice > 0 ? String(card.suggestedRawPrice) : "");
  }

  const loadPokemonCards = useCallback(async ({ page, append, signal }: { page: number; append: boolean; signal?: AbortSignal }) => {
    if (!canUsePokemonApi) return;

    setPokemonLoading(true);
    setPokemonError(null);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "24",
      });
      const trimmedQuery = query.trim();
      if (trimmedQuery.length >= 2) params.set("query", trimmedQuery);

      const response = await fetch(`/api/external/pokemon/search?${params.toString()}`, { signal });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Pokemon card lookup failed.");

      const cards = Array.isArray(json.cards) ? json.cards.map(pokemonCardToRecommendation) : [];
      setPokemonCards((current) => append ? mergeCards(current, cards) : cards);
      setPokemonPage(page);
      setPokemonTotal(typeof json.totalCount === "number" ? json.totalCount : null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPokemonError(error instanceof Error ? error.message : "Pokemon card lookup failed.");
      if (!append) setPokemonCards([]);
    } finally {
      setPokemonLoading(false);
    }
  }, [canUsePokemonApi, query]);

  useEffect(() => {
    if (!canUsePokemonApi) return;

    const timer = window.setTimeout(() => {
      void loadPokemonCards({ page: 1, append: false });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [canUsePokemonApi, loadPokemonCards]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCard) return;

    onSubmit({
      card: selectedCard,
      askingPrice: Number(askingPrice) || 0,
      feelingText,
      evidenceText,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#24312f]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="mx-auto max-h-[calc(100vh-2rem)] max-w-5xl overflow-y-auto rounded-md bg-[#fcfbf6] p-5 shadow-2xl md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[#64736c]">{t.eyebrow}</p>
            <h2 className="mt-1 font-serif text-3xl font-bold text-[#2f6f73]">{t.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64736c]">
              {t.description}
            </p>
          </div>
          <button className="secondary-button min-h-0 px-3 py-2" type="button" onClick={onClose}>
            {t.close}
          </button>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-[#fcfbf6] p-3">
                <p className="text-xs font-bold uppercase text-[#64736c]">{t.today}</p>
                <p className="mt-1 font-mono text-xl font-black text-[#2f6f73]">{formatMoney(profile.todayBudget)}</p>
              </div>
              <div className="rounded-md bg-[#fcfbf6] p-3">
                <p className="text-xs font-bold uppercase text-[#64736c]">{t.spent}</p>
                <p className="mt-1 font-mono text-xl font-black text-[#24312f]">{formatMoney(todaySpent)}</p>
              </div>
              <div className="rounded-md bg-[#fcfbf6] p-3">
                <p className="text-xs font-bold uppercase text-[#64736c]">{t.left}</p>
                <p className="mt-1 font-mono text-xl font-black text-[#b26a4c]">{formatMoney(todayRemaining)}</p>
              </div>
            </div>
            <label className="field mt-4">
              <span>{t.searchLabel}</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedCard(null);
                }}
                placeholder={t.searchPlaceholder}
              />
            </label>
            {canUsePokemonApi && (
              <div className="mt-3 rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-3 text-sm leading-6 text-[#64736c]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {pokemonLoading
                      ? t.apiLoading
                      : t.apiStatus(pokemonCards.length, pokemonTotal)}
                  </span>
                  <button
                    className="secondary-button min-h-0 px-3 py-2 text-xs"
                    type="button"
                    disabled={pokemonLoading || !canLoadMorePokemon}
                    onClick={() => void loadPokemonCards({ page: pokemonPage + 1, append: true })}
                  >
                    {t.loadMore}
                  </button>
                </div>
                {pokemonError && (
                  <p className="mt-2 font-semibold text-[#b26a4c]">{pokemonError}</p>
                )}
              </div>
            )}
            <div className="mt-4 space-y-3">
              {matches.map((card) => {
                const active = selectedCard?.id === card.id;
                return (
                  <button
                    key={card.id}
                    className={`choice-card min-h-[88px] items-start ${active ? "choice-card-active" : ""}`}
                    type="button"
                    onClick={() => handleSelectCard(card)}
                  >
                    <span>
                      <span className="block text-base">{card.cardName}</span>
                      <span className="mt-1 block text-sm font-medium leading-6 text-[#64736c]">{card.version}</span>
                      <span className="mt-1 block font-mono text-xs text-[#b26a4c]">{localizeCardText(card.rarity, locale)} · {formatMoney(card.suggestedRawPrice)} {t.guide}</span>
                    </span>
                    {active && (
                      <span className="choice-check" aria-hidden="true">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                );
              })}
              {matches.length === 0 && (
                <div className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-4 text-sm leading-6 text-[#64736c]">
                  {t.noMatch}
                </div>
              )}
            </div>
          </section>
          <form className="rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-4" onSubmit={handleSubmit}>
            <div className="rounded-md bg-[#fcfbf6] p-3">
              <p className="text-xs font-bold uppercase text-[#64736c]">{t.selectedVersion}</p>
              <p className="mt-1 font-serif text-xl font-bold text-[#2f6f73]">{selectedCard ? selectedCard.cardName : t.chooseFirst}</p>
              <p className="mt-1 text-sm leading-6 text-[#64736c]">{selectedCard?.version ?? t.noVersionNoVerdict}</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <label className="field">
                <span>{t.askingPrice}</span>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={askingPrice} onChange={(event) => setAskingPrice(event.target.value)} placeholder={selectedCard ? `${formatMoney(selectedCard.suggestedRawPrice)} ${t.guide}` : undefined} required />
              </label>
              <label className="field">
                <span>{t.feeling}</span>
                <textarea
                  value={feelingText}
                  onChange={(event) => setFeelingText(event.target.value)}
                  placeholder={t.feelingPlaceholder}
                  required
                />
              </label>
              <label className="field">
                <span>{t.evidence}</span>
                <textarea
                  value={evidenceText}
                  onChange={(event) => setEvidenceText(event.target.value)}
                  placeholder={t.evidencePlaceholder}
                />
              </label>
              <button className="primary-button" type="submit" disabled={!selectedCard || !feelingText.trim()}>
                <Sparkles className="h-4 w-4" />
                {t.verdict}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function CardDecisionSheet({
  locale,
  card,
  profile,
  readyToBuyResult,
  todayRemaining,
  onClose,
  onRunRaw,
  onCheckRisk,
  onAddToPlan,
  onCreateCooldownTicket,
  onMarkBought,
}: {
  locale: Locale;
  card: CuratedCardRecommendation;
  profile: UserProfile;
  readyToBuyResult: ReadyToBuyResult | null;
  todayRemaining: number;
  onClose: () => void;
  onRunRaw: (card: CuratedCardRecommendation) => void;
  onCheckRisk: (card: CuratedCardRecommendation) => void;
  onAddToPlan: (card: CuratedCardRecommendation) => void;
  onCreateCooldownTicket: (input: ReadyToBuyResult) => void;
  onMarkBought: (input: ReadyToBuyResult) => void;
}) {
  const [showFomoCheck, setShowFomoCheck] = useState(Boolean(readyToBuyResult));
  const [feelingText, setFeelingText] = useState(readyToBuyResult?.feelingText ?? "");
  const [askingPrice, setAskingPrice] = useState(readyToBuyResult?.askingPrice ? String(readyToBuyResult.askingPrice) : "");
  const [evidenceText, setEvidenceText] = useState(readyToBuyResult?.evidenceText ?? "");
  const [fomoResult, setFomoResult] = useState<FomoCheckResult | null>(readyToBuyResult?.fomoResult ?? null);
  const [marketCheck, setMarketCheck] = useState<MarketCheckResponse | null>(null);
  const [marketCheckLoading, setMarketCheckLoading] = useState(false);
  const [marketCheckError, setMarketCheckError] = useState<string | null>(null);
  const [cooldownSaved, setCooldownSaved] = useState(false);
  const [boughtSaved, setBoughtSaved] = useState(false);
  const t = getLocaleCopy(locale).sheet;

  useEffect(() => {
    if (!readyToBuyResult) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setMarketCheck(null);
      setMarketCheckError(null);
      setMarketCheckLoading(true);

      void callMarketCheck({
        cardName: readyToBuyResult.card.cardName,
        cardVersion: readyToBuyResult.card.version,
        tcg: readyToBuyResult.card.tcg,
        askingPrice: readyToBuyResult.askingPrice,
        feelingText: readyToBuyResult.feelingText,
        evidenceText: readyToBuyResult.evidenceText,
        profile: {
          ...profile,
          todayBudget: todayRemaining,
        },
      })
        .then((response) => {
          if (!cancelled) setMarketCheck(response);
        })
        .catch((error) => {
          if (!cancelled) setMarketCheckError(error instanceof Error ? error.message : "Market check failed.");
        })
        .finally(() => {
          if (!cancelled) setMarketCheckLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [profile, readyToBuyResult, todayRemaining]);

  async function handleFomoCheckSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFomoResult = runFomoCheck({
      cardName: card.cardName,
      cardVersion: card.version,
      askingPrice: Number(askingPrice) || 0,
      todayBudget: todayRemaining,
      monthlyBudget: profile.monthlyBudget,
      budgetRange: profile.budgetRange,
      versionConfirmed: true,
      feelingText,
      evidenceText,
    });

    setFomoResult(nextFomoResult);
    setMarketCheck(null);
    setMarketCheckError(null);
    setCooldownSaved(false);
    setBoughtSaved(false);
    setMarketCheckLoading(true);

    try {
      const response = await callMarketCheck({
        cardName: card.cardName,
        cardVersion: card.version,
        tcg: card.tcg,
        askingPrice: Number(askingPrice) || 0,
        feelingText,
        evidenceText,
        profile: {
          ...profile,
          todayBudget: todayRemaining,
        },
      });
      setMarketCheck(response);
    } catch (error) {
      setMarketCheckError(error instanceof Error ? error.message : "Market check failed.");
    } finally {
      setMarketCheckLoading(false);
    }
  }

  const currentDecision = fomoResult
    ? {
        card,
        askingPrice: Number(askingPrice) || 0,
        feelingText,
        evidenceText,
        fomoResult,
      } satisfies ReadyToBuyResult
    : null;

  function handleCooldownClick() {
    if (!currentDecision) return;
    onCreateCooldownTicket(currentDecision);
    setCooldownSaved(true);
  }

  function handleBoughtClick() {
    if (!currentDecision) return;
    onMarkBought(currentDecision);
    setBoughtSaved(true);
  }

  return (
    <div className="fixed inset-0 z-40 bg-[#24312f]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="mx-auto max-h-[calc(100vh-2rem)] max-w-4xl overflow-y-auto rounded-md bg-[#fcfbf6] p-5 shadow-2xl md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-4">
            <DesignedCard card={card} large />
            <div>
              <p className="text-xs font-semibold uppercase text-[#64736c]">{card.tcg} · {localizeCardText(card.rarity, locale)}</p>
              <h2 className="mt-1 font-serif text-3xl font-bold text-[#2f6f73]">{card.cardName}</h2>
              <p className="mt-1 text-[#64736c]">{card.version}</p>
            </div>
          </div>
          <button className="secondary-button min-h-0 px-3 py-2" onClick={onClose}>
            {t.close}
          </button>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-4">
            <h3 className="font-serif text-lg font-bold text-[#2f6f73]">{t.counterNote}</h3>
            <p className="mt-3 leading-7 text-[#36413d]">{localizeCardText(card.buyTone, locale)}</p>
            <GroupedList title={t.riskFlags} items={card.riskFlags.map((flag) => localizeCardText(flag, locale))} />
          </section>
          <section className="rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-4">
            <h3 className="font-serif text-lg font-bold text-[#2f6f73]">{t.snapshot}</h3>
            <DetailGrid
              items={[
                [t.rawGuide, formatMoney(card.suggestedRawPrice)],
                [t.psa9Guide, formatMoney(card.suggestedPsa9Price)],
                [t.psa10Guide, formatMoney(card.suggestedPsa10Price)],
                [t.psa10Odds, formatPercent(card.psa10Probability)],
              ]}
            />
          </section>
        </div>
        {showFomoCheck && (
          <section className="mt-6 rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-[#64736c]">{t.fomoCheck}</p>
                <h3 className="mt-1 font-serif text-2xl font-bold text-[#2f6f73]">{t.slowTitle}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64736c]">
                  {t.slowDescription}
                </p>
              </div>
              <span className="w-fit rounded-md bg-[#e7efe8] px-3 py-2 text-xs font-bold uppercase text-[#64736c]">
                {t.todayLeft} {formatMoney(todayRemaining)}
              </span>
            </div>
            <form className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleFomoCheckSubmit}>
              <label className="field md:col-span-2">
                <span>{t.feeling}</span>
                <textarea
                  value={feelingText}
                  onChange={(event) => setFeelingText(event.target.value)}
                  placeholder={t.feelingPlaceholder}
                  required
                />
              </label>
              <label className="field">
                <span>{t.askingPrice}</span>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={askingPrice} onChange={(event) => setAskingPrice(event.target.value)} placeholder={`${formatMoney(card.suggestedRawPrice)} ${t.rawGuide}`} />
              </label>
              <label className="field">
                <span>{t.evidence}</span>
                <textarea
                  value={evidenceText}
                  onChange={(event) => setEvidenceText(event.target.value)}
                  placeholder={t.evidencePlaceholder}
                />
              </label>
              <div className="md:col-span-2">
                <button className="primary-button" type="submit">
                  <Sparkles className="h-4 w-4" />
                  {t.showCard}
                </button>
              </div>
            </form>
            {fomoResult && (
              <>
                <MarketCheckPanel
                  locale={locale}
                  result={marketCheck}
                  loading={marketCheckLoading}
                  error={marketCheckError}
                  fomoResult={fomoResult}
                  onCreateCooldown={currentDecision && fomoResult.cooldownRecommended ? handleCooldownClick : undefined}
                  onMarkBought={currentDecision ? handleBoughtClick : undefined}
                  cooldownSaved={cooldownSaved}
                  boughtSaved={boughtSaved}
                />
              </>
            )}
          </section>
        )}
        <div className="sticky bottom-0 -mx-5 mt-6 flex flex-col gap-3 border-t border-[#d6ded5] bg-[#fcfbf6]/95 px-5 py-4 backdrop-blur sm:flex-row md:-mx-6 md:px-6">
          <button className="primary-button" onClick={() => setShowFomoCheck((current) => !current)}>
            <Sparkles className="h-4 w-4" />
            {t.fomoCheck}
          </button>
          <button className="secondary-button" onClick={() => onRunRaw(card)}>
            <Calculator className="h-4 w-4" />
            {t.runRaw}
          </button>
          <button className="secondary-button" onClick={() => onCheckRisk(card)}>
            <SearchCheck className="h-4 w-4" />
            {t.checkRisk}
          </button>
          <button className="secondary-button" onClick={() => onAddToPlan(card)}>
            <ClipboardList className="h-4 w-4" />
            {t.addPlan}
          </button>
        </div>
      </div>
    </div>
  );
}

function FomoMetric({
  label,
  score,
  metricLabel,
}: {
  label: string;
  score: number;
  metricLabel: string;
}) {
  return (
    <div className="rounded-md bg-[#fcfbf6]/75 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-[#64736c]">{label}</p>
        <p className="font-mono text-xs font-bold text-[#24312f]">{metricLabel}</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-[#d6ded5]">
        <div className="h-2 rounded-full bg-[#b26a4c]" style={{ width: `${score}%` }} />
      </div>
      <p className="mt-2 font-mono text-xs font-bold text-[#64736c]">{score}/100</p>
    </div>
  );
}

function MarketCheckPanel({
  locale,
  result,
  loading,
  error,
  fomoResult,
  onCreateCooldown,
  onMarkBought,
  cooldownSaved = false,
  boughtSaved = false,
}: {
  locale: Locale;
  result: MarketCheckResponse | null;
  loading: boolean;
  error: string | null;
  fomoResult: FomoCheckResult;
  onCreateCooldown?: () => void;
  onMarkBought?: () => void;
  cooldownSaved?: boolean;
  boughtSaved?: boolean;
}) {
  const t = getLocaleCopy(locale).marketCheck;
  const verdictCopy = getLocaleCopy(locale).verdict;
  const checks = result ? buildMarketCheckItems(result, locale) : [];
  const nextActions = result ? buildCompactMarketActions(result, locale) : [];
  const manualSoldUrl = result?.soldComps.manualCheckUrl;

  return (
    <section className="mt-5 rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-[#64736c]">{t.eyebrow}</p>
          <h4 className="mt-1 font-serif text-2xl font-bold text-[#2f6f73]">{t.title}</h4>
        </div>
        {result && (
          <span className="w-fit rounded-md bg-[#e7efe8] px-3 py-2 text-xs font-bold uppercase text-[#2f6f73]">
            {localizeMarketDecision(result.result.decision, locale)} · {localizeConfidence(result.result.confidence, locale)}
          </span>
        )}
      </div>
      {loading && (
        <MarketCheckLoadingPanel locale={locale} />
      )}
      {error && (
        <div className="mt-4 rounded-md border border-[#d88980] bg-[#fff5f3] p-3 text-sm font-bold text-[#7a241e]">
          {error}
        </div>
      )}
      {result && (
        <>
          <div className="mt-4 rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[#2f6f73] px-3 py-1.5 text-xs font-bold uppercase text-white">
                {localizeMarketDecision(result.result.decision, locale)}
              </span>
              <span className="rounded-md bg-[#fcfbf6] px-3 py-1.5 text-xs font-bold uppercase text-[#64736c]">
                {t.confidence}: {localizeConfidence(result.result.confidence, locale)}
              </span>
              <span className="rounded-md bg-[#fcfbf6] px-3 py-1.5 text-xs font-bold uppercase text-[#64736c]">
                {result.fallbackUsed ? t.localFallback : t.aiChecked}
              </span>
            </div>
            <p className="mt-3 text-base font-semibold leading-7 text-[#24312f]">
              {buildCompactMarketReason(result, locale)}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
            {checks.map((item) => (
              <div key={item.label} className={`rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-3 ${item.kind === "market" ? "md:col-span-2 xl:col-span-2" : ""}`}>
                <p className="text-xs font-bold uppercase text-[#64736c]">{item.label}</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-[#24312f]">{item.value}</p>
                {item.kind === "market" && manualSoldUrl && (
                  <div className="mt-3 border-t border-[#d6ded5] pt-3">
                    <a className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#2f6f73] bg-[#fcfbf6] px-3 py-2 text-sm font-extrabold text-[#2f6f73] hover:bg-[#e7efe8]" href={manualSoldUrl} target="_blank" rel="noopener noreferrer">
                      {t.checkEbaySold}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <p className="mt-2 text-xs font-semibold leading-5 text-[#64736c]">{t.ebaySoldHint}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-3">
            <p className="text-sm font-bold uppercase text-[#64736c]">{t.nextActions}</p>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-[#36413d]">
              {nextActions.map((action) => (
                <li key={action} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#2f6f73]" />
                  <span>{action}</span>
                </li>
              ))}
              {manualSoldUrl && (
                <li className="flex gap-2">
                  <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[#2f6f73]" />
                  <a className="font-bold text-[#2f6f73] underline-offset-4 hover:underline" href={manualSoldUrl} target="_blank" rel="noopener noreferrer">
                    {t.openEbayAction}
                  </a>
                </li>
              )}
            </ul>
          </div>

          {(onCreateCooldown || onMarkBought) && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              {onCreateCooldown && (
                <button className="primary-button" type="button" disabled={cooldownSaved} onClick={onCreateCooldown}>
                  <Clock3 className="h-4 w-4" />
                  {cooldownSaved ? verdictCopy.cooldownSaved : verdictCopy.cooldown}
                </button>
              )}
              {onMarkBought && (
                <button className="secondary-button" type="button" disabled={boughtSaved} onClick={onMarkBought}>
                  <ShoppingBag className="h-4 w-4" />
                  {boughtSaved ? verdictCopy.boughtSaved : verdictCopy.bought}
                </button>
              )}
            </div>
          )}

          <details className="mt-4 rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-3">
            <summary className="cursor-pointer text-sm font-bold text-[#2f6f73]">{t.localSignals}</summary>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <FomoMetric label={verdictCopy.fomoHeat} score={fomoResult.fomoHeat.score} metricLabel={localizeMetricLabel(fomoResult.fomoHeat.label, locale)} />
              <FomoMetric label={verdictCopy.budgetStrain} score={fomoResult.budgetStrain.score} metricLabel={localizeMetricLabel(fomoResult.budgetStrain.label, locale)} />
              <FomoMetric label={verdictCopy.evidenceStrength} score={fomoResult.evidenceStrength.score} metricLabel={localizeMetricLabel(fomoResult.evidenceStrength.label, locale)} />
              <FomoMetric label={verdictCopy.versionClarity} score={fomoResult.versionClarity.score} metricLabel={localizeMetricLabel(fomoResult.versionClarity.label, locale)} />
            </div>
          </details>

          <details className="mt-4 rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-3">
            <summary className="cursor-pointer text-sm font-bold text-[#2f6f73]">{t.debug}</summary>
            <div className="mt-3 rounded-md bg-[#fcfbf6] p-3 text-xs leading-5 text-[#64736c]">
              <p className="font-mono font-bold text-[#24312f]">{result.model}</p>
              <p className="mt-2">{t.sources}</p>
              <ul className="mt-1 space-y-1">
                {result.sources.map((source) => (
                  <li key={`${source.label}-${source.status}-${source.note}`}>
                    {source.label}: {localizeSourceStatus(source.status, locale)} · {localizeMarketText(source.note, locale)}
                  </li>
                ))}
              </ul>
              {result.soldComps.lookupQuery && (
                <p className="mt-2 font-mono">
                  eBay: {result.soldComps.lookupQuery}
                </p>
              )}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {result.trace.map((step) => (
                <div key={`${step.step}-${step.tool}`} className="rounded-md bg-[#fcfbf6] p-3 text-xs leading-5 text-[#64736c]">
                  <p className="font-mono font-bold text-[#24312f]">{step.tool}</p>
                  <p>{localizeMarketText(step.summary, locale)}</p>
                  <p className="font-mono">{step.model}</p>
                </div>
              ))}
            </div>
          </details>
          {result.fallbackUsed && (
            <p className="mt-3 text-xs font-bold uppercase text-[#b26a4c]">{t.fallback}</p>
          )}
        </>
      )}
    </section>
  );
}

function MarketCheckLoadingPanel({ locale }: { locale: Locale }) {
  const t = getLocaleCopy(locale).marketCheck;
  const steps = t.loadingSteps;
  const [activeStep, setActiveStep] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const active = steps[activeStep];

  useEffect(() => {
    const stepTimer = window.setInterval(() => {
      setActiveStep((current) => (current + 1) % steps.length);
    }, 1400);
    const elapsedTimer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(elapsedTimer);
    };
  }, [steps.length]);

  return (
    <div className="market-agent-panel mt-4 rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-4" aria-live="polite">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="agent-live-dot" />
            <p className="text-xs font-black uppercase tracking-wide text-[#2f6f73]">{t.loadingEyebrow}</p>
          </div>
          <p className="mt-2 text-base font-extrabold leading-7 text-[#24312f]">{t.loading}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black uppercase text-[#64736c]">
            <span className="rounded-md bg-[#fcfbf6] px-2.5 py-1.5 text-[#2f6f73]">
              {t.loadingNow}: {active.label}
            </span>
            <span className="rounded-md bg-[#fcfbf6] px-2.5 py-1.5">
              {t.loadingElapsed}: {elapsedSeconds}s
            </span>
          </div>
        </div>
        <div className="agent-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="agent-progress mt-4" aria-hidden="true">
        <span />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-5">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className={`agent-step rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-3 ${index === activeStep ? "is-active" : ""} ${index < activeStep ? "is-complete" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span className="agent-step-dot" />
              <p className="text-xs font-black uppercase text-[#64736c]">{step.label}</p>
            </div>
            <p className="mt-2 min-h-10 text-xs font-semibold leading-5 text-[#64736c]">{step.detail}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e7efe8]">
              <span className="agent-step-bar block h-full rounded-full bg-[#2f6f73]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolSurface({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <SectionIntro eyebrow={eyebrow} title={title} description={description} icon={Icon} />
      <div className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5 shadow-sm md:p-6">{children}</div>
    </section>
  );
}

function SectionIntro({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex max-w-3xl items-start gap-3">
      {Icon && (
        <span className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#2f6f73] text-[#f4f7f3]">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div>
        <p className="text-xs font-semibold uppercase text-[#64736c]">{eyebrow}</p>
        <h2 className="mt-1 font-serif text-3xl font-bold text-[#2f6f73]">{title}</h2>
        <p className="mt-2 leading-7 text-[#64736c]">{description}</p>
      </div>
    </div>
  );
}

function RiskReport({
  locale,
  report,
  onContinue,
  onAddToPlan,
}: {
  locale: Locale;
  report: ListingRiskReport;
  onContinue: () => void;
  onAddToPlan: () => void;
}) {
  const riskTone = getRiskTone(report.score, locale);
  const t = getLocaleCopy(locale).riskReport;

  return (
    <section className="mt-6 rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div className={`rounded-lg border p-5 ${riskTone.containerClass}`}>
          <p className="text-xs font-semibold uppercase tracking-wide">{riskTone.kicker}</p>
          <p className="mt-2 text-4xl font-black leading-none md:text-5xl">{riskTone.headline}</p>
          <p className="mt-3 text-sm font-semibold">{t.confidence}: {localizeOption(report.confidence, locale)}</p>
        </div>
        <p className="leading-7 text-[#36413d]">{localizeRiskReportText(report.cautiousSummary, locale)}</p>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <GroupedList title={t.missingInfo} items={localizeRiskReportItems(report.missingInfo, locale)} />
        <GroupedList title={t.keyRisks} items={localizeRiskReportItems(report.keyRisks, locale)} />
        <GroupedList title={t.sellerQuestions} items={localizeRiskReportItems(report.sellerQuestions, locale)} />
      </div>
      <div className="mt-5 rounded-md bg-[#fcfbf6] p-4 text-sm leading-6 text-[#24312f]">
        <strong>{t.suitability}:</strong> {localizeRiskReportText(report.suitability, locale)}
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button className="primary-button" type="button" onClick={onContinue}>
          <Calculator className="h-4 w-4" />
          {t.continueRaw}
        </button>
        <button className="secondary-button" type="button" onClick={onAddToPlan}>
          <ClipboardList className="h-4 w-4" />
          {t.addPlan}
        </button>
      </div>
    </section>
  );
}

function ListingRiskPipeline({
  locale,
  state,
  loading,
  onEvidenceChange,
  onContinue,
  onAddToPlan,
}: {
  locale: Locale;
  state: ListingPipelineState;
  loading: "evidence" | "risk_math_critic" | null;
  onEvidenceChange: (evidence: ListingEvidence) => void;
  onContinue: (evidence: ListingEvidence) => void;
  onAddToPlan: () => void;
}) {
  if (!state.listingInput && !loading) return null;
  const t = getLocaleCopy(locale).pipeline;

  const updateEvidence = (field: keyof Pick<ListingEvidence, "cardName" | "setCode" | "cardNumber" | "language">, value: string) => {
    if (!state.evidence) return;
    onEvidenceChange({
      ...state.evidence,
      [field]: {
        ...state.evidence[field],
        value: value.trim() || null,
        confidence: value.trim() ? "high" : "low",
        source: value.trim() ? "explicit_description" : "unknown",
      },
    });
  };

  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-md border border-[#d6ded5] bg-[#e7efe8] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-[#64736c]">{t.eyebrow}</p>
            <h3 className="mt-1 font-serif text-2xl font-bold text-[#2f6f73]">{t.title}</h3>
          </div>
          <Badge icon={ListChecks}>{state.fallbackUsed ? t.localFallback : t.editableReview}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold uppercase text-[#64736c] md:grid-cols-4">
          {[
            [t.evidence, Boolean(state.evidence)],
            [t.risk, Boolean(state.riskScore)],
            [t.math, Boolean(state.math)],
            [t.critic, Boolean(state.critic)],
          ].map(([label, done]) => (
            <div key={String(label)} className={`rounded-md border px-3 py-2 ${done ? "border-[#2f6f73] bg-[#fcfbf6] text-[#2f6f73]" : "border-[#d6ded5] bg-[#f4f7f3]"}`}>
              {done ? t.done : t.waiting} · {label}
            </div>
          ))}
        </div>
      </div>

      {loading === "evidence" && <PipelineNote label={t.evidenceLoading} />}

      {state.evidence && (
        <section className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-[#64736c]">{t.extracted}</p>
              <h3 className="mt-1 font-serif text-2xl font-bold text-[#2f6f73]">{t.confirmIdentity}</h3>
            </div>
            <button className="primary-button" type="button" disabled={loading !== null} onClick={() => onContinue(state.evidence!)}>
              <Check className="h-4 w-4" />
              {t.confirmContinue}
            </button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {([
              ["cardName", t.cardName],
              ["setCode", t.set],
              ["cardNumber", t.cardNumber],
              ["language", t.language],
            ] as const).map(([field, label]) => (
              <label key={field} className="rounded-md bg-[#f4f7f3] p-3">
                <span className="text-xs font-semibold uppercase text-[#64736c]">{label}</span>
                <input
                  className="mt-2 w-full rounded-md border border-[#d6ded5] bg-[#fcfbf6] px-3 py-2 font-mono text-sm outline-none focus:border-[#2f6f73]"
                  value={state.evidence?.[field].value ?? ""}
                  placeholder={t.missing}
                  onChange={(event) => updateEvidence(field, event.target.value)}
                />
                <span className="mt-2 block text-xs font-semibold text-[#64736c]">
                  {localizeOption(state.evidence?.[field].confidence ?? "low", locale)} · {localizeOption(state.evidence?.[field].source ?? "unknown", locale)}
                </span>
              </label>
            ))}
          </div>
          <GroupedList title={`${t.missingEvidence} (${state.evidence.missingEvidence.length})`} items={state.evidence.missingEvidence} />
        </section>
      )}

      {loading === "risk_math_critic" && !state.riskScore && <PipelineNote label={t.riskLoading} />}

      {state.riskScore && (
        <section className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5">
          <p className="text-xs font-semibold uppercase text-[#64736c]">{t.riskAgent}</p>
          <h3 className={`mt-2 font-serif text-4xl font-bold leading-tight ${state.riskScore.overall >= 70 ? "text-[#b26a4c]" : "text-[#2f6f73]"}`}>
            {localizeRiskReportText(state.riskScore.verdict, locale)}
          </h3>
          <p className="mt-2 font-mono text-lg font-bold">{t.overall}: {state.riskScore.overall}/100</p>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {Object.entries(state.riskScore.dimensions).map(([key, dimension]) => (
              <div key={key} className="rounded-md bg-[#f4f7f3] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold capitalize text-[#36413d]">{localizeRiskDimensionName(key, locale)}</p>
                  <p className="font-mono font-bold">{dimension.score}/100</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#64736c]">{localizeRiskReportText(dimension.reasons.join(" "), locale)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {state.math && (
        <section className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5">
          <p className="text-xs font-semibold uppercase text-[#64736c]">{t.mathAgent}</p>
          <h3 className="mt-1 font-serif text-2xl font-bold text-[#2f6f73]">{t.mathImpact}</h3>
          <div className="mt-5 rounded-md bg-[#f4f7f3] p-5 text-center">
            <p className="text-sm font-semibold uppercase text-[#64736c]">{t.expectedValue}</p>
            <p className={`mt-2 font-mono text-5xl font-black ${state.math.result.expectedProfit >= 0 ? "text-[#2f6f73]" : "text-[#b26a4c]"}`}>
              {formatMoney(state.math.result.expectedProfit)}
            </p>
            <p className="mt-2 text-sm text-[#64736c]">{localizeRawText(state.math.result.recommendation, locale)}</p>
          </div>
          <GroupedList title={t.assumptions} items={localizeRawItems(state.math.assumptionNotes, locale)} />
        </section>
      )}

      {state.critic && (
        <section className={`rounded-md border p-5 ${state.critic.passed ? "border-[#2f6f73] bg-[#e4eee7]" : "border-[#b26a4c] bg-[#fff3ed]"}`}>
          <p className="text-xs font-semibold uppercase text-[#64736c]">{t.finalRecommendation}</p>
          <h3 className="mt-2 font-serif text-3xl font-bold leading-tight text-[#24312f]">{localizeRiskReportText(state.critic.finalRecommendation, locale)}</h3>
          {state.critic.warnings.length > 0 && <GroupedList title={t.criticWarnings} items={localizeRiskReportItems(state.critic.warnings, locale)} />}
          <button className="primary-button mt-5" type="button" onClick={onAddToPlan}>
            <ClipboardList className="h-4 w-4" />
            {t.addPlan}
          </button>
        </section>
      )}

      {state.trace.length > 0 && (
        <details className="rounded-md border border-[#d6ded5] bg-[#24312f] p-5 text-sm text-[#f4f7f3]">
          <summary className="cursor-pointer font-mono text-xs uppercase text-[#d7a84e]">{t.trace} ({state.trace.length} {t.agents})</summary>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {state.trace.map((step) => (
              <article key={step.step} className="rounded-md border border-[#36413d] bg-[#2d3d3b] p-4 font-mono text-xs">
                <p className="uppercase text-[#d7a84e]">{step.step}</p>
                <h4 className="mt-1 text-sm font-bold text-[#fcfbf6]">{step.agent}</h4>
                <p className="mt-2 leading-6">{sanitizeTraceMessage(step.summary, locale)}</p>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function PipelineNote({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-5">
      <div className="h-4 w-48 animate-pulse rounded bg-[#d6ded5]" />
      <p className="mt-4 text-sm font-semibold text-[#64736c]">{label}</p>
    </div>
  );
}

function AgentTrace({ locale, response }: { locale: Locale; response: HermesResponse }) {
  const t = getLocaleCopy(locale).agentTrace;

  return (
    <details className="mt-6 rounded-md border border-[#d6ded5] bg-[#e7efe8] p-5 text-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 font-semibold">
        <Badge icon={Sparkles}>{t.viewTrace}</Badge>
        <Badge icon={Gauge}>{response.fallbackUsed ? t.localFallback : t.aiAssisted}</Badge>
      </summary>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Badge icon={Sparkles}>{t.hermesTask}: {response.taskType}</Badge>
      </div>
      {response.warnings.length > 0 && <GroupedList title={t.warnings} items={response.warnings.map((message) => sanitizeTraceMessage(message, locale))} />}
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {response.trace.map((step) => (
          <article key={`${step.step}-${step.agent}`} className="rounded-md border border-[#d6ded5] bg-[#fcfbf6] p-4">
            <p className="text-xs font-semibold uppercase text-[#64736c]">{step.step}</p>
            <h4 className="mt-1 text-base font-semibold text-[#2f6f73]">{step.agent}</h4>
            <p className="mt-2 text-sm leading-6 text-[#64736c]">{sanitizeTraceMessage(step.summary, locale)}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#64736c]">
              <span className="rounded-md bg-[#e7efe8] px-2 py-1">{t.model}: {sanitizeTraceMessage(step.model, locale)}</span>
              {step.toolsUsed.map((tool) => (
                <span key={tool} className="rounded-md bg-[#e7efe8] px-2 py-1">
                  {t.tool}: {tool}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}

function AiHealthBanner({ locale, health }: { locale: Locale; health: AiHealth }) {
  const t = getLocaleCopy(locale).aiHealth;
  const modelText = health.models
    ?.filter((model) => !model.ok)
    .map((model) => `${model.role}: ${model.model}${model.status ? ` (${model.status})` : ""}`)
    .join(", ");

  return (
    <div className="border-b border-[#e2c76c] bg-[#fff7d6] px-5 py-3 text-sm font-medium text-[#59451a]">
      <div className="mx-auto max-w-7xl">
        {localizeAiMessage(health.warning, locale) || t.fallback}
        {modelText ? <span className="ml-2 font-mono text-xs">{t.check}: {modelText}</span> : null}
      </div>
    </div>
  );
}

function AiError({ locale, message }: { locale: Locale; message: string }) {
  return (
    <div className="mt-5 rounded-md border border-[#d8a29a] bg-[#fff7f5] p-4 text-sm leading-6 text-[#81352f]">
      <strong>{getLocaleCopy(locale).common.aiRequestFailed}:</strong> {localizeAiMessage(message, locale)}
    </div>
  );
}

function CalibrationCard({ locale, calibration, onApply }: { locale: Locale; calibration: GradingCalibration; onApply: () => void }) {
  const t = getLocaleCopy(locale).calibration;

  return (
    <section className="mb-5 rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-[#64736c]">{t.title}</p>
          <p className="mt-2 text-sm leading-6 text-[#36413d]">{localizeCalibrationMessage(calibration.message, locale)}</p>
          {calibration.enoughHistory && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#64736c]">
              <span className="rounded-md bg-[#fcfbf6] px-2 py-1">{t.sample}: {calibration.sampleSize}</span>
              <span className="rounded-md bg-[#fcfbf6] px-2 py-1">{t.assumedAvg}: {formatPercent(calibration.assumedAverage)}</span>
              <span className="rounded-md bg-[#fcfbf6] px-2 py-1">{t.actualPsa10}: {formatPercent(calibration.actualPsa10Rate)}</span>
            </div>
          )}
        </div>
        <button className="secondary-button shrink-0" type="button" disabled={!calibration.enoughHistory} onClick={onApply}>
          {t.apply}
        </button>
      </div>
    </section>
  );
}

function RawResult({ locale, result, context, onAddToPlan }: { locale: Locale; result: RawVsSlabResult; context: RawDecisionContext; onAddToPlan: () => void }) {
  const profitable = result.expectedProfit >= 0;
  const t = getLocaleCopy(locale).rawResult;

  return (
    <section className="mt-6 space-y-4">
      <div
        className={`rounded-lg border p-6 text-center ${
          profitable ? "border-[#9fc7a3] bg-[#f1f8ef] text-[#173f24]" : "border-[#e1aaa4] bg-[#fff5f3] text-[#7a241e]"
        }`}
      >
        <p className="mx-auto mb-3 w-fit rounded-md bg-[#fcfbf6]/70 px-3 py-1 text-xs font-bold uppercase text-[#64736c]">{context.cardName}</p>
        <p className="text-xs font-extrabold uppercase tracking-wide">{t.expectedProfit}</p>
        <p className="mt-2 font-mono text-5xl font-black leading-none md:text-6xl">{formatMoney(result.expectedProfit)}</p>
        <p className="mx-auto mt-4 max-w-3xl text-sm font-semibold leading-6">{localizeRawText(result.recommendation, locale)}</p>
        <button className="secondary-button mt-5 bg-[#fcfbf6]/80" type="button" onClick={onAddToPlan}>
          <ClipboardList className="h-4 w-4" />
          {t.addPlan}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-5">
          <h3 className="font-serif text-lg font-bold text-[#2f6f73]">{t.supportingNumbers}</h3>
          <DetailGrid
            items={[
              [t.psa10Net, formatMoney(result.psa10NetValue)],
              [t.psa9Net, formatMoney(result.psa9NetValue)],
              [t.otherNet, formatMoney(result.otherNetValue)],
              [t.worstCase, formatMoney(result.worstCaseOutcome)],
              [
                t.breakEvenPsa10,
                result.breakEvenPsa10Probability === null ? getLocaleCopy(locale).common.notAvailable : `${(result.breakEvenPsa10Probability * 100).toFixed(1)}%`,
              ],
            ]}
            dangerLabels={[t.worstCase]}
          />
        </div>
        <div className="rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-5">
          <h3 className="font-serif text-lg font-bold text-[#2f6f73]">{t.explanation}</h3>
          <p className="mt-3 leading-7 text-[#36413d]">{localizeRawText(result.explanation, locale)}</p>
          <GroupedList title={t.assumptions} items={localizeRawItems(result.assumptions, locale)} />
        </div>
      </div>
    </section>
  );
}

function JournalEntry({
  locale,
  entry,
  onAskAgent,
  onAddToPlan,
  loading,
}: {
  locale: Locale;
  entry: DecisionJournalEntry;
  onAskAgent: (entry: DecisionJournalEntry) => void;
  onAddToPlan: (entry: DecisionJournalEntry) => void;
  loading: boolean;
}) {
  const t = getLocaleCopy(locale).journalEntry;

  return (
    <article className="rounded-md border border-[#d6ded5] bg-[#f4f7f3] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#64736c]">{localizeOption(entry.actionType, locale)}</p>
          <h3 className="mt-1 font-serif text-lg font-bold text-[#2f6f73]">{entry.cardName}</h3>
        </div>
        <span className="rounded-md bg-[#d7a84e] px-3 py-1 text-sm font-bold text-[#4a3f24]">{formatMoney(entry.price)}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#64736c]">{entry.thesis}</p>
      <DetailGrid
        items={[
          ["TCG", entry.tcg],
          [t.version, entry.version || t.notSpecified],
          [t.date, entry.date],
          [t.tags, entry.tags || t.notSpecified],
          [t.sentiment, localizeOption(entry.sentiment, locale)],
          [t.reviewStatus, localizeOption(entry.reviewStatus, locale)],
          [t.watchReason, entry.watchReason || t.notSpecified],
          [t.buyCondition, entry.buyCondition || t.notSpecified],
          [t.stopCondition, entry.stopCondition || t.notSpecified],
          [t.risks, entry.risks || t.notSpecified],
          [t.missingInfo, entry.missingInfo || t.notSpecified],
          [t.finalOutcome, entry.finalOutcome || t.notRecorded],
          [t.lessons, entry.lessonsLearned || t.notRecorded],
          [t.assumedPsa10, typeof entry.assumedPsa10Probability === "number" ? formatPercent(entry.assumedPsa10Probability) : t.notSpecified],
          [t.actualGrade, localizeOption(entry.actualGrade || "UNKNOWN", locale)],
        ]}
      />
      <div className="mt-5 flex flex-wrap gap-3">
        <button className="secondary-button" type="button" disabled={loading} onClick={() => onAskAgent(entry)}>
          <Sparkles className="h-4 w-4" />
          {loading ? t.checking : t.askAgent}
        </button>
        <button className="secondary-button" type="button" onClick={() => onAddToPlan(entry)}>
          <ClipboardList className="h-4 w-4" />
          {t.addReview}
        </button>
      </div>
    </article>
  );
}

function DesignedCard({ card, large = false }: { card: CuratedCardRecommendation; large?: boolean }) {
  const tone = getTcgTone(card.tcg);

  if (card.imageUrl) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-md border border-[#bccbc2] bg-[#e7efe8] ${large ? "h-52 w-36" : "h-32 w-24"} shadow-inner`}
      >
        <Image
          className="object-contain"
          src={card.imageUrl}
          alt={`${card.cardName} ${card.version}`}
          fill
          priority={large}
          sizes={large ? "144px" : "96px"}
        />
        <div className="absolute left-2 top-2 rounded-sm bg-[#24312f]/75 px-1.5 py-0.5 text-[8px] font-black uppercase text-[#f4f7f3]">
          {card.tcg}
        </div>
        {card.imageSource && (
          <div className="absolute inset-x-2 bottom-2 rounded-sm bg-[#fcfbf6]/85 px-1.5 py-0.5 text-center text-[8px] font-black uppercase text-[#64736c]">
            {card.imageSource}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md border ${tone.border} ${tone.bg} ${large ? "h-52 w-36" : "h-32 w-24"} p-2 shadow-inner`}
    >
      <div className={`absolute inset-x-0 top-0 h-2 ${tone.strip}`} />
      <div className="absolute left-2 top-4 rounded-sm bg-[#24312f]/70 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-[#f4f7f3]">
        {card.tcg}
      </div>
      <div className="absolute right-2 top-4 rounded-sm bg-[#f4f7f3] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#b26a4c]">
        {card.rarity.slice(0, 5)}
      </div>
      <div className="mt-8 flex h-[calc(100%-2rem)] flex-col justify-between">
        <div>
          <div className="grid min-h-14 place-items-center rounded-sm border border-current/20 bg-[#fcfbf6]/20 p-2 text-center">
            <span className="font-serif text-[10px] font-bold uppercase leading-4">
              Binder
              <br />
              slot
            </span>
          </div>
          <div className="mt-2 w-fit rotate-[-3deg] rounded-sm bg-[#d7a84e] px-2 py-1 text-[9px] font-black uppercase text-[#4a3f24]">
            Ask photos
          </div>
        </div>
        <div>
          <p className="truncate font-serif text-[11px] font-black uppercase">{card.cardName}</p>
          <p className="truncate text-[9px] font-semibold opacity-75">{card.version}</p>
        </div>
      </div>
    </div>
  );
}

function GroupedList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-5">
      <h4 className="text-sm font-semibold uppercase text-[#64736c]">{title}</h4>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-[#36413d]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b26a4c]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetailGrid({ items, dangerLabels = [] }: { items: [string, string][]; dangerLabels?: string[] }) {
  return (
    <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => {
        const isDanger = dangerLabels.includes(label);

        return (
          <div key={label} className="rounded-md bg-[#e7efe8] p-3">
            <dt className="text-xs font-semibold uppercase text-[#64736c]">{label}</dt>
            <dd className={`mt-1 font-mono text-sm leading-6 ${isDanger ? "font-bold text-[#b26a4c]" : "text-[#24312f]"}`}>{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function Badge({ children, icon: Icon }: { children: React.ReactNode; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-md border border-[#d6ded5] bg-[#fcfbf6] px-3 py-1.5 text-sm font-semibold text-[#24312f]">
      <Icon className="h-4 w-4 text-[#b26a4c]" />
      {children}
    </span>
  );
}

const InputField = ({
  label,
  className = "",
  type,
  inputMode,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className={`field ${className}`}>
    <span>{label}</span>
    <input type={type} inputMode={inputMode ?? (type === "number" ? "decimal" : undefined)} {...props} />
  </label>
);

const TextAreaField = ({
  label,
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) => (
  <label className={`field ${className}`}>
    <span>{label}</span>
    <textarea rows={4} {...props} />
  </label>
);

const SelectField = ({
  label,
  options,
  locale = "en",
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: readonly string[]; locale?: Locale }) => (
  <label className={`field ${className}`}>
    <span>{label}</span>
    <select {...props}>
      {options.map((option) => (
        <option key={option} value={option}>
          {localizeOption(option, locale)}
        </option>
      ))}
    </select>
  </label>
);

async function callHermes(payload: unknown): Promise<HermesResponse> {
  const response = await fetch("/api/hermes/route", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const json = parseJsonResponse(text);

  if (!response.ok) {
    throw new Error(json?.error || "Hermes request failed.");
  }

  return hermesResponseSchema.parse(json);
}

type PipelineStreamStage =
  | { stage: "evidence"; evidence: ListingEvidence; trace: PipelineTraceStep; warnings: string[]; fallbackUsed: boolean }
  | { stage: "risk"; riskScore: RiskScore; trace: PipelineTraceStep; warnings: string[]; fallbackUsed: boolean }
  | { stage: "math"; math: PipelineMathResult; trace: PipelineTraceStep; warnings: string[]; fallbackUsed: boolean }
  | { stage: "critic"; critic: PipelineCriticResult; trace: PipelineTraceStep; warnings: string[]; fallbackUsed: boolean }
  | { stage: "done" }
  | { stage: "error"; message: string };

async function callListingRiskPipeline(input: {
  listingInput: ListingRiskInput;
  evidence?: ListingEvidence;
  continueFromEvidence?: boolean;
  onStage: (stage: PipelineStreamStage) => void;
}) {
  const response = await fetch("/api/hermes/pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      listingInput: input.listingInput,
      evidence: input.evidence,
      continueFromEvidence: Boolean(input.continueFromEvidence),
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Pipeline request failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const line = chunk.split("\n").find((item) => item.startsWith("data: "));
      if (!line) continue;
      input.onStage(JSON.parse(line.slice(6)) as PipelineStreamStage);
    }
  }
}

async function callMarketCheck(input: {
  cardName: string;
  cardVersion: string;
  tcg: CuratedCardRecommendation["tcg"];
  askingPrice: number;
  feelingText: string;
  evidenceText: string;
  profile: UserProfile;
}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);
  let response: Response;

  try {
    response = await fetch("/api/agent/market-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Market check is taking too long. Use the deterministic pre-buy result and try AI again after the model/proxy responds faster.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  const text = await response.text();
  const json = parseJsonResponse(text);

  if (!response.ok) {
    throw new Error(json?.error || "Market check failed.");
  }

  return marketCheckResponseSchema.parse(json);
}

function parseJsonResponse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return {
      error: text.slice(0, 180) || "Hermes returned a non-JSON response.",
    };
  }
}

function summarizeJournal(entries: DecisionJournalEntry[]) {
  return entries
    .slice(0, 5)
    .map((entry) => `${entry.actionType}: ${entry.cardName}. TCG: ${entry.tcg}. Sentiment: ${entry.sentiment}. Thesis: ${entry.thesis}. Risks: ${entry.risks}`)
    .join("\n");
}

function buildLocalJournalReflection(entry: DecisionJournalEntry): JournalDraft {
  return journalDraftSchema.parse({
    cardName: entry.cardName,
    actionType: entry.actionType,
    thesis: entry.thesis,
    buyCondition: entry.buyCondition || "Only move forward when version, condition evidence, and price assumptions are clear.",
    sellCondition: entry.sellCondition || "Review the card after the planned holding period or when the original thesis no longer fits.",
    stopCondition: entry.stopCondition || "Pause if the missing information changes the risk profile or the decision depends on an optimistic grade.",
    risks: entry.risks || "Condition evidence, version clarity, liquidity, and budget discipline need another pass.",
    missingInfo: entry.missingInfo || "Recent sold comps, clear front/back photos, and a concrete review date.",
    reviewPrompt: buildJournalReviewSummary(entry),
  });
}

function buildJournalReviewSummary(entry: DecisionJournalEntry) {
  const reviewTarget = entry.reviewDate ? `Review on ${entry.reviewDate}` : "Set a review date";
  const watchReason = entry.watchReason || entry.thesis;
  return `${reviewTarget}. Re-check: ${watchReason}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function mergeCards(current: CuratedCardRecommendation[], incoming: CuratedCardRecommendation[]) {
  return Array.from(new Map([...current, ...incoming].map((card) => [card.id, card])).values());
}

function getLocaleCopy(locale: Locale) {
  return locale === "zh" ? zhCopy : enCopy;
}

function localizeMetricLabel(label: FomoCheckResult["fomoHeat"]["label"], locale: Locale) {
  if (locale === "en") return label;
  const map: Record<FomoCheckResult["fomoHeat"]["label"], string> = {
    Low: "低",
    Medium: "中",
    High: "高",
  };
  return map[label];
}

function localizeMarketDecision(decision: MarketCheckResponse["result"]["decision"], locale: Locale) {
  if (locale === "en") return decision;
  const map: Record<MarketCheckResponse["result"]["decision"], string> = {
    Buy: "可以买",
    "Ask seller": "先问卖家",
    Wait: "先等等",
    Pause: "暂停",
  };
  return map[decision];
}

function localizeConfidence(confidence: MarketCheckResponse["result"]["confidence"], locale: Locale) {
  if (locale === "en") return confidence;
  const map: Record<MarketCheckResponse["result"]["confidence"], string> = {
    low: "低把握",
    medium: "中等把握",
    high: "高把握",
  };
  return map[confidence];
}

function localizeSourceStatus(status: MarketCheckResponse["sources"][number]["status"], locale: Locale) {
  if (locale === "en") return status;
  const map: Record<MarketCheckResponse["sources"][number]["status"], string> = {
    used: "已使用",
    missing: "没找到",
    unavailable: "未接入",
  };
  return map[status];
}

function buildCompactMarketReason(result: MarketCheckResponse, locale: Locale) {
  const activeBudget = result.budget.activeBudget;
  const ask = result.input.askingPrice;

  if (result.budget.hardStop) {
    return locale === "zh"
      ? `先暂停。这张卡开价 ${formatMoney(ask)}，高于你现在的 ${formatMoney(activeBudget)} 预算线。`
      : `Pause for now. The ask is ${formatMoney(ask)}, above your active ${formatMoney(activeBudget)} guardrail.`;
  }

  if (!result.soldComps.available) {
    return locale === "zh"
      ? "先不要直接买。预算可继续看，但 TCGpal 还没有接入近期成交记录。"
      : "Do not make it a clean buy yet. Budget is reviewable, but recent sold comps are not connected.";
  }

  if (result.evidence.gaps.length > 0 || result.identifiedCard.confidence !== "high") {
    return locale === "zh"
      ? "先问卖家。版本或品相信息还不够支撑直接下单。"
      : "Ask the seller first. Version or condition evidence is not strong enough for a clean buy.";
  }

  return locale === "zh"
    ? "可以继续考虑，但只在预算和品相信息都守住时才下单。"
    : "You can keep considering it, but only if price and condition still stay inside your guardrails.";
}

function buildMarketCheckItems(result: MarketCheckResponse, locale: Locale) {
  const reference = getReferenceLabel(result, locale);
  const comps = result.soldComps.available
    ? locale === "zh" ? "有成交记录" : "Comps connected"
    : result.soldComps.manualCheckUrl
      ? locale === "zh" ? "手动核对链接" : "Manual sold check"
      : locale === "zh" ? "未接成交" : "No sold comps";
  const budget = result.budget.hardStop
    ? locale === "zh" ? "超过预算" : "Over budget"
    : locale === "zh" ? "预算内" : "Inside budget";
  const evidence = result.evidence.gaps.length === 0
    ? locale === "zh" ? "信息够看" : "Evidence okay"
    : locale === "zh" ? `缺 ${result.evidence.gaps.length} 项` : `${result.evidence.gaps.length} gaps`;

  return [
    { label: locale === "zh" ? "版本" : "Version", value: localizeConfidence(result.identifiedCard.confidence, locale), kind: "version" },
    { label: locale === "zh" ? "预算" : "Budget", value: budget, kind: "budget" },
    { label: locale === "zh" ? "市场" : "Market", value: `${reference} · ${comps}`, kind: "market" },
    { label: locale === "zh" ? "信息" : "Evidence", value: evidence, kind: "evidence" },
  ];
}

function getReferenceLabel(result: MarketCheckResponse, locale: Locale) {
  if (!result.referencePrices.available) {
    return locale === "zh" ? "无实时参考" : "No live ref";
  }

  if (result.referencePrices.source === "TCGpal curated baseline") {
    return locale === "zh" ? "Demo 基准" : "Demo baseline";
  }

  if (result.referencePrices.source === "PriceCharting") {
    return locale === "zh" ? "PriceCharting 参考" : "PriceCharting ref";
  }

  return locale === "zh" ? "外部参考" : "External ref";
}

function buildCompactMarketActions(result: MarketCheckResponse, locale: Locale) {
  if (result.budget.hardStop) {
    return locale === "zh"
      ? ["先等 24 小时。", `除非价格降到 ${formatMoney(result.budget.activeBudget)} 以内，否则不要出价。`]
      : ["Wait 24 hours.", `Do not offer unless the price drops under ${formatMoney(result.budget.activeBudget)}.`];
  }

  if (!result.soldComps.available) {
    return locale === "zh"
      ? ["只看同版本、同评级的近期成交中位价。", "确认价格和品相都合理后再决定。"]
      : ["Use the recent median for matching version and grade.", "Only continue if price and condition still line up."];
  }

  const actions = localizeMarketItems(result.result.nextActions, locale).slice(0, 2);
  return actions.length ? actions : locale === "zh" ? ["先补齐缺的信息。"] : ["Fill the missing evidence first."];
}

function localizeMarketItems(items: string[], locale: Locale) {
  return items.map((item) => localizeMarketText(item, locale));
}

function localizeMarketText(text: string, locale: Locale) {
  if (locale === "en") return text;

  const exact: Record<string, string> = {
    "OpenAI API key is missing. TCGpal used local deterministic tools only.": "没有配置 OpenAI API key，TCGpal 已使用本地确定性工具。",
    "Card version is not confirmed.": "卡片版本还没确认。",
    "Front photo is missing.": "缺正面图。",
    "Back photo is missing.": "缺背面图。",
    "Corner or edge closeups are missing.": "缺边角或边缘特写。",
    "Surface or video evidence is missing.": "缺表面或视频信息。",
    "Recent sold comps or reference prices are missing.": "缺近期成交价或参考价。",
    "Seller policy or return terms are missing.": "缺卖家政策或退换条款。",
    "Exact card/version confidence is not high.": "卡片/版本确认把握度还不高。",
    "Recent sold comps are unavailable.": "近期成交记录目前未接入。",
    "Reference prices are unavailable.": "参考价格目前不可用。",
    "Budget hard stop must clear before buying.": "预算硬停解除前不要买。",
    "Sold comps are unavailable in this build. Ask for or manually verify recent completed sales before buying.": "这个版本还没有接入成交记录。购买前请手动确认近期已成交价格。",
    "No sold-comps provider is wired in Phase 0.8. Do not claim eBay or marketplace sold history.": "Phase 0.8 还没有接入成交数据来源，不能声称查过 eBay 或市场成交。",
    "Automated sold comps are unavailable in this build. Use the manual eBay sold-search link to verify recent completed sales before buying.": "这个版本还没有接入自动成交数据。购买前请用 eBay sold 搜索链接手动核对近期已成交价格。",
    "Automated sold comps are not connected. Generated a verified eBay sold-search link for manual review.": "自动成交数据尚未接入；这里只生成 eBay sold 手动核对链接。",
    "Used local curated demo prices because live reference pricing was unavailable.": "实时参考价不可用，已使用本地 demo 参考价。",
    "Local demo baseline. Refresh with a configured pricing adapter before treating this as current market evidence.": "这是本地 demo 基准价。要当成当前市场信息前，需要配置价格来源重新检查。",
    "Sold comps provider is not configured in this phase.": "当前阶段还没有配置成交记录来源。",
  };

  if (exact[text]) return exact[text];
  if (text.startsWith("Pause. The asking price breaks the active budget guardrail")) return "暂停。卖家开价超过当前预算线，现在不该继续购买。";
  if (text.startsWith("Ask seller before buying.")) return "购买前先问卖家。卡片可以继续观察，但信息还不够支撑干净的下单决定。";
  if (text.startsWith("Wait for better market evidence.")) return "先等更好的市场信息。预算和版本可以继续看，但这个版本还没有接入近期成交记录。";
  if (text.startsWith("Buy can be considered")) return "可以在预算边界内考虑购买，但前提是再冷静读一遍价格、图片和原始买入理由。";
  if (text.startsWith("Check recent completed sales manually.")) return "手动检查近期已成交价格。";
  if (text.startsWith("Open eBay sold and confirm the price before offering.")) return "出价前打开 eBay sold，先核对近期成交价。";
  if (text.startsWith("Manual lookup query:")) return text.replace("Manual lookup query:", "手动搜索关键词：");
  if (text.startsWith("Compare the ask against the raw reference range.")) return "把卖家开价和裸卡参考区间对比。";
  if (text.startsWith("Only proceed if price and condition evidence still agree.")) return "只有当价格和品相信息仍然互相支持时，才继续。";
  if (text.startsWith("Ask for front/back photos")) return "向卖家要正反面图和品相特写。";
  if (text.startsWith("Confirm exact set")) return "确认准确系列、卡号、语言和版本。";
  if (text.startsWith("Verify recent sold comps")) return "付款前在 TCGpal 外部核对近期成交记录。";
  if (text.startsWith("Wait at least 24 hours.")) return "至少等 24 小时。";
  if (text.startsWith("Lower the entry price")) return "把入手价降到预算线以内。";
  if (text.startsWith("Recheck evidence only after")) return "预算硬停解除后，再重新检查信息。";

  return text;
}

function localizeRiskReportItems(items: string[], locale: Locale) {
  if (locale === "en") return items;
  return items.map((item) => localizeRiskReportText(item, locale));
}

function localizeRiskReportText(text: string, locale: Locale) {
  if (locale === "en") return text;

  const exact: Record<string, string> = {
    "Exact card number, release, language, or region confirmation": "准确卡号、版本、语言或发行地区",
    "Clear back photo": "清晰背面图",
    "Corner and surface closeups": "边角和表面特写",
    "Recent sold-comparable range": "近期成交价区间",
    "Version is not clearly confirmed, so similar cards or reprints could be confused.": "版本没有说清楚，容易把相似版本或再版混在一起。",
    "Back condition is not evidenced, which matters for whitening, centering, and grading risk.": "背面品相没有信息，白边、居中和评级风险都看不出来。",
    "Strong condition language is present, but it should be supported by photos rather than seller confidence.": "卖家用了很强的品相说法，但要看图，不要只信描述。",
    "The listing text contains buyer-risk signals such as limited photos, stock-photo wording, or no-return language.": "链接里有买家风险信号，比如图少、疑似公图或不退换。",
    "A grading goal requires stricter evidence than personal collection.": "如果目标是送评，需要比自留更严格的品相信息。",
    "The listed price is high enough that fees, shipping, and liquidity should be checked against sold comps.": "这个价格已经不低，要把手续费、运费、流动性和近期成交价一起看。",
    "No major text-based risk indicators were found, but photo evidence and sold comps are still needed.": "文字里没看到明显大雷，但正反面图和近期成交价还是要补。",
    "Can you provide clear front and back photos under normal lighting?": "可以补一组正常光线下的正反面图吗？",
    "Are there any scratches, dents, whitening, print lines, or surface marks?": "有没有划痕、压痕、白边、印线或表面痕迹？",
    "Can you confirm the exact card number, set, language, and release version?": "可以确认准确卡号、系列、语言和版本吗？",
    "Can you share corner closeups and angled surface photos?": "可以补边角特写和斜角表面图吗？",
    "Is the price based on recent sold comps or current active listings?": "这个价格是参考近期成交价，还是参考在售链接？",
    "Not suitable for grading speculation until missing condition and version evidence is resolved.": "缺的品相和版本信息补齐前，不适合拿来赌送评。",
    "Only suitable for personal collection if the price is discounted and uncertainty is acceptable.": "只有在价格有折让、你也能接受不确定性时，才适合自留继续看。",
    "Potentially usable for collection, but not ready for resale or grading decisions without seller follow-up.": "自留可以继续看，但没问清楚前，不适合拿来做转手或送评判断。",
    "Possibly suitable for grading only after closeups confirm corners, back, and surface.": "只有边角、背面和表面图都确认后，才可能适合送评。",
    "Reasonable to continue reviewing, assuming sold comps and photo evidence support the price.": "如果近期成交价和图片都撑得住这个价格，可以继续看。",
  };

  if (exact[text]) return exact[text];
  if (text.startsWith("Risk is ")) {
    return text
      .replace("Risk is high", "风险偏高")
      .replace("Risk is medium-high", "风险中高")
      .replace("Risk is medium", "风险中等")
      .replace("Risk is low", "风险较低")
      .replace("with high confidence from pasted text.", "，基于你贴的文字，把握度较高。")
      .replace("with medium confidence from pasted text.", "，基于你贴的文字，把握度中等。")
      .replace("with medium-low confidence from pasted text.", "，基于你贴的文字，把握度中低。")
      .replace("with low confidence from pasted text.", "，基于你贴的文字，把握度较低。")
      .replace("Treat this as a screening result, not proof of condition.", "这只是初筛，不是品相证明。")
      .replace("For self-collection, ask for missing evidence before relying on the listing.", "如果是自留，先把缺的信息问清楚再信这个链接。")
      .replace("For grading, ask for missing evidence before relying on the listing.", "如果是送评，先把缺的信息问清楚再信这个链接。")
      .replace("For resale, ask for missing evidence before relying on the listing.", "如果是转手，先把缺的信息问清楚再信这个链接。");
  }
  return text;
}

function localizeRawItems(items: string[], locale: Locale) {
  if (locale === "en") return items;
  return items.map((item) => localizeRawText(item, locale));
}

function localizeRawText(text: string, locale: Locale) {
  if (locale === "en") return text;

  const exact: Record<string, string> = {
    "Direct PSA10 is cleaner if you mainly want certainty; the raw route depends too much on a perfect grade.": "如果你主要想要确定性，直接看 PSA10 更干净；裸卡路线太依赖满分。",
    "Avoid the raw grading route at the current inputs unless better condition evidence or a lower entry price appears.": "按现在的输入，不建议走裸卡送评路线，除非有更强品相信息或更低入手价。",
    "Raw can be considered only with strong condition evidence because the downside is meaningful if it misses PSA9/10.": "只有品相信息够强，才考虑裸卡；没到 PSA9/10 时，下行空间不小。",
    "This is sensitive to PSA10 probability; verify surface, corners, centering, and back photos before acting.": "这个结果很吃 PSA10 概率。下单前先确认表面、边角、居中和背面图。",
    "The raw route is numerically reasonable, but it should still be treated as conditional on verified condition and clear version.": "数字上裸卡路线说得通，但前提还是品相确认、版本清楚。",
    "The calculation does not include taxes, opportunity cost, grading turnaround risk, or price movement during grading.": "这个计算没有包含税、机会成本、送评周期风险，以及送评期间价格变化。",
  };

  if (exact[text]) return exact[text];
  if (text.startsWith("Marketplace fee is ")) return text.replace("Marketplace fee is", "平台手续费按").replace(".", " 计算。");
  if (text.startsWith("Sale shipping is ")) return text.replace("Sale shipping is", "每次出货运费按").replace("per completed sale.", "计算。");
  if (text.startsWith("The model treats outcomes below PSA9 as an")) {
    return text
      .replace('The model treats outcomes below PSA9 as an "other" result worth', "低于 PSA9 的结果按“其他”估值")
      .replace("before fees.", "，再扣手续费。");
  }
  if (text.startsWith("A break-even PSA10 probability cannot be calculated")) {
    return "因为 PSA10 到手价值没有明显高过低分结果，所以没法算打平所需 PSA10 概率。";
  }
  if (text.startsWith("The raw route needs roughly ")) {
    return text
      .replace("The raw route needs roughly", "在这些假设下，裸卡路线大概需要")
      .replace("PSA10 probability to break even under these assumptions.", "的 PSA10 概率才能打平。");
  }
  if (text.startsWith("The expected value is positive")) {
    return text
      .replace("The expected value is positive, but the conclusion still depends on grading accuracy and liquidity.", "期望值是正的，但结论仍然取决于评级判断准不准、以及这张卡好不好出。")
      .replace("The raw route needs roughly", "裸卡路线大概需要")
      .replace("PSA10 probability to break even under these assumptions.", "的 PSA10 概率才能打平。");
  }
  if (text.startsWith("The expected value is negative")) {
    return text
      .replace("The expected value is negative at the current inputs.", "按当前输入，期望值是负的。")
      .replace("Consider lowering raw cost, improving condition confidence, or buying an already graded copy.", "可以考虑压低裸卡入手价、补强品相信息，或者直接看评级卡。")
      .replace("The raw route needs roughly", "裸卡路线大概需要")
      .replace("PSA10 probability to break even under these assumptions.", "的 PSA10 概率才能打平。");
  }
  return text;
}

function localizeCalibrationMessage(message: string, locale: Locale) {
  if (locale === "en") return message;
  return message
    .replace("Not enough graded journal outcomes yet. Add completed grading results to calibrate PSA10 assumptions.", "评级结果样本还不够。多记几次实际评级结果后，TCGpal 才能校准你的 PSA10 假设。")
    .replace("Your historical PSA10 hit rate is lower than your current assumption. Consider using", "你过去实际出 PSA10 的比例低于当前假设。可以先用")
    .replace("until more outcomes are logged.", "，等记录更多结果后再调整。")
    .replace("Your historical PSA10 hit rate is higher than your current assumption, but keep the current conservative input until more outcomes are logged.", "你过去实际出 PSA10 的比例高于当前假设，但样本还少，先保守一点比较稳。")
    .replace("Your current PSA10 assumption is close to your logged outcomes.", "你现在的 PSA10 假设和历史记录比较接近。");
}

function localizeAiMessage(message: string | undefined, locale: Locale) {
  if (!message) return "";
  if (locale === "en") return message;
  return message
    .replace("AI health check failed. AI actions may use local fallback.", "AI 健康检查失败，AI 操作可能会先用本地兜底。")
    .replace("Journal agent temporarily unavailable. Showing a local reflection instead.", "日志 Agent 暂时不可用，先显示本地复盘。")
    .replace("AI temporarily unavailable, using local fallback.", "AI 暂时不可用，先用本地兜底。")
    .replace("AI request failed", "AI 请求失败")
    .replace("Hermes request failed.", "Hermes 请求失败。")
    .replace("Pipeline request failed", "检查链路请求失败")
    .replace("Hermes returned a non-JSON response.", "Hermes 返回的不是 JSON。");
}

const enCopy = {
  headerSubtitle: "Card counter notes",
  nav: {
    dashboard: "Home",
    risk: "Risk",
    raw: "Raw vs Slab",
    journal: "Journal",
    landing: "Start",
    onboarding: "Profile",
  } as Record<View, string>,
  auth: {
    badge: "Purchase-intent rescue",
    title: "Before you buy the card, slow the decision down.",
    description: "TCGpal checks the buying process first: emotion, budget, evidence, and exact version. It does not pretend to predict the market.",
    eyebrow: "Demo account",
    panelTitle: "Start local, no backend.",
    panelDescription: "This gate only stores a local demo session so the early flow can feel like a real product without adding auth yet.",
    login: "Log in",
    signup: "Sign up",
  },
  onboarding: {
    badge: "TCGpal starts with the cards you care about",
    title: "Set the guardrails before the chase.",
    description: "Pick your games, your player type, and the budget limits TCGpal should respect when you feel pressure to buy.",
    step1: "Step 1 of 3",
    tcgTitle: "What TCGs do you follow?",
    tcgDescription: "Choose more than one. Your first home screen will be built around these games.",
    step2: "Step 2 of 3",
    personaTitle: "What type of TCG player are you?",
    step3: "Step 3 of 3",
    budgetTitle: "What budget should TCGpal respect?",
    budgetDescription: "Today's buy budget is the hard purchase guardrail. Monthly hobby budget is the softer benchmark.",
    todayBudget: "Today's buy budget",
    monthlyBenchmark: "Monthly hobby benchmark",
    continue: "Continue",
    back: "Back",
    start: "Start Ready to Buy flow",
  },
  home: {
    eyebrowStart: "Start here",
    eyebrowRadar: "Your Pokemon radar",
    title: "Ready to buy?",
    description: "Use this when the price, the listing clock, or the hype is pushing you to act now.",
    cta: "Ready to Buy",
    guardrail: "Today's guardrail",
    todayBudget: "Today budget",
    spentToday: "Spent today",
    remaining: "Remaining",
    monthlyBenchmark: "Monthly benchmark",
    coolingDown: "Cooling down",
    savedForReview: (count: number) => `${count} card decision${count === 1 ? "" : "s"} saved for review.`,
    quickPicks: "Quick card picks",
    quickPicksDescription: "These are demo cards you can click, but the main flow starts from Ready to Buy.",
    raw: "raw",
    psa10: "PSA10?",
    review: "Review this card",
  },
  readyModal: {
    eyebrow: "Ready to Buy",
    title: "Name the card before the feeling makes the call.",
    description: "Search by card name, version, or label. Pick the exact version first, then TCGpal checks the decision posture.",
    close: "Close",
    today: "Today",
    spent: "Spent",
    left: "Left",
    searchLabel: "Card name / label / set code",
    searchPlaceholder: "Umbreon VMAX, Luffy P-033, Charizard SAR",
    guide: "guide",
    apiLoading: "Loading Pokemon TCG API cards...",
    apiStatus: (loaded: number, total: number | null) => total ? `${loaded} of ${total.toLocaleString()} Pokemon API cards loaded` : `${loaded} Pokemon API cards loaded`,
    loadMore: "Load more",
    noMatch: "No match yet. Try a Pokemon card name, set, or number.",
    selectedVersion: "Selected version",
    chooseFirst: "Choose a card first",
    noVersionNoVerdict: "TCGpal will not run a verdict without a version.",
    askingPrice: "Current asking price",
    feeling: "What are you telling yourself right now?",
    feelingPlaceholder: "Example: I think this is going up and I might miss the last fair copy.",
    evidence: "What evidence do you have?",
    evidencePlaceholder: "Sold comps, front/back photos, condition proof, seller context...",
    verdict: "Get Calm Verdict",
  },
  sheet: {
    close: "Close",
    counterNote: "Counter note",
    riskFlags: "Risk flags",
    snapshot: "Raw / slab snapshot",
    rawGuide: "Raw guide",
    psa9Guide: "PSA9 guide",
    psa10Guide: "PSA10 guide",
    psa10Odds: "PSA10 odds",
    fomoCheck: "Pre-buy Check",
    slowTitle: "Slow the decision down.",
    slowDescription: "This is about your decision posture: emotional heat, budget strain, and evidence quality.",
    todayLeft: "Today left",
    feeling: "What are you telling yourself right now?",
    feelingPlaceholder: "Example: I feel like if I do not buy this today, it will run away from me.",
    askingPrice: "Current asking price",
    evidence: "What evidence do you have?",
    evidencePlaceholder: "Photos, comps, condition proof, seller context...",
    showCard: "Show calm decision card",
    runRaw: "Run Raw vs Slab",
    checkRisk: "Check Listing Risk",
    addPlan: "Add to 30-day plan",
  },
  verdict: {
    title: "Calm Decision Card",
    hardStop: "Hard stop: this breaks the current budget guardrail.",
    fomoHeat: "Decision heat",
    budgetStrain: "Budget strain",
    evidenceStrength: "Evidence strength",
    versionClarity: "Version clarity",
    emotionAgent: "Emotion Agent",
    budgetAgent: "Budget Agent",
    evidenceAgent: "Evidence Agent",
    versionAgent: "Version Agent",
    cooldown: "Create cooldown ticket",
    cooldownSaved: "Cooldown ticket saved",
    bought: "I bought it",
    boughtSaved: "Purchase recorded",
  },
  marketCheck: {
    eyebrow: "Agent market check",
    title: "Buy check",
    loading: "The market agent is calling card, price, comps, evidence, and budget tools...",
    loadingEyebrow: "Live agent run",
    loadingNow: "Now",
    loadingElapsed: "Elapsed",
    loadingSteps: [
      { label: "Card ID", detail: "Matching exact print and version." },
      { label: "Reference", detail: "Checking configured price sources." },
      { label: "Sold comps", detail: "Looking for connected comp evidence." },
      { label: "Evidence", detail: "Scanning photos, seller notes, and gaps." },
      { label: "Budget", detail: "Applying deterministic guardrails." },
    ],
    nextActions: "Next actions",
    missing: "Missing information",
    sources: "Sources",
    trace: "Tool trace",
    debug: "Debug details",
    localSignals: "Local decision signals",
    confidence: "Confidence",
    aiChecked: "AI checked",
    localFallback: "Local fallback",
    fallback: "Local deterministic fallback used",
    checkEbaySold: "Check recent sold on eBay",
    ebaySoldHint: "Look at the median of matching version + grade. Ignore outliers and lots.",
    openEbayAction: "Open eBay sold and confirm the price before offering.",
  },
  profile: {
    eyebrow: "Onboarding",
    title: "Set the guardrails before the recommendation",
    description: "The demo starts with user context because the same card can be reasonable for one collector and risky for another.",
    favoriteIp: "Favorite IP",
    primaryGoal: "Primary goal",
    todayBudget: "Today's buy budget",
    monthlyBudget: "Monthly budget",
    riskLevel: "Risk level",
    holdingPeriod: "Holding period",
    gradingPreference: "Willing to grade",
    preferredMarket: "Preferred market",
    favoriteCharacters: "Favorite characters or themes",
    save: "Save Profile",
  },
  risk: {
    eyebrow: "Listing Risk Checker",
    title: "Should this listing move forward?",
    description: "Paste title and description first. If the evidence clears the first screen, continue into raw-vs-slab math.",
    listingTitle: "Listing title",
    descriptionLabel: "Description",
    listedPrice: "Listed price",
    marketplace: "Marketplace",
    userGoal: "User goal",
    analyzeLocal: "Analyze listing",
    advancedShow: "Advanced: AI tools",
    advancedHide: "Hide AI tools",
    runningHermes: "Running Hermes...",
    analyzeAi: "Analyze with AI",
    evidenceAgentLoading: "Evidence Agent...",
    analyzePipeline: "Analyze with AI Pipeline",
  },
  riskReport: {
    confidence: "Confidence",
    missingInfo: "Missing information",
    keyRisks: "Key risks",
    sellerQuestions: "Seller questions",
    suitability: "Suitability",
    continueRaw: "Continue to Raw vs Slab",
    addPlan: "Add this to 30-day plan",
  },
  pipeline: {
    eyebrow: "Agent Review Pipeline",
    title: "Evidence first, then risk and math",
    localFallback: "Local fallback used",
    editableReview: "Editable review",
    evidence: "Evidence",
    risk: "Risk",
    math: "Math",
    critic: "Critic",
    done: "Done",
    waiting: "Waiting",
    evidenceLoading: "Evidence agent is reading the listing text...",
    extracted: "Evidence Extracted",
    confirmIdentity: "Confirm the card identity",
    confirmContinue: "Confirm & Continue",
    cardName: "Card name",
    set: "Set",
    cardNumber: "Card number",
    language: "Language",
    missing: "Missing",
    missingEvidence: "Missing evidence",
    riskLoading: "Risk agent is scoring condition, version, price, policy, and grading viability...",
    riskAgent: "Risk Agent",
    overall: "Overall",
    mathAgent: "Math Agent",
    mathImpact: "Raw vs Slab impact",
    expectedValue: "Expected Value",
    assumptions: "Assumptions used",
    finalRecommendation: "Final Recommendation",
    criticWarnings: "Critic warnings",
    addPlan: "Add to 30-day plan",
    trace: "View technical trace",
    agents: "agents",
  },
  raw: {
    eyebrow: "Raw vs Slab Calculator",
    title: "Use deterministic math before grading speculation",
    description: "All arithmetic is TypeScript code. The explanation only interprets the calculated result.",
    rawPrice: "Raw price",
    psa10Price: "PSA10 sold price",
    psa9Price: "PSA9 sold price",
    otherPrice: "Other estimate",
    gradingCost: "Grading + inbound cost",
    feeRate: "Marketplace fee rate (0.13 = 13%)",
    shipping: "Sale shipping",
    psa10Probability: "PSA10 probability (0.25 = 25%)",
    psa9Probability: "PSA9 probability (0.40 = 40%)",
    recalculate: "Recalculate",
  },
  calibration: {
    title: "Journal calibration",
    sample: "Sample",
    assumedAvg: "Assumed avg",
    actualPsa10: "Actual PSA10",
    apply: "Apply adjusted probability",
  },
  rawResult: {
    expectedProfit: "Expected Profit",
    addPlan: "Add this to 30-day plan",
    supportingNumbers: "Supporting numbers",
    psa10Net: "PSA10 net value",
    psa9Net: "PSA9 net value",
    otherNet: "Other net value",
    worstCase: "Worst case",
    breakEvenPsa10: "Break-even PSA10",
    explanation: "Explanation",
    assumptions: "Assumptions",
  },
  journal: {
    eyebrow: "Collection Decision Journal",
    title: "Capture the thesis, risks, and review result",
    description: "Structured notes stay in localStorage and feed the home recommendation radar without external card data.",
    cardName: "Card name",
    version: "Version",
    date: "Date",
    actionType: "Action type",
    price: "Price",
    goal: "Goal",
    tags: "Tags",
    tagsPlaceholder: "character, set, risk theme",
    sentiment: "Sentiment",
    thesis: "Original thesis",
    watchReason: "Watch reason",
    buyCondition: "Buy condition",
    sellCondition: "Sell condition",
    stopCondition: "Stop condition",
    risks: "Risks noted",
    reviewDate: "Review date",
    reviewStatus: "Review status",
    missingInfo: "Missing information",
    finalOutcome: "Final outcome",
    lessons: "Lessons learned",
    assumedPsa10: "Assumed PSA10 probability (0.30 = 30%)",
    actualGrade: "Actual grade",
    decisionSource: "Decision source",
    save: "Save Journal Entry",
    all: "All",
  },
  journalEntry: {
    version: "Version",
    date: "Date",
    tags: "Tags",
    sentiment: "Sentiment",
    reviewStatus: "Review status",
    watchReason: "Watch reason",
    buyCondition: "Buy condition",
    stopCondition: "Stop condition",
    risks: "Risks",
    missingInfo: "Missing info",
    finalOutcome: "Final outcome",
    lessons: "Lessons",
    assumedPsa10: "Assumed PSA10",
    actualGrade: "Actual grade",
    notSpecified: "Not specified",
    notRecorded: "Not recorded",
    checking: "Checking...",
    askAgent: "Ask Agent",
    addReview: "Add review item",
  },
  agentTrace: {
    viewTrace: "View AI reasoning trace",
    localFallback: "Local fallback used",
    aiAssisted: "AI assisted",
    hermesTask: "Hermes task",
    warnings: "Warnings",
    model: "Model",
    tool: "Tool",
  },
  common: {
    aiRequestFailed: "AI request failed",
    notAvailable: "N/A",
  },
  aiHealth: {
    fallback: "AI temporarily unavailable, using local fallback.",
    check: "Check",
  },
};

const zhCopy: typeof enCopy = {
  headerSubtitle: "买卡前先冷静一下",
  nav: {
    dashboard: "首页",
    risk: "风险",
    raw: "裸卡/评级",
    journal: "日志",
    landing: "开始",
    onboarding: "资料",
  },
  auth: {
    badge: "买卡前先停一下",
    title: "下单前，先别急。",
    description: "TCGpal 先看这次购买是不是被情绪推着走：预算够不够，品相和成交价有没有看，版本有没有选对。它不装作能预测涨跌。",
    eyebrow: "演示账号",
    panelTitle: "先用本地版。",
    panelDescription: "这里不会连后端，只是在本地记一下你进来了。先把买卡前的体验跑顺。",
    login: "登录",
    signup: "注册",
  },
  onboarding: {
    badge: "先知道你在玩什么",
    title: "追卡前，先把边界写下来。",
    description: "选你玩的卡种、你的买卡习惯，还有今天最多能花多少。真的上头的时候，这些数字会比感觉可靠。",
    step1: "第 1 步，共 3 步",
    tcgTitle: "你关注哪些 TCG？",
    tcgDescription: "可以选多个。首页先按这些卡种来。",
    step2: "第 2 步，共 3 步",
    personaTitle: "你平时怎么买卡？",
    step3: "第 3 步，共 3 步",
    budgetTitle: "今天最多花多少？",
    budgetDescription: "今日预算是硬线。月度预算只是参照，帮你判断这单是不是太重。",
    todayBudget: "今日购买预算",
    monthlyBenchmark: "月度爱好预算",
    continue: "继续",
    back: "返回",
    start: "开始买前检查",
  },
  home: {
    eyebrowStart: "从这里开始",
    eyebrowRadar: "你的 Pokemon 雷达",
    title: "准备下单？",
    description: "如果你已经开始想“现在不买就来不及了”，先点这里。",
    cta: "买前检查",
    guardrail: "今日预算线",
    todayBudget: "今日预算",
    spentToday: "今日已花",
    remaining: "剩余",
    monthlyBenchmark: "月度预算参考",
    coolingDown: "冷静中",
    savedForReview: (count: number) => `${count} 张卡先放一放，之后再看。`,
    quickPicks: "快速卡牌选择",
    quickPicksDescription: "下面是演示卡。真正要买某张卡时，先用上面的买前检查。",
    raw: "裸卡",
    psa10: "PSA10？",
    review: "查看这张卡",
  },
  readyModal: {
    eyebrow: "买前检查",
    title: "先确认是哪张卡。",
    description: "输入卡名、版本或编号。版本选错，后面的判断就没有意义。",
    close: "关闭",
    today: "今日",
    spent: "已花",
    left: "剩余",
    searchLabel: "卡名 / 编号 / 系列代码",
    searchPlaceholder: "Umbreon VMAX, Luffy P-033, Charizard SAR",
    guide: "参考价",
    apiLoading: "正在载入 Pokemon TCG API 卡牌...",
    apiStatus: (loaded: number, total: number | null) => total ? `已载入 ${loaded} / ${total.toLocaleString()} 张 Pokemon API 卡` : `已载入 ${loaded} 张 Pokemon API 卡`,
    loadMore: "载入更多",
    noMatch: "还没有匹配。可以换卡名、系列或编号再试。",
    selectedVersion: "已选版本",
    chooseFirst: "请先选择一张卡",
    noVersionNoVerdict: "没选版本，不给判断。",
    askingPrice: "卖家开价",
    feeling: "你现在怎么说服自己？",
    feelingPlaceholder: "例如：感觉它要涨了，现在不买会后悔。",
    evidence: "你看过哪些信息？",
    evidencePlaceholder: "近期成交价、正反面图、品相细节、卖家信息...",
    verdict: "看下单建议",
  },
  sheet: {
    close: "关闭",
    counterNote: "别上头提醒",
    riskFlags: "风险点",
    snapshot: "裸卡 / 评级卡快照",
    rawGuide: "裸卡参考",
    psa9Guide: "PSA9 参考",
    psa10Guide: "PSA10 参考",
    psa10Odds: "PSA10 假设",
    fomoCheck: "买前检查",
    slowTitle: "先慢一点。",
    slowDescription: "这里不猜涨跌，只看这次购买是不是太上头、太贵、信息太少。",
    todayLeft: "今日剩余",
    feeling: "你现在怎么说服自己？",
    feelingPlaceholder: "例如：今天不买，感觉它就跑了。",
    askingPrice: "卖家开价",
    evidence: "你看过哪些信息？",
    evidencePlaceholder: "正反面图、成交价、品相、卖家信息...",
    showCard: "看下单建议",
    runRaw: "算裸卡/评级",
    checkRisk: "检查链接风险",
    addPlan: "加入 30 天计划",
  },
  verdict: {
    title: "下单建议",
    hardStop: "先别下单：这单已经超过今天的预算线。",
    fomoHeat: "上头程度",
    budgetStrain: "预算压力",
    evidenceStrength: "信息完整度",
    versionClarity: "版本确认",
    emotionAgent: "情绪 Agent",
    budgetAgent: "预算 Agent",
    evidenceAgent: "信息 Agent",
    versionAgent: "版本 Agent",
    cooldown: "先加入观察清单",
    cooldownSaved: "已加入观察清单",
    bought: "我买了",
    boughtSaved: "购买已记录",
  },
  marketCheck: {
    eyebrow: "Agent 市场检查",
    title: "购买检查",
    loading: "市场 Agent 正在调用卡片、价格、成交、信息和预算工具...",
    loadingEyebrow: "Agent 实时检查中",
    loadingNow: "正在跑",
    loadingElapsed: "已用时",
    loadingSteps: [
      { label: "卡片识别", detail: "确认卡名、系列和版本。" },
      { label: "参考价", detail: "检查已配置的价格来源。" },
      { label: "成交", detail: "寻找已接入的成交证据。" },
      { label: "信息", detail: "检查照片、卖家描述和缺口。" },
      { label: "预算", detail: "套用确定性预算红线。" },
    ],
    nextActions: "下一步",
    missing: "缺的信息",
    sources: "来源",
    trace: "工具链路",
    debug: "Debug 细节",
    localSignals: "本地判断信号",
    confidence: "把握度",
    aiChecked: "AI 已检查",
    localFallback: "本地兜底",
    fallback: "已使用本地确定性兜底",
    checkEbaySold: "去 eBay 查近期已成交",
    ebaySoldHint: "看同版本+同评级的中位价，忽略异常价和 lot。",
    openEbayAction: "出价前打开 eBay sold，先核对价格。",
  },
  profile: {
    eyebrow: "资料设置",
    title: "先把预算和偏好写清楚",
    description: "同一张卡，对不同玩家可能完全不一样。这里先记你的基础边界。",
    favoriteIp: "主要 IP",
    primaryGoal: "主要目标",
    todayBudget: "今日购买预算",
    monthlyBudget: "月度预算",
    riskLevel: "风险偏好",
    holdingPeriod: "持有周期",
    gradingPreference: "是否考虑送评",
    preferredMarket: "常用市场",
    favoriteCharacters: "喜欢的角色或主题",
    save: "保存资料",
  },
  risk: {
    eyebrow: "链接风险检查",
    title: "这条链接能不能继续看？",
    description: "先贴标题和描述。信息过关，再去算裸卡/评级空间。",
    listingTitle: "链接标题",
    descriptionLabel: "描述",
    listedPrice: "卖家开价",
    marketplace: "平台",
    userGoal: "你的目标",
    analyzeLocal: "检查这条 listing",
    advancedShow: "进阶：AI 工具",
    advancedHide: "收起 AI 工具",
    runningHermes: "Hermes 处理中...",
    analyzeAi: "用 AI 看一下",
    evidenceAgentLoading: "信息 Agent 处理中...",
    analyzePipeline: "跑 AI 检查链路",
  },
  riskReport: {
    confidence: "把握度",
    missingInfo: "缺的信息",
    keyRisks: "主要风险",
    sellerQuestions: "要问卖家的问题",
    suitability: "适不适合",
    continueRaw: "继续算裸卡/评级",
    addPlan: "加入 30 天计划",
  },
  pipeline: {
    eyebrow: "Agent 检查链路",
    title: "先看信息，再看风险和数学",
    localFallback: "已用本地兜底",
    editableReview: "可编辑检查",
    evidence: "信息",
    risk: "风险",
    math: "数学",
    critic: "复核",
    done: "完成",
    waiting: "等待",
    evidenceLoading: "信息 Agent 正在读链接文字...",
    extracted: "提取到的信息",
    confirmIdentity: "先确认是哪张卡",
    confirmContinue: "确认并继续",
    cardName: "卡名",
    set: "系列",
    cardNumber: "卡号",
    language: "语言",
    missing: "缺失",
    missingEvidence: "缺的信息",
    riskLoading: "风险 Agent 正在看品相、版本、价格、退换和评级空间...",
    riskAgent: "风险 Agent",
    overall: "总分",
    mathAgent: "数学 Agent",
    mathImpact: "裸卡/评级影响",
    expectedValue: "期望值",
    assumptions: "使用的假设",
    finalRecommendation: "最终建议",
    criticWarnings: "复核提醒",
    addPlan: "加入 30 天计划",
    trace: "查看技术 trace",
    agents: "个 Agent",
  },
  raw: {
    eyebrow: "裸卡/评级计算器",
    title: "先算清楚，再谈送评空间",
    description: "这里的数学都是确定代码，不靠模型猜。",
    rawPrice: "裸卡价格",
    psa10Price: "PSA10 成交价",
    psa9Price: "PSA9 成交价",
    otherPrice: "其他结果估值",
    gradingCost: "送评和来回成本",
    feeRate: "平台手续费率（0.13 = 13%）",
    shipping: "出货运费",
    psa10Probability: "PSA10 概率（0.25 = 25%）",
    psa9Probability: "PSA9 概率（0.40 = 40%）",
    recalculate: "重新计算",
  },
  calibration: {
    title: "日志校准",
    sample: "样本",
    assumedAvg: "原本假设",
    actualPsa10: "实际 PSA10",
    apply: "套用调整后的概率",
  },
  rawResult: {
    expectedProfit: "期望利润",
    addPlan: "加入 30 天计划",
    supportingNumbers: "关键数字",
    psa10Net: "PSA10 到手",
    psa9Net: "PSA9 到手",
    otherNet: "其他结果到手",
    worstCase: "最差情况",
    breakEvenPsa10: "打平所需 PSA10",
    explanation: "说明",
    assumptions: "假设",
  },
  journal: {
    eyebrow: "买卡日志",
    title: "把当时怎么想的记下来",
    description: "这些记录只存在本地。之后可以用来校准你对品相、评级和预算的判断。",
    cardName: "卡名",
    version: "版本",
    date: "日期",
    actionType: "动作",
    price: "价格",
    goal: "目标",
    tags: "标签",
    tagsPlaceholder: "角色、系列、风险点",
    sentiment: "状态",
    thesis: "当时的购买理由",
    watchReason: "观察原因",
    buyCondition: "什么条件才买",
    sellCondition: "什么条件卖",
    stopCondition: "什么情况不买",
    risks: "记录的风险",
    reviewDate: "复盘日期",
    reviewStatus: "复盘状态",
    missingInfo: "缺的信息",
    finalOutcome: "最后结果",
    lessons: "学到什么",
    assumedPsa10: "当时假设的 PSA10 概率（0.30 = 30%）",
    actualGrade: "实际评级",
    decisionSource: "来源",
    save: "保存日志",
    all: "全部",
  },
  journalEntry: {
    version: "版本",
    date: "日期",
    tags: "标签",
    sentiment: "状态",
    reviewStatus: "复盘状态",
    watchReason: "观察原因",
    buyCondition: "买入条件",
    stopCondition: "停止条件",
    risks: "风险",
    missingInfo: "缺的信息",
    finalOutcome: "最后结果",
    lessons: "复盘",
    assumedPsa10: "假设 PSA10",
    actualGrade: "实际评级",
    notSpecified: "未填写",
    notRecorded: "未记录",
    checking: "检查中...",
    askAgent: "问 Agent",
    addReview: "加入复盘",
  },
  agentTrace: {
    viewTrace: "查看 AI 推理 trace",
    localFallback: "已用本地兜底",
    aiAssisted: "AI 辅助",
    hermesTask: "Hermes 任务",
    warnings: "提醒",
    model: "模型",
    tool: "工具",
  },
  common: {
    aiRequestFailed: "AI 请求失败",
    notAvailable: "无",
  },
  aiHealth: {
    fallback: "AI 暂时不可用，先用本地兜底。",
    check: "检查",
  },
};

function formatRiskDimensionName(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function localizeRiskDimensionName(value: string, locale: Locale) {
  if (locale === "en") return formatRiskDimensionName(value);
  const map: Record<string, string> = {
    condition: "品相",
    versionClarity: "版本清晰度",
    priceVsComps: "价格/成交价",
    sellerPolicy: "卖家规则",
    gradingViability: "评级空间",
  };
  return map[value] ?? formatRiskDimensionName(value);
}

function localizeOption(value: string, locale: Locale) {
  if (locale === "en") return value;
  const map: Record<string, string> = {
    Collector: "收藏为主",
    "Hybrid Collector-Seller": "收藏 + 交易",
    "Seller / Vendor": "卖家 / 卡商",
    Collection: "收藏",
    "Collection + resale": "收藏 + 转手",
    "Grading play": "送评玩法",
    "Small seller inventory": "小卖家库存",
    "Set completion": "补齐套装",
    Low: "低",
    Medium: "中",
    "Medium-low": "中低",
    "Medium-High": "中高",
    High: "高",
    low: "低",
    medium: "中",
    high: "高",
    unknown: "未知",
    explicit_description: "描述里有写",
    "Short-term": "短期",
    "3-6 months": "3-6 个月",
    "1 year+": "1 年以上",
    "Long-term collection": "长期收藏",
    No: "不考虑",
    Maybe: "可能",
    Yes: "会",
    "Self-collection": "自留收藏",
    Grading: "送评",
    Resale: "转手",
    "Considering purchase": "考虑购买",
    Bought: "已买",
    Skipped: "跳过",
    "Sent for grading": "已送评",
    "Listed for sale": "已挂出",
    Sold: "已卖",
    Holding: "持有中",
    "Re-evaluation": "重新评估",
    "Still interested": "仍感兴趣",
    Cautious: "谨慎",
    "Passed for now": "暂时放弃",
    Exited: "已退出",
    "Needs review": "待复盘",
    Watching: "观察中",
    Resolved: "已解决",
    manual: "手动",
    listing_risk: "链接风险",
    raw_vs_slab: "裸卡/评级",
    UNKNOWN: "未记录",
    PSA8_OR_LOWER: "PSA8 或更低",
    "Talk about it later": "之后再说",
  };
  return map[value] ?? value;
}

function localizeCardText(value: string, locale: Locale) {
  if (locale === "en") return value;
  const map: Record<string, string> = {
    "Alt Art": "异画",
    "Special Illustration Rare": "SAR / 特别插画稀有",
    "Secret Rare": "SR / Secret Rare",
    Preview: "预览卡",
    QCSR: "25 周年 QCSR",
    "Only move forward if the listing has front/back photos, corner closeups, and clear Japanese EB01 version evidence.": "只有看到正反面图、边角特写，并且日版 EB01 版本清楚，才继续看。",
    "Treat as a flagship chase only after checking recent sold comps, print quality, and whether hype premium has cooled.": "这是旗舰追逐卡，先看近期成交价、印刷品相，以及热度溢价有没有冷下来。",
    "Moonbreon is collector-icon territory; only review copies with clean edges, surface, centering, and recent sold-comparable support.": "月布已经是标志级收藏卡。只看边缘、表面、居中都清楚，而且近期成交价能撑住的卡。",
    "Strong modern chase with durable demand, but raw grading upside should be checked against centering and surface photos first.": "现代热门追逐卡，需求比较稳，但裸卡送评空间要先看居中和表面图。",
    "Review as a grail-level Evolving Skies card; avoid raw copies unless photos clearly support the condition claim.": "按高价 Evolving Skies 追逐卡来看。没有清楚图片支撑品相说法，就别碰裸卡。",
    "A major character chase; compare raw entry against PSA9 downside before assuming grading upside.": "大角色追逐卡。别先想 PSA10，先把裸卡入手价和 PSA9 下行空间对一下。",
    "Treat this as a watchlist candidate until the game has more liquidity and clearer market comps.": "先当观察卡看，等流动性和市场成交更清楚再说。",
    "Treat this as a collector-first review; only consider grading if edges and foil surface are clearly documented.": "先按收藏卡来看。只有边缘和闪面状态拍清楚，才考虑送评。",
    "Condition claims need photos": "品相说法要看图",
    "Grading upside is sensitive": "送评空间很吃品相",
    "Version clarity matters": "版本必须说清楚",
    "High hype premium": "热度溢价高",
    "Very condition-sensitive": "非常吃品相",
    "Entry price needs current sold comps": "入手价要对近期成交价",
    "Icon premium": "标志卡溢价",
    "High fake/repack attention": "热门卡，假卡/重封关注度高",
    "PSA10 margin depends heavily on condition": "PSA10 空间很依赖品相",
    "Centering matters": "居中很重要",
    "Raw copies can be over-described": "裸卡描述容易过度美化",
    "High liquidity but volatile premium": "流动性高，但溢价波动大",
    "Evolving Skies premium": "Evolving Skies 溢价",
    "Condition photos required": "必须要品相图",
    "PSA10 spread can compress": "PSA10 价差可能被压缩",
    "Character premium": "角色溢价",
    "Surface/edge evidence needed": "需要表面和边缘信息",
    "Grading route needs conservative PSA10 odds": "送评路线要用保守 PSA10 概率",
    "New-market liquidity": "新市场流动性不稳",
    "No stable grading comps": "评级成交参考还不稳定",
    "Collector-first only": "只适合收藏优先",
    "Foil surface risk": "闪面风险",
    "Version naming ambiguity": "版本命名容易混",
    "High entry price": "入手价高",
  };
  return map[value] ?? value;
}

function getDateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function budgetRangeToMonthlyBudget(budgetRange: UserProfile["budgetRange"]) {
  if (budgetRange === "$50") return 50;
  if (budgetRange === "$150") return 150;
  if (budgetRange === "$1000+") return 1000;
  if (budgetRange === "Talk about it later") return 300;
  return 300;
}

function personaToGoal(playerType: UserProfile["playerType"]): UserProfile["goal"] {
  if (playerType === "Collector") return "Collection";
  if (playerType === "Seller / Vendor") return "Small seller inventory";
  return "Collection + resale";
}

function personaDescription(playerType: UserProfile["playerType"], locale: Locale = "en") {
  if (locale === "zh") {
    if (playerType === "Collector") return "主要买自己喜欢的卡，不想因为上头多花钱。";
    if (playerType === "Seller / Vendor") return "会把卡当库存看，关心利润、手续费和流动性。";
    return "会收藏，也会在意转手、送评空间和买入纪律。";
  }

  if (playerType === "Collector") return "I mainly collect cards I like and want to avoid overpaying.";
  if (playerType === "Seller / Vendor") return "I buy cards as inventory and care about margin, fees, and liquidity.";
  return "I collect, but I also care about resale, grading upside, and decision discipline.";
}

function getTcgTone(tcg: UserProfile["favoriteTcgs"][number]) {
  if (tcg === "Pokemon") return { bg: "bg-[#d7a84e] text-[#4a3f24]", border: "border-[#b89344]", strip: "bg-[#2f6f73]" };
  if (tcg === "One Piece") return { bg: "bg-[#2f6f73] text-[#f4f7f3]", border: "border-[#24585c]", strip: "bg-[#b26a4c]" };
  if (tcg === "Yu-Gi-Oh") return { bg: "bg-[#b26a4c] text-[#f4f7f3]", border: "border-[#8e4f3b]", strip: "bg-[#d7a84e]" };
  if (tcg === "League / Riot TCG") return { bg: "bg-[#e7efe8] text-[#2f6f73]", border: "border-[#d6ded5]", strip: "bg-[#b26a4c]" };
  return { bg: "bg-[#64736c] text-[#f4f7f3]", border: "border-[#4f5a54]", strip: "bg-[#d7a84e]" };
}

function filterClass(active: boolean) {
  return `rounded-md border px-3 py-2 text-sm font-semibold ${
    active ? "border-[#2f6f73] bg-[#2f6f73] text-[#f4f7f3]" : "border-[#d6ded5] bg-[#fcfbf6] text-[#36413d] hover:border-[#bccbc2]"
  }`;
}

function getRiskTone(score: ListingRiskReport["score"], locale: Locale = "en") {
  if (score === "High") {
    return {
      kicker: locale === "zh" ? "高风险" : "High risk",
      headline: locale === "zh" ? "先问清楚" : "ASK QUESTIONS FIRST",
      containerClass: "border-[#d88980] bg-[#fff5f3] text-[#7a241e]",
    };
  }

  if (score === "Medium-High") {
    return {
      kicker: locale === "zh" ? "风险偏高" : "Elevated risk",
      headline: locale === "zh" ? "买前先确认" : "VERIFY BEFORE BUYING",
      containerClass: "border-[#e2c76c] bg-[#fff9dd] text-[#5d4815]",
    };
  }

  if (score === "Medium") {
    return {
      kicker: locale === "zh" ? "中等风险" : "Moderate risk",
      headline: locale === "zh" ? "先补信息" : "CHECK THE GAPS",
      containerClass: "border-[#d8c887] bg-[#fffbea] text-[#574819]",
    };
  }

  return {
    kicker: locale === "zh" ? "风险较低" : "Lower risk",
    headline: locale === "zh" ? "有条件继续" : "CONDITIONALLY OK",
    containerClass: "border-[#9fc7a3] bg-[#f1f8ef] text-[#173f24]",
  };
}

function sanitizeTraceMessage(message: string, locale: Locale = "en") {
  const lower = message.toLowerCase();
  if (lower.includes("zod") || lower.includes("invalid_type") || lower.includes("validation")) {
    if (locale === "zh") return "AI 输出和应用预期格式不一致，所以已切回本地兜底。";
    return "AI output did not match the expected app schema, so the local fallback was used.";
  }

  if (lower.includes("openai 401") || lower.includes("not_authorized") || lower.includes("api key")) {
    if (locale === "zh") return "当前本地会话里的 AI 服务不可用，所以已切回本地兜底。";
    return "AI provider is unavailable in this local session, so the local fallback was used.";
  }

  if (message.length > 180) {
    return `${message.slice(0, 177)}...`;
  }

  return message;
}
