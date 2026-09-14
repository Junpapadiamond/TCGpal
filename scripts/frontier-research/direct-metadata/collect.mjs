import { readMercariDocument } from "./mercari-dom.mjs";

/** Run only inside the supported browser REPL with an already selected tab.
 * No standalone browser, background job, HTTP fallback, or paid provider.
 * Review current robots rules before invoking. Only canonical listing paths
 * actually observed in this search are opened, never ref/tracking URLs.
 */
export async function collectMercariResearch(tab, query, { founderTriggered, robotsReviewedAt, maxDetails = 2 } = {}) {
  if (founderTriggered !== true || !/^\d{4}-\d{2}-\d{2}$/.test(robotsReviewedAt ?? "")
    || robotsReviewedAt !== new Date().toISOString().slice(0, 10)) throw new Error("An explicit research request and today's robots review are required.");
  if (typeof query !== "string" || !query.trim() || query.length > 200) throw new Error("A bounded card query is required.");
  const count = Math.max(1, Math.min(3, Math.floor(maxDetails) || 2));
  const searchUrl = `https://www.mercari.com/search/?keyword=${encodeURIComponent(query.trim())}`;
  const read = async () => tab.playwright.evaluate(`(${readMercariDocument.toString()})(document, ${JSON.stringify({
    sourceUrl: await tab.url(), observedAt: new Date().toISOString(), limit: 6,
  })})`);
  const observe = async (target, detail) => {
    const started = Date.now();
    try {
      await tab.goto(target);
      await tab.playwright.domSnapshot();
      let result = await read();
      if (result.status === "blocked") return { ...result, durationMs: Date.now() - started };
      // Condition-based readiness, not a fixed sleep or repeated navigation.
      const readySelector = detail ? 'script[type="application/ld+json"]' : 'a[data-testid="ProductThumbWrapper"]';
      try { await tab.playwright.locator(readySelector).first().waitFor({ state: "attached", timeoutMs: 8000 }); }
      catch { /* Record unavailable evidence without a request retry. */ }
      result = await read();
      return { ...result, durationMs: Date.now() - started };
    } catch {
      return { label: "frontier-research", status: "unavailable", sourceUrl: target,
        observedAt: new Date().toISOString(), acquisitionMethod: "browser-dom", evidenceState: "link-only",
        verifiedForRanking: false, fields: {}, discoveries: [], failure: "navigation-or-extraction-failed", durationMs: Date.now() - started };
    }
  };
  const search = await observe(searchUrl, false);
  const observations = [];
  if (search.status === "observed") {
    for (const discovery of search.discoveries.slice(0, count)) {
      const row = await observe(discovery.url, true);
      observations.push(row);
      if (row.status === "blocked") break;
    }
  }
  return { label: "frontier-research", query, robotsReviewedAt, search, observations,
    paidProviderCalls: 0, productionReady: false };
}
