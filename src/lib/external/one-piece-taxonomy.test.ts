import { describe, expect, it } from "vitest";
import catalog from "@/lib/external/one-piece-catalog.generated.json";
import {
  deriveOnePieceTaxonomy,
  ONE_PIECE_ARTWORK_CLASSES,
  ONE_PIECE_TREATMENTS,
  ONE_PIECE_CHANNELS,
  ONE_PIECE_COMPETITION_TIERS,
} from "@/lib/external/one-piece-taxonomy";

describe("One Piece taxonomy completeness", () => {
  it("accounts for every observed rarity, variant stem and release without silent fallback", () => {
    const failures: string[] = [];
    for (const card of catalog) {
      const taxonomy = deriveOnePieceTaxonomy(card);
      failures.push(...taxonomy.unmapped.map((issue) => `${card.card_image_id}: ${issue}`));
      expect(ONE_PIECE_ARTWORK_CLASSES).toContain(taxonomy.artworkClass);
      expect(ONE_PIECE_CHANNELS).toContain(taxonomy.releaseChannel);
      for (const treatment of taxonomy.treatments) expect(ONE_PIECE_TREATMENTS).toContain(treatment);
      if (taxonomy.competitionTier) expect(ONE_PIECE_COMPETITION_TIERS).toContain(taxonomy.competitionTier);
    }
    expect(failures).toEqual([]);
  });

  it.each([
    [{ rarity: "IR" }, "rarity: IR"],
    [{ variant: "Illustration Rare (P1)" }, "variant: Illustration Rare"],
    [{ set_name: "Unannounced Mystery Release" }, "release: Unannounced Mystery Release"],
  ])("fails naming an unseen catalog value: %j", (patch, diagnostic) => {
    expect(deriveOnePieceTaxonomy({ ...catalog[0], ...patch }).unmapped).toContain(diagnostic);
  });

  it("does not turn an unknown rarity into a base-print claim", () => {
    expect(deriveOnePieceTaxonomy({ ...catalog[0], rarity: "IR" }).artworkClass).toBe("unknown");
  });

  it("separates the original set, print release, ordinal and artwork class", () => {
    const nami = catalog.find((card) => card.card_image_id === "OP01-016_p3")!;
    expect(deriveOnePieceTaxonomy(nami)).toMatchObject({ artworkClass: "alternate", releaseChannel: "starter_deck", unmapped: [] });
    const reprint = catalog.find((card) => card.card_image_id === "EB01-009_r1")!;
    expect(deriveOnePieceTaxonomy(reprint)).toMatchObject({ artworkClass: "alternate", releaseChannel: "premium_booster", provenance: "reprint" });
  });

  it("recognizes Treasure Rare independently of the print ordinal", () => {
    const treasure = catalog.find((card) => card.card_image_id === "OP16-011_p1")!;
    expect(deriveOnePieceTaxonomy(treasure)).toMatchObject({ artworkClass: "treasure", unmapped: [] });
    expect(deriveOnePieceTaxonomy({ ...treasure, variant: null })).toMatchObject({ artworkClass: "treasure", unmapped: [] });
  });

  it("does not read a starter deck color as a print treatment", () => {
    const card = catalog.find((card) => card.card_image_id === "ST15-002")!;
    expect(deriveOnePieceTaxonomy(card)).toMatchObject({ releaseChannel: "starter_deck", treatments: [] });
  });

  it("keeps the competition qualifier separate from artwork", () => {
    const card = catalog.find((card) => card.card_image_id === "EB01-015_p2")!;
    expect(deriveOnePieceTaxonomy(card)).toMatchObject({ artworkClass: "alternate", releaseChannel: "tournament", competitionTier: "winner" });
  });
});
