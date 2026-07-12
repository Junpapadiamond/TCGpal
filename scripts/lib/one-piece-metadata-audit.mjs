const PLACEHOLDER_LABEL = "Exact Print Unresolved";

function count(records, predicate) {
  return records.reduce((total, record) => total + (predicate(record) ? 1 : 0), 0);
}

function productPair(record) {
  return record.tcgplayerGroupId && record.tcgplayerProductId
    ? `${record.tcgplayerGroupId}:${record.tcgplayerProductId}`
    : null;
}

function duplicateCounts(values) {
  const counts = new Map();
  for (const value of values) {
    if (value === null || value === undefined) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function normalizeMarker(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function recordsWithFamilyUniqueMarkers(records) {
  const families = new Map();
  for (const record of records) {
    const family = String(record.cardNumber ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
    const rows = families.get(family);
    if (rows) rows.push(record);
    else families.set(family, [record]);
  }
  const unique = new Set();
  for (const rows of families.values()) {
    const markerCounts = duplicateCounts(rows.flatMap((record) =>
      [...new Set((record.exactMarkers ?? []).map(normalizeMarker).filter(Boolean))],
    ));
    for (const record of rows) {
      if ((record.exactMarkers ?? []).some((marker) => markerCounts.get(normalizeMarker(marker)) === 1)) {
        unique.add(record.canonicalPrintId);
      }
    }
  }
  return unique;
}

function reasonCodesFor(record, sharedProductPairs, familyUniqueMarkers) {
  const reasons = [];
  if (record.verification !== "verified") reasons.push("status_not_verified");
  if (record.confidence !== "high") reasons.push("confidence_not_high");
  if ((record.conflicts ?? []).length > 0) reasons.push("conflicts_present");
  if (record.artworkClass === "unknown") reasons.push("semantic_unknown_artwork");
  if (record.displayLabel === PLACEHOLDER_LABEL) reasons.push("unresolved_label");
  if (record.releaseChannel === "unknown") reasons.push("unknown_release_channel");
  if (!record.releaseProvenance || record.releaseProvenance === "unknown") reasons.push("unknown_release_provenance");
  if (!Array.isArray(record.exactMarkers) || record.exactMarkers.length === 0) reasons.push("missing_exact_markers");
  else if (!familyUniqueMarkers.has(record.canonicalPrintId)) reasons.push("no_family_unique_exact_marker");
  if (!record.officialImageUrl) reasons.push("missing_official_image");
  if (!record.imageComparison?.officialSha256) reasons.push("missing_official_image_hash");
  if (!record.imageComparison?.tcgplayerSha256) reasons.push("missing_tcgplayer_image_hash");
  const bestDistance = record.imageComparison?.bestDistance;
  const matchThreshold = record.imageComparison?.matchThreshold;
  if (!Number.isFinite(bestDistance) || !Number.isFinite(matchThreshold)) {
    reasons.push("missing_image_distance_evidence");
  } else if (bestDistance > matchThreshold) {
    reasons.push("image_match_above_threshold");
  }
  const runnerUpDistance = record.imageComparison?.runnerUpDistance;
  const matchMargin = record.imageComparison?.matchMargin;
  const ambiguityMargin = record.imageComparison?.ambiguityMargin;
  if (Number.isFinite(runnerUpDistance)) {
    if (!Number.isFinite(matchMargin) || !Number.isFinite(ambiguityMargin)) {
      reasons.push("missing_global_image_margin");
    } else if (matchMargin < ambiguityMargin) {
      reasons.push("ambiguous_global_image_match");
    }
  }
  if (record.releaseMatch?.matched !== true) reasons.push("release_match_unproven");
  const pair = productPair(record);
  if (!pair) reasons.push("missing_product_mapping");
  else if (sharedProductPairs.has(pair)) reasons.push("shared_product_mapping");
  return reasons;
}

export function auditOnePieceMetadata(records) {
  const canonicalCounts = duplicateCounts(records.map((record) => record.canonicalPrintId));
  const verified = records.filter((record) => record.verification === "verified");
  const pairCounts = duplicateCounts(records.map(productPair));
  const sharedProductPairs = new Set(
    [...pairCounts.entries()].filter(([, total]) => total > 1).map(([pair]) => pair),
  );
  const familyUniqueMarkers = recordsWithFamilyUniqueMarkers(records);

  const evaluated = records.map((record) => ({
    canonicalPrintId: record.canonicalPrintId,
    reasonCodes: reasonCodesFor(record, sharedProductPairs, familyUniqueMarkers),
  }));
  const manualReviewCandidates = evaluated
    .filter((record) => record.reasonCodes.length === 0)
    .map((record) => record.canonicalPrintId);

  const recordsClaimingUncheckedOfficialCardList = count(records, (record) =>
    record.evidence?.some((item) => item.sourceType === "official_card_list"),
  );
  const officialImagesWithoutContentHash = count(records, (record) =>
    record.officialImageUrl && !record.imageComparison?.officialSha256,
  );
  const recordsWithoutHumanReview = count(records, (record) => record.humanReviewStatus !== "approved");
  const verifiedWithoutReleaseMatchEvidence = count(verified, (record) =>
    record.releaseMatch?.matched !== true,
  );
  const verifiedUnknownArtwork = count(verified, (record) => record.artworkClass === "unknown");
  const verifiedUnresolvedLabels = count(verified, (record) => record.displayLabel === PLACEHOLDER_LABEL);
  const verifiedUnknownReleaseChannel = count(verified, (record) => record.releaseChannel === "unknown");
  const verifiedWithoutExactMarkers = count(verified, (record) => !record.exactMarkers?.length);
  const verifiedWithoutFamilyUniqueExactMarker = count(verified, (record) =>
    !familyUniqueMarkers.has(record.canonicalPrintId),
  );
  const verifiedUnknownReleaseProvenance = count(verified, (record) =>
    !record.releaseProvenance || record.releaseProvenance === "unknown",
  );
  const recordsWithoutOfficialImage = count(records, (record) => !record.officialImageUrl);
  const recordsWithoutTcgplayerImageHash = count(records, (record) => !record.imageComparison?.tcgplayerSha256);
  const recordsWithAmbiguousGlobalImageMatch = count(records, (record) =>
    Number.isFinite(record.imageComparison?.runnerUpDistance)
    && Number.isFinite(record.imageComparison?.matchMargin)
    && Number.isFinite(record.imageComparison?.ambiguityMargin)
    && record.imageComparison.matchMargin < record.imageComparison.ambiguityMargin,
  );
  const unresolvedWithProductMapping = count(records, (record) =>
    record.verification === "unresolved" && Boolean(productPair(record)),
  );
  const conflictingRecords = count(records, (record) => record.verification === "conflicting");
  const unresolvedRecords = count(records, (record) => record.verification === "unresolved");
  const duplicateCanonicalPrintIds = count([...canonicalCounts.values()], (total) => total > 1);

  return {
    schemaVersion: 1,
    summary: {
      sourceRecords: records.length,
      duplicateCanonicalPrintIds,
      verifiedRecords: verified.length,
      conflictingRecords,
      unresolvedRecords,
      manualReviewCandidates: manualReviewCandidates.length,
    },
    blockers: {
      verifiedUnknownArtwork,
      verifiedUnresolvedLabels,
      verifiedUnknownReleaseChannel,
      verifiedWithoutExactMarkers,
      verifiedWithoutFamilyUniqueExactMarker,
      verifiedUnknownReleaseProvenance,
      recordsWithoutOfficialImage,
      recordsWithoutTcgplayerImageHash,
      recordsWithAmbiguousGlobalImageMatch,
      sharedMappedProductPairs: sharedProductPairs.size,
      mappedRecordsUsingSharedProductPairs: count(records, (record) => sharedProductPairs.has(productPair(record))),
      unresolvedWithProductMapping,
      recordsClaimingUncheckedOfficialCardList,
      officialImagesWithoutContentHash,
      verifiedWithoutReleaseMatchEvidence,
      recordsWithoutHumanReview,
    },
    runtimePublicationAllowed: records.length > 0
      && recordsClaimingUncheckedOfficialCardList === 0
      && officialImagesWithoutContentHash === 0
      && verifiedWithoutReleaseMatchEvidence === 0
      && verifiedUnknownArtwork === 0
      && verifiedUnresolvedLabels === 0
      && verifiedUnknownReleaseChannel === 0
      && verifiedWithoutExactMarkers === 0
      && verifiedWithoutFamilyUniqueExactMarker === 0
      && sharedProductPairs.size === 0
      && unresolvedWithProductMapping === 0
      && conflictingRecords === 0
      && unresolvedRecords === 0
      && duplicateCanonicalPrintIds === 0
      && recordsWithoutHumanReview === 0
      && evaluated.every((record) => record.reasonCodes.length === 0),
    manualReviewCandidates,
    reviewQueue: evaluated.filter((record) => record.reasonCodes.length > 0),
  };
}
