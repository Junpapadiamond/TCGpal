"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  Calculator,
  Check,
  ClipboardList,
  FilePenLine,
  Layers3,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Save,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  getJournalBasedRecommendations,
  toListingRiskInput,
  toRawVsSlabInput,
  type CuratedCardRecommendation,
  type JournalBasedRecommendation,
} from "@/lib/curated-recommendations";
import { getGradingCalibration, type GradingCalibration } from "@/lib/journal-calibration";
import { analyzeListingRisk } from "@/lib/listing-risk";
import { calculateRawVsSlab } from "@/lib/raw-vs-slab";
import {
  defaultProfile,
  defaultRawVsSlabInput,
  starterJournalEntry,
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
  playerTypeOptions,
  rawVsSlabInputSchema,
  riskOptions,
  userProfileSchema,
  type DecisionJournalEntry,
  type DecisionPlanItem,
  type HermesResponse,
  type JournalDraft,
  type ListingEvidence,
  type ListingRiskInput,
  type ListingRiskReport,
  type PipelineCriticResult,
  type PipelineMathResult,
  type RawVsSlabInput,
  type RawVsSlabResult,
  type RiskScore,
  type UserProfile,
} from "@/lib/schemas";
import {
  loadDecisionPlanItems,
  loadJournalEntries,
  loadLatestRawResult,
  loadProfile,
  saveDecisionPlanItems,
  saveJournalEntries,
  saveLatestRawResult,
  saveProfile,
} from "@/lib/storage";

type View = "landing" | "onboarding" | "dashboard" | "risk" | "raw" | "journal";

type JournalForm = Omit<DecisionJournalEntry, "id" | "createdAt">;
type OnboardingStep = "tcg" | "persona" | "budget";
type AiHealth = {
  ok: boolean;
  warning?: string;
  models?: { role: string; model: string; ok: boolean; status?: number }[];
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

const views: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "risk", label: "Risk", icon: SearchCheck },
  { id: "raw", label: "Raw vs Slab", icon: Calculator },
  { id: "journal", label: "Journal", icon: BookOpenCheck },
];

const listingDefaults: ListingRiskInput = {
  title: "Tony Tony Chopper EB01 Alt Art Japanese One Piece Mint",
  description: "Great condition, looks PSA10. No returns.",
  price: 120,
  marketplace: "eBay",
  userGoal: "Grading",
};

const journalDefaults: JournalForm = {
  tcg: "One Piece",
  cardName: "Tony Tony Chopper EB01-006 AA",
  version: "Japanese alternate art",
  date: new Date().toISOString().slice(0, 10),
  actionType: "Considering purchase",
  price: 80,
  userGoal: "Collection + resale",
  tags: "Chopper, alternate art, grading discipline",
  sentiment: "Cautious",
  thesis: "I want one representative Chopper card that can stay in my collection while preserving resale flexibility.",
  watchReason: "Character fit is strong, but the grading upside only matters if condition evidence is clear.",
  buyCondition: "Only buy below $80 with clean front/back photos and clear version.",
  sellCondition: "Review if net profit exceeds 30% after fees or if I need to rotate budget.",
  stopCondition: "Skip if version is unclear or the raw-vs-slab math only works with an optimistic PSA10 assumption.",
  risks: "Version ambiguity, condition uncertainty, and low liquidity for lower-end cards.",
  missingInfo: "Back photo, corner closeups, recent sold comps.",
  reviewDate: "",
  reviewStatus: "Needs review",
  finalOutcome: "",
  lessonsLearned: "",
  assumedPsa10Probability: 0.25,
  actualGrade: "UNKNOWN",
  source: "manual",
};

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [riskReport, setRiskReport] = useState<ListingRiskReport | null>(null);
  const [rawResult, setRawResult] = useState<RawVsSlabResult>(() => calculateRawVsSlab(defaultRawVsSlabInput));
  const [journalEntries, setJournalEntries] = useState<DecisionJournalEntry[]>([]);
  const [decisionPlanItems, setDecisionPlanItems] = useState<DecisionPlanItem[]>([]);
  const [selectedCard, setSelectedCard] = useState<CuratedCardRecommendation | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("tcg");
  const [journalFilter, setJournalFilter] = useState<DecisionJournalEntry["actionType"] | "All">("All");
  const [aiRiskResponse, setAiRiskResponse] = useState<HermesResponse | null>(null);
  const [journalAgentResponse, setJournalAgentResponse] = useState<HermesResponse | null>(null);
  const [journalAgentDraft, setJournalAgentDraft] = useState<JournalDraft | null>(null);
  const [aiLoading, setAiLoading] = useState<"risk" | "journal" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
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
      const storedDecisionPlanItems = loadDecisionPlanItems();
      const storedRawResult = loadLatestRawResult();
      const storedEntries = loadJournalEntries();

      if (storedProfile) {
        setProfile(storedProfile);
        profileForm.reset(storedProfile);
      }

      if (storedDecisionPlanItems.length) {
        setDecisionPlanItems(storedDecisionPlanItems);
      }

      if (storedRawResult) {
        setRawResult(storedRawResult);
      }

      if (storedEntries.length) {
        setJournalEntries(storedEntries);
      } else {
        setJournalEntries([starterJournalEntry]);
        saveJournalEntries([starterJournalEntry]);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [journalForm, profileForm]);

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
    if (journalFilter === "All") return journalEntries;
    return journalEntries.filter((entry) => entry.actionType === journalFilter);
  }, [journalEntries, journalFilter]);

  const recentJournalEntries = useMemo(() => journalEntries.slice(0, 3), [journalEntries]);

  const reviewQueue = useMemo(() => {
    return journalEntries
      .filter((entry) => entry.reviewStatus !== "Resolved")
      .slice(0, 4);
  }, [journalEntries]);

  const openPlanItems = useMemo(() => {
    return decisionPlanItems.filter((item) => item.status === "open");
  }, [decisionPlanItems]);

  const gradingCalibration = useMemo(() => {
    return getGradingCalibration(journalEntries, Number(watchedPsa10Probability) || defaultRawVsSlabInput.psa10Probability);
  }, [journalEntries, watchedPsa10Probability]);

  const journalRecommendations = useMemo(() => {
    return getJournalBasedRecommendations(profile, journalEntries);
  }, [journalEntries, profile]);

  const dashboardStats = [
    { label: "Monthly budget", value: `$${profile.monthlyBudget}`, icon: Target },
    { label: "Risk posture", value: profile.riskLevel, icon: Gauge },
    { label: "Journal entries", value: String(journalEntries.length), icon: BookOpenCheck },
    { label: "Needs review", value: String(reviewQueue.length), icon: FilePenLine },
    { label: "30-day items", value: String(openPlanItems.length), icon: ClipboardList },
  ];

  function navigateTo(nextView: View) {
    setView(nextView);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function handleProfileSubmit(data: UserProfile) {
    const parsed = userProfileSchema.parse(data);
    setProfile(parsed);
    saveProfile(parsed);
    navigateTo("dashboard");
  }

  function toggleFavoriteTcg(tcg: UserProfile["favoriteTcgs"][number]) {
    const current = profileForm.getValues("favoriteTcgs") ?? [];
    const next = current.includes(tcg) ? current.filter((item) => item !== tcg) : [...current, tcg];
    profileForm.setValue("favoriteTcgs", next.length ? next : [tcg], { shouldDirty: true });
  }

  function finishFirstRun() {
    const formValues = profileForm.getValues();
    const favoriteTcgs = formValues.favoriteTcgs?.length ? formValues.favoriteTcgs : ["One Piece"];
    const primaryTcg = favoriteTcgs[0] === "Pokemon" ? "Pokemon" : favoriteTcgs[0] === "Yu-Gi-Oh" ? "Yu-Gi-Oh" : favoriteTcgs[0] === "Other" ? "Other" : "One Piece";
    const budget = budgetRangeToMonthlyBudget(formValues.budgetRange);
    const nextProfile = userProfileSchema.parse({
      ...defaultProfile,
      ...formValues,
      favoriteTcgs,
      ip: primaryTcg,
      monthlyBudget: budget,
      goal: personaToGoal(formValues.playerType),
      riskLevel: formValues.playerType === "Seller / Vendor" ? "Medium" : defaultProfile.riskLevel,
    });

    setProfile(nextProfile);
    profileForm.reset(nextProfile);
    saveProfile(nextProfile);
    navigateTo("dashboard");
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
      warnings: [...current.warnings, ...stage.warnings.map(sanitizeTraceMessage)],
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
    const listing = riskForm.getValues();
    addDecisionPlanItem({
      source: "raw_vs_slab",
      title: rawResult.expectedProfit >= 0 ? "Verify condition before raw purchase" : "Wait for a better raw entry",
      cardName: listing.title || "Current raw-vs-slab decision",
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

  function updateDecisionPlanStatus(id: string, status: DecisionPlanItem["status"]) {
    const nextItems = decisionPlanItems.map((item) => (item.id === id ? { ...item, status } : item));
    setDecisionPlanItems(nextItems);
    saveDecisionPlanItems(nextItems);
  }

  return (
    <main className="min-h-screen bg-[#f5f3ed] text-[#2d2620]">
      <Header activeView={view} onNavigate={navigateTo} />
      {aiHealth && !aiHealth.ok && <AiHealthBanner health={aiHealth} />}

      {view === "landing" && (
        <FirstRunExperience
          step={onboardingStep}
          profile={userProfileSchema.parse({ ...defaultProfile, ...onboardingProfile })}
          onToggleTcg={toggleFavoriteTcg}
          onSelectPersona={(playerType) => profileForm.setValue("playerType", playerType, { shouldDirty: true })}
          onSelectBudget={(budgetRange) => profileForm.setValue("budgetRange", budgetRange, { shouldDirty: true })}
          onStepChange={setOnboardingStep}
          onFinish={finishFirstRun}
        />
      )}

      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8 lg:px-10">
        {view === "onboarding" && (
          <ToolSurface
            icon={ListChecks}
            eyebrow="Onboarding"
            title="Set the guardrails before the recommendation"
            description="The demo starts with user context because the same card can be reasonable for one collector and risky for another."
          >
            <form className="form-grid" onSubmit={profileForm.handleSubmit(handleProfileSubmit)}>
              <SelectField label="Favorite IP" {...profileForm.register("ip")} options={ipOptions} />
              <SelectField label="Primary goal" {...profileForm.register("goal")} options={goalOptions} />
              <InputField label="Monthly budget" type="number" {...profileForm.register("monthlyBudget", { valueAsNumber: true })} />
              <SelectField label="Risk level" {...profileForm.register("riskLevel")} options={riskOptions} />
              <SelectField label="Holding period" {...profileForm.register("holdingPeriod")} options={holdingOptions} />
              <SelectField label="Willing to grade" {...profileForm.register("gradingPreference")} options={gradingOptions} />
              <SelectField label="Preferred market" {...profileForm.register("preferredMarket")} options={marketOptions} />
              <TextAreaField className="md:col-span-2" label="Favorite characters or themes" {...profileForm.register("favoriteCharacters")} />
              <div className="md:col-span-2">
                <button className="primary-button" type="submit">
                  <Save className="h-4 w-4" />
                  Save Profile
                </button>
              </div>
            </form>
          </ToolSurface>
        )}

        {view === "dashboard" && (
          <section className="space-y-6">
            <SectionIntro
              eyebrow="Home"
              title="Collection decision journal"
              description="Start from your recorded thesis, unresolved review items, and local card radar. Agent help only runs when you ask for it."
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              {dashboardStats.map((stat) => (
                <Metric key={stat.label} {...stat} />
              ))}
            </div>
            <JournalHome
              entries={recentJournalEntries}
              reviewQueue={reviewQueue}
              onOpenJournal={() => navigateTo("journal")}
              onAskAgent={handleJournalAgent}
              onAddToPlan={handleAddJournalReviewToPlan}
              loading={aiLoading === "journal"}
            />
            {journalAgentDraft && <JournalAgentReflection draft={journalAgentDraft} response={journalAgentResponse} />}
            {aiError && aiLoading !== "risk" && <AiError message={aiError} />}
            <RecommendationGrid
              recommendations={journalRecommendations}
              profile={profile}
              onSelectCard={setSelectedCard}
            />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
              <Panel title="Active profile" icon={Target}>
                <DetailGrid
                  items={[
                    ["IP focus", profile.ip],
                    ["Goal", profile.goal],
                    ["Market", profile.preferredMarket],
                    ["Holding period", profile.holdingPeriod],
                    ["Grading", profile.gradingPreference],
                    ["Characters", profile.favoriteCharacters],
                  ]}
                />
              </Panel>
              <Panel title="Next best actions" icon={Sparkles}>
                <ActionList
                  items={[
                    "Write the thesis before buying or grading.",
                    "Use Risk Review when a listing lacks version or condition evidence.",
                    "Run Raw vs Slab only after the listing passes the evidence check.",
                    "Keep unresolved心得 in the 30-day plan until reviewed.",
                  ]}
                />
              </Panel>
            </div>
            <DecisionPlanList items={decisionPlanItems} onUpdateStatus={updateDecisionPlanStatus} />
          </section>
        )}

        {view === "risk" && (
          <ToolSurface
            icon={SearchCheck}
            eyebrow="Listing Risk Checker"
            title="Should this listing move forward?"
            description="Paste title and description first. If the evidence clears the first screen, continue into raw-vs-slab math."
          >
            <form className="form-grid" onSubmit={riskForm.handleSubmit(handleRiskSubmit)}>
              <InputField className="md:col-span-2" label="Listing title" {...riskForm.register("title")} />
              <TextAreaField className="md:col-span-2" label="Description" {...riskForm.register("description")} />
              <InputField label="Listed price" type="number" {...riskForm.register("price", { valueAsNumber: true })} />
              <SelectField label="Marketplace" {...riskForm.register("marketplace")} options={marketOptions} />
              <SelectField label="User goal" {...riskForm.register("userGoal")} options={["Self-collection", "Grading", "Resale"]} />
              <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row">
                <button className="primary-button" type="submit">
                  <AlertTriangle className="h-4 w-4" />
                  Analyze Locally
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={aiLoading === "risk"}
                  onClick={riskForm.handleSubmit(handleRiskAiSubmit)}
                >
                  <Sparkles className="h-4 w-4" />
                  {aiLoading === "risk" ? "Running Hermes..." : "Analyze with AI"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={pipelineLoading !== null}
                  onClick={riskForm.handleSubmit(handlePipelineEvidenceSubmit)}
                >
                  <ListChecks className="h-4 w-4" />
                  {pipelineLoading === "evidence" ? "Evidence Agent..." : "Analyze with AI Pipeline"}
                </button>
              </div>
            </form>
            {aiError && <AiError message={aiError} />}
            {pipelineError && <AiError message={pipelineError} />}
            <ListingRiskPipeline
              state={listingPipeline}
              loading={pipelineLoading}
              onEvidenceChange={(evidence) => setListingPipeline((current) => ({ ...current, evidence }))}
              onContinue={handlePipelineContinue}
              onAddToPlan={handleAddRiskToPlan}
            />
            {aiRiskResponse && <AgentTrace response={aiRiskResponse} />}
            {riskReport && (
              <RiskReport
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
            eyebrow="Raw vs Slab Calculator"
            title="Use deterministic math before grading speculation"
            description="All arithmetic is TypeScript code. The explanation only interprets the calculated result."
          >
            <CalibrationCard calibration={gradingCalibration} onApply={handleApplyCalibration} />
            <form className="form-grid" onSubmit={rawForm.handleSubmit(handleRawSubmit)}>
              <InputField label="Raw price" type="number" step="0.01" {...rawForm.register("rawPrice", { valueAsNumber: true })} />
              <InputField label="PSA10 sold price" type="number" step="0.01" {...rawForm.register("psa10Price", { valueAsNumber: true })} />
              <InputField label="PSA9 sold price" type="number" step="0.01" {...rawForm.register("psa9Price", { valueAsNumber: true })} />
              <InputField label="Other estimate" type="number" step="0.01" {...rawForm.register("otherPrice", { valueAsNumber: true })} />
              <InputField label="Grading + inbound cost" type="number" step="0.01" {...rawForm.register("gradingCost", { valueAsNumber: true })} />
              <InputField label="Marketplace fee rate (0.13 = 13%)" type="number" step="0.01" {...rawForm.register("marketplaceFeeRate", { valueAsNumber: true })} />
              <InputField label="Sale shipping" type="number" step="0.01" {...rawForm.register("shippingCost", { valueAsNumber: true })} />
              <InputField label="PSA10 probability (0.25 = 25%)" type="number" step="0.01" {...rawForm.register("psa10Probability", { valueAsNumber: true })} />
              <InputField label="PSA9 probability (0.40 = 40%)" type="number" step="0.01" {...rawForm.register("psa9Probability", { valueAsNumber: true })} />
              <div className="md:col-span-2">
                <button className="primary-button" type="submit">
                  <Calculator className="h-4 w-4" />
                  Recalculate
                </button>
              </div>
            </form>
            <RawResult result={rawResult} onAddToPlan={handleAddRawToPlan} />
          </ToolSurface>
        )}

        {view === "journal" && (
          <ToolSurface
            icon={BookOpenCheck}
            eyebrow="Collection Decision Journal"
            title="Capture the thesis, risks, and review result"
            description="Structured心得 stays in localStorage and feeds the home recommendation radar without external card data."
          >
            <form className="form-grid" onSubmit={journalForm.handleSubmit(handleJournalSubmit)}>
              <SelectField label="TCG" {...journalForm.register("tcg")} options={favoriteTcgOptions} />
              <InputField label="Card name" {...journalForm.register("cardName")} />
              <InputField label="Version" {...journalForm.register("version")} />
              <InputField label="Date" type="date" {...journalForm.register("date")} />
              <SelectField label="Action type" {...journalForm.register("actionType")} options={journalActionOptions} />
              <InputField label="Price" type="number" step="0.01" {...journalForm.register("price", { valueAsNumber: true })} />
              <SelectField label="Goal" {...journalForm.register("userGoal")} options={goalOptions} />
              <InputField label="Tags" placeholder="character, set, risk theme" {...journalForm.register("tags")} />
              <SelectField label="Sentiment" {...journalForm.register("sentiment")} options={journalSentimentOptions} />
              <TextAreaField className="md:col-span-2" label="Original thesis" {...journalForm.register("thesis")} />
              <TextAreaField className="md:col-span-2" label="Watch reason" {...journalForm.register("watchReason")} />
              <TextAreaField label="Buy condition" {...journalForm.register("buyCondition")} />
              <TextAreaField label="Sell condition" {...journalForm.register("sellCondition")} />
              <TextAreaField label="Stop condition" {...journalForm.register("stopCondition")} />
              <TextAreaField label="Risks noted" {...journalForm.register("risks")} />
              <InputField label="Review date" type="date" {...journalForm.register("reviewDate")} />
              <SelectField label="Review status" {...journalForm.register("reviewStatus")} options={journalReviewStatusOptions} />
              <TextAreaField label="Missing information" {...journalForm.register("missingInfo")} />
              <TextAreaField label="Final outcome" {...journalForm.register("finalOutcome")} />
              <TextAreaField label="Lessons learned" {...journalForm.register("lessonsLearned")} />
              <InputField
                label="Assumed PSA10 probability (0.30 = 30%)"
                type="number"
                step="0.01"
                {...journalForm.register("assumedPsa10Probability", {
                  setValueAs: (value) => (value === "" ? undefined : Number(value)),
                })}
              />
              <SelectField label="Actual grade" {...journalForm.register("actualGrade")} options={actualGradeOptions} />
              <SelectField label="Decision source" {...journalForm.register("source")} options={decisionSourceOptions} />
              <div className="md:col-span-2">
                <button className="primary-button" type="submit">
                  <Save className="h-4 w-4" />
                  Save Journal Entry
                </button>
              </div>
            </form>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <button className={filterClass(journalFilter === "All")} onClick={() => setJournalFilter("All")}>
                All
              </button>
              {journalActionOptions.map((action) => (
                <button key={action} className={filterClass(journalFilter === action)} onClick={() => setJournalFilter(action)}>
                  {action}
                </button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filteredEntries.map((entry) => (
                <JournalEntry
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
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onRunRaw={handleSendCardToRaw}
          onCheckRisk={handleSendCardToRisk}
          onAddToPlan={handleAddCardToPlan}
        />
      )}
    </main>
  );
}

function Header({ activeView, onNavigate }: { activeView: View; onNavigate: (view: View) => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[#dcd9c8] bg-[#f5f3ed]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-8 lg:px-10">
        <button className="flex w-fit items-center gap-3 text-left" onClick={() => onNavigate("landing")}>
          <span className="grid h-10 w-10 place-items-center rounded-md bg-[#4a7c59] font-serif text-lg font-bold text-[#f5f3ed]">
            T
          </span>
          <span>
            <span className="block font-serif text-xl font-bold text-[#4a7c59]">TCGpal</span>
            <span className="block text-xs font-semibold uppercase text-[#6b6555]">Card counter notes</span>
          </span>
        </button>
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
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function FirstRunExperience({
  step,
  profile,
  onToggleTcg,
  onSelectPersona,
  onSelectBudget,
  onStepChange,
  onFinish,
}: {
  step: OnboardingStep;
  profile: UserProfile;
  onToggleTcg: (tcg: UserProfile["favoriteTcgs"][number]) => void;
  onSelectPersona: (playerType: UserProfile["playerType"]) => void;
  onSelectBudget: (budgetRange: UserProfile["budgetRange"]) => void;
  onStepChange: (step: OnboardingStep) => void;
  onFinish: () => void;
}) {
  return (
    <section className="border-b border-[#dcd9c8] bg-[#ecebe1]">
      <div className="mx-auto grid min-h-[680px] max-w-7xl grid-cols-1 gap-8 px-5 py-10 md:grid-cols-[0.86fr_1.14fr] md:px-8 lg:px-10">
        <div className="flex flex-col justify-center">
          <Badge icon={Layers3}>TCGpal starts with the cards you care about</Badge>
          <h1 className="mt-5 max-w-3xl font-serif text-5xl font-bold leading-tight text-[#4a7c59] md:text-7xl">
            Build your card radar.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#6b6555]">
            Pick your games, your player type, and a rough budget. TCGpal will show cards to review before you paste a listing or run grading math.
          </p>
          <div className="mt-8 flex gap-2">
            {(["tcg", "persona", "budget"] as const).map((item, index) => (
              <button
                key={item}
                className={`h-2 flex-1 rounded-full ${step === item ? "bg-[#b7472a]" : "bg-[#fffdf7]"}`}
                aria-label={`Step ${index + 1}`}
                onClick={() => onStepChange(item)}
              />
            ))}
          </div>
        </div>
        <div className="rounded-md border border-[#dcd9c8] bg-[#fffdf7] p-5 shadow-[0_18px_50px_rgba(45,38,32,0.12)] md:p-6">
          {step === "tcg" && (
            <div>
              <p className="text-xs font-semibold uppercase text-[#6b6555]">Step 1 of 3</p>
              <h2 className="mt-2 font-serif text-3xl font-bold text-[#4a7c59]">What TCGs do you follow?</h2>
              <p className="mt-2 text-sm leading-6 text-[#6b6555]">Choose more than one. Your first home screen will be built around these games.</p>
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
                Continue
              </button>
            </div>
          )}
          {step === "persona" && (
            <div>
              <p className="text-xs font-semibold uppercase text-[#6b6555]">Step 2 of 3</p>
              <h2 className="mt-2 font-serif text-3xl font-bold text-[#4a7c59]">What type of TCG player are you?</h2>
              <div className="mt-6 grid grid-cols-1 gap-3">
                {playerTypeOptions.map((playerType) => (
                  <button
                    key={playerType}
                    className={`choice-card items-start ${profile.playerType === playerType ? "choice-card-active" : ""}`}
                    onClick={() => onSelectPersona(playerType)}
                  >
                    <span>
                      <span className="block text-base">{playerType}</span>
                      <span className="mt-1 block text-sm font-medium leading-6 text-[#6b6555]">{personaDescription(playerType)}</span>
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
                  Back
                </button>
                <button className="primary-button flex-1" onClick={() => onStepChange("budget")}>
                  Continue
                </button>
              </div>
            </div>
          )}
          {step === "budget" && (
            <div>
              <p className="text-xs font-semibold uppercase text-[#6b6555]">Step 3 of 3</p>
              <h2 className="mt-2 font-serif text-3xl font-bold text-[#4a7c59]">What budget should TCGpal respect?</h2>
              <p className="mt-2 text-sm leading-6 text-[#6b6555]">A range is enough for now. You can change it later.</p>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {budgetRangeOptions.map((budgetRange) => (
                  <button
                    key={budgetRange}
                    className={`choice-card ${profile.budgetRange === budgetRange ? "choice-card-active" : ""}`}
                    onClick={() => onSelectBudget(budgetRange)}
                  >
                    <span>{budgetRange}</span>
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
                  Back
                </button>
                <button className="primary-button flex-1" onClick={onFinish}>
                  Show my cards
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function JournalHome({
  entries,
  reviewQueue,
  onOpenJournal,
  onAskAgent,
  onAddToPlan,
  loading,
}: {
  entries: DecisionJournalEntry[];
  reviewQueue: DecisionJournalEntry[];
  onOpenJournal: () => void;
  onAskAgent: (entry: DecisionJournalEntry) => void;
  onAddToPlan: (entry: DecisionJournalEntry) => void;
  loading: boolean;
}) {
  const leadEntry = entries[0];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-md border border-[#dcd9c8] bg-[#fffdf7] p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-[#6b6555]">Latest counter note</p>
            <h3 className="mt-1 font-serif text-3xl font-bold text-[#4a7c59]">{leadEntry?.cardName ?? "Start a card thesis"}</h3>
          </div>
          <button className="primary-button" type="button" onClick={onOpenJournal}>
            <FilePenLine className="h-4 w-4" />
            New note
          </button>
        </div>
        {leadEntry ? (
          <div className="mt-5">
            <p className="text-sm leading-7 text-[#4a3a30]">{leadEntry.thesis}</p>
            <DetailGrid
              items={[
                ["TCG", leadEntry.tcg],
                ["Sentiment", leadEntry.sentiment],
                ["Review status", leadEntry.reviewStatus],
                ["Watch reason", leadEntry.watchReason || "Not specified"],
              ]}
            />
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="secondary-button" type="button" disabled={loading} onClick={() => onAskAgent(leadEntry)}>
                <Sparkles className="h-4 w-4" />
                {loading ? "Checking note..." : "Ask Agent"}
              </button>
              <button className="secondary-button" type="button" onClick={() => onAddToPlan(leadEntry)}>
                <ClipboardList className="h-4 w-4" />
                Add review item
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[#6b6555]">Create a structured心得 first; recommendations will adapt after there is history.</p>
        )}
      </section>

      <Panel title="Review queue" icon={FilePenLine}>
        {reviewQueue.length ? (
          <div className="space-y-3">
            {reviewQueue.map((entry) => (
              <article key={entry.id} className="rounded-md bg-[#f5f3ed] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-[#6b6555]">{entry.reviewStatus}</p>
                    <h4 className="mt-1 font-serif text-lg font-bold text-[#4a7c59]">{entry.cardName}</h4>
                  </div>
                  <span className="rounded-md bg-[#ecebe1] px-2 py-1 text-xs font-bold uppercase text-[#6b6555]">{entry.tcg}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#6b6555]">{entry.watchReason || entry.stopCondition || entry.risks || "Review the original thesis before acting."}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="secondary-button min-h-0 px-3 py-2 text-xs" type="button" disabled={loading} onClick={() => onAskAgent(entry)}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Agent
                  </button>
                  <button className="secondary-button min-h-0 px-3 py-2 text-xs" type="button" onClick={() => onAddToPlan(entry)}>
                    <ClipboardList className="h-3.5 w-3.5" />
                    Plan
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-[#6b6555]">No unresolved notes. New decisions can still be added from Journal, Listing Risk, or Raw vs Slab.</p>
        )}
      </Panel>
    </div>
  );
}

function JournalAgentReflection({ draft, response }: { draft: JournalDraft; response: HermesResponse | null }) {
  return (
    <section className="rounded-md border border-[#dcd9c8] bg-[#fffdf7] p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-[#6b6555]">Journal Agent</p>
          <h3 className="mt-1 font-serif text-2xl font-bold text-[#4a7c59]">{draft.cardName}</h3>
        </div>
        <Badge icon={Sparkles}>{response?.fallbackUsed ? "Local fallback used" : response ? "AI assisted" : "Local reflection"}</Badge>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-md bg-[#f5f3ed] p-4">
          <h4 className="font-serif text-lg font-bold text-[#4a7c59]">Next action prompt</h4>
          <p className="mt-2 text-sm leading-6 text-[#4a3a30]">{draft.reviewPrompt}</p>
        </div>
        <div className="rounded-md bg-[#f5f3ed] p-4">
          <h4 className="font-serif text-lg font-bold text-[#4a7c59]">Guardrail</h4>
          <p className="mt-2 text-sm leading-6 text-[#4a3a30]">{draft.stopCondition}</p>
        </div>
      </div>
      <GroupedList title="Risks to re-check" items={splitListText(draft.risks)} />
      {response && <AgentTrace response={response} />}
    </section>
  );
}

function RecommendationGrid({
  recommendations,
  profile,
  onSelectCard,
}: {
  recommendations: JournalBasedRecommendation[];
  profile: UserProfile;
  onSelectCard: (card: CuratedCardRecommendation) => void;
}) {
  return (
    <section className="rounded-md border border-[#dcd9c8] bg-[#fffdf7] p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-[#6b6555]">From your journal</p>
          <h3 className="mt-1 font-serif text-3xl font-bold text-[#4a7c59]">Cards to review next</h3>
        </div>
        <p className="w-fit rounded-full bg-[#f9a620] px-3 py-1 text-xs font-bold uppercase text-[#4a3a10]">{profile.favoriteTcgs.join(", ")} · {profile.budgetRange}</p>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
        {recommendations.map((recommendation, index) => {
          const card = recommendation.card;
          const featured = index === 0;
          return (
            <button
              key={card.id}
              className={`text-left ${featured ? "md:col-span-6 xl:col-span-5" : "md:col-span-3 xl:col-span-7"} ${index === 2 ? "xl:-mt-5" : ""}`}
              onClick={() => onSelectCard(card)}
            >
              <article className={`h-full rounded-md border border-[#dcd9c8] bg-[#f5f3ed] p-4 transition hover:-translate-y-1 hover:border-[#c8c2aa] hover:shadow-lg ${featured ? "md:p-5" : ""}`}>
                <div className={`flex gap-4 ${featured ? "items-end" : ""}`}>
                  <DesignedCard card={card} large={featured} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase text-[#6b6555]">{card.tcg}</p>
                    <h4 className={`${featured ? "text-3xl" : "text-lg"} mt-1 font-serif font-bold leading-tight text-[#4a7c59]`}>{card.cardName}</h4>
                    <p className="mt-1 text-sm leading-5 text-[#6b6555]">{card.version}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded bg-[#f9a620] px-2 py-1 font-mono text-xs font-bold text-[#4a3a10]">{formatMoney(card.suggestedRawPrice)} raw</span>
                      <span className="rounded bg-[#ecebe1] px-2 py-1 font-mono text-xs font-bold text-[#4a7c59]">{formatPercent(card.psa10Probability)} PSA10?</span>
                    </div>
                  </div>
                </div>
                <p className="mt-4 border-l-4 border-[#b7472a] bg-[#ecebe1] px-3 py-2 text-sm leading-6 text-[#4a3a30]">{recommendation.reason}</p>
                <p className="mt-3 text-xs font-semibold uppercase text-[#6b6555]">Local score {recommendation.score}</p>
              </article>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CardDecisionSheet({
  card,
  onClose,
  onRunRaw,
  onCheckRisk,
  onAddToPlan,
}: {
  card: CuratedCardRecommendation;
  onClose: () => void;
  onRunRaw: (card: CuratedCardRecommendation) => void;
  onCheckRisk: (card: CuratedCardRecommendation) => void;
  onAddToPlan: (card: CuratedCardRecommendation) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-[#2d2620]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="mx-auto max-h-[calc(100vh-2rem)] max-w-4xl overflow-y-auto rounded-md bg-[#fffdf7] p-5 shadow-2xl md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-4">
            <DesignedCard card={card} large />
            <div>
              <p className="text-xs font-semibold uppercase text-[#6b6555]">{card.tcg} · {card.rarity}</p>
              <h2 className="mt-1 font-serif text-3xl font-bold text-[#4a7c59]">{card.cardName}</h2>
              <p className="mt-1 text-[#6b6555]">{card.version}</p>
            </div>
          </div>
          <button className="secondary-button min-h-0 px-3 py-2" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-md border border-[#dcd9c8] bg-[#f5f3ed] p-4">
            <h3 className="font-serif text-lg font-bold text-[#4a7c59]">Counter note</h3>
            <p className="mt-3 leading-7 text-[#4a3a30]">{card.buyTone}</p>
            <GroupedList title="Risk flags" items={card.riskFlags} />
          </section>
          <section className="rounded-md border border-[#dcd9c8] bg-[#f5f3ed] p-4">
            <h3 className="font-serif text-lg font-bold text-[#4a7c59]">Raw / slab snapshot</h3>
            <DetailGrid
              items={[
                ["Raw guide", formatMoney(card.suggestedRawPrice)],
                ["PSA9 guide", formatMoney(card.suggestedPsa9Price)],
                ["PSA10 guide", formatMoney(card.suggestedPsa10Price)],
                ["PSA10 odds", formatPercent(card.psa10Probability)],
              ]}
            />
          </section>
        </div>
        <div className="sticky bottom-0 -mx-5 mt-6 flex flex-col gap-3 border-t border-[#dcd9c8] bg-[#fffdf7]/95 px-5 py-4 backdrop-blur sm:flex-row md:-mx-6 md:px-6">
          <button className="primary-button" onClick={() => onRunRaw(card)}>
            <Calculator className="h-4 w-4" />
            Run Raw vs Slab
          </button>
          <button className="secondary-button" onClick={() => onCheckRisk(card)}>
            <SearchCheck className="h-4 w-4" />
            Check Listing Risk
          </button>
          <button className="secondary-button" onClick={() => onAddToPlan(card)}>
            <ClipboardList className="h-4 w-4" />
            Add to 30-day plan
          </button>
        </div>
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
      <div className="rounded-md border border-[#dcd9c8] bg-[#fffdf7] p-5 shadow-sm md:p-6">{children}</div>
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
        <span className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#4a7c59] text-[#f5f3ed]">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div>
        <p className="text-xs font-semibold uppercase text-[#6b6555]">{eyebrow}</p>
        <h2 className="mt-1 font-serif text-3xl font-bold text-[#4a7c59]">{title}</h2>
        <p className="mt-2 leading-7 text-[#6b6555]">{description}</p>
      </div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-[#dcd9c8] bg-[#fffdf7] p-5">
      <h3 className="mb-4 flex items-center gap-2 font-serif text-lg font-bold text-[#4a7c59]">
        <Icon className="h-5 w-5 text-[#b7472a]" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-md border border-[#dcd9c8] bg-[#fffdf7] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#6b6555]">{label}</p>
        <Icon className="h-4 w-4 text-[#b7472a]" />
      </div>
      <p className="mt-3 font-mono text-2xl font-bold text-[#4a7c59]">{value}</p>
    </div>
  );
}

function RiskReport({
  report,
  onContinue,
  onAddToPlan,
}: {
  report: ListingRiskReport;
  onContinue: () => void;
  onAddToPlan: () => void;
}) {
  const riskTone = getRiskTone(report.score);

  return (
    <section className="mt-6 rounded-md border border-[#dcd9c8] bg-[#f5f3ed] p-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div className={`rounded-lg border p-5 ${riskTone.containerClass}`}>
          <p className="text-xs font-semibold uppercase tracking-wide">{riskTone.kicker}</p>
          <p className="mt-2 text-4xl font-black leading-none md:text-5xl">{riskTone.headline}</p>
          <p className="mt-3 text-sm font-semibold">Confidence: {report.confidence}</p>
        </div>
        <p className="leading-7 text-[#4a3a30]">{report.cautiousSummary}</p>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <GroupedList title="Missing information" items={report.missingInfo} />
        <GroupedList title="Key risks" items={report.keyRisks} />
        <GroupedList title="Seller questions" items={report.sellerQuestions} />
      </div>
      <div className="mt-5 rounded-md bg-[#fffdf7] p-4 text-sm leading-6 text-[#2d2620]">
        <strong>Suitability:</strong> {report.suitability}
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button className="primary-button" type="button" onClick={onContinue}>
          <Calculator className="h-4 w-4" />
          Continue to Raw vs Slab
        </button>
        <button className="secondary-button" type="button" onClick={onAddToPlan}>
          <ClipboardList className="h-4 w-4" />
          Add this to 30-day plan
        </button>
      </div>
    </section>
  );
}

function ListingRiskPipeline({
  state,
  loading,
  onEvidenceChange,
  onContinue,
  onAddToPlan,
}: {
  state: ListingPipelineState;
  loading: "evidence" | "risk_math_critic" | null;
  onEvidenceChange: (evidence: ListingEvidence) => void;
  onContinue: (evidence: ListingEvidence) => void;
  onAddToPlan: () => void;
}) {
  if (!state.listingInput && !loading) return null;

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
      <div className="rounded-md border border-[#dcd9c8] bg-[#ecebe1] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-[#6b6555]">Agent Review Pipeline</p>
            <h3 className="mt-1 font-serif text-2xl font-bold text-[#4a7c59]">Evidence first, then risk and math</h3>
          </div>
          <Badge icon={ListChecks}>{state.fallbackUsed ? "Local fallback used" : "Editable review"}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold uppercase text-[#6b6555] md:grid-cols-4">
          {[
            ["Evidence", Boolean(state.evidence)],
            ["Risk", Boolean(state.riskScore)],
            ["Math", Boolean(state.math)],
            ["Critic", Boolean(state.critic)],
          ].map(([label, done]) => (
            <div key={String(label)} className={`rounded-md border px-3 py-2 ${done ? "border-[#4a7c59] bg-[#fffdf7] text-[#4a7c59]" : "border-[#dcd9c8] bg-[#f5f3ed]"}`}>
              {done ? "Done" : "Waiting"} · {label}
            </div>
          ))}
        </div>
      </div>

      {loading === "evidence" && <PipelineNote label="Evidence agent is reading the listing text..." />}

      {state.evidence && (
        <section className="rounded-md border border-[#dcd9c8] bg-[#fffdf7] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-[#6b6555]">Evidence Extracted</p>
              <h3 className="mt-1 font-serif text-2xl font-bold text-[#4a7c59]">Confirm the card identity</h3>
            </div>
            <button className="primary-button" type="button" disabled={loading !== null} onClick={() => onContinue(state.evidence!)}>
              <Check className="h-4 w-4" />
              Confirm & Continue
            </button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {([
              ["cardName", "Card name"],
              ["setCode", "Set"],
              ["cardNumber", "Card number"],
              ["language", "Language"],
            ] as const).map(([field, label]) => (
              <label key={field} className="rounded-md bg-[#f5f3ed] p-3">
                <span className="text-xs font-semibold uppercase text-[#6b6555]">{label}</span>
                <input
                  className="mt-2 w-full rounded-md border border-[#dcd9c8] bg-[#fffdf7] px-3 py-2 font-mono text-sm outline-none focus:border-[#4a7c59]"
                  value={state.evidence?.[field].value ?? ""}
                  placeholder="Missing"
                  onChange={(event) => updateEvidence(field, event.target.value)}
                />
                <span className="mt-2 block text-xs font-semibold text-[#6b6555]">
                  {state.evidence?.[field].confidence ?? "low"} · {state.evidence?.[field].source ?? "unknown"}
                </span>
              </label>
            ))}
          </div>
          <GroupedList title={`Missing evidence (${state.evidence.missingEvidence.length})`} items={state.evidence.missingEvidence} />
        </section>
      )}

      {loading === "risk_math_critic" && !state.riskScore && <PipelineNote label="Risk agent is scoring condition, version, price, policy, and grading viability..." />}

      {state.riskScore && (
        <section className="rounded-md border border-[#dcd9c8] bg-[#fffdf7] p-5">
          <p className="text-xs font-semibold uppercase text-[#6b6555]">Risk Agent</p>
          <h3 className={`mt-2 font-serif text-4xl font-bold leading-tight ${state.riskScore.overall >= 70 ? "text-[#b7472a]" : "text-[#4a7c59]"}`}>
            {state.riskScore.verdict}
          </h3>
          <p className="mt-2 font-mono text-lg font-bold">Overall: {state.riskScore.overall}/100</p>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {Object.entries(state.riskScore.dimensions).map(([key, dimension]) => (
              <div key={key} className="rounded-md bg-[#f5f3ed] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold capitalize text-[#4a3a30]">{formatRiskDimensionName(key)}</p>
                  <p className="font-mono font-bold">{dimension.score}/100</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#6b6555]">{dimension.reasons.join(" ")}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {state.math && (
        <section className="rounded-md border border-[#dcd9c8] bg-[#fffdf7] p-5">
          <p className="text-xs font-semibold uppercase text-[#6b6555]">Math Agent</p>
          <h3 className="mt-1 font-serif text-2xl font-bold text-[#4a7c59]">Raw vs Slab impact</h3>
          <div className="mt-5 rounded-md bg-[#f5f3ed] p-5 text-center">
            <p className="text-sm font-semibold uppercase text-[#6b6555]">Expected Value</p>
            <p className={`mt-2 font-mono text-5xl font-black ${state.math.result.expectedProfit >= 0 ? "text-[#4a7c59]" : "text-[#b7472a]"}`}>
              {formatMoney(state.math.result.expectedProfit)}
            </p>
            <p className="mt-2 text-sm text-[#6b6555]">{state.math.result.recommendation}</p>
          </div>
          <GroupedList title="Assumptions used" items={state.math.assumptionNotes} />
        </section>
      )}

      {state.critic && (
        <section className={`rounded-md border p-5 ${state.critic.passed ? "border-[#4a7c59] bg-[#eef0df]" : "border-[#b7472a] bg-[#fff3ed]"}`}>
          <p className="text-xs font-semibold uppercase text-[#6b6555]">Final Recommendation</p>
          <h3 className="mt-2 font-serif text-3xl font-bold leading-tight text-[#2d2620]">{state.critic.finalRecommendation}</h3>
          {state.critic.warnings.length > 0 && <GroupedList title="Critic warnings" items={state.critic.warnings} />}
          <button className="primary-button mt-5" type="button" onClick={onAddToPlan}>
            <ClipboardList className="h-4 w-4" />
            Add to 30-day plan
          </button>
        </section>
      )}

      {state.trace.length > 0 && (
        <details className="rounded-md border border-[#dcd9c8] bg-[#2d2620] p-5 text-sm text-[#f5f3ed]">
          <summary className="cursor-pointer font-mono text-xs uppercase text-[#f9a620]">View technical trace ({state.trace.length} agents)</summary>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {state.trace.map((step) => (
              <article key={step.step} className="rounded-md border border-[#4a3a30] bg-[#3a312a] p-4 font-mono text-xs">
                <p className="uppercase text-[#f9a620]">{step.step}</p>
                <h4 className="mt-1 text-sm font-bold text-[#fffdf7]">{step.agent}</h4>
                <p className="mt-2 leading-6">{sanitizeTraceMessage(step.summary)}</p>
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
    <div className="rounded-md border border-[#dcd9c8] bg-[#fffdf7] p-5">
      <div className="h-4 w-48 animate-pulse rounded bg-[#dcd9c8]" />
      <p className="mt-4 text-sm font-semibold text-[#6b6555]">{label}</p>
    </div>
  );
}

function AgentTrace({ response }: { response: HermesResponse }) {
  return (
    <details className="mt-6 rounded-md border border-[#dcd9c8] bg-[#ecebe1] p-5 text-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 font-semibold">
        <Badge icon={Sparkles}>View AI reasoning trace</Badge>
        <Badge icon={Gauge}>{response.fallbackUsed ? "Local fallback used" : "AI assisted"}</Badge>
      </summary>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Badge icon={Sparkles}>Hermes task: {response.taskType}</Badge>
      </div>
      {response.warnings.length > 0 && <GroupedList title="Warnings" items={response.warnings.map(sanitizeTraceMessage)} />}
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {response.trace.map((step) => (
          <article key={`${step.step}-${step.agent}`} className="rounded-md border border-[#dcd9c8] bg-[#fffdf7] p-4">
            <p className="text-xs font-semibold uppercase text-[#6b6555]">{step.step}</p>
            <h4 className="mt-1 text-base font-semibold text-[#4a7c59]">{step.agent}</h4>
            <p className="mt-2 text-sm leading-6 text-[#6b6555]">{sanitizeTraceMessage(step.summary)}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#6b6555]">
              <span className="rounded-md bg-[#ecebe1] px-2 py-1">Model: {sanitizeTraceMessage(step.model)}</span>
              {step.toolsUsed.map((tool) => (
                <span key={tool} className="rounded-md bg-[#ecebe1] px-2 py-1">
                  Tool: {tool}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}

function AiHealthBanner({ health }: { health: AiHealth }) {
  const modelText = health.models
    ?.filter((model) => !model.ok)
    .map((model) => `${model.role}: ${model.model}${model.status ? ` (${model.status})` : ""}`)
    .join(", ");

  return (
    <div className="border-b border-[#e2c76c] bg-[#fff7d6] px-5 py-3 text-sm font-medium text-[#59451a]">
      <div className="mx-auto max-w-7xl">
        {health.warning || "AI temporarily unavailable, using local fallback."}
        {modelText ? <span className="ml-2 font-mono text-xs">Check: {modelText}</span> : null}
      </div>
    </div>
  );
}

function AiError({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-md border border-[#d8a29a] bg-[#fff7f5] p-4 text-sm leading-6 text-[#81352f]">
      <strong>AI request failed:</strong> {message}
    </div>
  );
}

function CalibrationCard({ calibration, onApply }: { calibration: GradingCalibration; onApply: () => void }) {
  return (
    <section className="mb-5 rounded-md border border-[#dcd9c8] bg-[#f5f3ed] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-[#6b6555]">Journal calibration</p>
          <p className="mt-2 text-sm leading-6 text-[#4a3a30]">{calibration.message}</p>
          {calibration.enoughHistory && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#6b6555]">
              <span className="rounded-md bg-[#fffdf7] px-2 py-1">Sample: {calibration.sampleSize}</span>
              <span className="rounded-md bg-[#fffdf7] px-2 py-1">Assumed avg: {formatPercent(calibration.assumedAverage)}</span>
              <span className="rounded-md bg-[#fffdf7] px-2 py-1">Actual PSA10: {formatPercent(calibration.actualPsa10Rate)}</span>
            </div>
          )}
        </div>
        <button className="secondary-button shrink-0" type="button" disabled={!calibration.enoughHistory} onClick={onApply}>
          Apply adjusted probability
        </button>
      </div>
    </section>
  );
}

function RawResult({ result, onAddToPlan }: { result: RawVsSlabResult; onAddToPlan: () => void }) {
  const profitable = result.expectedProfit >= 0;

  return (
    <section className="mt-6 space-y-4">
      <div
        className={`rounded-lg border p-6 text-center ${
          profitable ? "border-[#9fc7a3] bg-[#f1f8ef] text-[#173f24]" : "border-[#e1aaa4] bg-[#fff5f3] text-[#7a241e]"
        }`}
      >
        <p className="text-xs font-extrabold uppercase tracking-wide">Expected Profit</p>
        <p className="mt-2 font-mono text-5xl font-black leading-none md:text-6xl">{formatMoney(result.expectedProfit)}</p>
        <p className="mx-auto mt-4 max-w-3xl text-sm font-semibold leading-6">{result.recommendation}</p>
        <button className="secondary-button mt-5 bg-[#fffdf7]/80" type="button" onClick={onAddToPlan}>
          <ClipboardList className="h-4 w-4" />
          Add this to 30-day plan
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-md border border-[#dcd9c8] bg-[#f5f3ed] p-5">
          <h3 className="font-serif text-lg font-bold text-[#4a7c59]">Supporting numbers</h3>
          <DetailGrid
            items={[
              ["PSA10 net value", formatMoney(result.psa10NetValue)],
              ["PSA9 net value", formatMoney(result.psa9NetValue)],
              ["Other net value", formatMoney(result.otherNetValue)],
              ["Worst case", formatMoney(result.worstCaseOutcome)],
              [
                "Break-even PSA10",
                result.breakEvenPsa10Probability === null ? "N/A" : `${(result.breakEvenPsa10Probability * 100).toFixed(1)}%`,
              ],
            ]}
            dangerLabels={["Worst case"]}
          />
        </div>
        <div className="rounded-md border border-[#dcd9c8] bg-[#f5f3ed] p-5">
          <h3 className="font-serif text-lg font-bold text-[#4a7c59]">Explanation</h3>
          <p className="mt-3 leading-7 text-[#4a3a30]">{result.explanation}</p>
          <GroupedList title="Assumptions" items={result.assumptions} />
        </div>
      </div>
    </section>
  );
}

function DecisionPlanList({
  items,
  onUpdateStatus,
}: {
  items: DecisionPlanItem[];
  onUpdateStatus: (id: string, status: DecisionPlanItem["status"]) => void;
}) {
  if (!items.length) {
    return (
      <Panel title="30-day plan" icon={ClipboardList}>
        <p className="text-sm leading-6 text-[#6b6555]">
          No active decision items yet. Run a listing risk check or raw-vs-slab calculation, then add the decision here.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="30-day plan" icon={ClipboardList}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-md border border-[#dcd9c8] bg-[#f5f3ed] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-[#6b6555]">{formatDecisionSource(item.source)}</p>
                <h4 className="mt-1 font-serif text-lg font-bold text-[#4a7c59]">{item.title}</h4>
              </div>
              <span className="rounded-md bg-[#f9a620] px-3 py-1 text-xs font-bold uppercase text-[#4a3a10]">{item.status}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-[#2d2620]">{item.cardName}</p>
            <p className="mt-2 text-sm leading-6 text-[#6b6555]">{item.summary}</p>
            <p className="mt-3 text-xs font-semibold uppercase text-[#6b6555]">Due {item.dueDate}</p>
            {item.status === "open" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="secondary-button min-h-0 px-3 py-2 text-xs" type="button" onClick={() => onUpdateStatus(item.id, "done")}>
                  Mark done
                </button>
                <button className="secondary-button min-h-0 px-3 py-2 text-xs" type="button" onClick={() => onUpdateStatus(item.id, "skipped")}>
                  Skip
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </Panel>
  );
}

function JournalEntry({
  entry,
  onAskAgent,
  onAddToPlan,
  loading,
}: {
  entry: DecisionJournalEntry;
  onAskAgent: (entry: DecisionJournalEntry) => void;
  onAddToPlan: (entry: DecisionJournalEntry) => void;
  loading: boolean;
}) {
  return (
    <article className="rounded-md border border-[#dcd9c8] bg-[#f5f3ed] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#6b6555]">{entry.actionType}</p>
          <h3 className="mt-1 font-serif text-lg font-bold text-[#4a7c59]">{entry.cardName}</h3>
        </div>
        <span className="rounded-md bg-[#f9a620] px-3 py-1 text-sm font-bold text-[#4a3a10]">{formatMoney(entry.price)}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#6b6555]">{entry.thesis}</p>
      <DetailGrid
        items={[
          ["TCG", entry.tcg],
          ["Version", entry.version || "Not specified"],
          ["Date", entry.date],
          ["Tags", entry.tags || "Not specified"],
          ["Sentiment", entry.sentiment],
          ["Review status", entry.reviewStatus],
          ["Watch reason", entry.watchReason || "Not specified"],
          ["Buy condition", entry.buyCondition || "Not specified"],
          ["Stop condition", entry.stopCondition || "Not specified"],
          ["Risks", entry.risks || "Not specified"],
          ["Missing info", entry.missingInfo || "Not specified"],
          ["Final outcome", entry.finalOutcome || "Not recorded"],
          ["Lessons", entry.lessonsLearned || "Not recorded"],
          ["Assumed PSA10", typeof entry.assumedPsa10Probability === "number" ? formatPercent(entry.assumedPsa10Probability) : "Not specified"],
          ["Actual grade", entry.actualGrade || "UNKNOWN"],
        ]}
      />
      <div className="mt-5 flex flex-wrap gap-3">
        <button className="secondary-button" type="button" disabled={loading} onClick={() => onAskAgent(entry)}>
          <Sparkles className="h-4 w-4" />
          {loading ? "Checking..." : "Ask Agent"}
        </button>
        <button className="secondary-button" type="button" onClick={() => onAddToPlan(entry)}>
          <ClipboardList className="h-4 w-4" />
          Add review item
        </button>
      </div>
    </article>
  );
}

function DesignedCard({ card, large = false }: { card: CuratedCardRecommendation; large?: boolean }) {
  const tone = getTcgTone(card.tcg);
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md border ${tone.border} ${tone.bg} ${large ? "h-52 w-36" : "h-32 w-24"} p-2 shadow-inner`}
    >
      <div className={`absolute inset-x-0 top-0 h-2 ${tone.strip}`} />
      <div className="absolute left-2 top-4 rounded-sm bg-[#2d2620]/70 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-[#f5f3ed]">
        {card.tcg}
      </div>
      <div className="absolute right-2 top-4 rounded-sm bg-[#f5f3ed] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#b7472a]">
        {card.rarity.slice(0, 5)}
      </div>
      <div className="mt-8 flex h-[calc(100%-2rem)] flex-col justify-between">
        <div>
          <div className="grid min-h-14 place-items-center rounded-sm border border-current/20 bg-[#fffdf7]/20 p-2 text-center">
            <span className="font-serif text-[10px] font-bold uppercase leading-4">
              Binder
              <br />
              slot
            </span>
          </div>
          <div className="mt-2 w-fit rotate-[-3deg] rounded-sm bg-[#f9a620] px-2 py-1 text-[9px] font-black uppercase text-[#4a3a10]">
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
      <h4 className="text-sm font-semibold uppercase text-[#6b6555]">{title}</h4>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-[#4a3a30]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b7472a]" />
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
          <div key={label} className="rounded-md bg-[#ecebe1] p-3">
            <dt className="text-xs font-semibold uppercase text-[#6b6555]">{label}</dt>
            <dd className={`mt-1 font-mono text-sm leading-6 ${isDanger ? "font-bold text-[#b7472a]" : "text-[#2d2620]"}`}>{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function ActionList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 rounded-md bg-[#ecebe1] p-3 text-sm leading-6 text-[#2d2620]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#b7472a]" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function Badge({ children, icon: Icon }: { children: React.ReactNode; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-md border border-[#dcd9c8] bg-[#fffdf7] px-3 py-1.5 text-sm font-semibold text-[#2d2620]">
      <Icon className="h-4 w-4 text-[#b7472a]" />
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
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: readonly string[] }) => (
  <label className={`field ${className}`}>
    <span>{label}</span>
    <select {...props}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
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

function splitListText(text: string) {
  const items = text
    .split(/[.;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : ["Re-check the original thesis, missing evidence, and stop condition before acting."];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatRiskDimensionName(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function getDateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDecisionSource(source: DecisionPlanItem["source"]) {
  if (source === "journal") return "Journal review";
  return source === "listing_risk" ? "Listing risk" : "Raw vs slab";
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

function personaDescription(playerType: UserProfile["playerType"]) {
  if (playerType === "Collector") return "I mainly collect cards I like and want to avoid overpaying.";
  if (playerType === "Seller / Vendor") return "I buy cards as inventory and care about margin, fees, and liquidity.";
  return "I collect, but I also care about resale, grading upside, and decision discipline.";
}

function getTcgTone(tcg: UserProfile["favoriteTcgs"][number]) {
  if (tcg === "Pokemon") return { bg: "bg-[#f9a620] text-[#4a3a10]", border: "border-[#d18a18]", strip: "bg-[#4a7c59]" };
  if (tcg === "One Piece") return { bg: "bg-[#4a7c59] text-[#f5f3ed]", border: "border-[#386445]", strip: "bg-[#b7472a]" };
  if (tcg === "Yu-Gi-Oh") return { bg: "bg-[#b7472a] text-[#f5f3ed]", border: "border-[#8f351f]", strip: "bg-[#f9a620]" };
  if (tcg === "League / Riot TCG") return { bg: "bg-[#ecebe1] text-[#4a7c59]", border: "border-[#dcd9c8]", strip: "bg-[#b7472a]" };
  return { bg: "bg-[#6b6555] text-[#f5f3ed]", border: "border-[#565044]", strip: "bg-[#f9a620]" };
}

function filterClass(active: boolean) {
  return `rounded-md border px-3 py-2 text-sm font-semibold ${
    active ? "border-[#4a7c59] bg-[#4a7c59] text-[#f5f3ed]" : "border-[#dcd9c8] bg-[#fffdf7] text-[#4a3a30] hover:border-[#c8c2aa]"
  }`;
}

function getRiskTone(score: ListingRiskReport["score"]) {
  if (score === "High") {
    return {
      kicker: "High risk",
      headline: "ASK QUESTIONS FIRST",
      containerClass: "border-[#d88980] bg-[#fff5f3] text-[#7a241e]",
    };
  }

  if (score === "Medium-High") {
    return {
      kicker: "Elevated risk",
      headline: "VERIFY BEFORE BUYING",
      containerClass: "border-[#e2c76c] bg-[#fff9dd] text-[#5d4815]",
    };
  }

  if (score === "Medium") {
    return {
      kicker: "Moderate risk",
      headline: "CHECK THE GAPS",
      containerClass: "border-[#d8c887] bg-[#fffbea] text-[#574819]",
    };
  }

  return {
    kicker: "Lower risk",
    headline: "CONDITIONALLY OK",
    containerClass: "border-[#9fc7a3] bg-[#f1f8ef] text-[#173f24]",
  };
}

function sanitizeTraceMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("zod") || lower.includes("invalid_type") || lower.includes("validation")) {
    return "AI output did not match the expected app schema, so the local fallback was used.";
  }

  if (lower.includes("openai 401") || lower.includes("not_authorized") || lower.includes("api key")) {
    return "AI provider is unavailable in this local session, so the local fallback was used.";
  }

  if (message.length > 180) {
    return `${message.slice(0, 177)}...`;
  }

  return message;
}
