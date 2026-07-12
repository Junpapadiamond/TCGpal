import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { auditOnePieceMetadata } from "./one-piece-metadata-audit.mjs";

const records = JSON.parse(await readFile(
  new URL("../../output/one-piece-exact-print-metadata.json", import.meta.url),
  "utf8",
));

function publishableRecord(overrides = {}) {
  return {
    canonicalPrintId: "OP99-001_p1",
    cardNumber: "OP99-001",
    verification: "verified",
    confidence: "high",
    conflicts: [],
    artworkClass: "alternate",
    displayLabel: "Alternate Art",
    releaseChannel: "booster",
    releaseProvenance: "original_set",
    exactMarkers: ["blue anniversary foil"],
    tcgplayerGroupId: 999,
    tcgplayerProductId: 1000,
    officialImageUrl: "https://example.com/OP99-001_p1.png",
    imageComparison: {
      officialSha256: "official-hash",
      tcgplayerSha256: "tcgplayer-hash",
      bestDistance: 10,
      runnerUpDistance: 20,
      matchMargin: 10,
      matchThreshold: 32,
      ambiguityMargin: 2.5,
    },
    releaseMatch: { matched: true },
    evidence: [],
    humanReviewStatus: "approved",
    ...overrides,
  };
}

describe("One Piece research metadata audit", () => {
  it("reports the supplied ledger at canonical-print grain", () => {
    const audit = auditOnePieceMetadata(records);

    expect(audit.summary.sourceRecords).toBe(records.length);
    expect(audit.summary.duplicateCanonicalPrintIds).toBe(0);
    expect(
      audit.summary.verifiedRecords
      + audit.summary.conflictingRecords
      + audit.summary.unresolvedRecords,
    ).toBe(records.length);
  });

  it("blocks semantically incomplete and reverse-ambiguous mappings from promotion", () => {
    const shared = [
      publishableRecord({ canonicalPrintId: "OP99-001_p1", artworkClass: "unknown" }),
      publishableRecord({ canonicalPrintId: "OP99-001_p2" }),
    ];
    const audit = auditOnePieceMetadata(shared);

    expect(audit.blockers.sharedMappedProductPairs).toBe(1);
    expect(audit.blockers.mappedRecordsUsingSharedProductPairs).toBe(2);
    expect(audit.reviewQueue[0].reasonCodes).toContain("semantic_unknown_artwork");
    expect(audit.manualReviewCandidates).toEqual([]);
  });

  it("keeps unresolved rows with product ids in the review queue, never promotion", () => {
    const audit = auditOnePieceMetadata([
      publishableRecord({ verification: "unresolved" }),
    ]);

    expect(audit.blockers.unresolvedWithProductMapping).toBe(1);
    expect(audit.reviewQueue[0].reasonCodes).toContain("status_not_verified");
    expect(audit.manualReviewCandidates).toEqual([]);
  });

  it("flags provenance and reproducibility claims that the current generator cannot prove", () => {
    const audit = auditOnePieceMetadata(records);

    expect(audit.blockers.recordsWithoutHumanReview).toBe(records.length);
    expect(audit.runtimePublicationAllowed).toBe(false);
  });

  it("requires an exact marker that is unique within the card-number family", () => {
    const shared = ["OP99-001_p1", "OP99-001_p2"].map((canonicalPrintId, index) => ({
      canonicalPrintId,
      cardNumber: "OP99-001",
      verification: "verified",
      confidence: "high",
      conflicts: [],
      artworkClass: "alternate",
      displayLabel: "Alternate Art",
      releaseChannel: "booster",
      exactMarkers: ["alternate art"],
      tcgplayerGroupId: 999,
      tcgplayerProductId: 1000 + index,
      officialImageUrl: `https://example.com/${canonicalPrintId}.png`,
      imageComparison: { officialSha256: canonicalPrintId },
      evidence: [],
      humanReviewStatus: "pending",
    }));

    const audit = auditOnePieceMetadata(shared);
    expect(audit.manualReviewCandidates).toEqual([]);
    expect(audit.reviewQueue[0].reasonCodes).toContain("no_family_unique_exact_marker");
  });

  it("never allows publication while any semantic blocker remains", () => {
    const incomplete = [{
      canonicalPrintId: "OP99-001_p1",
      cardNumber: "OP99-001",
      verification: "verified",
      confidence: "high",
      conflicts: [],
      artworkClass: "unknown",
      displayLabel: "Exact Print Unresolved",
      releaseChannel: "unknown",
      exactMarkers: [],
      tcgplayerGroupId: 999,
      tcgplayerProductId: 1000,
      officialImageUrl: "https://example.com/OP99-001_p1.png",
      imageComparison: { officialSha256: "hash" },
      releaseMatch: { matched: true },
      evidence: [],
      humanReviewStatus: "approved",
    }];

    expect(auditOnePieceMetadata(incomplete).runtimePublicationAllowed).toBe(false);
  });

  it("never allows publication while any record remains in the review queue", () => {
    const blockedRecords = [
      publishableRecord({ confidence: "medium" }),
      publishableRecord({ conflicts: [{ field: "releaseName" }] }),
      publishableRecord({ tcgplayerGroupId: null, tcgplayerProductId: null }),
      publishableRecord({ verification: "candidate" }),
      publishableRecord({ releaseProvenance: "unknown" }),
      publishableRecord({ officialImageUrl: null }),
      publishableRecord({ imageComparison: { officialSha256: null, tcgplayerSha256: null } }),
      publishableRecord({
        imageComparison: {
          officialSha256: "official-hash",
          tcgplayerSha256: "tcgplayer-hash",
          bestDistance: 10,
          runnerUpDistance: 11,
          matchMargin: 1,
          matchThreshold: 32,
          ambiguityMargin: 2.5,
        },
      }),
    ];

    for (const record of blockedRecords) {
      const audit = auditOnePieceMetadata([record]);
      expect(audit.reviewQueue).toHaveLength(1);
      expect(audit.runtimePublicationAllowed).toBe(false);
    }
  });

  it("allows publication only for a complete, approved, globally distinct mapping", () => {
    const audit = auditOnePieceMetadata([publishableRecord()]);

    expect(audit.reviewQueue).toEqual([]);
    expect(audit.runtimePublicationAllowed).toBe(true);
  });

  it("never allows an empty research ledger to publish", () => {
    const audit = auditOnePieceMetadata([]);

    expect(audit.summary.sourceRecords).toBe(0);
    expect(audit.runtimePublicationAllowed).toBe(false);
  });
});
