import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { auditOnePieceMetadata } from "./one-piece-metadata-audit.mjs";

const records = JSON.parse(await readFile(
  new URL("../../output/one-piece-exact-print-metadata.json", import.meta.url),
  "utf8",
));

describe("One Piece research metadata audit", () => {
  it("reports the supplied ledger at canonical-print grain", () => {
    const audit = auditOnePieceMetadata(records);

    expect(audit.summary).toMatchObject({
      sourceRecords: 2040,
      duplicateCanonicalPrintIds: 0,
      verifiedRecords: 1579,
      conflictingRecords: 225,
      unresolvedRecords: 236,
    });
  });

  it("blocks semantically incomplete and reverse-ambiguous mappings from promotion", () => {
    const audit = auditOnePieceMetadata(records);

    expect(audit.blockers).toMatchObject({
      verifiedUnknownArtwork: 374,
      verifiedUnresolvedLabels: 200,
      verifiedUnknownReleaseChannel: 245,
      verifiedWithoutExactMarkers: 65,
      sharedMappedProductPairs: 38,
      mappedRecordsUsingSharedProductPairs: 78,
    });
    expect(audit.manualReviewCandidates).not.toContain("OP01-029_p2");
    expect(audit.manualReviewCandidates).not.toContain("OP01-029_r1");
  });

  it("keeps unresolved rows with product ids in the review queue, never promotion", () => {
    const audit = auditOnePieceMetadata(records);

    expect(audit.blockers.unresolvedWithProductMapping).toBe(115);
    expect(audit.reviewQueue.find((record) => record.canonicalPrintId === "ST01-012_p6"))
      .toMatchObject({ reasonCodes: expect.arrayContaining(["status_not_verified"]) });
    expect(audit.manualReviewCandidates).not.toContain("ST01-012_p6");
  });

  it("flags provenance and reproducibility claims that the current generator cannot prove", () => {
    const audit = auditOnePieceMetadata(records);

    expect(audit.blockers.recordsClaimingUncheckedOfficialCardList).toBe(0);
    expect(audit.blockers.officialImagesWithoutContentHash).toBe(0);
    expect(audit.blockers.verifiedWithoutReleaseMatchEvidence).toBe(0);
    expect(audit.blockers.recordsWithoutHumanReview).toBe(2040);
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
});
