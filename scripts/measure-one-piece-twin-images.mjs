// Explicitly invoked, bounded official-image research. Never imported by runtime.
// node scripts/measure-one-piece-twin-images.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { twinGroups, compareImages, robotsAllowsResearch } from "./lib/one-piece-twin-images.mjs";

const startedAt = new Date().toISOString();
const out = process.env.TWIN_IMAGE_OUTPUT ?? `docs/one-piece-twin-images-${startedAt.slice(0, 10)}.json`;
const catalogPath = "src/lib/external/one-piece-catalog.generated.json";
const catalogBytes = readFileSync(catalogPath);
const groups = twinGroups(JSON.parse(catalogBytes));
const cards = groups.flat();
const census = JSON.parse(readFileSync("src/lib/testing/one-piece-catalog-census.json", "utf8")).counts;
if (cards.length !== census.twinPrints || groups.length !== census.twinGroups) throw new Error("Catalog cohort changed; review the census before fetching");
const origin = "https://en.onepiece-cardgame.com";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const MAX_BYTES = 5 * 1024 * 1024;
const headers = { "User-Agent": "TCGlensTaxonomyResearch/1.0 (+https://lenstcg.com/method)" };
let stopReason = null;
async function boundedFetch(url, maxBytes = MAX_BYTES) {
  const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if ([401, 403, 429].includes(response.status)) stopReason = `Access boundary: HTTP ${response.status}`;
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new Error("Response exceeds byte limit");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Response exceeds byte limit");
    chunks.push(chunk);
  }
  return { response, bytes: Buffer.concat(chunks) };
}
const robots = { url: `${origin}/robots.txt`, observedAt: new Date().toISOString(), status: null, allowed: false };
try {
  const { response, bytes } = await boundedFetch(robots.url, 128 * 1024);
  Object.assign(robots, { status: response.status, sha256: hash(bytes), allowed: robotsAllowsResearch(response.status, bytes.toString("utf8")) });
} catch (error) { robots.error = error.message; }
if (!robots.allowed) stopReason = "Robots access could not be established";

const assets = new Map();
let next = 0;
let completed = 0;
async function worker() {
  while (next < cards.length) {
    const card = cards[next++];
    const record = { printId: card.card_image_id, url: card.card_image, observedAt: new Date().toISOString(), status: "error" };
    try {
      if (stopReason) throw new Error(stopReason);
      const url = new URL(card.card_image);
      if (url.origin !== origin || !/^\/images\/cardlist\/card\/[A-Za-z0-9_-]+\.png$/.test(url.pathname)
        || url.search || url.hash || url.username || url.password) throw new Error("Outside official catalog image allowlist");
      const { response, bytes } = await boundedFetch(url);
      record.httpStatus = response.status;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.headers.get("content-type")?.startsWith("image/")) throw new Error("Not an image response");
      const decoded = await sharp(bytes, { limitInputPixels: 20_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const vector = await sharp(bytes).resize(32, 45, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw().toBuffer();
      Object.assign(record, { status: "observed", byteLength: bytes.length, sha256: hash(bytes),
        width: decoded.info.width, height: decoded.info.height, pixelSha256: hash(decoded.data), vector });
    } catch (error) { record.error = error.message; }
    assets.set(card.card_image_id, record);
    completed++;
    if (completed % 50 === 0 || completed === cards.length) console.log(`Official images ${completed}/${cards.length}`);
    // Three workers, at most three requests in flight, no automatic retries.
    if (!stopReason) await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
await Promise.all(Array.from({ length: 3 }, worker));
const pairs = groups.flatMap((group) => group.flatMap((left, index) => group.slice(index + 1).map((right) => ({
  left: left.card_image_id, right: right.card_image_id, family: left.card_set_id, release: left.set_name,
  ...compareImages(assets.get(left.card_image_id), assets.get(right.card_image_id)),
}))));
const result = {
  mode: "research-only", claim: "Comparison of official reference image assets; no physical-print equivalence or merge approval",
  startedAt, completedAt: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  source: { catalogPath, catalogSha256: hash(catalogBytes), scriptSha256: hash(readFileSync(new URL(import.meta.url))) },
  method: { concurrency: 3, requestTimeoutMs: 15_000, maxBytes: MAX_BYTES, retries: 0, pixelHash: "native RGBA sha256 with dimensions checked", distance: "RGB RMSE of 32x45 fill-resized images; 0–255 scale; no equivalence threshold" },
  robots, stopReason,
  summary: { prints: cards.length, groups: groups.length, families: new Set(cards.map((card) => card.card_set_id)).size,
    imagesObserved: [...assets.values()].filter((asset) => asset.status === "observed").length,
    pairs: pairs.length, pairsCompared: pairs.filter((pair) => pair.status === "compared").length,
    byteIdenticalPairs: pairs.filter((pair) => pair.byteIdentical).length, pixelIdenticalPairs: pairs.filter((pair) => pair.pixelIdentical).length },
  images: [...assets.values()].map((asset) => { const record = { ...asset }; delete record.vector; return record; }), pairs,
};
writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: out, ...result.summary, stopReason }, null, 2));
if (result.summary.imagesObserved !== cards.length) process.exitCode = 2;
