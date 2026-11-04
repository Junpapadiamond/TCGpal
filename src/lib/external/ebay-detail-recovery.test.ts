import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeListing } from "@/lib/comparison/ranking";
import type { CardIdentityCandidate } from "@/lib/schemas";
import { resetEbayTokenCacheForTests, searchEbayAlternatives } from "./ebay";

const card: CardIdentityCandidate = { id: "sv3pt5-25", name: "Pikachu", setName: "151", setCode: "MEW", cardNumber: "25/165", language: "English", imageUrl: null, confidence: "high", matchReasons: [] };
const buyer = { country: "US" as const, postalCode: "", taxRate: null, desiredCondition: "Near Mint" as const };
const selectedId = "v1|364533494574|634039152482";
const aspects = [{ name: "Card Name", value: "Pikachu" }, { name: "Card Number", value: "25/165" }, { name: "Set", value: "151" }, { name: "Language", value: "English" }];

describe("eBay selected-item detail recovery", () => {
  beforeEach(() => {
    process.env.EBAY_CLIENT_ID = "test-id";
    process.env.EBAY_CLIENT_SECRET = "test-secret";
    resetEbayTokenCacheForTests();
  });
  afterEach(() => {
    delete process.env.EBAY_CLIENT_ID;
    delete process.env.EBAY_CLIENT_SECRET;
    resetEbayTokenCacheForTests();
  });

  async function search(detailChanges: Record<string, unknown> = {}, summaryChanges: Record<string, unknown> = {}) {
    const calls: string[] = [];
    const summary = { itemId: selectedId, title: "Pokemon 151 Singles Choose Your Card", condition: "Ungraded", price: { value: "2", currency: "USD" }, ...summaryChanges };
    const detail = { ...summary, localizedAspects: aspects,
      conditionDescriptors: [{ name: "Card Condition", values: [{ content: "Near Mint" }] }],
      shippingOptions: [{ shippingCost: { value: "1.32", currency: "USD" } }], ...detailChanges };
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/identity/v1/oauth2/token")) return Response.json({ access_token: "test-token", expires_in: 7200 });
      if (url.includes("/item_summary/search")) return Response.json({ itemSummaries: [summary] });
      calls.push(decodeURIComponent(url.split("/item/")[1].split("?")[0]));
      return Response.json(detail);
    }) as typeof fetch;
    const [seed] = await searchEbayAlternatives(card, buyer, fetcher);
    const listing = normalizeListing({ listing: seed, buyer, confirmedCard: card, cardLanguage: card.language, marketPrice: null });
    return { seed, listing, calls };
  }

  it("recovers a selected child only after its own detail proves identity, condition and shipping", async () => {
    const { seed, listing, calls } = await search();
    expect(calls).toEqual([selectedId]);
    expect(seed.title).toBe("Pokemon 151 Singles Choose Your Card");
    expect(seed.sourceDetailStatus).toBe("received");
    expect(listing.eligible).toBe(true);
    expect(listing.claimedCondition).toBe("Near Mint");
    expect(listing.preTaxTotal).toBe(3.32);
  });

  it("cannot borrow identity from a summary when the detail omits it", async () => {
    const { listing } = await search({ localizedAspects: undefined }, { localizedAspects: aspects });
    expect(listing.eligible).toBe(false);
    expect(listing.eligibilityIssues.map(issue => issue.code)).toContain("identity_low_confidence");
  });

  it.each([
    [{ localizedAspects: aspects.map(aspect => aspect.name === "Language" ? { ...aspect, value: "Japanese" } : aspect) }, "language_conflict"],
    [{ title: "Pokemon 151 Singles Choose Your Card Graded" }, "not_raw_single"],
    [{ title: "Pokemon 151 Rug Choose Your Card" }, "excluded_product_type"],
    [{ title: "Pikachu 24/165 151 Choose Your Card" }, "identity_low_confidence"],
    [{ shippingOptions: [] }, "shipping_unknown"],
    [{ conditionDescriptors: [] }, "condition_unstated"],
  ] as const)("keeps contradictory or incomplete selected-child details out of ranking: %j", async (changes, issue) => {
    const { listing } = await search(changes);
    expect(listing.eligible).toBe(false);
    expect(listing.eligibilityIssues.map(row => row.code)).toContain(issue);
  });

  it("records a mismatched returned child as a failed detail, without using its facts", async () => {
    const { seed, listing } = await search({ itemId: "v1|364533494574|634039152483" });
    expect(seed.sourceDetailStatus).toBe("failed");
    expect(seed.shipping).toBeNull();
    expect(listing.eligible).toBe(false);
  });

  it("does not resolve a generic parent listing as the requested child", async () => {
    const { listing, calls } = await search({}, { itemId: "v1|364533494574|0" });
    expect(calls).toEqual([]);
    expect(listing.eligible).toBe(false);
  });
});
