import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import catalog from "@/lib/external/one-piece-catalog.generated.json";
import unsafe from "@/lib/comparison/one-piece-unsafe-corpus.json";

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const stem = (value: string | null) => (value ?? "base").replace(/\s*\([PR]\d+\)/gi, "").trim();
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

describe("One Piece Phase 0 evidence artifacts", () => {
  it("pins the generated catalog census, including counterexamples to the handoff", () => {
    const census = readJson("src/lib/testing/one-piece-catalog-census.json");
    const groups = new Map<string, string[]>();
    for (const card of catalog) {
      const key = JSON.stringify([card.card_set_id, card.set_name, stem(card.variant)]);
      groups.set(key, [...(groups.get(key) ?? []), card.card_image_id]);
    }
    const twins = [...groups.values()].filter((group) => group.length > 1);
    const numberCounts = new Map<string, number>();
    for (const card of catalog) numberCounts.set(card.card_set_id, (numberCounts.get(card.card_set_id) ?? 0) + 1);
    const eventPattern = new RegExp(census.eventPattern, "i");
    const actual = {
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
      eventPrints: catalog.filter((card) => eventPattern.test(card.set_name)).length,
      theBestPrints: catalog.filter((card) => /one piece card the best/i.test(card.set_name)).length,
      leaderNamedDeckFamilies: catalog.filter((card) => card.card_set_id.startsWith("ST")
        && card.card_image_id === card.card_set_id && numberCounts.get(card.card_set_id)! > 1
        && (normalize(card.card_name).includes(normalize(card.set_name))
          || normalize(card.set_name).includes(normalize(card.card_name))))
        .map((card) => card.card_set_id).sort(),
      bareReleaseCodePrintIds: catalog.filter((card) => /^(?:ST|OP|EB|PRB)-\d+$/i.test(card.set_name))
        .map((card) => card.card_image_id).sort(),
    };
    expect(actual).toEqual(census.counts);
    expect(census.counts.prefixes).toHaveLength(56);
    expect(census.counts.treasurePrintIds).toHaveLength(12);
    expect(new Set(census.counts.treasurePrintIds.map((id: string) => id.split("_")[0])).size).toBe(12);
    expect(census.counts.leaderNamedDeckFamilies).toHaveLength(9);
    const nami = catalog.find((card) => card.card_image_id === "OP01-016_p3")!;
    expect([nami.set_id, nami.set_name]).toEqual(["OP-01", "The Three Captains"]);
  });

  it("traces every lexicon phrase to an actual seller title or TCGplayer name", () => {
    type Entry = { phrase: string; axis: string; value: string; source: string; evidence: string };
    const lexicons = readJson("src/lib/testing/one-piece-lexicons.json") as { seller: Entry[]; tcgplayer: Entry[] };
    expect(readJson("src/lib/external/one-piece-taxonomy-vocabulary.json")).toEqual(Object.fromEntries(
      Object.entries(lexicons).map(([name, entries]) => [name, entries.map(({ phrase, axis, value }) => ({ phrase, axis, value }))]),
    ));
    const ledger = readJson("output/one-piece-exact-print-metadata.json") as {
      tcgplayerGroupName: string | null; tcgplayerProductName: string | null;
    }[];
    for (const [kind, entries] of Object.entries(lexicons)) {
      expect(entries.length).toBeGreaterThan(15);
      for (const entry of entries) {
        expect(["artwork_class", "treatment", "release_channel", "competition_tier", "release_name", "provenance"]).toContain(entry.axis);
        expect(entry.value.length).toBeGreaterThan(0);
        expect(entry.evidence.toLowerCase(), entry.phrase).toContain(entry.phrase.toLowerCase());
        if (kind === "seller") {
          const titles = entry.source === "src/lib/comparison/one-piece-unsafe-corpus.json"
            ? unsafe.fixtures.map((row) => row.title)
            : readFileSync(entry.source, "utf8").split("\n")
              .filter((line) => line.startsWith("| op-"))
              .map((line) => line.split("|").map((cell) => cell.trim()))
              .flatMap((cells) => cells.filter((cell, index) => /^https:\/\/www\.ebay\.com\//.test(cells[index + 1] ?? "")));
          expect(titles, entry.phrase).toContain(entry.evidence);
        } else {
          expect(entry.source).toBe("output/one-piece-exact-print-metadata.json");
          expect(ledger.flatMap((row) => [row.tcgplayerGroupName, row.tcgplayerProductName]), entry.phrase).toContain(entry.evidence);
        }
      }
    }
  });
});
