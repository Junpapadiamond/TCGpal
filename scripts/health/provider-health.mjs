// Do the external sources still answer, and is their data fresh?
//
// Every product guarantee downstream of a provider is only as good as the
// provider's availability, and TCGlens hides none of it from the buyer — so it
// should not hide it from us either. Two of these numbers already caused
// user-visible bugs: pokemontcg.io answered 28 of 42 single-card requests with a
// 5xx on 2026-08-21, and a TCGCSV feed older than 48h is stale enough that
// listing-compare warns the buyer about it.
//
// Usage: node scripts/health/provider-health.mjs
import { FAIL, INCONCLUSIVE, PASS, pct, report, sleep } from "./lib/check.mjs";

const UA = { "User-Agent": "TCGlens-health/0.1 (+https://lenstcg.com)" };
const PROBES = Number(process.env.HEALTH_PROBES || 12);
// Below this, the catalog is not "flaky", it is down, and every identity lookup
// in the product is failing. Above it the adapters' own retries absorb the rest.
const MIN_CATALOG_SUCCESS = 0.15;
const TCGCSV_STALE_HOURS = 48;

async function probe(url, headers) {
  const started = Date.now();
  try {
    const response = await fetch(url, { headers });
    return { ok: response.ok, status: response.status, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, error: String(error) };
  }
}

const apiKey = process.env.POKEMON_TCG_API_KEY;
const catalogHeaders = apiKey ? { ...UA, "X-Api-Key": apiKey } : UA;

const catalog = [];
for (let i = 0; i < PROBES; i += 1) {
  catalog.push(await probe("https://api.pokemontcg.io/v2/cards/hsp-HGSS21", catalogHeaders));
  await sleep(600);
}
const catalogOk = catalog.filter((r) => r.ok).length;
const catalogRate = catalogOk / catalog.length;

const groups = await probe("https://tcgcsv.com/tcgplayer/3/groups", UA);
let tcgcsvAgeHours = null;
try {
  const response = await fetch("https://tcgcsv.com/last-updated.txt", { headers: UA });
  if (response.ok) {
    const at = new Date((await response.text()).trim());
    if (!Number.isNaN(at.getTime())) tcgcsvAgeHours = (Date.now() - at.getTime()) / 3.6e6;
  }
} catch { /* reported as unknown below */ }

const rows = [
  `pokemontcg.io  ${catalogOk}/${catalog.length} ok (${pct(catalogOk, catalog.length)})  ` +
    `statuses ${[...new Set(catalog.map((r) => r.status))].sort().join("/")}`,
  `tcgcsv groups  ${groups.ok ? `ok in ${groups.ms}ms` : `FAILED with ${groups.status}`}`,
  `tcgcsv feed    ${tcgcsvAgeHours === null ? "age unknown" : `${tcgcsvAgeHours.toFixed(1)}h old`}`,
];

// A dead TCGCSV means no market anchor for anyone, so it fails. A flaky
// pokemontcg.io is the normal state of that service and the adapters retry it;
// only a total outage is actionable.
const stale = tcgcsvAgeHours !== null && tcgcsvAgeHours > TCGCSV_STALE_HOURS;
const status = !groups.ok || stale
  ? FAIL
  : catalogRate < MIN_CATALOG_SUCCESS
    ? INCONCLUSIVE
    : PASS;

const headline = !groups.ok
  ? "TCGCSV is unreachable — every market anchor is degraded"
  : stale
    ? `TCGCSV feed is ${tcgcsvAgeHours.toFixed(1)}h old, past the ${TCGCSV_STALE_HOURS}h staleness the product warns on`
    : catalogRate < MIN_CATALOG_SUCCESS
      ? "pokemontcg.io is effectively down; identity lookups cannot be measured right now"
      : "all sources answering, feed fresh";

process.exit(report({ name: "provider-health", status, headline, rows, detail: { catalogRate, tcgcsvAgeHours } }));
