import { normalizeCanonicalPrintId, deriveOnePieceReleaseFacets, type OnePieceArtworkClass, type OnePiecePrintTreatment, type OnePieceReleaseChannel, type OnePieceReleaseMetadata } from "@/lib/external/one-piece-taxonomy";
export { deriveOnePieceCatalogPrintEnrichment, type OnePieceArtworkClass, type OnePiecePrintTreatment, type OnePieceReleaseChannel, type OnePieceReleaseMetadata } from "@/lib/external/one-piece-taxonomy";
export const ONE_PIECE_PRINT_METADATA_REVISION = "2026-07-11.2";

export type OnePiecePrintEnrichment = {
  canonicalPrintId: string;
  artworkClass: OnePieceArtworkClass;
  treatments: readonly OnePiecePrintTreatment[];
  displayLabel: string;
  collectorAliases: readonly string[];
  exactMarkers: readonly string[];
  tcgplayerProductId: number | null;
  tcgplayerGroupId: number | null;
  evidence: readonly OnePiecePrintEvidence[];
  verification: "verified" | "catalog_derived";
  metadataSource: "tcgcsv+official-image" | "official-image+curated" | "bundled-catalog";
  releaseProvenance: "original_set" | "reprint" | "promotion" | "unknown";
  releaseChannel?: OnePieceReleaseChannel;
  competitionTier?: OnePieceReleaseMetadata["competitionTier"];
};

export type OnePiecePrintEvidence = {
  source: "tcgcsv" | "official-card-list" | "bundled-catalog";
  productId: number | null;
  checkedAt: "2026-07-11";
};

type MetadataSeed = Omit<OnePiecePrintEnrichment, "canonicalPrintId" | "tcgplayerGroupId">;

// Audited against the TCGCSV category 68 group/product feeds on 2026-07-11.
// TCGplayer frequently files promos and reprints under a group whose name does
// not match Bandai's release name, so the group ID is part of exact identity.
const verifiedProductsByGroup = {
  3188: [454666],
  17675: [485265, 557286, 561183, 646747, 657798, 657799, 657800, 680497],
  17698: [485862],
  22890: [500118, 501677, 501678, 501679, 501680],
  23024: [516558],
  23213: [527019, 527020, 527026],
  23272: [541660],
  23333: [544532],
  23387: [545841],
  23462: [558162],
  23496: [587708, 587709, 587710, 587958, 587959, 587960, 587962, 587963, 587964, 587966],
  23589: [596915, 596925, 596927, 596984, 596986, 597035, 597037, 597065, 597068],
  23766: [617173],
  23834: [629167],
  24241: [632499, 632503, 632504, 632505],
  24302: [643867, 646572, 646573],
  24303: [657401, 657402, 657403, 657404, 657406, 657407, 657408, 657409, 657411, 657412, 657413, 657414, 657442, 657443, 657446],
  24305: [654637],
  24498: [661880, 661881, 661882],
  24537: [671448, 671453, 671454],
  24545: [672817],
  24637: [685313, 685479],
  24664: [695986, 696052, 696108],
} as const;

const verifiedGroupByProduct = new Map<number, number>(
  Object.entries(verifiedProductsByGroup).flatMap(([groupId, productIds]) =>
    productIds.map((productId) => [productId, Number(groupId)] as const),
  ),
);

function verifiedGroupId(productId: number | null) {
  if (productId === null) return null;
  const groupId = verifiedGroupByProduct.get(productId);
  if (!groupId) throw new Error(`Missing verified TCGplayer group for product ${productId}.`);
  return groupId;
}

function manga(productId: number, releaseProvenance: MetadataSeed["releaseProvenance"] = "original_set"): MetadataSeed {
  return {
    artworkClass: "manga",
    treatments: [],
    displayLabel: "Manga Art",
    collectorAliases: ["manga", "manga art", "manga rare", "comic art"],
    exactMarkers: ["manga", "manga art", "manga rare"],
    tcgplayerProductId: productId,
    evidence: [
      { source: "tcgcsv", productId, checkedAt: "2026-07-11" },
      { source: "official-card-list", productId: null, checkedAt: "2026-07-11" },
    ],
    verification: "verified",
    metadataSource: "tcgcsv+official-image",
    releaseProvenance,
  };
}

function special(
  displayLabel: string,
  productId: number,
  treatments: OnePiecePrintTreatment[] = [],
  metadataSource: MetadataSeed["metadataSource"] = "tcgcsv+official-image",
): MetadataSeed {
  return {
    artworkClass: "special",
    treatments,
    displayLabel,
    collectorAliases: [displayLabel, "SP", "special art", ...treatments],
    exactMarkers: [displayLabel, ...treatments],
    tcgplayerProductId: productId,
    evidence: [
      { source: "tcgcsv", productId, checkedAt: "2026-07-11" },
      { source: "official-card-list", productId: null, checkedAt: "2026-07-11" },
    ],
    verification: "verified",
    metadataSource,
    releaseProvenance: "reprint",
  };
}

function wanted(productId: number, releaseProvenance: MetadataSeed["releaseProvenance"] = "reprint"): MetadataSeed {
  return {
    artworkClass: "wanted_poster",
    treatments: [],
    displayLabel: "Wanted Poster",
    collectorAliases: ["wanted", "wanted poster", "poster art"],
    exactMarkers: ["wanted", "wanted poster"],
    tcgplayerProductId: productId,
    evidence: [
      { source: "tcgcsv", productId, checkedAt: "2026-07-11" },
      { source: "official-card-list", productId: null, checkedAt: "2026-07-11" },
    ],
    verification: "verified",
    metadataSource: "tcgcsv+official-image",
    releaseProvenance,
  };
}

function superAlternate(
  productId: number,
  treatments: OnePiecePrintTreatment[] = [],
): MetadataSeed {
  const displayLabel = treatments.includes("red") ? "Red Super Alternate Art" : "Super Alternate Art";
  return {
    artworkClass: "super_alternate",
    treatments,
    displayLabel,
    collectorAliases: [displayLabel, "super alt", "super alternate art", ...treatments],
    exactMarkers: [displayLabel, ...(treatments.includes("red") ? ["red super alt"] : [])],
    tcgplayerProductId: productId,
    evidence: [
      { source: "tcgcsv", productId, checkedAt: "2026-07-11" },
      { source: "official-card-list", productId: null, checkedAt: "2026-07-11" },
    ],
    verification: "verified",
    metadataSource: "tcgcsv+official-image",
    releaseProvenance: "original_set",
  };
}

function alternate(productId: number): MetadataSeed {
  return {
    artworkClass: "alternate",
    treatments: [],
    displayLabel: "Alternate Art",
    collectorAliases: ["alternate art", "alt art", "parallel"],
    exactMarkers: ["alternate art", "alt art", "parallel"],
    tcgplayerProductId: productId,
    evidence: [
      { source: "tcgcsv", productId, checkedAt: "2026-07-11" },
      { source: "official-card-list", productId: null, checkedAt: "2026-07-11" },
    ],
    verification: "verified",
    metadataSource: "tcgcsv+official-image",
    releaseProvenance: "original_set",
  };
}

function releaseAlternate(
  displayLabel: string,
  productId: number,
  collectorAliases: string[],
  metadataSource: MetadataSeed["metadataSource"] = "tcgcsv+official-image",
  release: {
    channel?: OnePieceReleaseChannel;
    competitionTier?: OnePieceReleaseMetadata["competitionTier"];
  } = {},
): MetadataSeed {
  return {
    artworkClass: "alternate",
    treatments: [],
    displayLabel,
    collectorAliases: [displayLabel, "alternate art", ...collectorAliases],
    exactMarkers: [displayLabel, ...collectorAliases],
    tcgplayerProductId: productId,
    evidence: [
      { source: "tcgcsv", productId, checkedAt: "2026-07-11" },
      { source: "official-card-list", productId: null, checkedAt: "2026-07-11" },
    ],
    verification: "verified",
    metadataSource,
    releaseProvenance: "reprint",
    releaseChannel: release.channel,
    competitionTier: release.competitionTier,
  };
}

const seeds: Record<string, MetadataSeed> = {
  // TCGCSV products explicitly named Manga, aligned to official Bandai images.
  "EB01-006_p2": manga(544532),
  "EB02-061_p2": manga(629167),
  "EB03-061_p2": manga(672817),
  "EB04-044_p2": manga(685313),
  "OP01-016_p8": manga(587966, "reprint"),
  "OP01-120_p2": manga(454666),
  "OP02-013_p2": manga(485862),
  "OP03-122_p2": manga(500118),
  "OP04-083_p2": manga(516558),
  "OP05-069_p2": manga(527019),
  "OP05-074_p2": manga(527020),
  "OP05-119_p2": manga(527026),
  "OP06-118_p2": manga(541660),
  "OP06-119_p3": manga(654637, "reprint"),
  "OP07-051_p2": manga(545841),
  "OP08-118_p2": manga(558162),
  "OP09-004_p2": manga(596925),
  "OP09-051_p2": manga(596984),
  "OP09-093_p2": manga(597035),
  "OP09-118_p2": manga(597065),
  "OP09-119_p2": manga(597068),
  "OP10-119_p2": manga(617173),
  "OP11-118_p2": manga(632499),
  "OP12-118_p2": manga(643867),
  "OP14-119_p2": manga(671448),
  "OP15-118_p2": manga(685479),
  "OP16-063_p2": manga(696052),
  "OP16-065_p2": manga(695986),
  "OP16-073_p2": manga(696108),

  // Premium Booster manga reprints use their own canonical reprint image ids.
  "EB01-006_r1": manga(587962, "reprint"),
  "OP01-120_r2": manga(587708, "reprint"),
  "OP02-013_r1": manga(587709, "reprint"),
  "OP03-122_r1": manga(587710, "reprint"),
  "OP04-083_r1": manga(587958, "reprint"),
  "OP05-069_r1": manga(587959, "reprint"),
  "OP05-074_r2": manga(587960, "reprint"),
  "OP05-119_r2": manga(587963, "reprint"),
  "OP06-118_r1": manga(587964, "reprint"),

  // OP05 Gear 5 Luffy treatments and later-release artwork.
  "OP05-119_p6": wanted(596915),
  "OP05-119_p7": special("Silver Special Art", 632503, ["silver"], "official-image+curated"),
  "OP05-119_p8": special("Gold Special Art", 632504, ["gold"]),
  "OP06-119_p2": special("Special Art", 632505),

  // Gold/silver paired SP treatments. Suffix order differs by family.
  "OP09-004_p5": special("Gold Special Art", 657442, ["gold"]),
  "OP09-004_p6": special("Silver Special Art", 657443, ["silver"], "official-image+curated"),
  "OP09-093_p4": special("Gold Special Art", 646573, ["gold"]),
  "OP09-093_p5": special("Silver Special Art", 646572, ["silver"], "official-image+curated"),
  "OP09-051_p4": special("Gold Special Art", 671453, ["gold"]),
  "OP09-051_p5": special("Silver Special Art", 671454, ["silver"], "official-image+curated"),

  // Wanted-poster artwork verified by TCGCSV product name and Bandai image alignment.
  "OP09-004_p3": wanted(596927),
  "OP09-051_p3": wanted(596986),
  "OP09-093_p3": wanted(597037),
  "OP09-118_p3": wanted(657446),
  "OP01-051_p2": wanted(501677),
  "ST01-012_p1": wanted(501678),
  "ST03-009_p1": wanted(501679),
  "ST04-003_p1": wanted(501680),

  // OP13 separates ordinary parallel, super alt, red super alt, and poster art.
  "OP13-118_p1": alternate(657403),
  "OP13-118_p2": superAlternate(657402),
  "OP13-118_p3": superAlternate(657401, ["red"]),
  "OP13-118_p4": wanted(657404, "original_set"),
  "OP13-119_p1": alternate(657408),
  "OP13-119_p2": superAlternate(657407),
  "OP13-119_p3": superAlternate(657406, ["red"]),
  "OP13-119_p4": wanted(657409, "original_set"),
  "OP13-120_p1": alternate(657413),
  "OP13-120_p2": superAlternate(657412),
  "OP13-120_p3": superAlternate(657411, ["red"]),
  "OP13-120_p4": wanted(657414, "original_set"),

  // Release-specific alternates that collectors search by product/event name.
  "OP01-016_p2": releaseAlternate("Premium Collection Alternate Art", 485265, ["premium collection", "25th edition"], "tcgcsv+official-image", { channel: "premium_collection" }),
  "OP01-016_p7": releaseAlternate("English 1st Anniversary Art", 557286, ["anniversary", "1st anniversary"], "official-image+curated", { channel: "anniversary" }),
  "OP03-123_p2": releaseAlternate("Championship 2024 Art", 561183, ["championship", "regional 2024"], "tcgcsv+official-image", { channel: "tournament" }),
  "OP11-119_p2": releaseAlternate("Treasure Cup Art", 646747, ["treasure cup"], "tcgcsv+official-image", { channel: "tournament" }),
  "OP12-119_p2": releaseAlternate("Japanese 3rd Anniversary Art", 680497, ["anniversary", "3rd anniversary"], "tcgcsv+official-image", { channel: "anniversary" }),
  "ST01-012_p5": releaseAlternate("3rd Anniversary Tournament Pack", 661882, ["anniversary", "tournament pack"], "tcgcsv+official-image", { channel: "tournament", competitionTier: "participation" }),
  "OP07-053_p3": releaseAlternate("3rd Anniversary Tournament Pack", 661881, ["anniversary", "tournament pack"], "tcgcsv+official-image", { channel: "tournament", competitionTier: "participation" }),
  "OP09-027_p2": releaseAlternate("3rd Anniversary Tournament Pack", 661880, ["anniversary", "tournament pack"], "tcgcsv+official-image", { channel: "tournament", competitionTier: "participation" }),
  "ST01-012_p6": releaseAlternate("3rd Anniversary Winner", 657798, ["anniversary", "tournament winner", "winner"], "tcgcsv+official-image", { channel: "tournament", competitionTier: "winner" }),
  "OP07-053_p4": releaseAlternate("3rd Anniversary Winner", 657799, ["anniversary", "tournament winner", "winner"], "tcgcsv+official-image", { channel: "tournament", competitionTier: "winner" }),
  "OP09-027_p3": releaseAlternate("3rd Anniversary Winner", 657800, ["anniversary", "tournament winner", "winner"], "tcgcsv+official-image", { channel: "tournament", competitionTier: "winner" }),
};

const normalizedSeeds = new Map(Object.entries(seeds).map(([id, seed]) => [normalizeCanonicalPrintId(id), seed]));

export function getOnePiecePrintEnrichment(canonicalPrintId: string): OnePiecePrintEnrichment | null {
  const id = normalizeCanonicalPrintId(canonicalPrintId);
  const seed = normalizedSeeds.get(id) ?? null;
  if (!seed) return null;
  return Object.freeze({
    canonicalPrintId: id,
    ...seed,
    tcgplayerGroupId: verifiedGroupId(seed.tcgplayerProductId),
    treatments: Object.freeze([...seed.treatments]),
    collectorAliases: Object.freeze([...seed.collectorAliases]),
    exactMarkers: Object.freeze([...seed.exactMarkers]),
    evidence: Object.freeze(seed.evidence.map((record) => Object.freeze({ ...record }))),
  });
}

export function deriveOnePieceReleaseMetadata(releaseName: string, canonicalPrintId: string): OnePieceReleaseMetadata {
  return deriveOnePieceReleaseFacets(releaseName, canonicalPrintId, getOnePiecePrintEnrichment(canonicalPrintId));
}
