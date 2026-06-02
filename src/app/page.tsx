"use client";

import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Calculator,
  ClipboardList,
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
import { useForm } from "react-hook-form";
import { analyzeListingRisk } from "@/lib/listing-risk";
import { generatePlan } from "@/lib/plan-generator";
import { calculateRawVsSlab } from "@/lib/raw-vs-slab";
import {
  defaultPlanInput,
  defaultProfile,
  defaultRawVsSlabInput,
  starterJournalEntry,
} from "@/lib/sample-data";
import {
  decisionJournalEntrySchema,
  generatedPlanSetSchema,
  goalOptions,
  gradingOptions,
  hermesResponseSchema,
  holdingOptions,
  ipOptions,
  journalActionOptions,
  listingRiskReportSchema,
  listingRiskInputSchema,
  marketOptions,
  planInputSchema,
  productTypeOptions,
  rawVsSlabInputSchema,
  returnsPolicyOptions,
  riskOptions,
  sellerRatingOptions,
  sellerTypeOptions,
  userProfileSchema,
  type DecisionJournalEntry,
  type GeneratedPlanSet,
  type HermesResponse,
  type ListingRiskInput,
  type ListingRiskReport,
  type PlanInput,
  type RawVsSlabInput,
  type RawVsSlabResult,
  type UserProfile,
} from "@/lib/schemas";
import {
  loadJournalEntries,
  loadLatestPlan,
  loadProfile,
  saveJournalEntries,
  saveLatestPlan,
  saveProfile,
} from "@/lib/storage";

type View = "landing" | "onboarding" | "dashboard" | "plan" | "risk" | "raw" | "journal";

type JournalForm = Omit<DecisionJournalEntry, "id" | "createdAt">;

const views: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "plan", label: "Plan", icon: ClipboardList },
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
  productType: "Single Card",
  sellerType: "Individual",
  sellerRating: "New / No history",
  returnsPolicy: "No returns",
  region: "",
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
};

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [latestPlan, setLatestPlan] = useState<GeneratedPlanSet | null>(null);
  const [riskReport, setRiskReport] = useState<ListingRiskReport | null>(null);
  const [rawResult, setRawResult] = useState<RawVsSlabResult>(() => calculateRawVsSlab(defaultRawVsSlabInput));
  const [journalEntries, setJournalEntries] = useState<DecisionJournalEntry[]>([]);
  const [journalFilter, setJournalFilter] = useState<DecisionJournalEntry["actionType"] | "All">("All");
  const [aiPlanResponse, setAiPlanResponse] = useState<HermesResponse | null>(null);
  const [aiRiskResponse, setAiRiskResponse] = useState<HermesResponse | null>(null);
  const [aiLoading, setAiLoading] = useState<"plan" | "risk" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const profileForm = useForm<UserProfile>({ defaultValues: defaultProfile });
  const planForm = useForm<PlanInput>({ defaultValues: defaultPlanInput });
  const riskForm = useForm<ListingRiskInput>({ defaultValues: listingDefaults });
  const rawForm = useForm<RawVsSlabInput>({ defaultValues: defaultRawVsSlabInput });
  const journalForm = useForm<JournalForm>({ defaultValues: journalDefaults });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedProfile = loadProfile();
      const storedPlan = loadLatestPlan();
      const storedEntries = loadJournalEntries();

      if (storedProfile) {
        setProfile(storedProfile);
        profileForm.reset(storedProfile);
        planForm.reset({
          ...defaultPlanInput,
          ip: storedProfile.ip,
          budget: storedProfile.monthlyBudget,
          goal: storedProfile.goal,
          riskLevel: storedProfile.riskLevel,
          holdingPeriod: storedProfile.holdingPeriod,
          gradingPreference: storedProfile.gradingPreference,
          preferredMarket: storedProfile.preferredMarket,
        });
      }

      if (storedPlan) {
        setLatestPlan(storedPlan);
      }

      if (storedEntries.length) {
        setJournalEntries(storedEntries);
      } else {
        setJournalEntries([starterJournalEntry]);
        saveJournalEntries([starterJournalEntry]);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [journalForm, planForm, profileForm]);

  const filteredEntries = useMemo(() => {
    if (journalFilter === "All") return journalEntries;
    return journalEntries.filter((entry) => entry.actionType === journalFilter);
  }, [journalEntries, journalFilter]);

  const dashboardStats = [
    { label: "Monthly budget", value: `$${profile.monthlyBudget}`, icon: Target },
    { label: "Risk posture", value: profile.riskLevel, icon: Gauge },
    { label: "Journal entries", value: String(journalEntries.length), icon: BookOpenCheck },
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

  function handlePlanSubmit(data: PlanInput) {
    const parsed = planInputSchema.parse(data);
    const plan = generatePlan(parsed);
    setLatestPlan(plan);
    saveLatestPlan(plan);
    setAiPlanResponse(null);
  }

  function handleRiskSubmit(data: ListingRiskInput) {
    const parsed = listingRiskInputSchema.parse(data);
    setRiskReport(analyzeListingRisk(parsed));
    setAiRiskResponse(null);
  }

  function handleRawSubmit(data: RawVsSlabInput) {
    const parsed = rawVsSlabInputSchema.parse(data);
    setRawResult(calculateRawVsSlab(parsed));
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

  async function handlePlanAiSubmit(data: PlanInput) {
    const parsed = planInputSchema.parse(data);
    setAiLoading("plan");
    setAiError(null);

    try {
      const response = await callHermes({
        taskHint: "PLAN_GENERATION",
        profile,
        planInput: parsed,
        journalSummary: summarizeJournal(journalEntries),
      });
      const plan = generatedPlanSetSchema.parse(response.result);
      setLatestPlan(plan);
      saveLatestPlan(plan);
      setAiPlanResponse(response);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI plan generation failed.");
    } finally {
      setAiLoading(null);
    }
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
      setAiError(error instanceof Error ? error.message : "AI listing analysis failed.");
    } finally {
      setAiLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f3] text-[#17211c]">
      <Header activeView={view} onNavigate={navigateTo} />

      {view === "landing" && (
        <section className="border-b border-[#d8ddcf] bg-[#eef2e7]">
          <div className="mx-auto grid min-h-[620px] max-w-7xl grid-cols-1 gap-8 px-5 py-10 md:grid-cols-[1.05fr_0.95fr] md:px-8 lg:px-10">
            <div className="flex flex-col justify-center">
              <Badge icon={ShieldCheck}>Cautious planning layer for TCG decisions</Badge>
              <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-tight text-[#111815] md:text-6xl">
                Stop guessing. Build a card plan.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4d5a50]">
                CardPlan AI helps collectors and small sellers turn goals, budgets, listing details, and grading assumptions into
                structured buy/sell plans. It explains tradeoffs without promising profit.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button className="primary-button" onClick={() => navigateTo("onboarding")}>
                  <ListChecks className="h-4 w-4" />
                  Create My First Plan
                </button>
                <button className="secondary-button" onClick={() => navigateTo("risk")}>
                  <SearchCheck className="h-4 w-4" />
                  Check a Listing Risk
                </button>
              </div>
              <div className="mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
                {["Conditional plans", "Deterministic math", "Decision journal"].map((item) => (
                  <div key={item} className="rounded-md border border-[#d8ddcf] bg-white/70 px-4 py-3 text-sm font-medium">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <ProductPreview />
          </div>
        </section>
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
              eyebrow="Dashboard"
              title="Portfolio demo cockpit"
              description="A compact view of user context, saved plan, recent risk posture, and journal habits."
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
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
                    "Generate or refresh the plan around the current budget.",
                    "Run the riskiest candidate listing through text-based checks.",
                    "Use Raw vs Slab before buying raw cards above $50.",
                    "Write the stop condition in Decision Journal before purchase.",
                  ]}
                />
              </Panel>
            </div>
            {latestPlan && <PlanResults planSet={latestPlan} />}
          </section>
        )}

        {view === "plan" && (
          <ToolSurface
            icon={ClipboardList}
            eyebrow="Plan Generator"
            title="Generate three conditional plans"
            description="Mock structured logic creates conservative, balanced, and aggressive plans from the user's goal and constraints."
          >
            <form className="form-grid" onSubmit={planForm.handleSubmit(handlePlanSubmit)}>
              <SelectField label="IP" {...planForm.register("ip")} options={ipOptions} />
              <InputField label="Theme or candidate cards" {...planForm.register("theme")} />
              <InputField label="Budget" type="number" {...planForm.register("budget", { valueAsNumber: true })} />
              <SelectField label="Goal" {...planForm.register("goal")} options={goalOptions} />
              <SelectField label="Risk level" {...planForm.register("riskLevel")} options={riskOptions} />
              <SelectField label="Holding period" {...planForm.register("holdingPeriod")} options={holdingOptions} />
              <SelectField label="Willing to grade" {...planForm.register("gradingPreference")} options={gradingOptions} />
              <SelectField label="Preferred market" {...planForm.register("preferredMarket")} options={marketOptions} />
              <TextAreaField className="md:col-span-2" label="Notes" {...planForm.register("notes")} />
              <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row">
                <button className="primary-button" type="submit">
                  <Sparkles className="h-4 w-4" />
                  Generate Local Plan
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={aiLoading === "plan"}
                  onClick={planForm.handleSubmit(handlePlanAiSubmit)}
                >
                  <Sparkles className="h-4 w-4" />
                  {aiLoading === "plan" ? "Running Hermes..." : "Generate with AI"}
                </button>
              </div>
            </form>
            {aiError && <AiError message={aiError} />}
            {aiPlanResponse && <AgentTrace response={aiPlanResponse} />}
            {latestPlan && <PlanResults planSet={latestPlan} />}
          </ToolSurface>
        )}

        {view === "risk" && (
          <ToolSurface
            icon={SearchCheck}
            eyebrow="Listing Risk Checker"
            title="Screen pasted listing text before buying"
            description="Phase 0 uses text-only mock logic. Image upload, vision, and Supabase storage wait until later phases."
          >
            <form className="form-grid" onSubmit={riskForm.handleSubmit(handleRiskSubmit)}>
              <InputField className="md:col-span-2" label="Listing title" {...riskForm.register("title")} />
              <TextAreaField className="md:col-span-2" label="Description" {...riskForm.register("description")} />
              <InputField label="Listed price" type="number" {...riskForm.register("price", { valueAsNumber: true })} />
              <SelectField label="Marketplace" {...riskForm.register("marketplace")} options={marketOptions} />
              <SelectField label="User goal" {...riskForm.register("userGoal")} options={["Self-collection", "Grading", "Resale"]} />
              <SelectField label="Product type" {...riskForm.register("productType")} options={productTypeOptions} />
              <SelectField label="Seller type" {...riskForm.register("sellerType")} options={sellerTypeOptions} />
              <SelectField label="Seller rating" {...riskForm.register("sellerRating")} options={sellerRatingOptions} />
              <SelectField label="Returns policy" {...riskForm.register("returnsPolicy")} options={returnsPolicyOptions} />
              <InputField className="md:col-span-2" label="Region / market context (optional)" {...riskForm.register("region")} />
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
            {riskReport && <RiskReport report={riskReport} />}
          </ToolSurface>
        )}

        {view === "raw" && (
          <ToolSurface
            icon={Calculator}
            eyebrow="Raw vs Slab Calculator"
            title="Use deterministic math before grading speculation"
            description="All arithmetic is TypeScript code. The explanation only interprets the calculated result."
          >
            <form className="form-grid" onSubmit={rawForm.handleSubmit(handleRawSubmit)}>
              <InputField label="Raw price" type="number" step="0.01" {...rawForm.register("rawPrice", { valueAsNumber: true })} />
              <InputField label="PSA10 sold price" type="number" step="0.01" {...rawForm.register("psa10Price", { valueAsNumber: true })} />
              <InputField label="PSA9 sold price" type="number" step="0.01" {...rawForm.register("psa9Price", { valueAsNumber: true })} />
              <InputField label="Other estimate" type="number" step="0.01" {...rawForm.register("otherPrice", { valueAsNumber: true })} />
              <InputField label="Grading + inbound cost" type="number" step="0.01" {...rawForm.register("gradingCost", { valueAsNumber: true })} />
              <InputField label="Marketplace fee rate" type="number" step="0.01" {...rawForm.register("marketplaceFeeRate", { valueAsNumber: true })} />
              <InputField label="Sale shipping" type="number" step="0.01" {...rawForm.register("shippingCost", { valueAsNumber: true })} />
              <InputField label="PSA10 probability" type="number" step="0.01" {...rawForm.register("psa10Probability", { valueAsNumber: true })} />
              <InputField label="PSA9 probability" type="number" step="0.01" {...rawForm.register("psa9Probability", { valueAsNumber: true })} />
              <div className="md:col-span-2">
                <button className="primary-button" type="submit">
                  <Calculator className="h-4 w-4" />
                  Recalculate
                </button>
              </div>
            </form>
            <RawResult result={rawResult} />
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
            <span className="block text-lg font-semibold">CardPlan AI</span>
            <span className="block text-xs font-medium uppercase text-[#647168]">PM demo MVP</span>
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

function ProductPreview() {
  return (
    <div className="flex items-center justify-center">
      <div className="w-full max-w-xl rounded-lg border border-[#c7d1c3] bg-white p-4 shadow-[0_18px_60px_rgba(28,45,37,0.14)]">
        <div className="flex items-center justify-between border-b border-[#e3e7dd] pb-3">
          <div>
            <p className="text-xs font-semibold uppercase text-[#68756c]">Plan preview</p>
            <h2 className="text-xl font-semibold">Balanced Chopper Plan</h2>
          </div>
          <span className="rounded-md bg-[#f2d06b] px-3 py-1 text-sm font-semibold">Medium risk</span>
        </div>
        <div className="grid grid-cols-3 gap-3 py-4">
          <MetricMini label="Budget" value="$300" />
          <MetricMini label="Reserve" value="$45" />
          <MetricMini label="Review" value="30 days" />
        </div>
        <div className="space-y-3">
          <PreviewRow label="Buy condition" value="Version clear, price below sold comps, front/back photos available." />
          <PreviewRow label="Risk flag" value="No raw grading play above $50 without corner and surface closeups." />
          <PreviewRow label="Journal prompt" value="Write thesis, stop condition, and review date before purchase." />
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

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e3e7dd] bg-[#f8faf5] p-3">
      <p className="text-xs font-semibold uppercase text-[#68756c]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#f8faf5] p-3">
      <p className="text-xs font-semibold uppercase text-[#68756c]">{label}</p>
      <p className="mt-1 text-sm leading-6 text-[#354139]">{value}</p>
    </div>
  );
}

function PlanResults({ planSet }: { planSet: GeneratedPlanSet }) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
      {planSet.plans.map((plan) => (
        <section key={plan.posture} className="rounded-lg border border-[#d8ddcf] bg-[#fbfcf8] p-5">
          <p className="text-xs font-semibold uppercase text-[#68756c]">{plan.posture}</p>
          <h3 className="mt-1 text-xl font-semibold">{plan.title}</h3>
          <p className="mt-3 text-sm leading-6 text-[#536057]">{plan.summary}</p>
          <GroupedList title="Budget split" items={plan.budgetSplit} />
          <GroupedList title="Buy conditions" items={plan.buyConditions} />
          <GroupedList title="Do not buy" items={plan.doNotBuyConditions} />
          <GroupedList title="Next actions" items={plan.nextActions} />
        </section>
      ))}
    </div>
  );
}

function RiskReport({ report }: { report: ListingRiskReport }) {
  return (
    <section className="mt-6 rounded-lg border border-[#d8ddcf] bg-[#fbfcf8] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge icon={AlertTriangle}>Risk score: {report.score}</Badge>
        <Badge icon={Gauge}>Confidence: {report.confidence}</Badge>
      </div>
      <p className="mt-4 leading-7 text-[#435046]">{report.cautiousSummary}</p>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <GroupedList title="Missing information" items={report.missingInfo} />
        <GroupedList title="Key risks" items={report.keyRisks} />
        <GroupedList title="Seller questions" items={report.sellerQuestions} />
      </div>
      <div className="mt-5 rounded-md bg-white p-4 text-sm leading-6 text-[#354139]">
        <strong>Suitability:</strong> {report.suitability}
      </div>
      {report.authenticity && (
        <div className="mt-5 rounded-lg border border-[#d8ddcf] bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge icon={ShieldCheck}>Authenticity risk: {report.authenticity.authenticityRisk}</Badge>
          </div>
          <p className="mt-4 leading-7 text-[#435046]">{report.authenticity.authenticitySummary}</p>
          <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <GroupedList title="Counterfeit signals" items={report.authenticity.counterfeitSignals} />
            <GroupedList title="Seller credibility" items={report.authenticity.sellerCredibilitySignals} />
            <GroupedList title="Authenticity questions" items={report.authenticity.authenticityQuestions} />
          </div>
        </div>
      )}
    </section>
  );
}

function AgentTrace({ response }: { response: HermesResponse }) {
  return (
    <section className="mt-6 rounded-lg border border-[#c7d1c3] bg-[#f8faf5] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge icon={Sparkles}>Hermes task: {response.taskType}</Badge>
        <Badge icon={Gauge}>{response.fallbackUsed ? "Fallback used" : "AI assisted"}</Badge>
      </div>
      {response.warnings.length > 0 && <GroupedList title="Warnings" items={response.warnings} />}
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {response.trace.map((step) => (
          <article key={`${step.step}-${step.agent}`} className="rounded-md border border-[#d8ddcf] bg-white p-4">
            <p className="text-xs font-semibold uppercase text-[#68756c]">{step.step}</p>
            <h4 className="mt-1 text-base font-semibold">{step.agent}</h4>
            <p className="mt-2 text-sm leading-6 text-[#536057]">{step.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#536057]">
              <span className="rounded-md bg-[#eef2e7] px-2 py-1">Model: {step.model}</span>
              {step.toolsUsed.map((tool) => (
                <span key={tool} className="rounded-md bg-[#eef2e7] px-2 py-1">
                  Tool: {tool}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AiError({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-md border border-[#d8a29a] bg-[#fff7f5] p-4 text-sm leading-6 text-[#81352f]">
      <strong>AI request failed:</strong> {message}
    </div>
  );
}

function RawResult({ result }: { result: RawVsSlabResult }) {
  return (
    <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-lg border border-[#d8ddcf] bg-[#fbfcf8] p-5">
        <h3 className="text-lg font-semibold">Calculation result</h3>
        <DetailGrid
          items={[
            ["PSA10 net value", formatMoney(result.psa10NetValue)],
            ["PSA9 net value", formatMoney(result.psa9NetValue)],
            ["Other net value", formatMoney(result.otherNetValue)],
            ["Expected profit", formatMoney(result.expectedProfit)],
            ["Worst case", formatMoney(result.worstCaseOutcome)],
            [
              "Break-even PSA10",
              result.breakEvenPsa10Probability === null ? "N/A" : `${(result.breakEvenPsa10Probability * 100).toFixed(1)}%`,
            ],
          ]}
        />
      </div>
      <div className="rounded-lg border border-[#d8ddcf] bg-[#fbfcf8] p-5">
        <h3 className="text-lg font-semibold">Explanation</h3>
        <p className="mt-3 leading-7 text-[#435046]">{result.explanation}</p>
        <p className="mt-4 rounded-md bg-white p-4 text-sm font-medium leading-6 text-[#243028]">{result.recommendation}</p>
        <GroupedList title="Assumptions" items={result.assumptions} />
      </div>
    </section>
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
        ]}
      />
    </article>
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

function DetailGrid({ items }: { items: [string, string][] }) {
  return (
    <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md bg-[#f8faf5] p-3">
          <dt className="text-xs font-semibold uppercase text-[#68756c]">{label}</dt>
          <dd className="mt-1 text-sm leading-6 text-[#354139]">{value}</dd>
        </div>
      ))}
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
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className={`field ${className}`}>
    <span>{label}</span>
    <input {...props} />
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

function filterClass(active: boolean) {
  return `rounded-md border px-3 py-2 text-sm font-semibold ${
    active ? "border-[#153f38] bg-[#153f38] text-white" : "border-[#d8ddcf] bg-white text-[#354139] hover:border-[#a8b5aa]"
  }`;
}
