// Baseline for the exact-print retrieval agent (docs/plan-retrieval-agent-2026-08-10.md).
//
// One question: for a fixed set of cards a buyer might actually search, how often
// does the comparison end with a recommendation instead of an abstention? That is
// "exact-print recall" — the share of the eval set whose report ends with
// outcome === "best_buy". It is a hard label computed by our own deterministic
// ranker, not a model judge, so it stays honest across runs.
//
// Nothing here touches product behaviour. It only drives the public
// /api/agent/listing-compare endpoint the way a buyer's browser does, then reads
// the report. Run it before changing retrieval, and again after, and the
// difference is the answer.
//
// Requires Node >= 22.18 (imports the committed card set as TypeScript directly,
// via native type stripping, so the script and the tests read the same source).
//
//   npm run measure:print-recall                 # against production
//   TARGET=http://localhost:3000 PACE_MS=1500 npm run measure:print-recall
//   SPLIT=tuning npm run measure:print-recall    # keep the held-out half unseen
//   ONLY=op-nami-op01-016 npm run measure:print-recall
//   OUT=docs/print-recall-2026-08-10.json npm run measure:print-recall
import { writeFileSync } from "node:fs";
import { PRINT_RECALL_CARDS } from "../src/lib/testing/print-recall-cards.ts";

const BASE = process.env.TARGET || "https://lenstcg.com";
const OUT = process.env.OUT || "";

// SPLIT exists so iterating on retrieval does not require looking at the held-out
// cards; ONLY is for re-checking a single card without paying for a full run.
const SPLIT = process.env.SPLIT || "all";
const ONLY = (process.env.ONLY || "").split(",").map((id) => id.trim()).filter(Boolean);
const CARDS = PRINT_RECALL_CARDS
  .filter((card) => SPLIT === "all" || card.split === SPLIT)
  .filter((card) => ONLY.length === 0 || ONLY.includes(card.id));

// The comparison route allows 20 requests per 10-minute window per client
// (RATE_LIMIT_COMPARE_MAX / DEFAULT_WINDOW_MS in src/lib/ops/rate-limit.ts).
// Pacing just under that ceiling keeps a 30-card run from measuring the rate
// limiter instead of retrieval. Override PACE_MS when pointing at localhost.
const PACE_MS = Number(process.env.PACE_MS ?? 31_000);
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function request(card, confirmedCardId) {
  return {
    query: card.query,
    sourceListing: {
      marketplace: "eBay", url: "", title: "", description: "", price: null, shipping: null,
      claimedCondition: "Unknown", active: true,
      seller: { feedbackPercentage: null, feedbackCount: null, returnsAccepted: null, topRated: null, buyerProtection: null, subRatings: null },
      evidence: { photoCount: 0, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: false, substantiveConditionNotes: false, missing: [] },
    },
    // Fixed buyer context so every card is measured on the same terms: Near Mint
    // requested, one delivery destination, tax estimated from the ZIP.
    buyer: { country: "US", postalCode: "10001", taxRate: null, desiredCondition: "Near Mint" },
    cardHint: { game: card.game, name: card.name, setCode: card.setCode, cardNumber: card.cardNumber, language: "English", variant: "", gradingClaim: "" },
    manualCandidates: [],
    webDiscoveryMode: "off",
    ...(confirmedCardId ? { confirmedCardId } : {}),
  };
}

async function compare(body) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${BASE}/api/agent/listing-compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return response.json();

    const detail = (await response.text()).slice(0, 160);
    // A 429 is the rate limiter, not a retrieval result. Waiting it out keeps the
    // card in the measurement instead of scoring it as a failure.
    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(response.headers.get("Retry-After")) || 60;
      console.log(`   rate limited; waiting ${retryAfter}s before retry ${attempt + 1}/${MAX_ATTEMPTS}`);
      await sleep((retryAfter + 2) * 1000);
      continue;
    }
    throw new Error(`${response.status}: ${detail}`);
  }
}

function tally(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
}

// Why the ranker rejected the rows it rejected. Each ineligible listing is counted
// once per distinct category so one listing carrying three identity issues does
// not look like three rejected listings.
function exclusionsByCategory(candidates) {
  const counts = new Map();
  for (const candidate of candidates) {
    if (candidate.eligible) continue;
    const categories = new Set(
      (candidate.eligibilityIssues ?? [])
        .filter((issue) => issue.disposition === "exclude")
        .map((issue) => issue.category),
    );
    if (categories.size === 0) categories.add("unspecified");
    for (const category of categories) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
}

function exclusionCodes(candidates) {
  const counts = new Map();
  for (const candidate of candidates) {
    if (candidate.eligible) continue;
    for (const issue of candidate.eligibilityIssues ?? []) {
      if (issue.disposition !== "exclude") continue;
      counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
}

const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const pct = (hits, total) => (total === 0 ? "  n/a" : `${((hits / total) * 100).toFixed(1)}%`);
const summarize = (counts) =>
  Object.entries(counts).map(([key, value]) => `${key} ${value}`).join(", ") || "—";
const duration = (ms) => `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;

async function resolve(card) {
  let report = await compare(request(card, card.confirmedCardId));
  let confirmationRequired = false;

  // The buyer taps a version when the number alone is ambiguous. Mirror that
  // one tap rather than scoring identity ambiguity as a retrieval failure.
  if (report.status === "needs_confirmation" && report.identityCandidates?.length) {
    confirmationRequired = true;
    const pick = card.confirmedCardId
      ? report.identityCandidates.find((candidate) => candidate.id.toUpperCase() === card.confirmedCardId.toUpperCase())
      : null;
    const chosen = pick ?? report.identityCandidates.find((candidate) => candidate.confidence === "high") ?? report.identityCandidates[0];
    report = await compare({ ...report.request, confirmedCardId: chosen.id });
  }
  return { report, confirmationRequired };
}

async function measure(card) {
  const startedAt = Date.now();
  let { report, confirmationRequired } = await resolve(card);

  // An unconfirmed card never reached the marketplace search, so scoring it as a
  // retrieval miss would measure the identity provider instead. The Pokemon TCG
  // API returns intermittent 5xx: on 2026-08-10 three of thirty cards failed this
  // way and all three resolved on an immediate retry — a 10-point swing in recall,
  // wider than the plan's own ship/kill thresholds. One retry, then the row is
  // reported as unresolved and kept out of the recall denominator.
  if (report.status === "needs_confirmation") {
    await sleep(5_000);
    ({ report, confirmationRequired } = await resolve(card));
  }

  const candidates = report.candidates ?? [];
  const eligible = candidates.filter((candidate) => candidate.eligible);
  return {
    id: card.id,
    label: card.label,
    game: card.game,
    split: card.split,
    printClass: card.printClass,
    era: card.era,
    requestedCardId: card.confirmedCardId ?? null,
    resolvedCardId: report.confirmedCard?.id ?? null,
    identityResolved: Boolean(report.confirmedCard),
    status: report.status,
    outcome: report.outcome ?? null,
    confirmationRequired,
    found: candidates.length,
    eligible: eligible.length,
    // How many rows proved the confirmed artwork at all. Reported separately from
    // eligibility because a row can prove the print and still be excluded on
    // condition or cost — that difference is what a retrieval change should move.
    printProven: candidates.filter((candidate) => candidate.printMatch === "exact" || candidate.printMatch === "compatible").length,
    printMatch: tally(candidates.map((candidate) => candidate.printMatch ?? "absent")),
    exclusions: exclusionsByCategory(candidates),
    codes: exclusionCodes(candidates),
    abstentionReason: report.abstention?.reason ?? null,
    variantExcluded: report.abstention?.variantExcludedCount ?? null,
    platformsComplete: (report.platforms ?? []).filter((platform) => platform.status === "complete").length,
    marketAnchor: report.confirmedCard?.marketMid ?? null,
    elapsedMs: Date.now() - startedAt,
    error: null,
  };
}

const rows = [];
const runStartedAt = Date.now();

console.log(`target ${BASE}   cards ${CARDS.length}   split ${SPLIT}   pace ${PACE_MS}ms\n`);
console.log(`${"card".padEnd(38)}${"outcome".padEnd(15)}${"found".padStart(6)}${"proven".padStart(7)}${"elig".padStart(6)}  excluded by category`);

for (const [index, card] of CARDS.entries()) {
  let row;
  try {
    row = await measure(card);
  } catch (error) {
    row = { id: card.id, label: card.label, game: card.game, split: card.split, printClass: card.printClass, era: card.era, outcome: null, identityResolved: false, found: 0, eligible: 0, printProven: 0, printMatch: {}, exclusions: {}, codes: {}, elapsedMs: 0, error: error.message };
  }
  rows.push(row);
  console.log(
    `${row.label.padEnd(38)}${(row.error ? "ERROR" : row.identityResolved ? row.outcome ?? "—" : "unresolved").padEnd(15)}` +
    `${String(row.found).padStart(6)}${String(row.printProven).padStart(7)}${String(row.eligible).padStart(6)}  ` +
    (row.error ? row.error : summarize(row.exclusions)),
  );
  if (index < CARDS.length - 1) await sleep(PACE_MS);
}

const wallClockMs = Date.now() - runStartedAt;
// "measured" is the set that actually reached a marketplace search. Rows that
// errored or never confirmed a card are reported, but they are not retrieval
// results and do not move recall in either direction.
const measured = rows.filter((row) => !row.error && row.identityResolved);
const errored = rows.filter((row) => row.error);
const unresolved = rows.filter((row) => !row.error && !row.identityResolved);
const recall = (subset) => {
  const scored = subset.filter((row) => !row.error && row.identityResolved);
  const hits = scored.filter((row) => row.outcome === "best_buy").length;
  return `${String(hits).padStart(2)}/${String(scored.length).padEnd(2)} ${pct(hits, scored.length)}`;
};
const pooled = (key) => {
  const counts = new Map();
  for (const row of measured) {
    for (const [name, value] of Object.entries(row[key])) counts.set(name, (counts.get(name) ?? 0) + value);
  }
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
};

console.log("\n──────── exact-print recall ────────");
console.log(`cards measured            ${measured.length} of ${rows.length}${errored.length ? ` (${errored.length} errored)` : ""}`);
console.log(`best_buy                  ${recall(rows)}   <- exact-print recall`);
console.log(`inspect_first             ${measured.filter((row) => row.outcome === "inspect_first").length}`);
console.log(`next_moves                ${measured.filter((row) => row.outcome === "next_moves").length}`);
console.log(`identity unresolved       ${unresolved.length}   <- never searched; upstream identity, not retrieval`);
console.log(`\nby split                  tuning ${recall(rows.filter((row) => row.split === "tuning"))}    held out ${recall(rows.filter((row) => row.split === "held_out"))}`);
console.log(`by game                   pokemon ${recall(rows.filter((row) => row.game === "pokemon"))}   onePiece ${recall(rows.filter((row) => row.game === "onePiece"))}`);
console.log(`by print                  base ${recall(rows.filter((row) => row.printClass === "base"))}      alternate ${recall(rows.filter((row) => row.printClass === "alternate"))}`);
console.log(`by era                    vintage ${recall(rows.filter((row) => row.era === "vintage"))}   modern ${recall(rows.filter((row) => row.era === "modern"))}`);
console.log(`\nmedian eligible per card  ${median(measured.map((row) => row.eligible)) ?? "n/a"}`);
console.log(`median print-proven       ${median(measured.map((row) => row.printProven)) ?? "n/a"}`);
console.log(`median found per card     ${median(measured.map((row) => row.found)) ?? "n/a"}`);
console.log(`cards with zero eligible  ${measured.filter((row) => row.eligible === 0).length}`);
console.log(`cards with zero found     ${measured.filter((row) => row.found === 0).length}`);
console.log(`\npooled print match        ${summarize(pooled("printMatch"))}`);
console.log(`pooled exclusions         ${summarize(pooled("exclusions"))}`);
console.log(`pooled exclusion codes    ${summarize(pooled("codes"))}`);
console.log(`\nmedian latency per card   ${Math.round((median(measured.map((row) => row.elapsedMs)) ?? 0) / 100) / 10}s`);
console.log(`total wall clock          ${duration(wallClockMs)}`);

if (errored.length) {
  console.log("\nerrors");
  for (const row of errored) console.log(`  ${row.label.padEnd(38)}${row.error}`);
}

if (unresolved.length) {
  console.log("\nidentity unresolved (excluded from recall)");
  for (const row of unresolved) console.log(`  ${row.label}`);
}

const zeroEligible = measured.filter((row) => row.eligible === 0);
if (zeroEligible.length) {
  console.log("\nzero eligible");
  for (const row of zeroEligible) {
    console.log(`  ${row.label.padEnd(38)}found ${String(row.found).padStart(3)}   ${summarize(row.exclusions)}`);
  }
}

// Integrity check on the instrument itself: a card whose report confirmed a
// different print than the eval asked for is not measuring what the row claims.
const misresolved = measured.filter(
  (row) => row.requestedCardId && row.resolvedCardId?.toUpperCase() !== row.requestedCardId.toUpperCase(),
);
if (misresolved.length) {
  console.log("\nresolved to a different print than requested");
  for (const row of misresolved) {
    console.log(`  ${row.label.padEnd(38)}wanted ${row.requestedCardId}   got ${row.resolvedCardId ?? "none"}`);
  }
}

if (OUT) {
  writeFileSync(OUT, `${JSON.stringify({ target: BASE, startedAt: new Date(runStartedAt).toISOString(), wallClockMs, rows }, null, 2)}\n`);
  console.log(`\nwrote ${OUT}`);
}
