import { describe, expect, it, vi } from "vitest";
import { assessPhotoIdentity, buildPhotoResearchRequest, inspectPhotoPairs } from "./client.mjs";

const pair = {
  id: "ace-alt", listingUrl: "https://www.ebay.com/itm/158307192401",
  observedAt: "2026-11-05T01:21:00.000Z", observedTimePrecision: "minute",
  sellerImageUrl: "https://i.ebayimg.com/images/g/SMUAAeSwEu1qrbFd/s-l500.webp",
  referenceImageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP07-119_p1.png",
  expected: { printId: "OP07-119_p1", collectorNumber: "OP07-119", cost: "10", power: "10000" },
};
const field = value => ({ value, confidence: "high" });
const observation = (overrides = {}) => ({
  id: pair.id,
  seller: { collectorNumber: field("OP07-119"), cost: field("10"), power: field("10000") },
  reference: { collectorNumber: field("OP07-119"), cost: field("10"), power: field("10000") },
  artwork: { relation: "same", confidence: "high", evidence: "The pose and background agree." },
  ...overrides,
});

describe("isolated One Piece photo identity research", () => {
  it("never promotes a matching-looking photo to exact-print or buying eligibility", () => {
    expect(assessPhotoIdentity(pair, observation())).toMatchObject({
      status: "no_conflict_observed", verifiedForRanking: false, productionReady: false,
    });
  });
  it("flags the observed number and printed-stat contradiction independently of the title", () => {
    expect(assessPhotoIdentity(pair, observation({ seller: {
      collectorNumber: field("OP16-118"), cost: field("5"), power: field("6000"),
    } }))).toMatchObject({ status: "candidate_conflict", conflicts: ["collectorNumber", "cost", "power"] });
  });
  it("does not turn a single OCR disagreement or uncertain artwork into an automatic rejection", () => {
    expect(assessPhotoIdentity(pair, observation({ seller: {
      collectorNumber: { value: "OP16-118", confidence: "low" }, cost: field("10"), power: field("10000"),
    } }))).toMatchObject({ status: "unverified" });
    expect(assessPhotoIdentity(pair, observation({ artwork: {
      relation: "different", confidence: "high", evidence: "Different pose, same printed number.",
    } }))).toMatchObject({ status: "needs_visual_review", verifiedForRanking: false });
  });
  it("rejects a reference read that conflicts with the catalog instead of blaming the listing", () => {
    expect(assessPhotoIdentity(pair, observation({ reference: {
      collectorNumber: field("OP16-118"), cost: field("5"), power: field("6000"),
    } }))).toMatchObject({ status: "invalid_reference_read", conflicts: [] });
  });
  it("requires an explicit founder trigger and restricts pairs to five observed eBay/official images", async () => {
    const fetcher = vi.fn();
    const model = vi.fn();
    for (const input of [
      { founderTriggered: false, pairs: [pair] },
      { founderTriggered: true, pairs: Array.from({ length: 6 }, (_, index) => ({ ...pair, id: String(index) })) },
      { founderTriggered: true, pairs: [{ ...pair, sellerImageUrl: "http://127.0.0.1/private" }] },
      { founderTriggered: true, pairs: [{ ...pair, sellerImageUrl: "https://i.ebayimg.com.evil.test/a.jpg" }] },
      { founderTriggered: true, pairs: [{ ...pair, referenceImageUrl: "https://example.test/card.png" }] },
      { founderTriggered: true, pairs: [pair, pair] },
    ]) await expect(inspectPhotoPairs(input, { fetcher, model })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
  });
  it("does not put expected labels, titles, prices or seller identifiers in the visual prompt", () => {
    const request = buildPhotoResearchRequest([{ ...pair, privateSellerName: "DO_NOT_SEND" }],
      [[{ mediaType: "image/png", base64: "a" }, { mediaType: "image/png", base64: "b" }]]);
    expect(JSON.stringify(request)).not.toMatch(/OP07-119|DO_NOT_SEND|ace-alt|ebay\.com|14\.99/);
    expect(request.content.filter(block => block.type === "image")).toHaveLength(2);
  });
  it("makes one model call for the bounded batch and retains only schema-checked research evidence", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const fetcher = vi.fn(async () => new Response(png, { headers: { "content-type": "image/png" } }));
    const model = vi.fn(async () => ({ pairs: [observation({ id: "pair-1" })] }));
    const result = await inspectPhotoPairs({ founderTriggered: true, pairs: [pair] }, { fetcher, model });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([, options]) => options.redirect === "error")).toBe(true);
    expect(model).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ mode: "frontier-research", productionReady: false, modelCalls: 1,
      observations: [{ status: "no_conflict_observed", verifiedForRanking: false }] });
    expect(JSON.stringify(result)).not.toMatch(/base64|iVBOR/);
  });
  it("stops without model calls on denied, oversized, or non-image responses", async () => {
    for (const response of [new Response("denied", { status: 403 }),
      new Response("html", { headers: { "content-type": "text/html" } }),
      new Response("large", { headers: { "content-type": "image/png", "content-length": "2097153" } })]) {
      const model = vi.fn();
      await expect(inspectPhotoPairs({ founderTriggered: true, pairs: [pair] },
        { fetcher: vi.fn(async () => response.clone()), model })).rejects.toThrow();
      expect(model).not.toHaveBeenCalled();
    }
  });
  it("refuses model output for another pair rather than silently attaching it", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetcher = vi.fn(async () => new Response(png, { headers: { "content-type": "image/png" } }));
    const model = vi.fn(async () => ({ pairs: [observation({ id: "other" })] }));
    await expect(inspectPhotoPairs({ founderTriggered: true, pairs: [pair] }, { fetcher, model })).rejects.toThrow(/pair/);
    expect(model).toHaveBeenCalledOnce();
  });
});
