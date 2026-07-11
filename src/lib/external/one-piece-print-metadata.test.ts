import { describe, expect, it } from "vitest";
import {
  deriveOnePieceCatalogPrintEnrichment,
  deriveOnePieceReleaseMetadata,
  getOnePiecePrintEnrichment,
  ONE_PIECE_PRINT_METADATA_REVISION,
} from "@/lib/external/one-piece-print-metadata";

describe("One Piece exact-print metadata", () => {
  it("identifies researched manga prints by canonical image id without treating every P2 as manga", () => {
    const verifiedManga = [
      ["OP11-118_p2", 632499],
      ["EB02-061_p2", 629167],
      ["OP05-119_p2", 527026],
      ["OP01-016_p8", 587966],
      ["OP15-118_p2", 685479],
      ["EB04-044_p2", 685313],
      ["OP06-119_p3", 654637],
      ["OP05-119_r2", 587963],
    ] as const;

    for (const [printId, productId] of verifiedManga) {
      expect(getOnePiecePrintEnrichment(printId)).toMatchObject({
        artworkClass: "manga",
        treatments: [],
        tcgplayerProductId: productId,
        verification: "verified",
      });
      expect(getOnePiecePrintEnrichment(printId)?.collectorAliases).toContain("manga");
    }

    expect(getOnePiecePrintEnrichment("OP03-123_p2")?.artworkClass).not.toBe("manga");
    expect(getOnePiecePrintEnrichment("OP11-119_p2")?.artworkClass).not.toBe("manga");
    expect(getOnePiecePrintEnrichment("OP06-119_p2")?.artworkClass).toBe("special");
    expect(ONE_PIECE_PRINT_METADATA_REVISION).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("normalizes canonical ids and returns immutable evidence-backed records", () => {
    const first = getOnePiecePrintEnrichment("  op11-118_P2  ");
    expect(first).toMatchObject({
      canonicalPrintId: "OP11-118_p2",
      artworkClass: "manga",
      tcgplayerProductId: 632499,
    });
    expect(first?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "tcgcsv", productId: 632499, checkedAt: "2026-07-11" }),
    ]));

    if (!first) throw new Error("Expected researched metadata.");
    expect(() => (first.collectorAliases as string[]).push("corrupted")).toThrow();
    expect(getOnePiecePrintEnrichment("OP11-118_p2")?.collectorAliases).not.toContain("corrupted");
  });

  it("keeps artwork, treatment, and release semantics separate for special Luffy prints", () => {
    expect(getOnePiecePrintEnrichment("OP05-119_p6")).toMatchObject({
      artworkClass: "wanted_poster",
      treatments: [],
      tcgplayerProductId: 596915,
    });
    expect(getOnePiecePrintEnrichment("OP05-119_p7")).toMatchObject({
      artworkClass: "special",
      treatments: ["silver"],
      tcgplayerProductId: 632503,
    });
    expect(getOnePiecePrintEnrichment("OP05-119_p8")).toMatchObject({
      artworkClass: "special",
      treatments: ["gold"],
      tcgplayerProductId: 632504,
    });
    expect(getOnePiecePrintEnrichment("OP09-004_p3")).toMatchObject({
      artworkClass: "wanted_poster",
      tcgplayerProductId: 596927,
    });
    expect(getOnePiecePrintEnrichment("OP06-119_p2")).toMatchObject({
      artworkClass: "special",
      tcgplayerProductId: 632505,
    });
  });

  it("derives release provenance from the release product, not the original card number", () => {
    expect(deriveOnePieceReleaseMetadata("A Fist Of Divine Speed", "OP05-119_p8")).toMatchObject({
      channel: "booster",
      provenance: "reprint",
    });
    expect(deriveOnePieceReleaseMetadata("English Version 2nd Anniversary Set", "OP05-119_anniversary")).toMatchObject({
      channel: "anniversary",
      provenance: "promotion",
    });
    expect(deriveOnePieceReleaseMetadata("Offline Regional Champion Card Set 2025 Vol.2", "EB01-003_p4")).toMatchObject({
      channel: "tournament",
      competitionTier: "champion",
      provenance: "promotion",
    });
  });

  it("identifies researched anniversary, tournament, winner, and early wanted-poster releases", () => {
    expect(getOnePiecePrintEnrichment("OP01-016_p2")).toMatchObject({
      displayLabel: "Premium Collection Alternate Art",
      artworkClass: "alternate",
      tcgplayerProductId: 485265,
      releaseProvenance: "reprint",
    });
    expect(getOnePiecePrintEnrichment("OP11-119_p2")).toMatchObject({
      displayLabel: "Treasure Cup Art",
      tcgplayerProductId: 646747,
      tcgplayerGroupId: 17675,
    });
    expect(getOnePiecePrintEnrichment("OP01-016_p7")).toMatchObject({
      displayLabel: "English 1st Anniversary Art",
      tcgplayerProductId: 557286,
      tcgplayerGroupId: 17675,
    });
    expect(getOnePiecePrintEnrichment("ST01-012_p5")).toMatchObject({
      displayLabel: "3rd Anniversary Tournament Pack",
      tcgplayerProductId: 661882,
      tcgplayerGroupId: 24498,
    });
    expect(getOnePiecePrintEnrichment("ST01-012_p6")).toMatchObject({
      displayLabel: "3rd Anniversary Winner",
      tcgplayerProductId: 657798,
      tcgplayerGroupId: 17675,
      releaseChannel: "tournament",
      competitionTier: "winner",
    });
    expect(deriveOnePieceReleaseMetadata("3rd Anniversary Event", "ST01-012_p6")).toMatchObject({
      channel: "tournament",
      competitionTier: "winner",
      provenance: "reprint",
    });
    expect(getOnePiecePrintEnrichment("OP01-051_p2")).toMatchObject({
      artworkClass: "wanted_poster",
      tcgplayerProductId: 501677,
    });
  });

  it("labels generalized coverage as bundled-catalog derivation without inventing a product id", () => {
    expect(deriveOnePieceCatalogPrintEnrichment({
      canonicalPrintId: "EB01-003_p2",
      isAlternateArt: true,
      rarity: "R",
      releaseName: "Offline Regional Participation Pack 2025 Vol.2",
    })).toMatchObject({
      verification: "catalog_derived",
      metadataSource: "bundled-catalog",
      tcgplayerProductId: null,
      evidence: [{ source: "bundled-catalog", productId: null }],
    });
  });
});
