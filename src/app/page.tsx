"use client";

import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Calculator,
  Check,
  ClipboardList,
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
  getCuratedRecommendations,
  toListingRiskInput,
  toRawVsSlabInput,
  type CuratedCardRecommendation,
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
  type ListingRiskInput,
  type ListingRiskReport,
  type RawVsSlabInput,
  type RawVsSlabResult,
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
  cardName: "Tony Tony Chopper EB01-006 AA",
  version: "Japanese alternate art",
  date: new Date().toISOString().slice(0, 10),
  actionType: "Considering purchase",
  price: 80,
  userGoal: "Collection + resale",
  thesis: "I want one representative Chopper card that can stay in my collection while preserving resale flexibility.",
  buyCondition: "Only buy below $80 with clean front/back photos and clear version.",
  sellCondition: "Review if net profit exceeds 30% after fees or if I need to rotate budget.",
  stopCondition: "Skip if version is unclear or the raw-vs-slab math only works with an optimistic PSA10 assumption.",
  risks: "Version ambiguity, condition uncertainty, and low liquidity for lower-end cards.",
  missingInfo: "Back photo, corner closeups, recent sold comps.",
  reviewDate: "",
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
  const [aiLoading, setAiLoading] = useState<"risk" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);

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

  const openPlanItems = useMemo(() => {
    return decisionPlanItems.filter((item) => item.status === "open");
  }, [decisionPlanItems]);

  const gradingCalibration = useMemo(() => {
    return getGradingCalibration(journalEntries, Number(watchedPsa10Probability) || defaultRawVsSlabInput.psa10Probability);
  }, [journalEntries, watchedPsa10Probability]);

  const recommendedCards = useMemo(() => {
    return getCuratedRecommendations(profile);
  }, [profile]);

  const dashboardStats = [
    { label: "Monthly budget", value: `$${profile.monthlyBudget}`, icon: Target },
    { label: "Risk posture", value: profile.riskLevel, icon: Gauge },
    { label: "Journal entries", value: String(journalEntries.length), icon: BookOpenCheck },
    { label: "30-day items", value: String(openPlanItems.length), icon: ClipboardList },
    { label: "Last EV", value: formatMoney(rawResult.expectedProfit), icon: BarChart3 },
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
    <main className="min-h-screen bg-[#f6f7f3] text-[#17211c]">
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
              title="Cards worth reviewing first"
              description="Curated demo recommendations based on your TCGs, player type, and budget range."
            />
            <RecommendationGrid
              cards={recommendedCards}
              profile={profile}
              onSelectCard={setSelectedCard}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              {dashboardStats.map((stat) => (
                <Metric key={stat.label} {...stat} />
              ))}
            </div>
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
                    "Paste the current eBay listing into Listing Risk.",
                    "Run Raw vs Slab before buying raw cards above $50.",
                    "Use journal history to calibrate PSA10 assumptions.",
                    "Add unresolved decisions to the 30-day plan before purchase.",
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
              </div>
            </form>
            {aiError && <AiError message={aiError} />}
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
            eyebrow="Decision Journal"
            title="Capture the thesis before the purchase"
            description="Entries are saved to localStorage so the portfolio demo can show persistence without a backend."
          >
            <form className="form-grid" onSubmit={journalForm.handleSubmit(handleJournalSubmit)}>
              <InputField label="Card name" {...journalForm.register("cardName")} />
              <InputField label="Version" {...journalForm.register("version")} />
              <InputField label="Date" type="date" {...journalForm.register("date")} />
              <SelectField label="Action type" {...journalForm.register("actionType")} options={journalActionOptions} />
              <InputField label="Price" type="number" step="0.01" {...journalForm.register("price", { valueAsNumber: true })} />
              <SelectField label="Goal" {...journalForm.register("userGoal")} options={goalOptions} />
              <TextAreaField className="md:col-span-2" label="Original thesis" {...journalForm.register("thesis")} />
              <TextAreaField label="Buy condition" {...journalForm.register("buyCondition")} />
              <TextAreaField label="Sell condition" {...journalForm.register("sellCondition")} />
              <TextAreaField label="Stop condition" {...journalForm.register("stopCondition")} />
              <TextAreaField label="Risks noted" {...journalForm.register("risks")} />
              <InputField label="Review date" type="date" {...journalForm.register("reviewDate")} />
              <TextAreaField label="Missing information" {...journalForm.register("missingInfo")} />
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
                <JournalEntry key={entry.id} entry={entry} />
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
    <header className="sticky top-0 z-20 border-b border-[#d8ddcf] bg-[#f6f7f3]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-8 lg:px-10">
        <button className="flex w-fit items-center gap-3 text-left" onClick={() => onNavigate("landing")}>
          <span className="grid h-10 w-10 place-items-center rounded-md bg-[#153f38] text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-lg font-semibold">TCGpal</span>
            <span className="block text-xs font-medium uppercase text-[#647168]">Cautious TCG decisions</span>
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
    <section className="border-b border-[#d8ddcf] bg-[#eef2e7]">
      <div className="mx-auto grid min-h-[680px] max-w-7xl grid-cols-1 gap-8 px-5 py-10 md:grid-cols-[0.9fr_1.1fr] md:px-8 lg:px-10">
        <div className="flex flex-col justify-center">
          <Badge icon={Layers3}>TCGpal starts with the cards you care about</Badge>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-tight text-[#111815] md:text-6xl">
            Build your card radar.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4d5a50]">
            Pick your games, your player type, and a rough budget. TCGpal will show cards to review before you paste a listing or run grading math.
          </p>
          <div className="mt-8 flex gap-2">
            {(["tcg", "persona", "budget"] as const).map((item, index) => (
              <button
                key={item}
                className={`h-2 flex-1 rounded-full ${step === item ? "bg-[#153f38]" : "bg-white"}`}
                aria-label={`Step ${index + 1}`}
                onClick={() => onStepChange(item)}
              />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-[#c7d1c3] bg-white p-5 shadow-[0_18px_60px_rgba(28,45,37,0.14)] md:p-6">
          {step === "tcg" && (
            <div>
              <p className="text-xs font-semibold uppercase text-[#68756c]">Step 1 of 3</p>
              <h2 className="mt-2 text-3xl font-semibold">What TCGs do you follow?</h2>
              <p className="mt-2 text-sm leading-6 text-[#536057]">Choose more than one. Your first home screen will be built around these games.</p>
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
              <p className="text-xs font-semibold uppercase text-[#68756c]">Step 2 of 3</p>
              <h2 className="mt-2 text-3xl font-semibold">What type of TCG player are you?</h2>
              <div className="mt-6 grid grid-cols-1 gap-3">
                {playerTypeOptions.map((playerType) => (
                  <button
                    key={playerType}
                    className={`choice-card items-start ${profile.playerType === playerType ? "choice-card-active" : ""}`}
                    onClick={() => onSelectPersona(playerType)}
                  >
                    <span>
                      <span className="block text-base">{playerType}</span>
                      <span className="mt-1 block text-sm font-medium leading-6 text-[#536057]">{personaDescription(playerType)}</span>
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
              <p className="text-xs font-semibold uppercase text-[#68756c]">Step 3 of 3</p>
              <h2 className="mt-2 text-3xl font-semibold">What budget should TCGpal respect?</h2>
              <p className="mt-2 text-sm leading-6 text-[#536057]">A range is enough for now. You can change it later.</p>
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

function RecommendationGrid({
  cards,
  profile,
  onSelectCard,
}: {
  cards: CuratedCardRecommendation[];
  profile: UserProfile;
  onSelectCard: (card: CuratedCardRecommendation) => void;
}) {
  return (
    <section className="rounded-lg border border-[#d8ddcf] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-[#68756c]">Recommended first reviews</p>
          <h3 className="mt-1 text-2xl font-semibold">{profile.playerType} radar</h3>
        </div>
        <p className="text-sm font-medium text-[#536057]">{profile.favoriteTcgs.join(", ")} · {profile.budgetRange}</p>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <button key={card.id} className="text-left" onClick={() => onSelectCard(card)}>
            <article className="h-full rounded-lg border border-[#d8ddcf] bg-[#fbfcf8] p-4 transition hover:-translate-y-1 hover:border-[#9eb0a0] hover:shadow-lg">
              <div className="flex gap-4">
                <DesignedCard card={card} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase text-[#68756c]">{card.tcg}</p>
                  <h4 className="mt-1 text-lg font-semibold leading-6">{card.cardName}</h4>
                  <p className="mt-1 text-sm leading-5 text-[#536057]">{card.version}</p>
                  <p className="mt-3 font-mono text-sm font-bold">{formatMoney(card.suggestedRawPrice)} raw</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#435046]">{card.buyTone}</p>
            </article>
          </button>
        ))}
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
    <div className="fixed inset-0 z-40 bg-[#111815]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="mx-auto max-h-[calc(100vh-2rem)] max-w-4xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-4">
            <DesignedCard card={card} large />
            <div>
              <p className="text-xs font-semibold uppercase text-[#68756c]">{card.tcg} · {card.rarity}</p>
              <h2 className="mt-1 text-3xl font-semibold">{card.cardName}</h2>
              <p className="mt-1 text-[#536057]">{card.version}</p>
            </div>
          </div>
          <button className="secondary-button min-h-0 px-3 py-2" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-lg border border-[#d8ddcf] bg-[#fbfcf8] p-4">
            <h3 className="text-lg font-semibold">Moderate buy tone</h3>
            <p className="mt-3 leading-7 text-[#435046]">{card.buyTone}</p>
            <GroupedList title="Risk flags" items={card.riskFlags} />
          </section>
          <section className="rounded-lg border border-[#d8ddcf] bg-[#fbfcf8] p-4">
            <h3 className="text-lg font-semibold">Raw / slab snapshot</h3>
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
        <div className="sticky bottom-0 -mx-5 mt-6 flex flex-col gap-3 border-t border-[#e3e7dd] bg-white/95 px-5 py-4 backdrop-blur sm:flex-row md:-mx-6 md:px-6">
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
      <div className="rounded-lg border border-[#d8ddcf] bg-white p-5 shadow-sm md:p-6">{children}</div>
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
        <span className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#153f38] text-white">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div>
        <p className="text-xs font-semibold uppercase text-[#68756c]">{eyebrow}</p>
        <h2 className="mt-1 text-3xl font-semibold text-[#111815]">{title}</h2>
        <p className="mt-2 leading-7 text-[#536057]">{description}</p>
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
    <section className="rounded-lg border border-[#d8ddcf] bg-white p-5">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Icon className="h-5 w-5 text-[#1f695d]" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-[#d8ddcf] bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#647168]">{label}</p>
        <Icon className="h-4 w-4 text-[#1f695d]" />
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
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
    <section className="mt-6 rounded-lg border border-[#d8ddcf] bg-[#fbfcf8] p-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div className={`rounded-lg border p-5 ${riskTone.containerClass}`}>
          <p className="text-xs font-semibold uppercase tracking-wide">{riskTone.kicker}</p>
          <p className="mt-2 text-4xl font-black leading-none md:text-5xl">{riskTone.headline}</p>
          <p className="mt-3 text-sm font-semibold">Confidence: {report.confidence}</p>
        </div>
        <p className="leading-7 text-[#435046]">{report.cautiousSummary}</p>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <GroupedList title="Missing information" items={report.missingInfo} />
        <GroupedList title="Key risks" items={report.keyRisks} />
        <GroupedList title="Seller questions" items={report.sellerQuestions} />
      </div>
      <div className="mt-5 rounded-md bg-white p-4 text-sm leading-6 text-[#354139]">
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

function AgentTrace({ response }: { response: HermesResponse }) {
  return (
    <details className="mt-6 rounded-lg border border-[#c7d1c3] bg-[#f8faf5] p-5 text-sm">
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
          <article key={`${step.step}-${step.agent}`} className="rounded-md border border-[#d8ddcf] bg-white p-4">
            <p className="text-xs font-semibold uppercase text-[#68756c]">{step.step}</p>
            <h4 className="mt-1 text-base font-semibold">{step.agent}</h4>
            <p className="mt-2 text-sm leading-6 text-[#536057]">{sanitizeTraceMessage(step.summary)}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#536057]">
              <span className="rounded-md bg-[#eef2e7] px-2 py-1">Model: {sanitizeTraceMessage(step.model)}</span>
              {step.toolsUsed.map((tool) => (
                <span key={tool} className="rounded-md bg-[#eef2e7] px-2 py-1">
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
    <section className="mb-5 rounded-lg border border-[#d8ddcf] bg-[#fbfcf8] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-[#68756c]">Journal calibration</p>
          <p className="mt-2 text-sm leading-6 text-[#435046]">{calibration.message}</p>
          {calibration.enoughHistory && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#536057]">
              <span className="rounded-md bg-white px-2 py-1">Sample: {calibration.sampleSize}</span>
              <span className="rounded-md bg-white px-2 py-1">Assumed avg: {formatPercent(calibration.assumedAverage)}</span>
              <span className="rounded-md bg-white px-2 py-1">Actual PSA10: {formatPercent(calibration.actualPsa10Rate)}</span>
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
        <button className="secondary-button mt-5 bg-white/80" type="button" onClick={onAddToPlan}>
          <ClipboardList className="h-4 w-4" />
          Add this to 30-day plan
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-[#d8ddcf] bg-[#fbfcf8] p-5">
          <h3 className="text-lg font-semibold">Supporting numbers</h3>
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
        <div className="rounded-lg border border-[#d8ddcf] bg-[#fbfcf8] p-5">
          <h3 className="text-lg font-semibold">Explanation</h3>
          <p className="mt-3 leading-7 text-[#435046]">{result.explanation}</p>
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
        <p className="text-sm leading-6 text-[#536057]">
          No active decision items yet. Run a listing risk check or raw-vs-slab calculation, then add the decision here.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="30-day plan" icon={ClipboardList}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-md border border-[#d8ddcf] bg-[#f8faf5] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-[#68756c]">{formatDecisionSource(item.source)}</p>
                <h4 className="mt-1 text-lg font-semibold">{item.title}</h4>
              </div>
              <span className="rounded-md bg-white px-3 py-1 text-xs font-bold uppercase text-[#354139]">{item.status}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-[#243028]">{item.cardName}</p>
            <p className="mt-2 text-sm leading-6 text-[#536057]">{item.summary}</p>
            <p className="mt-3 text-xs font-semibold uppercase text-[#68756c]">Due {item.dueDate}</p>
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

function JournalEntry({ entry }: { entry: DecisionJournalEntry }) {
  return (
    <article className="rounded-lg border border-[#d8ddcf] bg-[#fbfcf8] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[#68756c]">{entry.actionType}</p>
          <h3 className="mt-1 text-lg font-semibold">{entry.cardName}</h3>
        </div>
        <span className="rounded-md bg-white px-3 py-1 text-sm font-semibold">{formatMoney(entry.price)}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#536057]">{entry.thesis}</p>
      <DetailGrid
        items={[
          ["Version", entry.version || "Not specified"],
          ["Date", entry.date],
          ["Buy condition", entry.buyCondition || "Not specified"],
          ["Stop condition", entry.stopCondition || "Not specified"],
          ["Risks", entry.risks || "Not specified"],
          ["Missing info", entry.missingInfo || "Not specified"],
          ["Assumed PSA10", typeof entry.assumedPsa10Probability === "number" ? formatPercent(entry.assumedPsa10Probability) : "Not specified"],
          ["Actual grade", entry.actualGrade || "UNKNOWN"],
        ]}
      />
    </article>
  );
}

function DesignedCard({ card, large = false }: { card: CuratedCardRecommendation; large?: boolean }) {
  const tone = getTcgTone(card.tcg);
  return (
    <div
      className={`relative overflow-hidden rounded-md border ${tone.border} ${tone.bg} ${large ? "h-44 w-32" : "h-32 w-24"} shrink-0 p-2 shadow-inner`}
    >
      <div className={`absolute inset-x-0 top-0 h-2 ${tone.strip}`} />
      <div className="mt-2 flex h-full flex-col justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wide text-white/85">{card.tcg}</p>
          <div className="mt-2 rounded-sm border border-white/30 bg-white/20 p-2 text-center text-[10px] font-bold uppercase leading-4 text-white">
            Card art
            <br />
            coming soon
          </div>
        </div>
        <div>
          <p className="truncate text-[10px] font-black uppercase text-white">{card.cardName}</p>
          <p className="truncate text-[9px] font-semibold text-white/75">{card.rarity}</p>
        </div>
      </div>
    </div>
  );
}

function GroupedList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-5">
      <h4 className="text-sm font-semibold uppercase text-[#68756c]">{title}</h4>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-[#435046]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f695d]" />
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
          <div key={label} className="rounded-md bg-[#f8faf5] p-3">
            <dt className="text-xs font-semibold uppercase text-[#68756c]">{label}</dt>
            <dd className={`mt-1 font-mono text-sm leading-6 ${isDanger ? "font-bold text-[#9f2f25]" : "text-[#354139]"}`}>{value}</dd>
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
        <li key={item} className="flex items-start gap-3 rounded-md bg-[#f8faf5] p-3 text-sm leading-6 text-[#354139]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1f695d]" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function Badge({ children, icon: Icon }: { children: React.ReactNode; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-md border border-[#c7d1c3] bg-white px-3 py-1.5 text-sm font-semibold text-[#243028]">
      <Icon className="h-4 w-4 text-[#1f695d]" />
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
    .map((entry) => `${entry.actionType}: ${entry.cardName}. Thesis: ${entry.thesis}. Risks: ${entry.risks}`)
    .join("\n");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getDateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDecisionSource(source: DecisionPlanItem["source"]) {
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
  if (tcg === "Pokemon") return { bg: "bg-[#2f6db3]", border: "border-[#1f4f86]", strip: "bg-[#f2d06b]" };
  if (tcg === "One Piece") return { bg: "bg-[#255f59]", border: "border-[#17433f]", strip: "bg-[#d14c3f]" };
  if (tcg === "Yu-Gi-Oh") return { bg: "bg-[#4b2f6f]", border: "border-[#301f48]", strip: "bg-[#b9a05f]" };
  if (tcg === "League / Riot TCG") return { bg: "bg-[#20364f]", border: "border-[#142536]", strip: "bg-[#b7985a]" };
  return { bg: "bg-[#4d5a50]", border: "border-[#333d36]", strip: "bg-[#c7d1c3]" };
}

function filterClass(active: boolean) {
  return `rounded-md border px-3 py-2 text-sm font-semibold ${
    active ? "border-[#153f38] bg-[#153f38] text-white" : "border-[#d8ddcf] bg-white text-[#354139] hover:border-[#a8b5aa]"
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
