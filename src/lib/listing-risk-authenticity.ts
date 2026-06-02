import type { AuthenticityAssessment, ListingRiskInput } from "./schemas";

// Deterministic, text-only screening heuristics for counterfeit / authenticity risk.
// Phase 0: no scraping or external data. Signals come from listing text plus
// user-provided seller context. This is a cautious screen, not proof of fraud.

// Resealed / opened-then-resealed sealed product (boxes searched for hits, then re-shrink-wrapped).
const resealSignals = [
  "重封",
  "回封",
  "二次封",
  "已拆",
  "拆验",
  "拆封验",
  "验过",
  "resealed",
  "reseal",
  "re-sealed",
  "factory reseal",
];

// Bootleg / proxy / counterfeit single cards.
const bootlegSignals = [
  "自制",
  "自印",
  "代印",
  "高仿",
  "仿制",
  "仿品",
  "proxy",
  "bootleg",
  "fan made",
  "fan-made",
  "custom print",
  "replica",
  "reproduction",
];

// Singles pulled from broken packs being passed off alongside "sealed" claims.
const repackSignals = ["代抽剩", "拆包卡", "pulled from", "repack", "重组", "自组"];

// Over-strong authenticity guarantees are themselves a prompt to verify independently.
// NOTE: do not echo these literal phrases in output (the safety critic flags them).
const reassuranceSignals = ["保真", "100% authentic", "guaranteed authentic", "假一赔", "absolutely genuine", "正品保证"];

const lowerOrderRisk = ["Low", "Medium", "Medium-High", "High"] as const;

export function analyzeAuthenticityRisk(input: ListingRiskInput): AuthenticityAssessment {
  const text = `${input.title} ${input.description} ${input.region ?? ""}`.toLowerCase();
  const productType = input.productType ?? "Single Card";
  const isSealed = productType === "Sealed Box" || productType === "Sealed Pack";

  const counterfeitSignals: string[] = [];
  const sellerCredibilitySignals: string[] = [];
  let score = 0;

  if (resealSignals.some((signal) => text.includes(signal))) {
    score += isSealed ? 4 : 2;
    counterfeitSignals.push(
      "The text mentions opening or resealing. Searched-and-resealed sealed product is a common way to remove hits while still looking factory-fresh.",
    );
  }

  if (bootlegSignals.some((signal) => text.includes(signal))) {
    score += productType === "Single Card" ? 4 : 3;
    counterfeitSignals.push(
      "The text contains reproduction, proxy, or custom-print wording, which points to a possibly unofficial card rather than a genuine print.",
    );
  }

  if (isSealed && repackSignals.some((signal) => text.includes(signal))) {
    score += 2;
    counterfeitSignals.push(
      "Repack or pulled-from-pack wording conflicts with a sealed claim, so confirm whether the product is truly factory sealed.",
    );
  }

  if (reassuranceSignals.some((signal) => text.includes(signal))) {
    score += 1;
    counterfeitSignals.push(
      "The listing leans on strong authenticity guarantees. Treat that as a prompt to verify independently, not as proof of authenticity.",
    );
  }

  if (isSealed && input.price > 0 && input.price < 40) {
    score += 2;
    counterfeitSignals.push(
      "The price looks unusually low for a sealed product, which can indicate a resealed, partial, or non-genuine item.",
    );
  }

  if (/china|chinese|国内|大陆|cn domestic|taobao|闲鱼|xianyu/.test(text)) {
    score += 1;
    sellerCredibilitySignals.push(
      "Domestic-market context was mentioned. Genuine sealed product is often at a premium there, and resealed boxes and bootleg singles are reported, so sourcing matters.",
    );
  }

  // Seller credibility context (user-provided, no external lookups).
  switch (input.sellerType) {
    case "Official Distributor":
      sellerCredibilitySignals.push("Seller is described as an official distributor, which lowers (but does not remove) sourcing risk.");
      score -= 1;
      break;
    case "Individual":
      score += isSealed ? 2 : 1;
      sellerCredibilitySignals.push("Seller is an individual, so there is no marketplace authenticity guarantee behind the item.");
      break;
    case "Unknown":
    case undefined:
      score += 1;
      sellerCredibilitySignals.push("Seller type is unknown, so sourcing and accountability cannot be assessed yet.");
      break;
    default:
      break;
  }

  switch (input.sellerRating) {
    case "Low (under 90%)":
      score += 2;
      sellerCredibilitySignals.push("Seller rating is low, which is a meaningful caution signal for dispute and authenticity risk.");
      break;
    case "New / No history":
      score += 2;
      sellerCredibilitySignals.push("Seller has little or no track record, so there is no history to gauge reliability.");
      break;
    case "Medium (90-97%)":
      score += 1;
      break;
    case "Unknown":
    case undefined:
      score += 1;
      break;
    default:
      break;
  }

  if (input.returnsPolicy === "No returns") {
    score += 1;
    sellerCredibilitySignals.push("No-returns policy removes recourse if the item turns out to be misdescribed or not genuine.");
  } else if (input.returnsPolicy === "Unknown" || input.returnsPolicy === undefined) {
    score += 1;
  }

  const authenticityRisk = getAuthenticityRisk(Math.max(0, score));

  return {
    authenticityRisk,
    counterfeitSignals,
    sellerCredibilitySignals: sellerCredibilitySignals.length
      ? sellerCredibilitySignals
      : ["No specific seller-credibility flags from the provided context, but verify sourcing before a high-value purchase."],
    authenticityQuestions: getAuthenticityQuestions(productType, isSealed),
    authenticitySummary: getAuthenticitySummary(authenticityRisk, productType),
  };
}

function getAuthenticityRisk(score: number): AuthenticityAssessment["authenticityRisk"] {
  if (score >= 8) return "High";
  if (score >= 5) return "Medium-High";
  if (score >= 2) return "Medium";
  return "Low";
}

function getAuthenticityQuestions(productType: NonNullable<ListingRiskInput["productType"]>, isSealed: boolean) {
  const questions: string[] = [];

  if (isSealed) {
    questions.push("Can you show the shrink wrap, seams, and weight under good lighting, including close shots of the seal?");
    questions.push("Where was this sourced — official distributor, direct from the manufacturer, or a secondary seller?");
    questions.push("Has the box ever been opened, weighed, searched, or resealed in any way?");
  } else if (productType === "Single Card") {
    questions.push("Can you provide closeups of the print texture, dot pattern, and back under magnification?");
    questions.push("What is the exact set code and card number, and where was the card obtained?");
  } else {
    questions.push("Can you describe exactly what is included and how the item's authenticity can be verified?");
  }

  questions.push("If authenticity is disputed after delivery, are returns or a refund possible?");
  return questions;
}

function getAuthenticitySummary(
  risk: AuthenticityAssessment["authenticityRisk"],
  productType: NonNullable<ListingRiskInput["productType"]>,
) {
  return `Authenticity risk is ${risk.toLowerCase()} for this ${productType.toLowerCase()} based on the text and seller context. This is a screening signal, not proof that the item is genuine or fake; verify sourcing and condition evidence before relying on it.`;
}

// Exposed for callers that need the same ordering used by the merge step.
export const authenticityRiskOrder = lowerOrderRisk;
