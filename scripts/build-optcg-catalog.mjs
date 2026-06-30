// Build the bundled One Piece (OPTCG) catalog from the maintained
// `one-piece-card-game-json` dataset (a devDependency), writing it to
// src/lib/external/one-piece-catalog.generated.json in the OnePieceTcgCard shape.
//
//   node scripts/build-optcg-catalog.mjs
//
// Why this exists: the live optcgapi.com dump is often unreachable (and is blocked
// by some egress policies), so we snapshot an accurate, fully-tagged catalog from a
// packaged dataset instead. One entry per card NUMBER (base art preferred); the
// number is the stable id the comparison flow keys on. Commit the generated JSON.
//
// Prices are intentionally null — TCGpal never invents a market price.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const source = require("one-piece-card-game-json/en/cards.json");
const OUT = new URL("../src/lib/external/one-piece-catalog.generated.json", import.meta.url);

function titleCase(value) {
  // Capitalize the first letter of each whitespace-separated word only, so
  // apostrophes stay intact ("SEA'S" → "Sea's", not "Sea'S").
  return value
    .toLowerCase()
    .replace(/(^|\s)([a-z0-9])/g, (_, lead, ch) => lead + ch.toUpperCase())
    .trim();
}

// card_sets looks like "-ROMANCE DAWN- [OP-01]" → { setId: "OP-01", setName: "Romance Dawn" }.
// The bracket can be noisy in the dataset (e.g. "[OP-14-EB04]"), so the canonical
// set_id is always derived from the clean card-number prefix; the bracketed text is
// only used for the human-readable set name.
function parseSet(card) {
  const raw = typeof card.card_sets === "string" ? card.card_sets : "";
  const setId = setIdFromNumber(card.card_number);
  const name = raw.replace(/\[[^\]]*\]/, "").replace(/^[-\s]+|[-\s]+$/g, "").trim();
  return {
    setId,
    setName: name ? titleCase(name) : setId,
  };
}

// "OP01-001" → "OP-01", "ST01-001" → "ST-01", "EB01-001" → "EB-01", "P-001" → "P".
function setIdFromNumber(cardNumber) {
  const prefix = String(cardNumber || "").split("-")[0] ?? "";
  const m = prefix.match(/^([A-Z]+)(\d+)$/i);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : prefix.toUpperCase();
}

function titleType(value) {
  return value ? titleCase(String(value)) : null; // LEADER → Leader, CHARACTER → Character
}

function joinTag(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join("/") || null;
  return value ? String(value) : null;
}

function toCatalogCard(card) {
  const { setId, setName } = parseSet(card);
  return {
    card_name: card.card_name,
    card_set_id: card.card_number, // stable per-number id the flow keys on
    set_id: setId,
    set_name: setName,
    rarity: card.rarity ?? null,
    card_color: joinTag(card.colors),
    card_type: titleType(card.card_type),
    card_cost: card.cost && card.cost !== "-" ? String(card.cost) : null,
    card_power: card.power && card.power !== "-" ? String(card.power) : null,
    life: card.life && card.life !== "-" ? String(card.life) : null,
    counter_amount: card.counter && card.counter !== "-" ? String(card.counter) : null,
    attribute: joinTag(card.attributes),
    sub_types: joinTag(card.types),
    card_image: card.image_url ?? null,
    card_image_id: card.image_name ?? card.card_number,
    market_price: null,
    inventory_price: null,
  };
}

function main() {
  if (!Array.isArray(source) || source.length === 0) {
    console.error("✗ Dataset empty — is one-piece-card-game-json installed?");
    process.exit(1);
  }

  // One entry per card number; prefer the base print (non-alternate art) so the
  // canonical art/number wins. Alternate-art prints share the number and fold in.
  const byNumber = new Map();
  for (const card of source) {
    if (!card || typeof card.card_name !== "string" || typeof card.card_number !== "string") continue;
    const key = card.card_number.toUpperCase();
    const existing = byNumber.get(key);
    if (!existing || (existing.is_alternate_art && !card.is_alternate_art)) {
      byNumber.set(key, card);
    }
  }

  const cards = Array.from(byNumber.values())
    .map(toCatalogCard)
    .sort((a, b) => a.card_set_id.localeCompare(b.card_set_id));

  writeFileSync(OUT, `${JSON.stringify(cards, null, 0)}\n`);
  process.stdout.write(`✓ Wrote ${cards.length} cards to ${OUT.pathname}\n`);
}

main();
