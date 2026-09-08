// Explicit, one-off reference research. Never imported by production.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { chooseProduct, productMatchesRelease } from "./research-one-piece-exact-prints.mjs";
import { robotsAllowsResearch } from "./lib/one-piece-twin-images.mjs";
import { referenceReviewStatus } from "./lib/one-piece-reference-review.mjs";

const day = new Date().toISOString().slice(0, 10);
const outputPath = `docs/one-piece-tcgplayer-alignment-${day}.json`;
const cacheDir = `output/tcgplayer-alignment-${day}`;
mkdirSync(cacheDir, { recursive: true });
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const catalog = read("src/lib/external/one-piece-catalog.generated.json");
const ledger = read("output/one-piece-exact-print-metadata.json");
const targets = read("docs/one-piece-ambiguity-review-2026-09-07.json").unresolvedPrints;
const ids = [...new Set([...targets.map((row) => row.printId), "EB02-010_p1"])];
if (ids.length !== 608) throw new Error("Review cohort changed; pin it before fetching");
const headers = { "User-Agent": "TCGlens-IdentityResearch/0.1.0 (+https://lenstcg.com/method)" };
const stoppedOrigins = new Map();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function bounded(url) {
  const origin = new URL(url).origin;
  if (stoppedOrigins.has(origin)) throw new Error(stoppedOrigins.get(origin));
  const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if ([401, 403, 429].includes(response.status)) stoppedOrigins.set(origin, `Access boundary: HTTP ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error("Response exceeds 8 MB limit");
    chunks.push(chunk);
  }
  return { response, bytes: Buffer.concat(chunks) };
}
async function json(url) {
  const path = `${cacheDir}/${hash(url)}.json`;
  if (existsSync(path)) return read(path);
  const { response, bytes } = await bounded(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const record = { url, observedAt: new Date().toISOString(), data: JSON.parse(bytes.toString("utf8")) };
  writeFileSync(path, JSON.stringify(record));
  await delay(150);
  return record;
}
const stamp = await bounded("https://tcgcsv.com/last-updated.txt");
if (!stamp.response.ok) throw new Error("TCGCSV freshness unavailable");
const feedAsOf = stamp.bytes.toString("utf8").trim();
const groups = (await json("https://tcgcsv.com/tcgplayer/68/groups")).data.results;
const wantedGroups = new Set([23496, 24305, 24736]);
for (const id of ids) {
  const old = ledger.find((row) => row.canonicalPrintId === id);
  for (const candidate of [old, ...(old?.conflicts ?? [])]) if (candidate?.tcgplayerGroupId) wantedGroups.add(candidate.tcgplayerGroupId);
}
for (const g of groups) if (/anime.*25th|world.*strongest/i.test(g.name)) wantedGroups.add(g.groupId);
const products = []; const failures = [];
for (const groupId of wantedGroups) {
  try {
    const group = groups.find((group) => group.groupId === groupId);
    if (!group) throw new Error("Group missing from current catalog");
    const p = await json(`https://tcgcsv.com/tcgplayer/68/${groupId}/products`);
    const prices = await json(`https://tcgcsv.com/tcgplayer/68/${groupId}/prices`);
    products.push(...p.data.results.map((product) => ({ ...product, group, observedAt: p.observedAt,
      pricesObservedAt: prices.observedAt, prices: prices.data.results.filter((price) => price.productId === product.productId) })));
  } catch (error) { failures.push({ groupId, error: error.message }); }
  console.log(`Catalog/price group ${groupId}: ${products.length} cumulative products`);
}
const normalize = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const number = (p) => p.extendedData?.find((field) => field.name === "Number")?.value ?? "";
const robots = [];
for (const origin of ["https://en.onepiece-cardgame.com", "https://tcgplayer-cdn.tcgplayer.com"]) {
  const previous = existsSync(outputPath) ? read(outputPath).robots.find((row) => row.origin === origin) : null;
  if (previous) {
    robots.push(previous);
    if (!previous.allowed) stoppedOrigins.set(origin, "Reference image research blocked by robots");
    continue;
  }
  try {
    const { response, bytes } = await bounded(`${origin}/robots.txt`);
    const allowed = robotsAllowsResearch(response.status, bytes.toString("utf8"));
    robots.push({ origin, status: response.status, allowed, observedAt: new Date().toISOString() });
    if (!allowed) stoppedOrigins.set(origin, "Reference image research blocked by robots");
  } catch (error) { stoppedOrigins.set(origin, error.message); robots.push({ origin, allowed: false, error: error.message }); }
}
const imagePromises = new Map();
async function image(url) {
  if (!imagePromises.has(url)) imagePromises.set(url, (async () => {
    const path = `${cacheDir}/image-${hash(url ?? "")}.json`;
    if (existsSync(path)) return read(path);
    let record = { url, observedAt: new Date().toISOString() };
    try {
      const parsed = new URL(url);
      if (!["en.onepiece-cardgame.com", "tcgplayer-cdn.tcgplayer.com"].includes(parsed.hostname)) throw new Error("Outside reference image allowlist");
      const { response, bytes } = await bounded(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.headers.get("content-type")?.startsWith("image/")) throw new Error("Not an image");
      const meta = await sharp(bytes, { limitInputPixels: 20_000_000 }).metadata();
      const vector = [...await sharp(bytes).resize(32, 45, { fit: "fill" }).removeAlpha().raw().toBuffer()];
      record = { ...record, status: "observed", sha256: hash(bytes), width: meta.width, height: meta.height, vector };
    } catch (error) { record = { ...record, status: "error", error: error.message }; }
    writeFileSync(path, JSON.stringify(record));
    return record;
  })());
  return imagePromises.get(url);
}
function distance(a, b) {
  if (a.status !== "observed" || b.status !== "observed" || a.vector.length !== b.vector.length) return Infinity;
  return Math.sqrt(a.vector.reduce((sum, value, index) => sum + (value - b.vector[index]) ** 2, 0) / a.vector.length);
}
function projection(row) {
  const p = row.product;
  return { productId: p.productId, groupId: p.group.groupId, groupName: p.group.name,
    name: p.name, collectorNumber: number(p), url: p.url, imageUrl: p.imageUrl,
    productObservedAt: p.observedAt, pricesObservedAt: p.pricesObservedAt, feedAsOf,
    priceReferences: p.prices.map((price) => ({ subtype: price.subTypeName, marketPrice: price.marketPrice ?? null })),
    imageDistance: Number.isFinite(row.distance) ? Number(row.distance.toFixed(3)) : null,
    imageStatus: row.image.status, imageSha256: row.image.sha256 ?? null };
}
const records = []; let next = 0;
async function worker() {
  while (next < ids.length) {
    const id = ids[next++];
    const card = catalog.find((card) => card.card_image_id === id);
    const old = ledger.find((row) => row.canonicalPrintId === id);
    const release = { name: card.set_name, code: old?.releaseCode ?? card.card_set_id.split("-")[0].replace(/([A-Z]+)(\d+)/, "$1-$2") };
    if (/^One Piece Card The Best$/i.test(card.set_name)) release.code = "PRB-01";
    if (/^One Piece Card The Best Vol.2$/i.test(card.set_name)) release.code = "PRB-02";
    const candidates = products.filter((p) => normalize(number(p)) === normalize(card.card_set_id) && normalize(p.name).includes(normalize(card.card_name)));
    const official = await image(card.card_image);
    const scored = [];
    // Sequential within a print; at most three print workers are active.
    for (const product of candidates) {
      const asset = await image(product.imageUrl);
      scored.push({ product, image: asset, distance: distance(official, asset) });
    }
    scored.sort((a, b) => a.distance - b.distance || a.product.productId - b.product.productId);
    const chosen = chooseProduct(scored, release);
    const candidate = chosen.match && productMatchesRelease(chosen.match.product, release) ? chosen.match : null;
    const relevant = scored.filter((row) => productMatchesRelease(row.product, release));
    const prior = scored.find((row) => row.product.productId === old?.tcgplayerProductId);
    const retained = [...new Set([...(candidate ? [candidate] : []), ...(prior ? [prior] : []), ...relevant.slice(0, 8), ...scored.slice(0, 3)])];
    const status = referenceReviewStatus({ productCount: candidates.length, officialObserved: official.status === "observed",
      observedProductImages: scored.filter((row) => row.image.status === "observed").length, uniqueCandidate: Boolean(candidate) });
    records.push({ printId: id, cardNumber: card.card_set_id, cardName: card.card_name, release: card.set_name,
      officialImageUrl: card.card_image, officialImageStatus: official.status, officialImageSha256: official.sha256 ?? null,
      status,
      candidateProductId: candidate?.product.productId ?? null,
      reason: status === "image_check_unavailable" ? "Fresh image check unavailable; do not interpret a source failure as absent products or inherently ambiguous artwork"
        : chosen.reason ?? (candidate ? "Image and release isolate a candidate; physical treatment and human review remain separate" : "No unique image and release match"),
      currentSameNumberProducts: candidates.length, candidates: retained.map(projection),
      priorProductId: old?.tcgplayerProductId ?? null,
      priorCandidateStillInCatalog: Boolean(prior), priorImageEvidenceDate: old?.evidence?.find((e) => e.sourceType === "official_image")?.checkedAt ?? null,
      priorImageComparison: old?.imageComparison ?? null, priorConflicts: old?.conflicts ?? [],
      humanReviewStatus: "pending", pageReviewStatus: "not_yet_opened" });
    if (records.length % 25 === 0 || records.length === ids.length) console.log(`Print review ${records.length}/${ids.length}`);
    await delay(150);
  }
}
await Promise.all(Array.from({ length: 3 }, worker));
records.sort((a, b) => a.printId.localeCompare(b.printId));
const owners = new Map();
for (const row of records) if (row.candidateProductId) owners.set(row.candidateProductId, [...(owners.get(row.candidateProductId) ?? []), row.printId]);
for (const row of records) if ((owners.get(row.candidateProductId)?.length ?? 0) > 1) {
  row.status = "shared_product_needs_review"; row.sharedWithPrints = owners.get(row.candidateProductId).filter((id) => id !== row.printId);
}
const result = { mode: "research-only", scope: "607 catalog abstentions plus user-reported EB02-010_p1", completedAt: new Date().toISOString(), feedAsOf,
  method: "One record per official print; fresh TCGplayer catalog/aggregate prices via TCGCSV, image candidate comparison using existing research thresholds; never automatic approval",
  sourceQueue: "docs/one-piece-ambiguity-review-2026-09-07.json", robots, failures,
  summary: { prints: records.length, counts: Object.fromEntries([...new Set(records.map((r) => r.status))].map((status) => [status, records.filter((r) => r.status === status).length])) }, records };
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.summary));
