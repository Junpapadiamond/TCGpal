// Catalog freshness monitor: which sets does the live TCGCSV catalog already
// know about that TCGlens identity cannot resolve?
//
//   node scripts/check-catalog-freshness.mjs
//   node scripts/check-catalog-freshness.mjs --check          # exit 1 on a real gap
//   node scripts/check-catalog-freshness.mjs --json out.json  # machine-readable
//   node scripts/check-catalog-freshness.mjs --lookback-days 400
//
// Why this exists: the market anchor (TCGCSV, daily) refreshes itself, while
// identity does not. Pokemon English rides a live English-only API; One Piece
// rides a committed snapshot rebuilt by hand. Both can silently fall behind the
// anchor, which means the price feed can quote a card search cannot find.
//
// This monitor only READS. It never edits the catalog and never promotes data
// into runtime identity — that stays a reviewed change.
import { readFileSync, writeFileSync } from "node:fs";
import {
  applyReleaseTiming,
  assessGroupCoverage,
  buildNumberIndex,
  countBackfilledGroups,
  DEFAULT_LOOKBACK_DAYS,
  matchPokemonSet,
  selectRecentGroups,
  summarizeReport,
} from "./lib/catalog-freshness.mjs";

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const POKEMON_TCG_SETS_URL = "https://api.pokemontcg.io/v2/sets?pageSize=250";
// TCGCSV rejects requests without a User-Agent.
const USER_AGENT = "TCGlens-catalog-freshness/1.0 (+https://github.com/ChenJunHsu/TCGpal)";
const ONE_PIECE_CATALOG = new URL("../src/lib/external/one-piece-catalog.generated.json", import.meta.url);
const PRODUCT_CONCURRENCY = 4;

const CATEGORIES = [
  { categoryId: 3, label: "Pokemon (English)", resolver: "pokemontcg-io-sets" },
  { categoryId: 68, label: "One Piece", resolver: "bundled-catalog-numbers" },
  { categoryId: 85, label: "Pokemon (Japan)", resolver: "none" },
];

function parseArgs(argv) {
  const args = { check: false, json: null, lookbackDays: DEFAULT_LOOKBACK_DAYS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") args.check = true;
    else if (arg === "--json") args.json = argv[++index] ?? null;
    else if (arg === "--lookback-days") args.lookbackDays = Number(argv[++index]);
  }
  if (!Number.isFinite(args.lookbackDays) || args.lookbackDays <= 0) {
    throw new Error("--lookback-days must be a positive number.");
  }
  return args;
}

async function getJsonOnce(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// pokemontcg.io returns a transient 502 often enough that a single failure
// would make the weekly signal unreliable.
async function getJson(url, { timeoutMs = 20000, attempts = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await getJsonOnce(url, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function fetchGroups(categoryId) {
  const payload = await getJson(`${TCGCSV_BASE}/${categoryId}/groups`);
  return Array.isArray(payload?.results) ? payload.results : [];
}

async function fetchProducts(categoryId, groupId) {
  const payload = await getJson(`${TCGCSV_BASE}/${categoryId}/${groupId}/products`);
  return Array.isArray(payload?.results) ? payload.results : [];
}

function loadOnePieceIndex() {
  const cards = JSON.parse(readFileSync(ONE_PIECE_CATALOG, "utf8"));
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error("Bundled One Piece catalog is empty — refusing to report false gaps.");
  }
  return buildNumberIndex(cards);
}

async function fetchPokemonSetNames() {
  const payload = await getJson(POKEMON_TCG_SETS_URL, { timeoutMs: 25000 });
  const sets = Array.isArray(payload?.data) ? payload.data : [];
  return sets.map((set) => set?.name).filter((name) => typeof name === "string");
}

// One Piece identity is a committed snapshot of card NUMBERS, so coverage is a
// number-level question: which printed numbers in this group can search resolve?
async function auditOnePiece(category, groups, now) {
  const index = loadOnePieceIndex();
  const assessments = await mapWithConcurrency(groups, PRODUCT_CONCURRENCY, async (group) => {
    const products = await fetchProducts(category.categoryId, group.groupId);
    return applyReleaseTiming(assessGroupCoverage(group, products, index), now);
  });
  return assessments.map((assessment) => ({ ...assessment, category: category.label }));
}

// Pokemon English identity is a live API that ships whole sets at once, so the
// actionable question is set-level: has pokemontcg.io added this set yet?
// Supplemental groups (promo bins, blister exclusives) are not modelled as sets
// upstream, so an unmatched one is a known shape difference, not a gap.
async function auditPokemonEnglish(category, groups, now) {
  const setNames = await fetchPokemonSetNames();
  return groups.map((group) => {
    const matched = matchPokemonSet(group.name, setNames);
    const base = {
      groupId: group.groupId,
      name: group.name,
      abbreviation: group.abbreviation ?? null,
      publishedOn: group.publishedOn ?? null,
      category: category.label,
      matchedSet: matched,
      products: null,
      numbered: null,
      resolved: null,
      missingNumbers: [],
      missingSample: [],
    };
    if (matched) return { ...base, status: "covered" };
    // Mainline expansions always carry a TCGplayer set code (PBL, CRI, POR).
    // The code-less groups are promo bins and mixed collections ("First Partner
    // Collection 2026", "Player Placement Trainer Promos") that pokemontcg.io
    // does not model as sets at all, so an unmatched one is a shape difference
    // upstream rather than a set we failed to pick up.
    const isMainline = Boolean(group.abbreviation) && !group.isSupplemental;
    if (!isMainline) {
      return { ...base, status: "unsupported", reason: "promo/supplemental group; pokemontcg.io models no such set" };
    }
    return applyReleaseTiming({ ...base, status: "missing", reason: "pokemontcg.io has not published this set" }, now);
  });
}

// Japanese Pokemon has no identity adapter at all: pokemontcg.io is English
// only, and inferTcgplayerCategoryId in src/lib/external/tcgcsv.ts never
// returns category 85. These sets are unreachable by construction, not stale.
function auditUnsupported(category, groups) {
  return groups.map((group) => ({
    groupId: group.groupId,
    name: group.name,
    abbreviation: group.abbreviation ?? null,
    publishedOn: group.publishedOn ?? null,
    category: category.label,
    status: "unsupported",
    reason: "no identity adapter for this category",
    products: null,
    numbered: null,
    resolved: null,
    missingNumbers: [],
    missingSample: [],
  }));
}

const STATUS_MARK = {
  covered: "ok  ",
  partial: "GAP ",
  missing: "GAP ",
  "pending-singles": "wait",
  "pending-release": "soon",
  unsupported: "n/a ",
};

function formatDate(value) {
  return String(value ?? "").slice(0, 10) || "unknown";
}

function printCategory(category, entries, error) {
  process.stdout.write(`\n${category.label}  (TCGplayer category ${category.categoryId})\n`);
  if (error) {
    process.stdout.write(`  SOURCE FAILED — ${error}\n`);
    return;
  }
  if (entries.length === 0) {
    process.stdout.write("  no sets published in the lookback window\n");
    return;
  }
  for (const entry of entries) {
    const mark = STATUS_MARK[entry.status] ?? entry.status;
    const label = entry.abbreviation ? `${entry.abbreviation} — ${entry.name}` : entry.name;
    process.stdout.write(`  ${mark} ${formatDate(entry.publishedOn)}  ${label}\n`);
    if (entry.status === "partial" || entry.status === "missing") {
      if (entry.numbered !== null) {
        process.stdout.write(`         ${entry.resolved}/${entry.numbered} numbers resolve`);
        process.stdout.write(entry.missingSample.length > 0 ? `; missing e.g. ${entry.missingSample.join(", ")}\n` : "\n");
      } else if (entry.reason) {
        process.stdout.write(`         ${entry.reason}\n`);
      }
    }
    if (entry.status === "pending-singles") {
      process.stdout.write("         listed, but no numbered singles catalogued upstream yet\n");
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const entries = [];
  const byCategory = [];

  // One unreachable source must not blank the whole report — the same rule the
  // comparison flow follows. A failed category is shown, never hidden.
  const failures = [];
  let backfilled = 0;
  for (const category of CATEGORIES) {
    try {
      const groups = await fetchGroups(category.categoryId);
      const recent = selectRecentGroups(groups, { now, lookbackDays: args.lookbackDays });
      backfilled += countBackfilledGroups(groups);

      let assessed;
      if (category.resolver === "bundled-catalog-numbers") assessed = await auditOnePiece(category, recent, now);
      else if (category.resolver === "pokemontcg-io-sets") assessed = await auditPokemonEnglish(category, recent, now);
      else assessed = auditUnsupported(category, recent);

      byCategory.push({ category, entries: assessed });
      entries.push(...assessed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ category: category.label, error: message });
      byCategory.push({ category, entries: [], error: message });
    }
  }

  const summary = summarizeReport(entries);

  process.stdout.write(`TCGlens catalog freshness — ${now.toISOString()}\n`);
  process.stdout.write(`Lookback: ${args.lookbackDays} days\n`);
  for (const { category, entries: rows, error } of byCategory) printCategory(category, rows, error);

  const { counts } = summary;
  process.stdout.write(
    `\nSummary: ${counts.covered} covered, ${counts.partial} partial, ${counts.missing} missing, `
    + `${counts["pending-singles"]} awaiting singles, ${counts["pending-release"]} unreleased, `
    + `${counts.unsupported} unreachable\n`,
  );

  // Surfaced rather than silent: these were skipped as TCGplayer backfills of
  // legacy products, so a sudden jump is worth a look at the midnight rule.
  process.stdout.write(`Skipped ${backfilled} groups re-stamped by TCGplayer backfill.\n`);

  if (failures.length > 0) {
    process.stdout.write(`Source failures: ${failures.map((failure) => failure.category).join(", ")}\n`);
  }

  if (args.json) {
    const payload = { generatedAt: now.toISOString(), summary, failures, entries };
    writeFileSync(args.json, `${JSON.stringify(payload, null, 2)}\n`);
    process.stdout.write(`Wrote ${args.json}\n`);
  }

  if (!summary.ok) {
    process.stdout.write("\nIdentity is behind the market anchor. Rebuild the affected catalog before the gap reaches buyers.\n");
    if (args.check) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
