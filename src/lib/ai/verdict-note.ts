// The AI-written Action note.
//
// Boundary: deterministic code in verdict-copy.ts decides buy/wait/pass, owns the
// label, and computes every number. This module turns that already-made decision
// plus the report into a numbered fact sheet, asks the model to write one to three
// sentences from it, and then verifies the answer with plain code. Anything the
// checker does not like falls back to the deterministic sentence, silently — the
// worst case is exactly today's copy.
import { createAiProvider, type AiProvider } from "@/lib/ai/provider";
import { getAiConfig } from "@/lib/ai/config";
import { findUnsupportedClaim, forbiddenAnswer, forbiddenVerdictNote } from "@/lib/ai/unsupported-claims";
import {
  verdictNoteDraftSchema,
  type ComparisonReport,
  type NormalizedListing,
  type RankedChoice,
  type VerdictNoteDraft,
} from "@/lib/schemas";

export type VerdictFact = { id: number; text: string };

export type VerdictNoteLang = "en" | "zh";

// The deterministic decision, passed in rather than recomputed here, so this
// module can never become the thing that decides.
export type VerdictDecision = {
  kind: "buy" | "wait" | "pass";
  label: string;
  fallbackNote: string;
};

export type VerdictNoteInput = {
  report: ComparisonReport;
  role: RankedChoice["role"];
  lang: VerdictNoteLang;
  decision: VerdictDecision;
};

export type VerdictNoteResult = {
  note: string | null;
  citedFactIds: number[];
  usedAi: boolean;
  rejectedReason: string | null;
  facts: VerdictFact[];
};

export type VerdictNoteCheck = { ok: boolean; reason: string | null };

const NOTE_MAX_CHARS = 300;
const NOTE_MAX_SENTENCES = 3;

// The note is fetched after the result is already on screen, so it does not
// share buildNarrative's strict critical-path budget. Left on the 12s default,
// only ~half of calls returned in time; the 30s ceiling took the review corpus
// from 15/21 notes to 21/21.
const NOTE_TIMEOUT_MS = 30_000;

// Writing this note requires no deliberation: ranking.ts already decided, and
// buildVerdictFactSheet already computed every number the model is allowed to
// use. Reasoning effort therefore buys nothing but latency and tokens — the
// deterministic checker, not the model's thinking, is what makes the note safe.
// Measured on gpt-5.6-luna: default effort spent ~290 reasoning tokens for a
// ~70-token sentence at a 10.0s median (worst 13.9s), while "none" spent zero
// reasoning tokens at a 4.0s median (worst 4.6s) with identical accept rates.
const NOTE_REASONING_EFFORT = "none" as const;

export function isVerdictNoteEnabled() {
  const value = process.env.AI_VERDICT_NOTE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export type VerdictNoteTarget = {
  choice: RankedChoice;
  listing: NormalizedListing;
  alternatives: NormalizedListing[];
  marketPrice: number | null;
};

// Mirrors what the result screen shows for the active lens: the ranked pick, the
// other eligible rows, and the same market anchor the deterministic verdict used.
export function resolveVerdictNoteTarget(
  report: ComparisonReport,
  role: RankedChoice["role"],
): VerdictNoteTarget | null {
  if (report.outcome && report.outcome !== "best_buy") return null;
  const choice = report.rankedChoices.find((ranked) => ranked.role === role) ?? null;
  if (!choice) return null;
  const listing = report.candidates.find((candidate) => candidate.id === choice.listingId) ?? null;
  if (!listing) return null;
  return {
    choice,
    listing,
    alternatives: report.candidates.filter((candidate) => candidate.eligible && candidate.id !== listing.id),
    marketPrice: report.demoMode ? null : report.confirmedCard?.marketMid ?? null,
  };
}

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

function listingCost(listing: NormalizedListing) {
  return listing.estimatedLandedCost ?? listing.preTaxTotal;
}

function totalLabel(listing: NormalizedListing) {
  return listing.estimatedTax === null ? "pre-tax total" : "estimated landed total";
}

function lensLabel(role: RankedChoice["role"]) {
  switch (role) {
    case "lowest_landed_cost": return "Cheapest";
    case "safest_listing": return "Safest";
    case "best_condition_evidence": return "Best documented";
    default: return "Best Value";
  }
}

function riskLabel(listing: NormalizedListing) {
  switch (listing.riskLabel) {
    case "low_risk": return "low risk";
    case "some_risk": return "some risk";
    case "higher_risk": return "risk signals on its seller record";
    case "unverified": return "unverified";
  }
}

function photoPhrase(count: number) {
  if (count === 0) return "no item-specific photos";
  return `${count} item-specific photo${count === 1 ? "" : "s"}`;
}

// The fact sheet is the model's entire world: if a number is not in here, the
// checker rejects any note that states it. Sanitized like sanitizeReportForQuestion —
// no urls, no internal ids, no raw seller free text.
export function buildVerdictFactSheet(input: VerdictNoteInput): VerdictFact[] {
  const target = resolveVerdictNoteTarget(input.report, input.role);
  if (!target) return [];
  const { listing, alternatives, marketPrice } = target;
  const { report, decision } = input;
  const requested = report.request?.buyer?.desiredCondition ?? "Near Mint";
  const card = report.confirmedCard;
  const texts: string[] = [];

  texts.push(card
    ? `Card: ${card.name}${card.setCode ? ` ${card.setCode}` : ""} #${card.cardNumber}. The buyer asked for ${requested}.`
    : `The buyer asked for ${requested}.`);

  texts.push(listing.claimedCondition === "Unknown"
    ? `The seller did not state a condition for this copy.`
    : `The seller states ${listing.claimedCondition} condition, which is a seller claim and not an inspection.`);

  texts.push(costFact(listing));
  texts.push(marketFact(listing, marketPrice, requested, report.demoMode));
  texts.push(`The listing shows ${photoPhrase(listing.evidence.photoCount)}.`);

  const evidenceDetail = describeEvidenceDetail(listing);
  if (evidenceDetail) texts.push(evidenceDetail);

  texts.push(returnsFact(listing));
  texts.push(sellerFact(listing));
  texts.push(`Evidence completeness scores ${listing.evidenceCompletenessScore}/100 and the combined value read scores ${listing.valueScore}/100.`);

  if (listing.listingLanguage && listing.listingLanguage.toLowerCase() !== "english") {
    texts.push(`This is a ${listing.listingLanguage}-language listing.`);
  }
  if (listing.userSupplied) {
    texts.push("These listing facts are buyer-entered rather than read from a live source, so they are unverified.");
  }
  if (listing.webDiscovered) {
    texts.push("This row came from web discovery, so its facts are approximate and were never fetched as inventory.");
  }

  texts.push(...rivalFacts(listing, alternatives));

  for (const note of listing.trustNotes.slice(0, 2)) {
    texts.push(`Scoring note: ${note}`);
  }

  texts.push(`The buyer is looking at the ${lensLabel(input.role)} lens.`);
  texts.push(`The verdict is already decided: ${decision.kind} ("${decision.label}"). Explain it; never change, hedge, or restate the label.`);

  return texts.map((text, index) => ({ id: index + 1, text }));
}

function costFact(listing: NormalizedListing) {
  const parts = [`item ${money(listing.price)}`];
  if (listing.shipping === null) {
    parts.push("shipping not stated");
  } else {
    parts.push(`shipping ${money(listing.shipping)}`);
  }
  if (listing.estimatedTax !== null) parts.push(`estimated tax ${money(listing.estimatedTax)}`);
  return `Complete cost is ${money(listingCost(listing))} ${totalLabel(listing)} (${parts.join(" + ")}).`;
}

// The aggregate anchor is item-only and condition-blind (AGENTS.md): only an NM
// request against an NM claim is a like-for-like read. Everything else states the
// prices without a percentage so the model has no delta to reach for.
function marketFact(
  listing: NormalizedListing,
  marketPrice: number | null,
  requested: string,
  demoMode: boolean,
) {
  if (marketPrice === null || marketPrice <= 0 || demoMode) {
    return "No usable market reference is available for this comparison, so the note must not state a market position.";
  }
  const likeForLike = listing.marketComparable
    && listing.costComplete
    && requested === "Near Mint"
    && listing.claimedCondition === "Near Mint";
  if (!likeForLike) {
    return `The ${money(marketPrice)} market reference is Near Mint only, so it is not a like-for-like read for this listing; the item price is ${money(listing.price)}.`;
  }
  const delta = (listing.price - marketPrice) / marketPrice;
  const pct = Math.abs(Math.round(delta * 100));
  if (pct === 0) {
    return `The ${money(listing.price)} item price sits at the ${money(marketPrice)} Near Mint market reference (item price only; shipping and tax are separate).`;
  }
  return `The ${money(listing.price)} item price is ${pct}% ${delta < 0 ? "under" : "over"} the ${money(marketPrice)} Near Mint market reference (item price only; shipping and tax are separate).`;
}

function describeEvidenceDetail(listing: NormalizedListing) {
  const present: string[] = [];
  if (listing.evidence.frontBackExplicit) present.push("front and back are both shown");
  if (listing.evidence.closeupsExplicit) present.push("there are close-ups");
  if (listing.evidence.surfaceExplicit) present.push("surface is shown");
  if (listing.evidence.substantiveConditionNotes) present.push("the seller wrote substantive condition notes");
  if (present.length === 0) {
    return listing.evidence.missing.length > 0
      ? `Missing review material: ${listing.evidence.missing.slice(0, 3).join(", ")}.`
      : null;
  }
  return `Review material: ${present.join(", ")}.`;
}

function returnsFact(listing: NormalizedListing) {
  if (listing.seller.returnsAccepted === false) return "The seller does not accept returns.";
  if (listing.seller.returnsAccepted === null) return "The seller's return policy was not verified.";
  return "The seller accepts returns.";
}

function sellerFact(listing: NormalizedListing) {
  if (listing.riskLabel === "unverified" || listing.seller.feedbackCount === null) {
    return `No seller track record was available, so seller trust stays neutral at ${listing.sellerTrustScore}/100. Unverified is not the same as risky.`;
  }
  const percentage = listing.seller.feedbackPercentage === null
    ? ""
    : ` at ${listing.seller.feedbackPercentage}% positive`;
  return `Seller trust scores ${listing.sellerTrustScore}/100 (${riskLabel(listing)}) from ${listing.seller.feedbackCount} feedback ratings${percentage}.`;
}

function rivalFacts(listing: NormalizedListing, alternatives: NormalizedListing[]) {
  if (alternatives.length === 0) {
    return ["This pick is the only comparable listing in the report; there is nothing else to compare it against."];
  }
  const facts = [`${alternatives.length + 1} listings passed the exact-print and cost gates in this comparison.`];
  const byCost = [...alternatives].sort((a, b) => listingCost(a) - listingCost(b));
  const cheapestRival = byCost[0];
  if (listingCost(cheapestRival) < listingCost(listing)) {
    facts.push(`The cheapest rival is ${money(listingCost(cheapestRival))} ${totalLabel(cheapestRival)} with ${photoPhrase(cheapestRival.evidence.photoCount)} and ${riskLabel(cheapestRival)}; this pick costs ${money(listingCost(listing) - listingCost(cheapestRival))} more.`);
  } else {
    facts.push(`This pick is also the cheapest comparable listing; the next cheapest is ${money(listingCost(cheapestRival))} ${totalLabel(cheapestRival)}.`);
  }
  const bestDocumented = [...alternatives].sort((a, b) => b.evidenceCompletenessScore - a.evidenceCompletenessScore)[0];
  if (bestDocumented.id !== cheapestRival.id) {
    facts.push(`The best-documented rival is ${money(listingCost(bestDocumented))} ${totalLabel(bestDocumented)} with ${photoPhrase(bestDocumented.evidence.photoCount)} and evidence ${bestDocumented.evidenceCompletenessScore}/100.`);
  }
  return facts;
}

type NumberToken = { kind: "money" | "percent" | "plain"; value: number };

const NUMBER_PATTERN = /(\$|¥|￥)?\s?(\d[\d,]*(?:\.\d+)?)\s?(%|％)?/g;

function extractNumbers(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const value = Number(match[2].replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const kind = match[1] ? "money" : match[3] ? "percent" : "plain";
    tokens.push({ kind, value });
  }
  return tokens;
}

function countSentences(note: string) {
  // Blank the digits first so a decimal point is never read as a full stop.
  const withoutDecimals = note.replace(/\d[\d,]*(?:\.\d+)?/g, "0");
  return withoutDecimals
    .split(/[.!?。！？]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .length;
}

const CJK_PATTERN = /[㐀-䶿一-鿿]/;

// Plain code, no model: the note only ships if every number in it is a number the
// fact sheet already stated, it makes no forbidden claim, it is short, and its
// citations point at real facts.
export function checkVerdictNote(
  draft: VerdictNoteDraft,
  facts: VerdictFact[],
  lang: VerdictNoteLang,
  options: { bannedTokens?: string[] } = {},
): VerdictNoteCheck {
  const note = draft.note.trim();
  if (!note) return { ok: false, reason: "The model returned an empty note." };
  if (facts.length === 0) return { ok: false, reason: "There was no fact sheet to check the note against." };

  if (draft.citedFactIds.length === 0) {
    return { ok: false, reason: "The model cited no fact ids." };
  }
  const unknownCitation = draft.citedFactIds.find((id) => id < 1 || id > facts.length);
  if (unknownCitation !== undefined) {
    return { ok: false, reason: `The model cited fact ${unknownCitation}, which is not in the fact sheet.` };
  }

  if (note.length > NOTE_MAX_CHARS) {
    return { ok: false, reason: `The note is too long (${note.length} characters).` };
  }
  const sentences = countSentences(note);
  if (sentences > NOTE_MAX_SENTENCES) {
    return { ok: false, reason: `The note runs to ${sentences} sentences.` };
  }

  if (/https?:\/\/|www\./i.test(note)) {
    return { ok: false, reason: "The note contains a link." };
  }
  const bannedToken = (options.bannedTokens ?? []).find((token) => token.length > 2 && note.toLowerCase().includes(token.toLowerCase()));
  if (bannedToken) {
    return { ok: false, reason: "The note contains an internal identifier." };
  }

  const claim = findUnsupportedClaim(note, forbiddenAnswer) ?? findUnsupportedClaim(note, forbiddenVerdictNote);
  if (claim) {
    return { ok: false, reason: `The note makes an unsupported claim (${claim}).` };
  }

  const hasCjk = CJK_PATTERN.test(note);
  if (lang === "en" && hasCjk) return { ok: false, reason: "The note was not written in English." };
  if (lang === "zh" && !hasCjk) return { ok: false, reason: "The note was not written in Chinese." };

  const factText = facts.map((fact) => fact.text).join(" ");
  const allowed = extractNumbers(factText);
  const allowedMoney = new Set(allowed.filter((token) => token.kind === "money").map((token) => token.value));
  const allowedPercent = new Set(allowed.filter((token) => token.kind === "percent").map((token) => token.value));
  const allowedAny = new Set(allowed.map((token) => token.value));

  for (const token of extractNumbers(note)) {
    const grounded = token.kind === "money"
      ? allowedMoney.has(token.value)
      : token.kind === "percent"
        ? allowedPercent.has(token.value)
        : allowedAny.has(token.value);
    if (!grounded) {
      return { ok: false, reason: `The note states an ungrounded number (${token.kind} ${token.value}).` };
    }
  }

  return { ok: true, reason: null };
}

function writerSystemPrompt(lang: VerdictNoteLang, decision: VerdictDecision) {
  return [
    "You write the one short note under a buying verdict on TCGlens, an evidence-backed listing comparison for trading-card buyers.",
    `The verdict is already decided by deterministic code: ${decision.kind}, labelled "${decision.label}". Explain that verdict for this specific listing. Never contradict it, never restate the label, never tell the buyer to do something else.`,
    "You may use ONLY the numbered facts supplied. Every number, price, percentage, and count you write must appear in those facts verbatim. Inventing or rounding a number gets the note discarded.",
    "Write 1-3 sentences, under 300 characters total. Say what is specific to this listing rather than generic buying advice.",
    "Report the fact numbers you used in citedFactIds.",
    "Never say scam, guaranteed, must-buy, risk-free, authentic, fake, or investment. Never predict a grade, claim sold-comps evidence, or promise future value. Condition is always the seller's claim.",
    "Missing seller history is unverified, not risky. If a fact says there is no usable market reference, do not imply a price position.",
    "Do not mention internal ids, urls, or the fact sheet itself.",
    lang === "zh"
      ? "Write the note in simplified Chinese, in plain collector language. Keep prices in their original $ notation."
      : "Write the note in plain English, in the voice of a careful friend who checked the listing.",
  ].join("\n");
}

export async function generateVerdictNote(
  input: VerdictNoteInput,
  dependencies: { provider?: AiProvider } = {},
): Promise<VerdictNoteResult> {
  const empty: VerdictNoteResult = { note: null, citedFactIds: [], usedAi: false, rejectedReason: null, facts: [] };
  if (!isVerdictNoteEnabled()) return { ...empty, rejectedReason: "The AI verdict note is disabled." };
  if (input.report.demoMode) return { ...empty, rejectedReason: "Demo reports keep the deterministic note." };

  const target = resolveVerdictNoteTarget(input.report, input.role);
  if (!target) return { ...empty, rejectedReason: "This report has no ranked pick for that lens." };

  const facts = buildVerdictFactSheet(input);
  if (facts.length === 0) return { ...empty, rejectedReason: "The fact sheet was empty." };

  const provider = dependencies.provider ?? createAiProvider(getAiConfig());
  let draft: VerdictNoteDraft;
  try {
    const response = await provider.completeJson({
      role: "critic",
      schemaName: "verdict_note",
      schema: verdictNoteDraftSchema,
      timeoutMs: NOTE_TIMEOUT_MS,
      reasoningEffort: NOTE_REASONING_EFFORT,
      system: writerSystemPrompt(input.lang, input.decision),
      user: {
        verdict: { kind: input.decision.kind, label: input.decision.label },
        lens: lensLabel(input.role),
        facts: facts.map((fact) => `${fact.id}. ${fact.text}`),
      },
    });
    const parsed = verdictNoteDraftSchema.safeParse(response.data);
    if (!parsed.success) {
      return { ...empty, facts, rejectedReason: "The model returned an invalid note shape." };
    }
    draft = parsed.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return { ...empty, facts, rejectedReason: `The provider call failed: ${message}` };
  }

  const check = checkVerdictNote(draft, facts, input.lang, {
    bannedTokens: input.report.candidates.map((candidate) => candidate.id),
  });
  if (!check.ok) {
    return { ...empty, facts, rejectedReason: check.reason };
  }

  return {
    note: draft.note.trim(),
    citedFactIds: draft.citedFactIds,
    usedAi: true,
    rejectedReason: null,
    facts,
  };
}
