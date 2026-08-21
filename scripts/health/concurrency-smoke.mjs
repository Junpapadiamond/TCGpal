// Does the deployment still answer when several buyers arrive at once?
//
// The question this exists for is a concrete one: if five people are on the site
// together, does everyone get a report, or does someone get a 500, a rate limit,
// or a wait long enough that they leave? It is a smoke test, not a load test —
// one round, a handful of concurrent buyers, against a deployment that belongs
// to us. Raising HEALTH_CONCURRENCY turns it into something that can hurt the
// service; do that deliberately or not at all.
//
// A 429 is reported but never counted as a failure. The rate limiter working is
// the system defending itself correctly, not a regression — the failure is a 5xx
// or a request that never returns.
//
// Usage: TARGET=https://lenstcg.com node scripts/health/concurrency-smoke.mjs
import { buildCompareRequest } from "../lib/compare-probe.mjs";
import { FAIL, INCONCLUSIVE, PASS, percentile, report } from "./lib/check.mjs";

const BASE = process.env.TARGET || "https://lenstcg.com";
const CONCURRENCY = Number(process.env.HEALTH_CONCURRENCY || 5);
// Concurrency should cost queueing time, not correctness. If the slowest of five
// simultaneous reports takes more than this, buyers are being made to wait in a
// way a single-user measurement would never reveal.
const MAX_P95_MS = Number(process.env.HEALTH_MAX_P95_MS || 25_000);

// Distinct cards on purpose: one repeated card would be served from the
// 15-minute comparison cache and would measure the cache, not concurrency.
const CARDS = [
  { game: "pokemon", name: "Umbreon VMAX", setCode: "SWSH7", cardNumber: "215/203", query: "Umbreon VMAX 215/203", confirmedCardId: "swsh7-215" },
  { game: "pokemon", name: "Giratina V", setCode: "SWSH11", cardNumber: "186/196", query: "Giratina V 186/196", confirmedCardId: "swsh11-186" },
  { game: "pokemon", name: "Pikachu", setCode: "BASE1", cardNumber: "58/102", query: "Pikachu 58/102", confirmedCardId: "base1-58" },
  { game: "pokemon", name: "Suicune", setCode: "HSP", cardNumber: "HGSS21", query: "Suicune HGSS21", confirmedCardId: "hsp-HGSS21" },
  { game: "pokemon", name: "Mewtwo & Mew-GX", setCode: "SM11", cardNumber: "222/236", query: "Mewtwo & Mew-GX 222/236", confirmedCardId: "sm11-222" },
  { game: "pokemon", name: "Miriam", setCode: "SV1", cardNumber: "251/198", query: "Miriam 251/198", confirmedCardId: "sv1-251" },
  { game: "onePiece", name: "Nami", setCode: "OP-01", cardNumber: "OP01-016", query: "Nami OP01-016", confirmedCardId: "OP01-016_p8" },
  { game: "onePiece", name: "Monkey.D.Luffy", setCode: "OP-05", cardNumber: "OP05-119", query: "Monkey.D.Luffy OP05-119", confirmedCardId: "OP05-119_p2" },
];

async function oneBuyer(card, index) {
  const started = Date.now();
  try {
    const response = await fetch(`${BASE}/api/agent/listing-compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCompareRequest(card, card.confirmedCardId)),
    });
    const ms = Date.now() - started;
    if (!response.ok) return { index, card: card.query, ms, status: response.status, ok: false };
    const body = await response.json();
    return {
      index,
      card: card.query,
      ms: Date.now() - started,
      status: 200,
      ok: true,
      outcome: body.outcome ?? "unknown",
      anchored: typeof body.confirmedCard?.marketMid === "number",
    };
  } catch (error) {
    return { index, card: card.query, ms: Date.now() - started, status: 0, ok: false, error: String(error).slice(0, 90) };
  }
}

const wave = CARDS.slice(0, CONCURRENCY);
const started = Date.now();
const results = await Promise.all(wave.map((card, index) => oneBuyer(card, index)));
const wallMs = Date.now() - started;

const served = results.filter((result) => result.ok);
const limited = results.filter((result) => result.status === 429);
const failed = results.filter((result) => !result.ok && result.status !== 429);
const latencies = served.map((result) => result.ms);
const p95 = percentile(latencies, 95) ?? 0;

const rows = results
  .sort((a, b) => a.index - b.index)
  .map((result) => `${result.ok ? "ok  " : result.status === 429 ? "429 " : "FAIL"} ${String(result.ms).padStart(6)}ms  ` +
    `${result.card.padEnd(26)} ${result.ok ? `${result.outcome}${result.anchored ? "" : " (no anchor)"}` : `status ${result.status}${result.error ? ` ${result.error}` : ""}`}`);
rows.push("");
rows.push(`${wave.length} concurrent buyers: ${served.length} served, ${limited.length} rate limited, ${failed.length} failed  ` +
  `| slowest ${Math.max(0, ...latencies)}ms, p95 ${p95}ms, wall ${wallMs}ms`);

const status = served.length === 0
  ? INCONCLUSIVE
  : failed.length > 0 || p95 > MAX_P95_MS
    ? FAIL
    : PASS;

process.exit(report({
  name: "concurrency-smoke",
  status,
  headline: status === INCONCLUSIVE
    ? "no concurrent request was served"
    : failed.length > 0
      ? `${failed.length} of ${wave.length} concurrent buyers got an error`
      : p95 > MAX_P95_MS
        ? `all ${wave.length} served, but p95 ${p95}ms exceeds ${MAX_P95_MS}ms`
        : `${wave.length} concurrent buyers all served, p95 ${p95}ms`,
  rows,
  detail: { concurrency: wave.length, p95, wallMs, results },
}));
