// How long does each page take to answer?
//
// The buyer-facing number this protects is the wait before anything is on
// screen. It measures the server: time to first byte and time to the full HTML
// document, sampled several times per route. It does NOT measure browser render,
// hydration, or Core Web Vitals — that needs a real browser, and claiming
// otherwise would be exactly the kind of unsupported claim the product forbids.
//
// Cold starts are the point, not noise: a serverless route that has been idle is
// what the day's first buyer actually gets, so the first sample of each route is
// reported separately rather than averaged away.
//
// Usage: TARGET=https://lenstcg.com node scripts/health/page-timing.mjs
import { FAIL, INCONCLUSIVE, PASS, percentile, report, sleep } from "./lib/check.mjs";

const BASE = process.env.TARGET || "https://lenstcg.com";
const SAMPLES = Number(process.env.HEALTH_SAMPLES || 4);

// Budgets are for the document response, not the whole page experience.
const ROUTES = [
  { path: "/", budgetMs: 2500 },
  { path: "/method", budgetMs: 2500 },
];

async function timeOnce(url) {
  const started = Date.now();
  try {
    const response = await fetch(url, { headers: { "User-Agent": "TCGlens-health/0.1" }, redirect: "follow" });
    const ttfb = Date.now() - started;
    const body = await response.text();
    return { ok: response.ok, status: response.status, ttfb, total: Date.now() - started, bytes: body.length };
  } catch (error) {
    return { ok: false, status: 0, ttfb: null, total: Date.now() - started, error: String(error).slice(0, 100) };
  }
}

const rows = [];
const breaches = [];
let measuredRoutes = 0;

for (const route of ROUTES) {
  const url = new URL(route.path, BASE).toString();
  const samples = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    samples.push(await timeOnce(url));
    await sleep(500);
  }
  const ok = samples.filter((sample) => sample.ok);
  if (ok.length === 0) {
    rows.push(`${route.path.padEnd(10)} UNREACHABLE (${samples.map((s) => s.status).join("/")})`);
    breaches.push(`${route.path} unreachable`);
    continue;
  }
  measuredRoutes += 1;
  const totals = ok.map((sample) => sample.total);
  const p95 = percentile(totals, 95);
  const first = samples[0].total;
  const overBudget = p95 > route.budgetMs;
  if (overBudget) breaches.push(`${route.path} p95 ${p95}ms over ${route.budgetMs}ms`);
  rows.push(
    `${overBudget ? "OVER" : "    "} ${route.path.padEnd(10)} first ${String(first).padStart(5)}ms  ` +
    `median ${String(percentile(totals, 50)).padStart(5)}ms  p95 ${String(p95).padStart(5)}ms  ` +
    `budget ${route.budgetMs}ms  (${ok.length}/${samples.length} ok, ${Math.round(ok[0].bytes / 1024)}KB)`,
  );
}

const status = measuredRoutes === 0 ? INCONCLUSIVE : breaches.length > 0 ? FAIL : PASS;
process.exit(report({
  name: "page-timing",
  status,
  headline: status === INCONCLUSIVE
    ? "no route could be reached"
    : breaches.length > 0
      ? breaches.join("; ")
      : `every route answered inside its budget over ${SAMPLES} samples`,
  rows,
  detail: { base: BASE, samples: SAMPLES, breaches },
}));
