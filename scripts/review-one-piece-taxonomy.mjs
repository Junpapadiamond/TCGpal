// Offline evidence extraction only. These artifacts never enrich runtime prints.
import { readFileSync, writeFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const catalog = readJson("src/lib/external/one-piece-catalog.generated.json");
const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const stem = (value) => (value ?? "base").replace(/\s*\([PR]\d+\)/gi, "").trim();
const eventPattern = "tournament|winner|finalist|champion|participation|anniversary|treasure cup|pre.?release|release event|sealed battle|event pack|pirates party|celebration|premium card collection|gift collection|binder|playmat|dash pack|expo|magazine|store";
const numberCounts = new Map();
const groups = new Map();
for (const card of catalog) {
  numberCounts.set(card.card_set_id, (numberCounts.get(card.card_set_id) ?? 0) + 1);
  const key = JSON.stringify([card.card_set_id, card.set_name, stem(card.variant)]);
  groups.set(key, [...(groups.get(key) ?? []), card.card_image_id]);
}
const twins = [...groups.values()].filter((group) => group.length > 1);
const counts = {
  prints: catalog.length,
  families: numberCounts.size,
  prefixes: [...new Set(catalog.map((card) => card.card_set_id.split("-")[0]))].sort(),
  rarities: [...new Set(catalog.map((card) => card.rarity))].sort(),
  variantStems: [...new Set(catalog.map((card) => stem(card.variant)))].sort(),
  promoPrints: catalog.filter((card) => card.card_set_id.startsWith("P-")).length,
  treasurePrintIds: catalog.filter((card) => card.rarity === "TR").map((card) => card.card_image_id).sort(),
  twinPrints: twins.flat().length,
  twinGroups: twins.length,
  twinFamilies: new Set(twins.flat().map((id) => id.split("_")[0])).size,
  eventPrints: catalog.filter((card) => new RegExp(eventPattern, "i").test(card.set_name)).length,
  theBestPrints: catalog.filter((card) => /one piece card the best/i.test(card.set_name)).length,
  leaderNamedDeckFamilies: catalog.filter((card) => card.card_set_id.startsWith("ST")
    && card.card_image_id === card.card_set_id && numberCounts.get(card.card_set_id) > 1
    && (normalize(card.card_name).includes(normalize(card.set_name))
      || normalize(card.set_name).includes(normalize(card.card_name))))
    .map((card) => card.card_set_id).sort(),
  bareReleaseCodePrintIds: catalog.filter((card) => /^(?:ST|OP|EB|PRB)-\d+$/i.test(card.set_name))
    .map((card) => card.card_image_id).sort(),
};
writeJson("src/lib/testing/one-piece-catalog-census.json", { eventPattern, counts });

const unsafePath = "src/lib/comparison/one-piece-unsafe-corpus.json";
const sellerEvidence = readJson(unsafePath).fixtures.map((row) => ({ source: unsafePath, evidence: row.title }));
for (const source of ["docs/one-piece-buy-accuracy-2026-08-14.md", "docs/one-piece-buy-accuracy-2026-08-14-baseline.md"]) {
  for (const line of readFileSync(source, "utf8").split("\n").filter((line) => line.startsWith("| op-"))) {
    const cells = line.split("|").map((cell) => cell.trim());
    const urlIndex = cells.findIndex((cell) => /^https:\/\/www\.ebay\.com\//.test(cell));
    if (urlIndex > 0) sellerEvidence.push({ source, evidence: cells[urlIndex - 1] });
  }
}
const ledgerPath = "output/one-piece-exact-print-metadata.json";
const ledger = readJson(ledgerPath);
const tcgEvidence = ledger.flatMap((row) => [row.tcgplayerGroupName, row.tcgplayerProductName])
  .filter(Boolean).map((evidence) => ({ source: ledgerPath, evidence }));
// Finite semantic phrases, selected from the corpora above. Absence is recorded;
// the generator does not invent an example to make the vocabulary look complete.
const terms = {
  artwork_class: {
    alternate: ["Alternate Art", "Alt Art", "Alt.", "Parallel", "Full Art"],
    special: ["SP", "Special Art", "Special Alternate Art"],
    manga: ["Manga", "Comic Parallel"],
    treasure: ["Treasure Rare"],
    wanted_poster: ["Wanted Poster", "Wanted"],
    super_alternate: ["Super Alternate Art"],
  },
  treatment: { gold: ["Gold"], silver: ["Silver"], red: ["Red Super Alternate Art"] },
  release_channel: {
    booster: ["Extra Booster", "Memorial Collection", "Heroines Edition", "Romance Dawn", "Paramount War"],
    premium_booster: ["Premium Booster", "The Best"],
    premium_collection: ["Premium Card Collection", "Premium Collection", "Gift Collection"],
    anniversary: ["25th Anniversary", "1st Anniversary", "2nd Anniversary", "3rd Anniversary"],
    tournament: ["Tournament Pack", "Winner Pack", "Regional", "Treasure Cup"],
    promo: ["Promo", "Promotion Cards", "Magazine"],
    event: ["Event Pack", "Sealed Battle", "Pirates Party"],
    starter_deck: ["Starter Deck", "The Three Captains"],
  },
  competition_tier: { winner: ["Winner"], champion: ["Champion"], finalist: ["Finalist"], participation: ["Participation"] },
  provenance: { reprint: ["Reprint", "Revision Pack", "Revised"] },
};
function mine(evidenceRows) {
  const entries = [];
  for (const [axis, values] of Object.entries(terms)) {
    for (const [value, phrases] of Object.entries(values)) {
      for (const phrase of phrases) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`\\b${escaped}(?![a-z])`, "i");
        const found = evidenceRows.find((row) => pattern.test(row.evidence));
        if (found) entries.push({ phrase, axis, value, ...found });
      }
    }
  }
  return entries;
}
const seller = mine(sellerEvidence);
const tcgplayer = mine(tcgEvidence);
// Full provider group names and release-bearing parentheticals preserve spelling,
// volume, year and tier. They are names to reconcile, not approved product mappings.
const names = new Map();
for (const row of ledger) {
  if (row.tcgplayerGroupName) names.set(row.tcgplayerGroupName, row.tcgplayerGroupName);
  for (const match of (row.tcgplayerProductName ?? "").matchAll(/\(([^)]+)\)/g)) {
    if (/pack|set|collection|anniversary|regional|champion|winner|finalist|event|battle|expo|promo|captains|reprint|fest|box|league|deck|vol\./i.test(match[1])) {
      names.set(match[1], row.tcgplayerProductName);
    }
  }
}
for (const [phrase, evidence] of [...names].sort(([a], [b]) => a.localeCompare(b, "en"))) {
  tcgplayer.push({ phrase, axis: "release_name", value: phrase, source: ledgerPath, evidence });
}
writeJson("src/lib/testing/one-piece-lexicons.json", { seller, tcgplayer });
console.log(JSON.stringify({ counts, lexicons: { seller: seller.length, tcgplayer: tcgplayer.length } }, null, 2));
