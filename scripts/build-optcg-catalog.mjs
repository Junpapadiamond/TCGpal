// Build the bundled One Piece (OPTCG) catalog from the maintained
// `one-piece-card-game-json` dataset (a devDependency), writing it to
// src/lib/external/one-piece-catalog.generated.json in the OnePieceTcgCard shape.
//
//   node scripts/build-optcg-catalog.mjs
//
// Why this exists: the live optcgapi.com dump is often unreachable (and is blocked
// by some egress policies), so we snapshot an accurate, fully-tagged catalog from a
// packaged dataset instead. One entry per PRINT — every base art AND every alternate
// art / parallel / manga (SP) / treasure rare (TR) / promo — deduped by the stable
// per-print image id. The card NUMBER stays the crosswalk/eBay key; the print id
// (card_image_id) is what distinguishes the alt arts the buyer wants to choose
// between. Commit the generated JSON.
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

// The trailing marker that distinguishes a parallel from the base print, derived
// from the image name: "OP01-024_p1" → "P1", "ST01-007_p3" → "P3". Empty for a
// base print (image name === card number).
function variantSuffix(cardNumber, imageName) {
  const number = String(cardNumber || "").toUpperCase();
  const name = String(imageName || "").toUpperCase();
  if (!name || !number) return "";
  const marker = name.startsWith(number) ? name.slice(number.length).replace(/^_/, "") : "";
  return marker;
}

// Human label for a print's art variation (null for the base print). The printed
// rarity (SR/SEC/SP CARD/TR/P) is carried separately in `rarity`; this names the
// ART so the picker can tell parallels of one number apart. Treasure Rare and the
// special/manga prints get their well-known chase labels; everything else reads as
// "Alternate Art", with the parallel marker appended so distinct alts stay distinct.
function variantLabel(card) {
  if (!card.is_alternate_art) return null;
  const rarity = String(card.rarity || "").toUpperCase();
  const suffix = variantSuffix(card.card_number, card.image_name);
  let base;
  if (rarity === "TR") base = "Treasure Rare";
  else if (rarity === "SP CARD") base = "Special Art";
  else if (rarity === "SEC") base = "Secret Rare Alt";
  else base = "Alternate Art";
  return suffix ? `${base} (${suffix})` : base;
}

function toCatalogCard(card) {
  const { setId, setName } = parseSet(card);
  return {
    card_name: card.card_name,
    card_set_id: card.card_number, // card NUMBER — the crosswalk/eBay/display key
    set_id: setId,
    set_name: setName,
    rarity: card.rarity ?? null,
    is_alternate_art: Boolean(card.is_alternate_art),
    variant: variantLabel(card),
    card_color: joinTag(card.colors),
    card_type: titleType(card.card_type),
    card_cost: card.cost && card.cost !== "-" ? String(card.cost) : null,
    card_power: card.power && card.power !== "-" ? String(card.power) : null,
    life: card.life && card.life !== "-" ? String(card.life) : null,
    counter_amount: card.counter && card.counter !== "-" ? String(card.counter) : null,
    attribute: joinTag(card.attributes),
    sub_types: joinTag(card.types),
    card_image: card.image_url ?? null,
    card_image_id: card.image_name ?? card.card_number, // stable per-PRINT id
    market_price: null,
    inventory_price: null,
  };
}

function main() {
  if (!Array.isArray(source) || source.length === 0) {
    console.error("✗ Dataset empty — is one-piece-card-game-json installed?");
    process.exit(1);
  }

  // One entry per PRINT, deduped by the stable image id so every alternate art,
  // parallel, manga (SP), treasure rare (TR), and promo keeps its own row and its
  // own SAMPLE image. The dataset carries a couple of exact-duplicate prints; the
  // image-id key folds those together (first wins) without dropping real variants.
  const byPrint = new Map();
  for (const card of source) {
    if (!card || typeof card.card_name !== "string" || typeof card.card_number !== "string") continue;
    const key = String(card.image_name || card.card_number).toUpperCase();
    if (!byPrint.has(key)) byPrint.set(key, card);
  }

  // Sort by number, then base art before its parallels, then by print id so the
  // canonical print leads each group and alt ordering stays stable across rebuilds.
  const cards = Array.from(byPrint.values())
    .map(toCatalogCard)
    .sort(
      (a, b) =>
        a.card_set_id.localeCompare(b.card_set_id)
        || Number(Boolean(a.is_alternate_art)) - Number(Boolean(b.is_alternate_art))
        || String(a.card_image_id).localeCompare(String(b.card_image_id)),
    );

  writeFileSync(OUT, `${JSON.stringify(cards, null, 0)}\n`);
  process.stdout.write(`✓ Wrote ${cards.length} cards to ${OUT.pathname}\n`);
}

main();
