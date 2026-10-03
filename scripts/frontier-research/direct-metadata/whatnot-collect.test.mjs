import { describe, expect, it, vi } from "vitest";
import { collectWhatnotResearch } from "./whatnot-collect.mjs";

const options = { founderTriggered: true };
const response = (body, status = 200, type = "text/html") => new Response(body, { status, headers: { "content-type": type } });
const robots = () => response("User-agent: *\nAllow: /\n", 200, "text/plain");
const search = () => response(Array.from({ length: 8 }, (_, i) => `<a href="/listing/card-${i}">Card ${i}</a>`).join(""));

describe("bounded Whatnot HTTP research collector", () => {
  it("requires an explicit request before network access", async () => {
    const fetcher = vi.fn();
    await expect(collectWhatnotResearch("Giratina", { fetcher })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("checks robots first and never fetches a prohibited search or listing", async () => {
    const fetcher = vi.fn(async () => response("User-agent: *\nDisallow: /search\n", 200, "text/plain"));
    const report = await collectWhatnotResearch("Giratina", { ...options, fetcher });
    expect(report.search.failure).toBe("robots-disallowed");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("fails closed on missing robots evidence and HTTP access blocks without fallback or retry", async () => {
    const missing = vi.fn(async () => response("No robots", 404));
    expect((await collectWhatnotResearch("Giratina", { ...options, fetcher: missing })).search.failure).toBe("robots-unavailable");
    const blocked = vi.fn().mockResolvedValueOnce(robots()).mockResolvedValueOnce(response("Denied", 403));
    const report = await collectWhatnotResearch("Giratina", { ...options, fetcher: blocked });
    expect(report.search).toMatchObject({ status: "blocked", failure: "http-403" });
    expect(blocked).toHaveBeenCalledTimes(2);
  });
  it("bounds five summaries and three detail requests, disables redirects/cookies, and never creates ranking evidence", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(robots()).mockResolvedValueOnce(search())
      .mockImplementation(async (url) => response(`<h1>Card</h1><script type="application/ld+json">${JSON.stringify({
        "@type": "Product", name: "Card", offers: { "@type": "Offer", url, price: "10.00", priceCurrency: "USD" },
      })}</script>`));
    const report = await collectWhatnotResearch("Giratina", { ...options, fetcher });
    expect(report.search.discoveries).toHaveLength(5);
    expect(report.observations).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledTimes(5);
    for (const [, init] of fetcher.mock.calls) expect(init).toMatchObject({ redirect: "manual", credentials: "omit" });
    expect(report.productionReady).toBe(false);
    expect(report.paidProviderCalls).toBe(0);
  });
  it("stops the whole detail loop on a challenge, and obeys detail-path robots exclusions", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(robots()).mockResolvedValueOnce(search())
      .mockResolvedValueOnce(response("<h1>Just a moment...</h1>"));
    expect((await collectWhatnotResearch("Giratina", { ...options, fetcher })).observations).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const restricted = vi.fn().mockResolvedValueOnce(response("User-agent: *\nDisallow: /listing/\n", 200, "text/plain"))
      .mockResolvedValueOnce(search());
    const report = await collectWhatnotResearch("Giratina", { ...options, fetcher: restricted });
    expect(report.observations[0].failure).toBe("robots-disallowed");
    expect(restricted).toHaveBeenCalledTimes(2);
  });
  it("includes body reading in the byte and time limits", async () => {
    const oversized = vi.fn().mockResolvedValueOnce(robots()).mockResolvedValueOnce(response("x".repeat(1024 * 1024 + 1)));
    expect((await collectWhatnotResearch("Giratina", { ...options, fetcher: oversized })).search.failure).toBe("response-too-large");
    const hanging = vi.fn().mockResolvedValueOnce(robots()).mockResolvedValueOnce(new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "text/html" } }));
    expect((await collectWhatnotResearch("Giratina", { ...options, fetcher: hanging, timeoutMs: 20 })).search.failure).toBe("request-timeout");
  });
  it("does not follow redirects, and fails closed on a robots crawl delay this one-shot harness does not schedule", async () => {
    const redirect = vi.fn().mockResolvedValueOnce(robots()).mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://www.whatnot.com/login" } }));
    expect((await collectWhatnotResearch("Giratina", { ...options, fetcher: redirect })).search.failure).toBe("http-302");
    expect(redirect).toHaveBeenCalledTimes(2);
    const delayed = vi.fn().mockResolvedValueOnce(response("User-agent: *\nAllow: /\nCrawl-delay: 10\n", 200, "text/plain"));
    expect((await collectWhatnotResearch("Giratina", { ...options, fetcher: delayed })).search.failure).toBe("robots-crawl-delay-not-supported");
    expect(delayed).toHaveBeenCalledTimes(1);
  });
});
