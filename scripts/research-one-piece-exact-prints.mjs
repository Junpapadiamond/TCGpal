import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const catalog = require("one-piece-card-game-json/en/cards.json");

const CATEGORY_ID = 68;
const TCGCSV_BASE = `https://tcgcsv.com/tcgplayer/${CATEGORY_ID}`;
const SECONDARY_CATALOG = "https://github.com/bountycards/onePieceCardGameParser";
const OUTPUT = new URL("../output/one-piece-exact-print-metadata.json", import.meta.url);
const CHECKED_AT = new Date().toISOString().slice(0, 10);
const USER_AGENT = "TCGlens-exact-print-research/1.0";
const CONCURRENCY = 8;
const IMAGE_MATCH_METHOD = "rgb-rmse-32x45-v2";
const IMAGE_MATCH_THRESHOLD = 32;
const IMAGE_AMBIGUITY_MARGIN = 2.5;

const RELEASE_CODE_TO_GROUP_ABBREVIATION = new Map([
  ["P", "OP-PR"],
  ["PRB-01", "PRB-01"],
  ["PRB-02", "PRB-02"],
]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeCollectorNumber(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseRelease(card) {
  const raw = String(card.card_sets ?? "");
  const code = raw.match(/\[([^\]]+)\]/)?.[1]?.trim() ?? null;
  const name = raw.replace(/\[[^\]]+\]/, "").replace(/^[-\s]+|[-\s]+$/g, "").trim() || null;
  return { name, code };
}

function extendedValue(product, field) {
  return product.extendedData?.find((entry) => entry.name === field)?.value ?? null;
}

function candidatePrints() {
  const byId = new Map();
  for (const card of catalog) {
    if (!card?.image_name || !card?.card_number || !card?.card_name) continue;
    // A distinct official image id is a separate print candidate even when the
    // secondary catalog's alternate-art flag is false. The id remains opaque;
    // no artwork or release meaning is inferred from its trailing characters.
    const hasDistinctPrintImage = normalizeText(card.image_name) !== normalizeText(card.card_number);
    if (!hasDistinctPrintImage && card.rarity !== "P") continue;
    const key = String(card.image_name).toUpperCase();
    if (!byId.has(key)) byId.set(key, card);
  }
  return [...byId.values()].sort((a, b) =>
    a.card_number.localeCompare(b.card_number) || a.image_name.localeCompare(b.image_name),
  );
}

async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function fetchBuffer(url, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function mapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function loadTcgcsv() {
  const groups = (await fetchJson(`${TCGCSV_BASE}/groups`)).results ?? [];
  const productGroups = await mapConcurrent(groups, CONCURRENCY, async (group) => {
    const envelope = await fetchJson(`${TCGCSV_BASE}/${group.groupId}/products`);
    return (envelope.results ?? []).map((product) => ({ ...product, group }));
  });
  const products = productGroups.flat();
  const byNumber = new Map();
  for (const product of products) {
    const number = normalizeCollectorNumber(extendedValue(product, "Number"));
    if (!number) continue;
    const rows = byNumber.get(number);
    if (rows) rows.push(product);
    else byNumber.set(number, [product]);
  }
  return { groups, products, byNumber };
}

function identityCandidates(card, byNumber) {
  const number = normalizeCollectorNumber(card.card_number);
  const name = normalizeText(card.card_name);
  return (byNumber.get(number) ?? []).filter((product) => {
    const productName = normalizeText(product.name);
    return productName.includes(name) || name.includes(productName);
  });
}

const imageAssetCache = new Map();

async function imageAsset(url) {
  if (!imageAssetCache.has(url)) {
    imageAssetCache.set(url, (async () => {
      const bytes = await fetchBuffer(url);
      const [metadata, vector] = await Promise.all([
        sharp(bytes).metadata(),
        sharp(bytes).resize(32, 45, { fit: "fill" }).removeAlpha().raw().toBuffer(),
      ]);
      return {
        sha256: createHash("sha256").update(bytes).digest("hex"),
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        vector,
      };
    })());
  }
  return imageAssetCache.get(url);
}

function imageDistance(left, right) {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum / left.length);
}

function groupMatchesRelease(group, release) {
  if (!release.code) return false;
  const expected = RELEASE_CODE_TO_GROUP_ABBREVIATION.get(release.code) ?? release.code;
  const abbreviation = normalizeCollectorNumber(group.abbreviation);
  const normalizedExpected = normalizeCollectorNumber(expected);
  if (abbreviation === normalizedExpected) return true;
  const releaseName = normalizeText(release.name);
  const groupName = normalizeText(group.name);
  return releaseName.length >= 5 && (groupName.includes(releaseName) || releaseName.includes(groupName));
}

function releaseWords(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/tournament kit/g, "tournament pack")
    .replace(/\bparticipant\b/g, "participation")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !["included", "in", "the", "card", "cards", "set", "one", "piece"].includes(word));
}

export function productMatchesRelease(product, release) {
  const groupAbbreviationMatches = groupMatchesRelease(product.group, release);
  const releaseTokens = releaseWords(release.name);
  if (releaseTokens.length === 0) return groupAbbreviationMatches;
  const productTokens = new Set(releaseWords(product.name));
  const releaseTier = ["winner", "champion", "finalist", "participation"]
    .find((token) => releaseTokens.includes(token)) ?? null;
  const productTier = ["winner", "champion", "finalist", "participation"]
    .find((token) => productTokens.has(token)) ?? null;
  if (releaseTier !== productTier && (releaseTier || productTier)) return false;

  const releaseChannel = ["online", "offline"].find((token) => releaseTokens.includes(token)) ?? null;
  const productChannel = ["online", "offline"].find((token) => productTokens.has(token)) ?? null;
  if (releaseChannel !== productChannel && (releaseChannel || productChannel)) return false;
  if (groupAbbreviationMatches) return true;
  for (const [left, right] of [
    ["online", "offline"],
    ["champion", "finalist"],
    ["champion", "participation"],
    ["finalist", "participation"],
    ["winner", "participation"],
  ]) {
    if (releaseTokens.includes(left) && (!productTokens.has(left) || productTokens.has(right))) return false;
    if (releaseTokens.includes(right) && (!productTokens.has(right) || productTokens.has(left))) return false;
  }
  const required = releaseTokens.filter((token) => ![
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december",
  ].includes(token));
  const matched = required.filter((token) => productTokens.has(token));
  const distinctive = [
    "anniversary", "celebration", "champion", "finalist", "participation", "regional",
    "release", "event", "promotion", "promo", "treasure", "tournament", "winner",
  ];
  const distinctiveMatches = matched.filter((token) => distinctive.includes(token));
  if (required.length <= 2) return matched.length === required.length;
  return matched.length / required.length >= 0.72 && (distinctiveMatches.length > 0 || matched.length >= 3);
}

function releaseMatchEvidence(product, release) {
  if (!product) return null;
  const officialTokens = releaseWords(release.name);
  const productTokens = new Set(releaseWords(`${product.name} ${product.group?.name ?? ""}`));
  const firstPresent = (tokens, values) => values.find((value) => tokens.includes
    ? tokens.includes(value)
    : tokens.has(value)) ?? null;
  const groupAbbreviationExact = groupMatchesRelease(product.group, release);
  const matched = productMatchesRelease(product, release);
  return {
    matched,
    method: groupAbbreviationExact
      ? "exact_group_abbreviation"
      : matched
        ? "tier_aware_release_tokens"
        : "no_release_match",
    officialCompetitionTier: firstPresent(officialTokens, ["winner", "champion", "finalist", "participation"]),
    productCompetitionTier: firstPresent(productTokens, ["winner", "champion", "finalist", "participation"]),
    officialRegionalChannel: firstPresent(officialTokens, ["online", "offline"]),
    productRegionalChannel: firstPresent(productTokens, ["online", "offline"]),
  };
}

async function scoreProducts(card, products) {
  if (!card.image_url) return { official: null, rows: [] };
  const official = await imageAsset(card.image_url);
  const scored = await mapConcurrent(products, CONCURRENCY, async (product) => {
    if (!product.imageUrl) return { product, image: null, distance: Number.POSITIVE_INFINITY };
    try {
      const image = await imageAsset(product.imageUrl);
      return { product, image, distance: imageDistance(official.vector, image.vector) };
    } catch {
      return { product, image: null, distance: Number.POSITIVE_INFINITY };
    }
  });
  return {
    official,
    rows: scored.sort((a, b) => a.distance - b.distance || a.product.productId - b.product.productId),
  };
}

export function chooseProduct(scored, release) {
  const visualMatches = scored.filter((row) => row.distance <= IMAGE_MATCH_THRESHOLD);
  const releaseMatches = visualMatches.filter((row) => productMatchesRelease(row.product, release));
  const pool = releaseMatches.length > 0 ? releaseMatches : visualMatches;
  if (pool.length === 0) return { match: null, bestCandidate: null, runnerUp: null, conflicts: [], reason: "No TCGCSV product image matched the official print." };

  const best = pool[0];
  const runnerUp = scored.find((row) => row !== best && Number.isFinite(row.distance)) ?? null;
  const indistinguishable = pool.filter((row) => Math.abs(row.distance - best.distance) < IMAGE_AMBIGUITY_MARGIN);
  if (indistinguishable.length > 1) {
    return {
      match: null,
      bestCandidate: best,
      runnerUp,
      conflicts: indistinguishable.map((row) => ({
        tcgplayerProductId: row.product.productId,
        tcgplayerGroupId: row.product.group.groupId,
        tcgplayerGroupName: row.product.group.name,
        tcgplayerProductName: row.product.name,
        imageDistance: Number(row.distance.toFixed(2)),
      })),
      reason: "Multiple TCGCSV products are visually indistinguishable for this official image and release evidence does not isolate one product.",
    };
  }
  return { match: best, bestCandidate: best, runnerUp, conflicts: [], reason: null };
}

function explicitMarkers(product, card, release) {
  const name = product?.name ?? "";
  const description = extendedValue(product ?? {}, "Description") ?? "";
  const groupName = product?.group?.name ?? "";
  const releaseName = release.name ?? "";
  const haystack = `${name} ${description} ${groupName} ${releaseName}`;
  let markers = [];
  const rules = [
    ["manga", /\bmanga\b/i],
    ["alternate art", /alternate art/i],
    ["super alternate art", /super alternate/i],
    ["red super alternate art", /red super alternate/i],
    ["parallel", /\bparallel\b/i],
    ["full art", /\bfull art\b/i],
    ["wanted poster", /wanted poster/i],
    ["special art", /\bspecial art\b|\(sp\)/i],
    ["treasure rare", /treasure rare|\(tr\)/i],
    ["gold", /\bgold\b/i],
    ["silver", /\bsilver\b/i],
    ["red", /red super alternate|\(red\)|\bred foil\b/i],
    ["foil", /\bfoil\b/i],
    ["stamped", /\bstamp(?:ed)?\b/i],
    ["serialized", /serial(?:ized)? number|\bserialized\b/i],
    ["signed", /\bsigned\b|\bsignature\b/i],
    ["textured", /\btextured\b/i],
    ["winner", /\bwinner\b/i],
    ["champion", /\bchampion\b/i],
    ["finalist", /\bfinalist\b/i],
    ["participation", /\bparticipation\b|\bparticipant\b/i],
    ["regional", /\bregional\b/i],
    ["treasure cup", /treasure cup/i],
    ["anniversary", /\banniversary\b/i],
    ["promotion", /\bpromotion\b|\bpromo\b/i],
    ["release event", /release event/i],
    ["pre-release", /pre-release/i],
    ["tournament", /\btournament\b/i],
    ["reprint", /\breprint(?:ed)?\b/i],
  ];
  for (const [marker, pattern] of rules) if (pattern.test(haystack)) markers.push(marker);
  if (/without (?:the )?original textured foil|without texture/i.test(description)) {
    markers = markers.filter((marker) => !["textured", "foil"].includes(marker));
  }
  if (card.rarity === "SP CARD" && !markers.includes("special art")) markers.push("special art");
  if (card.rarity === "TR" && !markers.includes("treasure rare")) markers.push("treasure rare");
  return [...new Set(markers)];
}

function classifyArtwork(markers) {
  if (markers.includes("manga")) return "manga";
  if (markers.includes("red super alternate art") || markers.includes("super alternate art")) return "super_alternate";
  if (markers.includes("wanted poster")) return "wanted_poster";
  if (markers.some((marker) => ["alternate art", "parallel", "full art"].includes(marker))) return "alternate";
  if (markers.some((marker) => [
    "special art", "treasure rare", "gold", "silver", "red", "stamped", "serialized", "signed",
    "winner", "champion", "finalist", "participation", "regional", "treasure cup", "anniversary",
    "promotion", "release event", "pre-release", "tournament",
  ].includes(marker))) return "special";
  return "unknown";
}

function treatments(markers, product) {
  const description = extendedValue(product ?? {}, "Description") ?? "";
  const values = ["gold", "silver", "red", "stamped", "serialized", "signed", "textured"]
    .filter((value) => markers.includes(value));
  if (/without (?:the )?original textured foil|without texture/i.test(description)) {
    return values.filter((value) => value !== "textured");
  }
  return values;
}

function releaseChannel(product, card, release) {
  const haystack = `${product?.group?.name ?? ""} ${product?.name ?? ""} ${release.name ?? ""}`;
  if (/premium booster/i.test(haystack)) return "premium_booster";
  if (/premium (?:card )?collection|collection set/i.test(haystack)) return "premium_collection";
  if (/anniversary/i.test(haystack)) return "anniversary";
  if (/winner|champion|finalist|regional|treasure cup|tournament|super pre-release/i.test(haystack)) return "tournament";
  if (/release event|pre-release|\bevent\b/i.test(haystack)) return "event";
  if (/promotion|promo/i.test(haystack) || card.rarity === "P") return "promo";
  if (/booster|romance dawn|paramount war|pillars of strength|kingdoms of intrigue|awakening of the new era|wings of the captain|two legends|royal blood|divine speed|legacy of the master|carrying on his will|azure sea|kami.s island|time of battle/i.test(haystack)) return "booster";
  return "unknown";
}

function releaseProvenance(product, card, release, channel) {
  const description = extendedValue(product ?? {}, "Description") ?? "";
  if (/\breprint(?:ed)?\b/i.test(description) || /premium booster/i.test(product?.group?.name ?? "")) return "reprint";
  if (["promo", "event", "tournament", "anniversary"].includes(channel)) return "promotion";
  const cardPrefix = card.card_number.match(/^([A-Z]+)(\d+)/i);
  const originalCode = cardPrefix ? `${cardPrefix[1].toUpperCase()}-${cardPrefix[2]}` : null;
  if (release.code && originalCode === release.code.toUpperCase()) return "original_set";
  if (release.code && originalCode && originalCode !== release.code.toUpperCase()) return "reprint";
  return "unknown";
}

function competitionTier(markers) {
  for (const tier of ["winner", "champion", "finalist", "participation"]) {
    if (markers.includes(tier)) return tier;
  }
  return null;
}

function displayLabel(artworkClass, markers, channel) {
  if (artworkClass === "manga") return "Manga Art";
  if (markers.includes("red super alternate art")) return "Red Super Alternate Art";
  if (artworkClass === "super_alternate") return "Super Alternate Art";
  if (artworkClass === "wanted_poster") return "Wanted Poster";
  if (markers.includes("treasure rare")) return "Treasure Rare";
  if (markers.includes("special art")) return "Special Art";
  if (markers.includes("serialized")) return "Serialized";
  if (markers.includes("winner")) return "Winner";
  if (markers.includes("champion")) return "Champion";
  if (markers.includes("finalist")) return "Finalist";
  if (markers.includes("participation")) return "Participation";
  if (markers.includes("reprint")) return "Reprint";
  if (artworkClass === "alternate") return "Alternate Art";
  if (channel === "promo") return "Promo";
  if (channel === "event") return "Event Print";
  if (channel === "tournament") return "Tournament Print";
  return "Exact Print Unresolved";
}

function aliases(artworkClass, markers, label) {
  const values = [label.toLowerCase()];
  if (artworkClass === "manga") values.push("manga", "manga rare");
  if (artworkClass === "alternate") values.push("alternate art", "alt art");
  if (artworkClass === "super_alternate") values.push("super alternate", "super alt");
  if (artworkClass === "wanted_poster") values.push("wanted poster", "wanted");
  values.push(...markers.filter((marker) => !["foil", "promotion", "release event", "tournament"].includes(marker)));
  return [...new Set(values)];
}

function productEvidence(product) {
  if (!product) return [];
  return [
    {
      sourceType: "tcgcsv",
      url: `${TCGCSV_BASE}/${product.group.groupId}/products`,
      checkedAt: CHECKED_AT,
      supports: [
        "tcgplayerProductId", "tcgplayerGroupId", "tcgplayerGroupName",
        "tcgplayerProductName", "tcgplayerCollectorNumber",
      ],
    },
  ];
}

function notesFor(product, choiceReason, imageDistanceValue) {
  const notes = [];
  const description = extendedValue(product ?? {}, "Description") ?? "";
  if (/without (?:the )?original textured foil/i.test(description)) {
    notes.push("TCGplayer explicitly states that this reprint omits the original textured foil.");
  }
  if (/\bfoil\b/i.test(`${product?.name ?? ""} ${description}`)) {
    notes.push("Foil is retained as an exact marker because the requested treatments enum does not include foil.");
  }
  if (Number.isFinite(imageDistanceValue)) notes.push(`Official-to-TCGplayer image RMSE: ${imageDistanceValue.toFixed(2)}.`);
  if (choiceReason) notes.push(choiceReason);
  return notes.join(" ");
}

async function buildRecord(card, tcgcsv) {
  const release = parseRelease(card);
  const candidates = identityCandidates(card, tcgcsv.byNumber);
  let scoring = { official: null, rows: [] };
  let scoringError = null;
  try {
    scoring = await scoreProducts(card, candidates);
  } catch (error) {
    scoringError = error instanceof Error ? error.message : String(error);
  }
  const choice = scoringError
    ? { match: null, conflicts: [], reason: `Official image comparison failed: ${scoringError}` }
    : chooseProduct(scoring.rows, release);
  const match = choice.match?.product ?? null;
  const distance = choice.match?.distance ?? Number.POSITIVE_INFINITY;
  const markers = explicitMarkers(match, card, release);
  const artworkClass = classifyArtwork(markers);
  const channel = releaseChannel(match, card, release);
  const number = match ? extendedValue(match, "Number") : null;
  const normalizedNumberAgrees = match
    ? normalizeCollectorNumber(number) === normalizeCollectorNumber(card.card_number)
    : false;
  const normalizedNameAgrees = match
    ? normalizeText(match.name).includes(normalizeText(card.card_name))
    : false;
  const releaseAgrees = match ? productMatchesRelease(match, release) : false;
  const verified = Boolean(match && distance <= 32 && normalizedNumberAgrees && normalizedNameAgrees && releaseAgrees);
  const verification = verified ? "verified" : choice.conflicts.length > 0 ? "conflicting" : "unresolved";
  const confidence = verified && distance <= 22 ? "high" : verified ? "medium" : "low";
  const conflicts = [...choice.conflicts];
  if (match && !releaseAgrees) {
    conflicts.push({
      field: "releaseName",
      officialReleaseName: release.name,
      officialReleaseCode: release.code,
      tcgplayerGroupName: match.group.name,
      tcgplayerGroupId: match.group.groupId,
    });
  }

  const label = displayLabel(artworkClass, markers, channel);
  const compared = choice.match ?? choice.bestCandidate ?? null;
  const runnerUpDistance = choice.runnerUp?.distance ?? null;
  const bestDistance = compared?.distance ?? null;
  return {
    canonicalPrintId: card.image_name,
    cardNumber: card.card_number,
    cardName: card.card_name,
    language: "EN",
    artworkClass,
    treatments: treatments(markers, match),
    displayLabel: label,
    collectorAliases: aliases(artworkClass, markers, label),
    exactMarkers: markers,
    releaseName: release.name,
    releaseCode: release.code,
    releaseChannel: channel,
    releaseProvenance: releaseProvenance(match, card, release, channel),
    competitionTier: competitionTier(markers),
    officialImageUrl: card.image_url ?? null,
    tcgplayerProductId: match?.productId ?? null,
    tcgplayerGroupId: match?.group?.groupId ?? null,
    tcgplayerGroupName: match?.group?.name ?? null,
    tcgplayerProductName: match?.name ?? null,
    tcgplayerCollectorNumber: number,
    verification,
    confidence,
    humanReviewStatus: "pending",
    methodRevision: IMAGE_MATCH_METHOD,
    imageComparison: {
      officialSha256: scoring.official?.sha256 ?? null,
      officialWidth: scoring.official?.width ?? null,
      officialHeight: scoring.official?.height ?? null,
      tcgplayerSha256: compared?.image?.sha256 ?? null,
      tcgplayerWidth: compared?.image?.width ?? null,
      tcgplayerHeight: compared?.image?.height ?? null,
      bestDistance: Number.isFinite(bestDistance) ? Number(bestDistance.toFixed(2)) : null,
      runnerUpDistance: Number.isFinite(runnerUpDistance) ? Number(runnerUpDistance.toFixed(2)) : null,
      matchMargin: Number.isFinite(bestDistance) && Number.isFinite(runnerUpDistance)
        ? Number((runnerUpDistance - bestDistance).toFixed(2))
        : null,
      matchThreshold: IMAGE_MATCH_THRESHOLD,
      ambiguityMargin: IMAGE_AMBIGUITY_MARGIN,
    },
    releaseMatch: releaseMatchEvidence(match, release),
    evidence: [
      {
        sourceType: "secondary_catalog",
        url: SECONDARY_CATALOG,
        checkedAt: CHECKED_AT,
        supports: ["canonicalPrintId", "cardNumber", "cardName", "language", "releaseName", "releaseCode"],
      },
      {
        sourceType: "official_image",
        url: card.image_url,
        checkedAt: CHECKED_AT,
        supports: ["canonicalPrintId", "officialImageUrl", "imageComparison"],
      },
      ...productEvidence(match),
    ],
    conflicts,
    notes: notesFor(match, choice.reason, distance),
  };
}

function validate(records, tcgcsv) {
  const errors = [];
  const productMembership = new Map(tcgcsv.products.map((product) => [
    `${product.group.groupId}:${product.productId}`,
    product,
  ]));
  const printIds = new Set();
  for (const record of records) {
    if (printIds.has(record.canonicalPrintId)) errors.push(`Duplicate print id ${record.canonicalPrintId}`);
    printIds.add(record.canonicalPrintId);
    if (!record.officialImageUrl?.includes(record.canonicalPrintId)) {
      errors.push(`Official image URL does not contain print id ${record.canonicalPrintId}`);
    }
    if (record.verification !== "verified") continue;
    const product = productMembership.get(`${record.tcgplayerGroupId}:${record.tcgplayerProductId}`);
    if (!product) errors.push(`Product ${record.tcgplayerProductId} is not in group ${record.tcgplayerGroupId}`);
    if (normalizeCollectorNumber(record.tcgplayerCollectorNumber) !== normalizeCollectorNumber(record.cardNumber)) {
      errors.push(`Collector number mismatch for ${record.canonicalPrintId}`);
    }
    if (!normalizeText(record.tcgplayerProductName).includes(normalizeText(record.cardName))) {
      errors.push(`Product name mismatch for ${record.canonicalPrintId}`);
    }
  }
  if (errors.length > 0) throw new Error(`Validation failed:\n${errors.slice(0, 50).join("\n")}`);
}

export function markSharedProductMappings(records) {
  const byProduct = new Map();
  for (const record of records) {
    if (!record.tcgplayerGroupId || !record.tcgplayerProductId) continue;
    const key = `${record.tcgplayerGroupId}:${record.tcgplayerProductId}`;
    const rows = byProduct.get(key);
    if (rows) rows.push(record.canonicalPrintId);
    else byProduct.set(key, [record.canonicalPrintId]);
  }
  const shared = new Map([...byProduct].filter(([, printIds]) => printIds.length > 1));
  return records.map((record) => {
    const key = `${record.tcgplayerGroupId}:${record.tcgplayerProductId}`;
    const printIds = shared.get(key);
    if (record.verification !== "verified" || !printIds) return record;
    return {
      ...record,
      verification: "conflicting",
      confidence: "low",
      conflicts: [
        ...(record.conflicts ?? []),
        {
          reason: "shared_external_product_mapping",
          tcgplayerGroupId: record.tcgplayerGroupId,
          tcgplayerProductId: record.tcgplayerProductId,
          canonicalPrintIds: printIds,
        },
      ],
    };
  });
}

async function main() {
  const prints = candidatePrints();
  process.stderr.write(`Auditing ${prints.length} candidate English special prints.\n`);
  const tcgcsv = await loadTcgcsv();
  process.stderr.write(`Loaded ${tcgcsv.groups.length} TCGCSV groups and ${tcgcsv.products.length} products.\n`);
  let completed = 0;
  const records = markSharedProductMappings(await mapConcurrent(prints, CONCURRENCY, async (card) => {
    const record = await buildRecord(card, tcgcsv);
    completed += 1;
    if (completed % 100 === 0 || completed === prints.length) {
      process.stderr.write(`Audited ${completed}/${prints.length} prints.\n`);
    }
    return record;
  }));
  validate(records, tcgcsv);
  await mkdir(new URL("../output/", import.meta.url), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(records, null, 2)}\n`);
  const status = records.reduce((counts, record) => {
    counts[record.verification] = (counts[record.verification] ?? 0) + 1;
    return counts;
  }, {});
  process.stderr.write(`Wrote ${records.length} records to ${OUTPUT.pathname}. ${JSON.stringify(status)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
