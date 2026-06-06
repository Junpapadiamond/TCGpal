import { fomoCheckInputSchema, fomoCheckResultSchema, type FomoCheckInput, type FomoCheckResult } from "./schemas";

const urgencyPatterns = [
  /right now/i,
  /now or never/i,
  /before it(?:'| i)?s too late/i,
  /going up/i,
  /gonna go up/i,
  /will go up/i,
  /moon/i,
  /fomo/i,
  /can't miss/i,
  /cannot miss/i,
  /last chance/i,
  /everyone/i,
  /hype/i,
  /regret/i,
  /panic/i,
  /rush/i,
];

const groundingPatterns = [
  /budget/i,
  /sold comp/i,
  /comp/i,
  /condition/i,
  /photo/i,
  /back/i,
  /corner/i,
  /surface/i,
  /centering/i,
  /thesis/i,
  /wait/i,
  /plan/i,
  /review/i,
];

const evidencePatterns = [
  /front/i,
  /back/i,
  /photo/i,
  /picture/i,
  /corner/i,
  /edge/i,
  /surface/i,
  /centering/i,
  /sold/i,
  /comp/i,
  /pricecharting/i,
  /tcgplayer/i,
  /ebay/i,
  /return/i,
  /seller/i,
  /condition/i,
  /psa/i,
  /bgs/i,
];

export function runFomoCheck(rawInput: FomoCheckInput): FomoCheckResult {
  const input = fomoCheckInputSchema.parse(rawInput);
  const fomoHeat = scoreFomoHeat(input.feelingText);
  const budgetStrain = scoreBudgetStrain(input.askingPrice, input.todayBudget, input.monthlyBudget);
  const evidenceStrength = scoreEvidenceStrength(input.evidenceText);
  const versionClarity = scoreVersionClarity(input.versionConfirmed, input.cardVersion);
  const activeBudget = input.todayBudget || input.monthlyBudget;
  const hardStop = activeBudget > 0 && input.askingPrice > activeBudget;
  const decisionPosture = getDecisionPosture({
    fomoHeat: fomoHeat.score,
    budgetStrain: budgetStrain.score,
    evidenceStrength: evidenceStrength.score,
    versionClarity: versionClarity.score,
    hardStop,
  });
  const nextStep = getNextStep({
    hardStop,
    fomoHeat: fomoHeat.score,
    budgetStrain: budgetStrain.score,
    evidenceStrength: evidenceStrength.score,
    versionClarity: versionClarity.score,
  });
  const cooldownRecommended = decisionPosture === "Hot" || decisionPosture === "Overheated";

  return fomoCheckResultSchema.parse({
    decisionPosture,
    nextStep,
    fomoHeat,
    budgetStrain,
    evidenceStrength,
    versionClarity,
    hardStop,
    cooldownRecommended,
    warmSummary: buildWarmSummary(decisionPosture, nextStep, input),
    guardrail: buildGuardrail(nextStep, input),
  });
}

function scoreFomoHeat(text: string) {
  const matches = urgencyPatterns.filter((pattern) => pattern.test(text));
  const groundingMatches = groundingPatterns.filter((pattern) => pattern.test(text));
  const exclamationBoost = (text.match(/!/g) ?? []).length >= 2 ? 10 : 0;
  const questionBoost = /should i|am i|is this/i.test(text) ? -8 : 0;
  const score = clamp(matches.length * 14 + exclamationBoost + questionBoost - groundingMatches.length * 6 + (text.length > 180 ? 8 : 0), 0, 100);

  return {
    score,
    label: metricLabel(score),
    reasons: compactReasons([
      matches.length ? `FOMO language found: ${matches.slice(0, 3).map((pattern) => labelPattern(pattern)).join(", ")}.` : "No strong panic language found.",
      groundingMatches.length ? "You included some grounding details, which lowers the emotional heat." : "The thought does not yet include many grounding details.",
      exclamationBoost ? "Repeated urgency punctuation raises the heat." : "",
    ]),
  };
}

function scoreBudgetStrain(askingPrice: number, todayBudget: number, monthlyBudget: number) {
  const activeBudget = todayBudget || monthlyBudget;
  const activeRatio = activeBudget > 0 ? askingPrice / activeBudget : 1;
  const monthlyRatio = monthlyBudget > 0 ? askingPrice / monthlyBudget : 1;
  const score = clamp(Math.round(activeRatio * 100), 0, 100);

  return {
    score,
    label: metricLabel(score),
    reasons: compactReasons([
      todayBudget > 0 ? `This would use ${Math.round(activeRatio * 100)}% of today's buy budget.` : "No today's buy budget is available, so the monthly benchmark is being used.",
      monthlyBudget > 0 ? `It is ${Math.round(monthlyRatio * 100)}% of the monthly hobby budget benchmark.` : "",
      askingPrice > activeBudget && activeBudget > 0 ? "The asking price is above the active budget guardrail, so this is a hard pause." : "",
      askingPrice <= activeBudget && activeRatio >= 0.5 ? "It is within today's budget, but concentrated enough to slow down." : "",
      activeRatio < 0.5 ? "The price leaves meaningful room inside today's budget." : "",
    ]),
  };
}

function scoreEvidenceStrength(text: string) {
  const matches = evidencePatterns.filter((pattern) => pattern.test(text));
  const score = clamp(matches.length * 12 + (text.trim().length >= 80 ? 12 : 0), 0, 100);

  return {
    score,
    label: metricLabel(score),
    reasons: compactReasons([
      matches.length ? `Evidence mentioned: ${matches.slice(0, 4).map((pattern) => labelPattern(pattern)).join(", ")}.` : "No concrete evidence was entered yet.",
      text.trim().length >= 80 ? "The evidence note has enough detail to review." : "The evidence note is still thin.",
    ]),
  };
}

function scoreVersionClarity(versionConfirmed: boolean, cardVersion: string) {
  const score = versionConfirmed && cardVersion.trim() ? 100 : versionConfirmed ? 70 : 15;

  return {
    score,
    label: metricLabel(score),
    reasons: compactReasons([
      versionConfirmed ? "A specific card version was selected before the check." : "The card version is not confirmed yet.",
      cardVersion.trim() ? `Selected version: ${cardVersion}.` : "No version label is attached to this decision.",
    ]),
  };
}

function getDecisionPosture(input: {
  fomoHeat: number;
  budgetStrain: number;
  evidenceStrength: number;
  versionClarity: number;
  hardStop: boolean;
}): FomoCheckResult["decisionPosture"] {
  if (input.hardStop || input.versionClarity < 35 || (input.fomoHeat >= 70 && input.evidenceStrength < 45)) return "Overheated";
  if (input.fomoHeat >= 55 || input.budgetStrain >= 75 || input.evidenceStrength < 25) return "Hot";
  if (input.fomoHeat >= 25 || input.budgetStrain >= 45 || input.evidenceStrength < 60 || input.versionClarity < 80) return "Warm";
  return "Cool";
}

function getNextStep(input: {
  hardStop: boolean;
  fomoHeat: number;
  budgetStrain: number;
  evidenceStrength: number;
  versionClarity: number;
}): FomoCheckResult["nextStep"] {
  if (input.hardStop || (input.fomoHeat >= 70 && input.evidenceStrength < 45)) return "Pause";
  if (input.versionClarity < 80) return "Ask for evidence";
  if (input.evidenceStrength < 45) return "Ask for evidence";
  if (input.budgetStrain >= 45 || input.fomoHeat >= 35) return "Run math";
  return "Proceed within guardrails";
}

function buildWarmSummary(posture: FomoCheckResult["decisionPosture"], nextStep: FomoCheckResult["nextStep"], input: FomoCheckInput) {
  if (posture === "Overheated") {
    return `This looks emotionally hot, not stupid. Let’s slow it down before ${input.cardName} turns into a pressure purchase.`;
  }

  if (posture === "Hot") {
    return `There is real interest here, but the decision is carrying some heat. Give the evidence and budget one more pass before acting.`;
  }

  if (posture === "Warm") {
    return `This is not an obvious panic buy, but it is still worth checking the facts before the hobby brain takes over.`;
  }

  return nextStep === "Proceed within guardrails"
    ? `This looks calm enough to keep reviewing. Stay inside the guardrails and do not let the listing clock make the decision for you.`
    : `This looks mostly calm. The next step is just to fill the evidence gap before you decide.`;
}

function buildGuardrail(nextStep: FomoCheckResult["nextStep"], input: FomoCheckInput) {
  const activeBudget = input.todayBudget || input.monthlyBudget;

  if (nextStep === "Pause") {
    return `Pause for at least 24 hours or lower the entry below your $${activeBudget} active guardrail before revisiting.`;
  }

  if (nextStep === "Ask for evidence") {
    return "Ask for front/back photos, corner or surface closeups, and recent sold comps before spending emotional money.";
  }

  if (nextStep === "Run math") {
    return "Run Raw vs Slab with conservative PSA10 odds before treating the upside as real.";
  }

  return "Proceed only if the listed price, evidence, and your original thesis still agree after one calm reread.";
}

function metricLabel(score: number): FomoCheckResult["fomoHeat"]["label"] {
  if (score >= 67) return "High";
  if (score >= 34) return "Medium";
  return "Low";
}

function labelPattern(pattern: RegExp) {
  return pattern.source.replace(/\\/g, "").replace(/\(\?:'\| i\)\?/g, "'").replace(/\|/g, "/");
}

function compactReasons(reasons: string[]) {
  const compacted = reasons.filter(Boolean);
  return compacted.length ? compacted.slice(0, 4) : ["No strong signal found."];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
