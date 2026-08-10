// Does eBay actually know the condition of the rows we never ask about?
//
//   npm run review:detail-budget
//
// The comparison excludes any listing whose condition is unstated. Browse search
// summaries almost always report only "Ungraded" (→ "Unknown"), and the real
// NM/LP/MP grade lives on the per-item endpoint, which only the first
// EBAY_DETAIL_BUDGET matchable rows receive. On 2026-08-10 that cap was 12 of 50,
// and `condition_unstated` was the single largest exclusion in the print-recall
// baseline — 753 of 1,472 candidates.
//
// So: is the condition of rows 13-50 knowable, or is the field simply empty?
//
// DESIGN. The obvious experiment — run the product API at budget 12, then at 50 —
// is confounded twice. The comparison cache is keyed on card + condition + ZIP,
// so a second run inside 15 minutes replays the first run's report verbatim; and
// spacing the arms far enough apart to miss the cache lets live eBay supply drift
// between them (measured: one card moved 48 → 17 print-proven rows in ~2 hours).
//
// This runs both arms through the real searchEbayAlternatives seconds apart and
// inner-joins on item id. Every listing is then its own control: the only thing
// that differs between its two readings is whether it received a detail call.
// Rows that appear in one arm only are dropped rather than counted, so drift can
// only shrink the sample, never manufacture a result.
//
// Opt-in and live, so `npm run test` never touches the network.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findOnePieceCatalogVariant } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";
import { searchEbayAlternatives } from "@/lib/external/ebay";
import { deriveVariantIntent, normalizeListing } from "@/lib/comparison/ranking";
import type { ListingSeed } from "@/lib/schemas";
import type { BuyerContext, CardIdentityCandidate } from "@/lib/schemas";

const enabled = process.env.EBAY_DETAIL_REVIEW === "1";
const GAP_MS = Number(process.env.EBAY_DETAIL_GAP_MS) || 4000;
const PAGE = 50;
const SHIPPED_BUDGET = 12;
const OUTPUT_DIR = path.resolve(process.cwd(), "docs");

// vitest does not load .env.local, so a live check has to do it itself.
function loadLocalEnv() {
  try {
    const text = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 1) continue;
      const key = trimmed.slice(0, index);
      if (!process.env[key]) process.env[key] = trimmed.slice(index + 1);
    }
  } catch {
    // Credentials may come from the real environment instead.
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function pokemon(name: string, setName: string, setCode: string, cardNumber: string): CardIdentityCandidate {
  return {
    id: `${setCode}-${cardNumber}`.toLowerCase(),
    name, setName, setCode, cardNumber,
    language: "English", imageUrl: null, confidence: "high", matchReasons: [],
  } as CardIdentityCandidate;
}

function onePiece(printId: string): CardIdentityCandidate {
  const print = findOnePieceCatalogVariant(printId);
  if (!print) throw new Error(`Missing One Piece catalog print for ${printId}`);
  return mapOnePieceCardToIdentity(print, { confidence: "high", matchReasons: ["detail-budget review"] });
}

// Set names are spelled out because the flip rate is a property of eBay's data,
// not of our identity resolver — resolving identity live would add the Pokemon
// API's ~10% intermittent 5xx rate to a measurement that does not need it.
const SAMPLE: { label: string; card: CardIdentityCandidate }[] = [
  { label: "Charizard 4/102", card: pokemon("Charizard", "Base", "BS", "4/102") },
  { label: "Pikachu 58/102", card: pokemon("Pikachu", "Base", "BS", "58/102") },
  { label: "Umbreon VMAX 215/203", card: pokemon("Umbreon VMAX", "Evolving Skies", "SWSH7", "215/203") },
  { label: "Giratina V 130/196", card: pokemon("Giratina V", "Lost Origin", "SWSH11", "130/196") },
  { label: "Charizard ex 006/165", card: pokemon("Charizard ex", "151", "MEW", "006/165") },
  { label: "Gardevoir ex 245/198", card: pokemon("Gardevoir ex", "Scarlet & Violet", "SV1", "245/198") },
  { label: "Monkey.D.Luffy ST01-001", card: onePiece("ST01-001") },
  { label: "Nami OP01-016", card: onePiece("OP01-016") },
  { label: "Roronoa Zoro OP01-001", card: onePiece("OP01-001") },
  { label: "Trafalgar Law OP05-069", card: onePiece("OP05-069") },
];

const buyer: BuyerContext = { country: "US", postalCode: "10001", taxRate: null, desiredCondition: "Near Mint" };

type CardResult = {
  label: string;
  paired: number;
  unknownBefore: number;
  flipped: number;
  flippedToNearMint: number;
  // What the shipped budget already recovers, so the reported gain is the
  // marginal rows rather than the whole enrichment effect.
  nearMintWithinShippedBudget: number;
  nearMintAtFullPage: number;
  // The number that actually matters: rows surviving every deterministic gate,
  // not just the condition one. Recovering a condition is worthless if the row
  // was going to fail print proof or the product filter anyway.
  eligibleSummaryOnly: number;
  eligibleShipped: number;
  eligibleFullPage: number;
  after: Record<string, number>;
  error: string | null;
};

describe.skipIf(!enabled)("eBay item-detail budget review", () => {
  it("measures how much condition the unasked rows are hiding", { timeout: 900_000 }, async () => {
    loadLocalEnv();
    expect(process.env.EBAY_CLIENT_ID, "EBAY_CLIENT_ID must be available").toBeTruthy();

    const results: CardResult[] = [];

    for (const [index, entry] of SAMPLE.entries()) {
      try {
        // Three arms, seconds apart. 0 = every row reads exactly what the search
        // summary claims. 12 = the shipped behaviour, measured rather than
        // projected, so the marginal gain needs no assumption about which rows
        // the shortlist filter would have picked. 50 = the whole page enriched.
        const summaryOnly = await searchEbayAlternatives(entry.card, buyer, fetch, undefined, null, 0);
        const shipped = await searchEbayAlternatives(entry.card, buyer, fetch, undefined, null, SHIPPED_BUDGET);
        const enriched = await searchEbayAlternatives(entry.card, buyer, fetch, undefined, null, PAGE);

        const before = new Map(summaryOnly.map((seed) => [seed.id, seed.claimedCondition]));
        const atShipped = new Map(shipped.map((seed) => [seed.id, seed.claimedCondition]));
        const after = new Map(enriched.map((seed) => [seed.id, seed.claimedCondition]));

        // A row counts only if all three arms saw it, so drift can shrink the
        // sample but never invent a difference.
        const paired = [...before.keys()].filter((id) => after.has(id) && atShipped.has(id));
        const pairedIds = new Set(paired);

        // Run the production gates over each arm's own seeds, restricted to the
        // paired rows. marketPrice stays null, which disables the market-floor
        // gate identically in all three arms — it inflates the absolute counts a
        // little but leaves the arm-to-arm difference clean.
        const variantIntent = deriveVariantIntent(entry.card);
        const eligibleIn = (seeds: ListingSeed[]) => seeds
          .filter((seed) => pairedIds.has(seed.id))
          .filter((seed) => normalizeListing({
            listing: seed,
            buyer,
            marketPrice: null,
            variantIntent,
            cardLanguage: entry.card.language,
            confirmedCard: entry.card,
          }).eligible).length;
        const unknownBefore = paired.filter((id) => before.get(id) === "Unknown");
        const flipped = unknownBefore.filter((id) => after.get(id) !== "Unknown");
        const flippedToNearMint = flipped.filter((id) => after.get(id) === "Near Mint");

        const tally: Record<string, number> = {};
        for (const id of paired) {
          const condition = after.get(id) ?? "Unknown";
          tally[condition] = (tally[condition] ?? 0) + 1;
        }

        results.push({
          label: entry.label,
          paired: paired.length,
          unknownBefore: unknownBefore.length,
          flipped: flipped.length,
          flippedToNearMint: flippedToNearMint.length,
          nearMintWithinShippedBudget: paired.filter((id) => atShipped.get(id) === "Near Mint").length,
          nearMintAtFullPage: paired.filter((id) => after.get(id) === "Near Mint").length,
          eligibleSummaryOnly: eligibleIn(summaryOnly),
          eligibleShipped: eligibleIn(shipped),
          eligibleFullPage: eligibleIn(enriched),
          after: tally,
          error: null,
        });
      } catch (error) {
        results.push({
          label: entry.label, paired: 0, unknownBefore: 0, flipped: 0, flippedToNearMint: 0,
          nearMintWithinShippedBudget: 0, nearMintAtFullPage: 0,
          eligibleSummaryOnly: 0, eligibleShipped: 0, eligibleFullPage: 0, after: {},
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (index < SAMPLE.length - 1) await sleep(GAP_MS);
    }

    const measured = results.filter((row) => !row.error);
    const sum = (pick: (row: CardResult) => number) => measured.reduce((total, row) => total + pick(row), 0);
    const pairedTotal = sum((row) => row.paired);
    const unknownTotal = sum((row) => row.unknownBefore);
    const flippedTotal = sum((row) => row.flipped);
    const nearMintTotal = sum((row) => row.flippedToNearMint);
    const shippedNm = sum((row) => row.nearMintWithinShippedBudget);
    const fullNm = sum((row) => row.nearMintAtFullPage);
    const shippedEligible = sum((row) => row.eligibleShipped);
    const fullEligible = sum((row) => row.eligibleFullPage);
    const rate = (part: number, whole: number) => (whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(1)}%`);

    const lines = [
      `# eBay item-detail budget review — ${new Date().toISOString().slice(0, 10)}`,
      "",
      "Reproduce with `npm run review:detail-budget`. Each listing is its own control:",
      "both arms run the real `searchEbayAlternatives` seconds apart, inner-joined on",
      "item id, differing only in whether the row received a detail call.",
      "",
      `Shipped detail budget: **${SHIPPED_BUDGET}** of a ${PAGE}-row page.`,
      "",
      "| Card | Paired rows | Unknown on summary | Detail resolved it | → Near Mint | NM @12 | NM @50 | **Eligible @12** | **Eligible @50** |",
      "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
      ...measured.map((row) => `| ${row.label} | ${row.paired} | ${row.unknownBefore} | ${row.flipped} | ${row.flippedToNearMint} | ${row.nearMintWithinShippedBudget} | ${row.nearMintAtFullPage} | ${row.eligibleShipped} | ${row.eligibleFullPage} |`),
      "",
      "## Pooled",
      "",
      `- Paired listings measured: **${pairedTotal}** across ${measured.length} cards`,
      `- Condition unstated on the search summary: **${unknownTotal}** (${rate(unknownTotal, pairedTotal)})`,
      `- Of those, the detail call supplied a condition: **${flippedTotal}** (${rate(flippedTotal, unknownTotal)})`,
      `- Of those flips, Near Mint (i.e. eligible for an NM request): **${nearMintTotal}** (${rate(nearMintTotal, flippedTotal)})`,
      `- Near Mint rows reachable at budget 12: **${shippedNm}** · at budget 50: **${fullNm}**`,
      `- Marginal NM supply from raising the budget: **+${fullNm - shippedNm}** rows across ${measured.length} cards`
        + `${measured.length ? ` (${((fullNm - shippedNm) / measured.length).toFixed(1)} per card)` : ""}`,
      "",
      "### After every deterministic gate, not just condition",
      "",
      `- Eligible with no detail calls at all: **${sum((row) => row.eligibleSummaryOnly)}**`,
      `- Eligible at the shipped budget of ${SHIPPED_BUDGET}: **${shippedEligible}**`,
      `- Eligible with the full page enriched: **${fullEligible}**`,
      `- Marginal eligible listings: **+${fullEligible - shippedEligible}** across ${measured.length} cards`
        + `${shippedEligible ? ` (${(((fullEligible - shippedEligible) / shippedEligible) * 100).toFixed(0)}% more comparable supply)` : ""}`,
      `- Cards where eligible supply grew: **${measured.filter((row) => row.eligibleFullPage > row.eligibleShipped).length}** of ${measured.length}`
        + `; shrank: **${measured.filter((row) => row.eligibleFullPage < row.eligibleShipped).length}**`,
      "",
      ...(results.some((row) => row.error)
        ? ["## Errors", "", ...results.filter((row) => row.error).map((row) => `- ${row.label}: ${row.error}`), ""]
        : []),
    ];

    const outputPath = path.join(OUTPUT_DIR, `ebay-detail-budget-review-${new Date().toISOString().slice(0, 10)}.md`);
    writeFileSync(outputPath, `${lines.join("\n")}\n`);
    console.log(lines.join("\n"));
    console.log(`\nwrote ${outputPath}`);

    expect(measured.length, "at least one card must complete").toBeGreaterThan(0);
  });
});
