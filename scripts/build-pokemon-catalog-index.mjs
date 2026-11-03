import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(process.argv[2] ?? join(repoRoot, "..", "pokemon-tcg-data"));
const outputPath = join(repoRoot, "src", "data", "pokemon-catalog-index.json");
const sets = JSON.parse(readFileSync(join(sourceRoot, "sets", "en.json"), "utf8"));
const setsById = new Map(sets.map((set) => [set.id, set]));
const cards = [];

for (const filename of readdirSync(join(sourceRoot, "cards", "en")).filter((name) => name.endsWith(".json")).sort()) {
  const setId = filename.slice(0, -5);
  const set = setsById.get(setId);
  if (!set) throw new Error(`Missing set metadata for ${setId}.`);
  const sourceCards = JSON.parse(readFileSync(join(sourceRoot, "cards", "en", filename), "utf8"));
  for (const card of sourceCards) {
    const legacyStem = `https://images.pokemontcg.io/${set.id}/${card.number}`;
    // Compact only URLs that actually match the old CDN convention. Newer
    // releases use provider-supplied Scrydex URLs; never invent their paths.
    const legacyImages = card.images?.small === `${legacyStem}.png`
      && card.images?.large === `${legacyStem}_hires.png`;
    cards.push({
      i: card.id,
      n: card.name,
      u: card.subtypes,
      d: card.number,
      r: card.rarity,
      ...(!legacyImages ? { m: card.images ?? {} } : {}),
      s: {
        i: set.id,
        n: set.name,
        e: set.series,
        t: set.printedTotal,
        p: set.ptcgoCode,
        d: set.releaseDate,
        ...(set.images?.symbol !== `https://images.pokemontcg.io/${set.id}/symbol.png`
          ? { y: set.images?.symbol ?? null } : {}),
      },
    });
  }
}

const revision = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const sourceUpdatedAt = execFileSync("git", ["-C", sourceRoot, "show", "-s", "--format=%cI", "HEAD"], { encoding: "utf8" }).trim();
writeFileSync(outputPath, `${JSON.stringify({ revision, sourceUpdatedAt, cards })}\n`);
console.log(`Wrote ${cards.length} English cards from ${revision.slice(0, 12)} to ${outputPath}.`);
