import { describe, expect, it, vi } from "vitest";
import { collectMercariResearch } from "./collect.mjs";

const options = { founderTriggered: true, robotsReviewedAt: new Date().toISOString().slice(0, 10), maxDetails: 2 };
function tabFor(results) {
  let current;
  return { goto: vi.fn(async (url) => { current = url; }), url: async () => current,
    playwright: { domSnapshot: vi.fn(async () => "observed DOM"),
      evaluate: vi.fn(async () => results[current]), locator: () => ({ first: () => ({ waitFor: async () => {} }) }) } };
}
describe("founder-triggered bounded Mercari browser collector", () => {
  it("follows only observed listing URLs and stops immediately on an access block", async () => {
    const searchUrl = "https://www.mercari.com/search/?keyword=Pikachu";
    const listing = "https://www.mercari.com/us/item/m123/";
    const tab = tabFor({ [searchUrl]: { status: "observed", discoveries: [{ url: listing }, { url: "https://www.mercari.com/us/item/m456/" }] },
      [listing]: { status: "blocked", fields: {} } });
    const report = await collectMercariResearch(tab, "Pikachu", options);
    expect(tab.goto.mock.calls).toEqual([[searchUrl], [listing]]);
    expect(report.observations).toHaveLength(1);
    expect(report.productionReady).toBe(false);
  });
  it("does not start without explicit research context or a current robots review", async () => {
    const tab = tabFor({});
    await expect(collectMercariResearch(tab, "Pikachu", { ...options, founderTriggered: false })).rejects.toThrow();
    await expect(collectMercariResearch(tab, "Pikachu", { ...options, robotsReviewedAt: "2000-01-01" })).rejects.toThrow();
    expect(tab.goto).not.toHaveBeenCalled();
  });
});
