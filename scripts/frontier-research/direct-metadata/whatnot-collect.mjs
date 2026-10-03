import robotsParser from "robots-parser";
import { pathToFileURL } from "node:url";
import { canonicalWhatnotListing, parseWhatnotMetadata, WHATNOT_MAX_HTML_BYTES, WHATNOT_ORIGIN } from "./whatnot-metadata.mjs";

const USER_AGENT = "TCGlensFrontierResearch/1.0";
const BLOCK_STATUSES = new Set([401, 403, 429]);

/** Explicit one-shot research only. At most robots + one search + three details.
 * Fixed public host, no redirects, cookies, auth, retry or paid provider.
 */
export async function collectWhatnotResearch(query, { founderTriggered, fetcher = fetch, timeoutMs = 8000 } = {}) {
  if (founderTriggered !== true) throw new Error("Explicit founder-triggered research is required.");
  if (typeof query !== "string" || !query.trim() || query.length > 200) throw new Error("A bounded card query is required.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000) throw new Error("Request timeout must be 1–8000 ms.");
  const searchUrl = `${WHATNOT_ORIGIN}/search?query=${encodeURIComponent(query.trim())}`;
  const startedAt = new Date().toISOString();
  const requests = [];
  const failure = (sourceUrl, code, blocked = true) => ({ label: "frontier-research", sourceUrl,
    observedAt: new Date().toISOString(), acquisitionMethod: "public-html-jsonld", status: blocked ? "blocked" : "unavailable",
    evidenceState: "link-only", verifiedForRanking: false, fields: {}, discoveries: [], failure: code });
  const request = async (url, robots = false) => {
    const controller = new AbortController();
    let reader;
    let timer;
    const start = Date.now();
    const trace = { sourceUrl: url, status: null, bytes: 0, durationMs: 0 };
    requests.push(trace);
    const expiry = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); void reader?.cancel().catch(() => {}); reject(new Error("request-timeout")); }, timeoutMs);
    });
    const acquire = async () => {
      const res = await fetcher(url, { signal: controller.signal, redirect: "manual", credentials: "omit",
        headers: { "User-Agent": USER_AGENT, Accept: robots ? "text/plain" : "text/html" } });
      trace.status = res.status;
      if (res.status !== 200) { void res.body?.cancel().catch(() => {}); throw new Error(`http-${res.status}`); }
      if (res.url && res.url !== url) { void res.body?.cancel().catch(() => {}); throw new Error("unexpected-response-url"); }
      if (!robots && !/^text\/html(?:\s*;|$)/i.test(res.headers.get("content-type") ?? "")) {
        void res.body?.cancel().catch(() => {}); throw new Error("unsupported-content-type");
      }
      const maxBytes = robots ? 128 * 1024 : WHATNOT_MAX_HTML_BYTES;
      if (Number(res.headers.get("content-length") ?? 0) > maxBytes) { void res.body?.cancel().catch(() => {}); throw new Error("response-too-large"); }
      if (!res.body) throw new Error("empty-response");
      reader = res.body.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        trace.bytes += value.byteLength;
        if (trace.bytes > maxBytes) { void reader.cancel().catch(() => {}); throw new Error("response-too-large"); }
        chunks.push(value);
      }
      return Buffer.concat(chunks).toString("utf8");
    };
    try { return { body: await Promise.race([acquire(), expiry]) }; }
    catch (error) {
      const known = /^(?:http-\d{3}|request-timeout|response-too-large|unexpected-response-url|unsupported-content-type|empty-response)$/;
      return { failure: known.test(error.message ?? "") ? error.message : "network-unavailable", blocked: BLOCK_STATUSES.has(trace.status) };
    } finally { clearTimeout(timer); trace.durationMs = Date.now() - start; }
  };
  const observations = [];
  const report = (search, robotsStatus) => ({ label: "frontier-research", query: query.trim(), startedAt,
    completedAt: new Date().toISOString(), robotsStatus, search, observations, requests,
    paidProviderCalls: 0, productionReady: false, userAgent: USER_AGENT });
  const robotsUrl = `${WHATNOT_ORIGIN}/robots.txt`;
  const robotsResponse = await request(robotsUrl, true);
  if (robotsResponse.failure || !/^\s*user-agent\s*:/im.test(robotsResponse.body) || /<html/i.test(robotsResponse.body)) {
    return report(failure(searchUrl, "robots-unavailable"), { sourceUrl: robotsUrl, failure: robotsResponse.failure ?? "invalid-robots-document" });
  }
  const rules = robotsParser(robotsUrl, robotsResponse.body);
  const allowed = (url) => rules.isAllowed(url, USER_AGENT) === true;
  const robotsStatus = { sourceUrl: robotsUrl, observedAt: new Date().toISOString(), userAgent: USER_AGENT, checked: true };
  if (!allowed(searchUrl)) return report(failure(searchUrl, "robots-disallowed"), robotsStatus);
  if (rules.getCrawlDelay(USER_AGENT) > 0) return report(failure(searchUrl, "robots-crawl-delay-not-supported"), robotsStatus);
  const observe = async (url) => {
    const res = await request(url);
    if (res.failure) return failure(url, res.failure, res.blocked);
    return parseWhatnotMetadata(res.body, { sourceUrl: url, observedAt: new Date().toISOString() });
  };
  const search = await observe(searchUrl);
  if (search.status === "observed") {
    for (const discovery of search.discoveries.slice(0, 3)) {
      const target = canonicalWhatnotListing(discovery.url);
      if (!target || !allowed(target)) { observations.push(failure(discovery.url, "robots-disallowed")); break; }
      const observation = await observe(target);
      observations.push(observation);
      // Any failed detail ends the bounded experiment; never try another route.
      if (observation.status !== "observed") break;
    }
  }
  return report(search, robotsStatus);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--founder-triggered") throw new Error('Usage: node whatnot-collect.mjs --founder-triggered "card query"');
  const result = await collectWhatnotResearch(args[1], { founderTriggered: true });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
