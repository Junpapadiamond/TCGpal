// Snapshot the full OPTCG (One Piece) catalog for offline coverage.
//   Run from the project root, on a machine with network access:
//     node scripts/fetch-optcg.mjs
//
// It pulls the OPTCG /allSetCards/ dump and writes it to
// src/lib/external/one-piece-catalog.generated.json, which the bundled catalog
// merges in (adding any card ids beyond the hand-verified seed). Commit the
// result to ship full offline coverage. The curated seed already guarantees that
// common queries resolve even if you never run this.
import { writeFileSync } from "node:fs";

const BASE = process.env.ONE_PIECE_TCG_API_BASE_URL ?? "https://www.optcgapi.com/api";
const OUT = new URL("../src/lib/external/one-piece-catalog.generated.json", import.meta.url);

const KEEP = [
  "card_name",
  "card_set_id",
  "set_id",
  "set_name",
  "rarity",
  "card_type",
  "card_image",
  "market_price",
  "inventory_price",
];

async function main() {
  const url = `${BASE.replace(/\/+$/, "")}/allSetCards/`;
  process.stdout.write(`Fetching ${url} ...\n`);

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    console.error(`✗ OPTCG request failed with ${response.status}`);
    process.exit(1);
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    console.error("✗ Unexpected response: expected a non-empty array of cards.");
    process.exit(1);
  }

  // Keep only the fields the adapter uses, and only cards with a usable id/name.
  const cards = data
    .filter((card) => card && typeof card.card_name === "string" && typeof card.card_set_id === "string")
    .map((card) => Object.fromEntries(KEEP.filter((key) => key in card).map((key) => [key, card[key]])));

  writeFileSync(OUT, `${JSON.stringify(cards, null, 0)}\n`);
  process.stdout.write(`✓ Wrote ${cards.length} cards to ${OUT.pathname}\n`);
  process.stdout.write("  Commit the file to ship full offline coverage.\n");
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
