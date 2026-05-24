import type { ListingRiskInput, ListingRiskReport } from "./schemas";

const versionSignals = ["for asia", "reprint", "jp", "japanese", "english", "promo", "eb01", "op-", "prb", "card number"];
const conditionClaims = ["psa10", "psa 10", "gem mint", "mint", "perfect", "pack fresh"];
const missingPhotoSignals = ["front only", "no back", "no returns", "stock photo", "blurry"];

export function analyzeListingRisk(input: ListingRiskInput): ListingRiskReport {
  const text = `${input.title} ${input.description}`.toLowerCase();
  const missingInfo = new Set<string>();
  const keyRisks: string[] = [];
  let score = 0;

  if (!versionSignals.some((signal) => text.includes(signal))) {
    score += 2;
    missingInfo.add("Exact card number, release, language, or region confirmation");
    keyRisks.push("Version is not clearly confirmed, so similar cards or reprints could be confused.");
  }

  if (!text.includes("back photo") && !text.includes("back pic") && !text.includes("front/back")) {
    score += input.userGoal === "Grading" ? 3 : 2;
    missingInfo.add("Clear back photo");
    keyRisks.push("Back condition is not evidenced, which matters for whitening, centering, and grading risk.");
  }

  if (!text.includes("corner") && !text.includes("closeup") && !text.includes("surface")) {
    score += input.userGoal === "Grading" ? 2 : 1;
    missingInfo.add("Corner and surface closeups");
  }

  if (conditionClaims.some((claim) => text.includes(claim))) {
    score += 2;
    keyRisks.push("Strong condition language is present, but it should be supported by photos rather than seller confidence.");
  }

  if (missingPhotoSignals.some((signal) => text.includes(signal))) {
    score += 2;
    keyRisks.push("The listing text contains buyer-risk signals such as limited photos, stock-photo wording, or no-return language.");
  }

  if (input.userGoal === "Grading") {
    score += 1;
    keyRisks.push("A grading goal requires stricter evidence than personal collection.");
  }

  if (input.price > 150 && input.userGoal !== "Self-collection") {
    score += 1;
    keyRisks.push("The listed price is high enough that fees, shipping, and liquidity should be checked against sold comps.");
    missingInfo.add("Recent sold-comparable range");
  }

  const riskScore = getRiskScore(score);
  const confidence = getConfidence(missingInfo.size, input.description.length);

  return {
    score: riskScore,
    confidence,
    missingInfo: Array.from(missingInfo),
    keyRisks: keyRisks.length
      ? keyRisks
      : ["No major text-based risk indicators were found, but photo evidence and sold comps are still needed."],
    sellerQuestions: getSellerQuestions(Array.from(missingInfo), input.userGoal),
    suitability: getSuitability(riskScore, input.userGoal),
    cautiousSummary: getSummary(riskScore, confidence, input.userGoal),
  };
}

function getRiskScore(score: number): ListingRiskReport["score"] {
  if (score >= 8) return "High";
  if (score >= 6) return "Medium-High";
  if (score >= 3) return "Medium";
  return "Low";
}

function getConfidence(missingInfoCount: number, descriptionLength: number): ListingRiskReport["confidence"] {
  if (missingInfoCount >= 3) return "Medium-low";
  if (descriptionLength < 40) return "Low";
  if (missingInfoCount >= 1) return "Medium";
  return "High";
}

function getSellerQuestions(missingInfo: string[], userGoal: ListingRiskInput["userGoal"]) {
  const questions = [
    "Can you provide clear front and back photos under normal lighting?",
    "Are there any scratches, dents, whitening, print lines, or surface marks?",
    "Can you confirm the exact card number, set, language, and release version?",
  ];

  if (missingInfo.includes("Corner and surface closeups") || userGoal === "Grading") {
    questions.push("Can you share corner closeups and angled surface photos?");
  }

  if (missingInfo.includes("Recent sold-comparable range")) {
    questions.push("Is the price based on recent sold comps or current active listings?");
  }

  return questions;
}

function getSuitability(score: ListingRiskReport["score"], userGoal: ListingRiskInput["userGoal"]) {
  if (score === "High" && userGoal === "Grading") {
    return "Not suitable for grading speculation until missing condition and version evidence is resolved.";
  }

  if (score === "High") {
    return "Only suitable for personal collection if the price is discounted and uncertainty is acceptable.";
  }

  if (score === "Medium-High") {
    return "Potentially usable for collection, but not ready for resale or grading decisions without seller follow-up.";
  }

  if (userGoal === "Grading") {
    return "Possibly suitable for grading only after closeups confirm corners, back, and surface.";
  }

  return "Reasonable to continue reviewing, assuming sold comps and photo evidence support the price.";
}

function getSummary(
  score: ListingRiskReport["score"],
  confidence: ListingRiskReport["confidence"],
  userGoal: ListingRiskInput["userGoal"],
) {
  return `Risk is ${score.toLowerCase()} with ${confidence.toLowerCase()} confidence from pasted text. Treat this as a screening result, not proof of condition. For ${userGoal.toLowerCase()}, ask for missing evidence before relying on the listing.`;
}
