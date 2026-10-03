import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasSoldgraphCredentials, parseSoldgraphListings, searchSoldgraphListings } from "./soldgraph";
import { reserveSoldgraphSearch } from "./soldgraph-budget";
import { clearLocalCache, setJsonCache } from "@/lib/ops/cache";
import { demoIdentities } from "@/lib/comparison/fixtures";
import { normalizeListing, rankListings } from "@/lib/comparison/ranking";

vi.mock("./soldgraph-budget", () => ({ reserveSoldgraphSearch: vi.fn() }));
vi.mock("@/lib/ops/redis", () => ({ getRedisClient: () => null }));
const card = demoIdentities[0];
const query = "Umbreon VMAX 215/203";
const now = new Date("2026-10-03T14:00:00Z");
const requestId = "test-job-id";
const mercari = { id: "m123", title: query, link: "https://www.mercari.com/us/item/m123/", condition: "Like New",
  displayed_price: { amount: 123.45, currency: "USD" }, seller_text: "PRIVATE_SELLER", image: "https://u-mercari-images.mercdn.net/photo.jpg" };
const whatnot = { ...mercari, id: "TGlzdGluZzox==", link: "https://www.whatnot.com/listing/TGlzdGluZzox==",
  image: "https://images.whatnot.com/listing-preview?signature=test-public-image-signature",
  condition: "Near Mint", quantity: 1, grading_service: null, grade: null, card_set: "Evolving Skies", card_number: "215/203", language: "English" };
function page(provider: "mercari" | "whatnot", data: unknown[] = [provider === "mercari" ? mercari : whatnot], overrides = {}) {
  return { provider, country: "us", query, page: 1, count: data.length, collected_at: now.toISOString(), schema_version: 2,
    completeness: "provider_page_only", data, ...overrides };
}
const complete = (provider: "mercari" | "whatnot", overrides = {}) => ({ request_id: requestId, status: "complete", credits: 1, cached: false, result: page(provider), ...overrides });
const pending = { request_id: requestId, status: "pending", credits: 0, cached: false, poll_url: `/v1/jobs/${requestId}` };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); clearLocalCache();
  vi.stubEnv("SOLDGRAPH_ENABLED", "1"); vi.stubEnv("SOLDGRAPH_API_KEY", "sg_test_only");
  vi.mocked(reserveSoldgraphSearch).mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Soldgraph source facts", () => {
  it("requires its own explicit flag and server credential", () => {
    expect(hasSoldgraphCredentials()).toBe(true);
    vi.stubEnv("SOLDGRAPH_ENABLED", "0");
    expect(hasSoldgraphCredentials()).toBe(false);
    vi.stubEnv("SOLDGRAPH_ENABLED", "1"); vi.stubEnv("SOLDGRAPH_API_KEY", "");
    expect(hasSoldgraphCredentials()).toBe(false);
  });

  it("retains USD dollar amounts, original observation time and unknown charges without seller data", () => {
    const [seed] = parseSoldgraphListings(page("mercari"), "mercari", card, query, now);
    expect(seed).toMatchObject({ id: "mercari-m123", price: 123.45, shipping: null, buyerFee: null,
      claimedCondition: "Unknown", observedAt: now.toISOString(), demo: false, active: true,
      seller: { feedbackCount: null, feedbackPercentage: null }, evidence: { photoCount: 0 } });
    expect(JSON.stringify(seed)).not.toContain("PRIVATE_SELLER");
    expect(seed.imageUrl).toBe(mercari.image);
    expect(seed.imageKind).toBe("listing_preview");
    // A listing preview is visible without becoming condition-photo evidence.
    expect(seed.imageUrls).toEqual([]);
  });

  it.each(["mercari", "whatnot"] as const)("retains the documented %s primary preview without increasing evidence scores", marketplace => {
    const row = marketplace === "mercari" ? mercari : whatnot;
    const [preview] = parseSoldgraphListings(page(marketplace, [{ ...row,
      images: ["https://evil.test/fake-gallery.jpg"], image_urls: ["https://evil.test/fake-gallery.jpg"] }]), marketplace, card, query, now);
    const [withoutPreview] = parseSoldgraphListings(page(marketplace, [{ ...row, image: null }]), marketplace, card, query, now);
    expect(preview).toMatchObject({ imageUrl: row.image, imageKind: "listing_preview", imageUrls: [], evidence: { photoCount: 0,
      frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false } });
    expect(withoutPreview).toMatchObject({ imageUrl: null, imageKind: "unknown", imageUrls: [] });
    const context = { buyer: { country: "US" as const, desiredCondition: "Near Mint" as const, postalCode: "", taxRate: null }, confirmedCard: card, cardLanguage: card.language };
    const normalizedPreview = normalizeListing({ listing: preview, ...context });
    const normalizedWithout = normalizeListing({ listing: withoutPreview, ...context });
    expect(normalizedPreview.imageKind).toBe("listing_preview");
    expect(normalizedPreview.evidenceCompletenessScore).toBe(normalizedWithout.evidenceCompletenessScore);
    expect(normalizedPreview.costComplete).toBe(false);
    expect(rankListings([normalizedPreview])).toEqual([]);
  });

  it.each([
    "http://u-mercari-images.mercdn.net/photo.jpg", "https://evil.test/photo.jpg",
    "https://u-mercari-images.mercdn.net.evil.test/photo.jpg", "https://127.0.0.1/photo.jpg",
    "https://u-mercari-images.mercdn.net:8443/photo.jpg", "https://name:password@u-mercari-images.mercdn.net/photo.jpg",
    "https://u-mercari-images.mercdn.net/photo.jpg#private", "https://images.whatnot.com/wrong-marketplace.jpg",
    "javascript:alert(1)", "data:image/png;base64,invalid", "", "not a URL",
  ])("discards an unsafe preview without discarding the asking-price offer: %s", image => {
    const [seed] = parseSoldgraphListings(page("mercari", [{ ...mercari, image }]), "mercari", card, query, now);
    expect(seed).toMatchObject({ imageUrl: null, imageKind: "unknown", imageUrls: [], price: 123.45, shipping: null, buyerFee: null });
  });

  it("rejects an unreviewed Mercari CDN image on either marketplace", () => {
    const image = "https://static.mercdn.net/item/detail/orig/photos/m123.jpg";
    const [seed] = parseSoldgraphListings(page("mercari", [{ ...mercari, image }]), "mercari", card, query, now);
    expect(seed.imageUrl).toBeNull();
    const [wrongMarketplace] = parseSoldgraphListings(page("whatnot", [{ ...whatnot, image }]), "whatnot", card, query, now);
    expect(wrongMarketplace.imageUrl).toBeNull();
  });

  it.each([undefined, 123, {}, "x".repeat(4097)])("rejects a changed upstream image-field contract", image => {
    expect(() => parseSoldgraphListings(page("mercari", [{ ...mercari, image }]), "mercari", card, query, now)).toThrow(/schema/);
  });

  it("uses explicit Whatnot card claims while withholding complete-cost winners", () => {
    const [seed] = parseSoldgraphListings(page("whatnot"), "whatnot", card, query, now);
    expect(seed).toMatchObject({ price: 123.45, claimedCondition: "Near Mint", listingLanguage: "English" });
    const listing = normalizeListing({ listing: seed, buyer: { country: "US", desiredCondition: "Near Mint", postalCode: "", taxRate: null }, confirmedCard: card, cardLanguage: card.language });
    expect(listing.costComplete).toBe(false);
    expect(rankListings([listing])).toEqual([]);
  });

  it("retains contradictory language and number claims for deterministic rejection", () => {
    const [seed] = parseSoldgraphListings(page("whatnot", [{ ...whatnot, language: "Japanese", card_number: "216/203" }]), "whatnot", card, query, now);
    const listing = normalizeListing({ listing: seed, buyer: { country: "US", desiredCondition: "Near Mint", postalCode: "", taxRate: null }, confirmedCard: card, cardLanguage: card.language });
    expect(listing.eligible).toBe(false);
    expect(listing.eligibilityIssues.some(issue => issue.code === "language_conflict")).toBe(true);
    expect(seed.matchAspectText).toContain("216/203");
  });

  it.each([
    { quantity: 0 }, { grade: "10" }, { grading_service: "PSA" }, { condition: "Graded" },
    { title: `${query} PSA 10` }, { title: `${query} AGS 10 Gem Mint` }, { displayed_price: null }, { displayed_price: { amount: 0, currency: "USD" } },
    { displayed_price: { amount: 12.345, currency: "USD" } }, { status: "sold" }, { transaction_type: "auction" },
  ])("drops unavailable, graded, ranged and invalid-price Whatnot rows: %j", override => {
    expect(parseSoldgraphListings(page("whatnot", [{ ...whatnot, ...override }]), "whatnot", card, query, now)).toEqual([]);
  });

  it.each([
    { provider: "whatnot" }, { country: "jp" }, { query: "different" }, { page: 2 }, { count: 2 },
    { collected_at: "2026-10-03T13:40:00Z" }, { collected_at: "2026-10-03T14:02:00Z" }, { schema_version: 3 },
    { data: [{ ...mercari, link: "https://evil.test/us/item/m123/" }] },
    { data: [{ ...mercari, displayed_price: { amount: 123, currency: "JPY" } }] },
  ])("rejects conflicting envelopes, URLs, currencies or stale facts: %j", override => {
    expect(() => parseSoldgraphListings(page("mercari", [mercari], override), "mercari", card, query, now)).toThrow(/schema|stale/);
  });
});

describe("bounded Soldgraph API acquisition", () => {
  it("refreshes image-less seeds written by the previous adapter cache contract", async () => {
    const [oldSeed] = parseSoldgraphListings(page("mercari", [{ ...mercari, image: null }]), "mercari", card, query, now);
    await setJsonCache("soldgraph-listings", JSON.stringify(["v1", "mercari", card.id, card.language, query]),
      { observedAt: now.toISOString(), seeds: [oldSeed] }, { ttlSeconds: 900 });
    const fetcher = vi.fn(async () => Response.json(complete("mercari")));
    const [seed] = await searchSoldgraphListings("mercari", card, fetcher, query);
    expect(seed.imageUrl).toBe(mercari.image);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("coalesces requests, uses one fixed-host page of three, and caches sanitized timestamps", async () => {
    const fetcher = vi.fn(async () => Response.json(complete("mercari")));
    const results = await Promise.all([searchSoldgraphListings("mercari", card, fetcher, query), searchSoldgraphListings("mercari", card, fetcher, query)]);
    expect(results[0]).toEqual(results[1]);
    expect(await searchSoldgraphListings("mercari", card, fetcher, query)).toEqual(results[0]);
    expect(fetcher).toHaveBeenCalledOnce(); expect(reserveSoldgraphSearch).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin).toBe("https://api.soldgraph.com"); expect(url.pathname).toBe("/v1/mercari/listings");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: query, count: "3", page: "1", country: "us", sort: "best_match" });
    expect(init).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer sg_test_only" } });
    expect(url.href).not.toContain("sg_test_only");
  });

  it("does not contact a provider when disabled or the shared free allowance is unavailable", async () => {
    const fetcher = vi.fn();
    vi.stubEnv("SOLDGRAPH_ENABLED", "0");
    await expect(searchSoldgraphListings("mercari", card, fetcher, query)).rejects.toThrow(/not enabled/);
    vi.stubEnv("SOLDGRAPH_ENABLED", "1");
    vi.mocked(reserveSoldgraphSearch).mockRejectedValueOnce(new Error("allowance unavailable"));
    await expect(searchSoldgraphListings("mercari", card, fetcher, query)).rejects.toThrow(/allowance/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("polls the same validated job once without another reservation or search", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(pending, { status: 202, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(Response.json(complete("whatnot")));
    const result = searchSoldgraphListings("whatnot", card, fetcher, query);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(reserveSoldgraphSearch).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[1][0])).toBe(`https://api.soldgraph.com/v1/jobs/${requestId}?wait=20`);
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe(fetcher.mock.calls[1][1].headers["Idempotency-Key"]);
  });

  it("does not follow an untrusted poll URL or restart a pending search", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...pending, poll_url: "https://evil.test/secret" }, { status: 202 }));
    await expect(searchSoldgraphListings("whatnot", card, fetcher, query)).rejects.toThrow(/schema/);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("allows a cold search to finish in one long poll inside the overall deadline", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(pending, { status: 202, headers: { "retry-after": "2" } }))
      .mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 12_000));
        return Response.json(complete("whatnot"));
      });
    const result = searchSoldgraphListings("whatnot", card, fetcher, query);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(await result).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(reserveSoldgraphSearch).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[1][0])).toContain("?wait=20");
  });

  it("keeps failed requests uncached and redacts provider failure bodies", async () => {
    const fetcher = vi.fn(async () => new Response("sg_test_only PRIVATE_UPSTREAM", { status: 403 }));
    await expect(searchSoldgraphListings("mercari", card, fetcher, query)).rejects.toThrow("Soldgraph returned HTTP 403.");
    await expect(searchSoldgraphListings("mercari", card, fetcher, query)).rejects.toThrow("Soldgraph returned HTTP 403.");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refreshes at the original observation expiry instead of extending cached inventory freshness", async () => {
    const fetcher = vi.fn(async () => Response.json(complete("mercari", { result: page("mercari", [mercari], { collected_at: new Date().toISOString() }) })));
    await searchSoldgraphListings("mercari", card, fetcher, query);
    vi.setSystemTime(new Date(now.getTime() + 14 * 60_000));
    await searchSoldgraphListings("mercari", card, fetcher, query);
    expect(fetcher).toHaveBeenCalledOnce();
    vi.setSystemTime(new Date(now.getTime() + 15 * 60_000));
    const rows = await searchSoldgraphListings("mercari", card, fetcher, query);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(rows[0].observedAt).toBe(new Date().toISOString());
  });

  it("ends pending or failed jobs without a replacement query or fake empty inventory", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(pending, { status: 202 }))
      .mockResolvedValueOnce(Response.json(pending, { status: 202 }));
    const outcome = searchSoldgraphListings("whatnot", card, fetcher, query).catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await outcome).toMatch(/pending/);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(reserveSoldgraphSearch).toHaveBeenCalledOnce();
  });

  it.each([true, false])("cancels oversized declared or streaming response bodies (declared=%s)", async declared => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1_000_001)); }, cancel });
    const fetcher = vi.fn(async () => new Response(stream, { headers: declared ? { "content-length": "1000001" } : {} }));
    await expect(searchSoldgraphListings("mercari", card, fetcher, query)).rejects.toThrow(/size limit/);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("bounds a hanging body by the deadline and cancels its stream", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ pull: () => new Promise(() => undefined), cancel })));
    const result = searchSoldgraphListings("mercari", card, fetcher, query).then(() => "wrong", (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatch(/timed out/);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
