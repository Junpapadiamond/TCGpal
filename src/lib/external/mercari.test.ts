import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasMercariCredentials,
  parseMercariTitleCondition,
  searchMercariListings,
} from "@/lib/external/mercari";
import type { CardIdentityCandidate } from "@/lib/schemas";

const CARD: CardIdentityCandidate = {
  id: "sv3pt5-199",
  name: "Charizard ex",
  setName: "Scarlet & Violet 151",
  setCode: "sv3pt5",
  cardNumber: "199/165",
  language: "English",
  imageUrl: null,
  confidence: "high",
  matchReasons: [],
};

function item(overrides: Record<string, unknown> = {}) {
  return {
    listing_id: "m17923568616",
    url: "https://www.mercari.com/us/item/m17923568616/",
    title: "Pokemon Charizard ex 199/165 NM",
    price: 350,
    currency: "USD",
    listing_status: "on_sale",
    condition_id: "like_new",
    brand: "Pokemon",
    category_path: ["Toys & Collectibles", "Trading Cards", "Single Cards"],
    media: { image_urls: ["https://u-mercari-images.mercdn.net/photos/m1_1.jpg"] },
    seller_review_count: 42,
    ...overrides,
  };
}

function fetcherFor(items: unknown[]) {
  return vi.fn(async () => new Response(JSON.stringify(items), { status: 200 })) as unknown as typeof fetch;
}

describe("Mercari title condition", () => {
  it("reads an explicit card-grade claim from the title", () => {
    expect(parseMercariTitleCondition("Charizard ex 199/165 NM")).toBe("Near Mint");
    expect(parseMercariTitleCondition("Charizard Near Mint")).toBe("Near Mint");
    expect(parseMercariTitleCondition("Charizard 151 Very LP+ few dots")).toBe("Lightly Played");
    expect(parseMercariTitleCondition("Charizard MP heavy wear")).toBe("Moderately Played");
    expect(parseMercariTitleCondition("Charizard damaged crease")).toBe("Damaged");
  });

  it("stays Unknown when the title states no card grade", () => {
    expect(parseMercariTitleCondition("Pokemon 151 Charizard EX")).toBe("Unknown");
  });

  it("takes the worst grade when a title states a range", () => {
    expect(parseMercariTitleCondition("Charizard NM-LP")).toBe("Lightly Played");
  });
});

describe("Mercari search adapter", () => {
  beforeEach(() => {
    process.env.MERCARI_APIFY_TOKEN = "apify_api_test";
  });
  afterEach(() => {
    delete process.env.MERCARI_APIFY_TOKEN;
    vi.restoreAllMocks();
  });

  it("is off without a token and never calls the provider", async () => {
    delete process.env.MERCARI_APIFY_TOKEN;
    expect(hasMercariCredentials()).toBe(false);
    const spy = fetcherFor([item()]);
    await expect(searchMercariListings(CARD, spy)).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("never reports a shipping cost, which Mercari does not publish here", async () => {
    const seeds = await searchMercariListings(CARD, fetcherFor([item()]));
    expect(seeds[0].shipping).toBeNull();
  });

  it("reads price as dollars, not cents", async () => {
    const seeds = await searchMercariListings(CARD, fetcherFor([item({ price: 350 })]));
    expect(seeds[0].price).toBe(350);
  });

  it("never turns Mercari's resale grade into a card grade", async () => {
    // "like_new" is Mercari's generic condition vocabulary for all goods. It is
    // not a TCG grade, and treating it as one would fabricate a seller claim.
    const seeds = await searchMercariListings(
      CARD,
      fetcherFor([item({ title: "Pokemon 151 Charizard EX", condition_id: "like_new" })]),
    );
    expect(seeds[0].claimedCondition).toBe("Unknown");
  });

  it("uses a card grade the seller actually wrote in the title", async () => {
    const seeds = await searchMercariListings(CARD, fetcherFor([item({ title: "Charizard ex 199/165 NM" })]));
    expect(seeds[0].claimedCondition).toBe("Near Mint");
  });

  it("carries listing photos through for evidence", async () => {
    const seeds = await searchMercariListings(CARD, fetcherFor([item()]));
    expect(seeds[0].imageUrls).toEqual(["https://u-mercari-images.mercdn.net/photos/m1_1.jpg"]);
    expect(seeds[0].evidence.photoCount).toBe(1);
  });

  it("drops listings that are no longer on sale", async () => {
    const seeds = await searchMercariListings(
      CARD,
      fetcherFor([item({ listing_id: "a", listing_status: "sold_out" }), item({ listing_id: "b" })]),
    );
    expect(seeds.map((seed) => seed.id)).toEqual(["mercari-b"]);
  });

  it("de-duplicates repeated listing ids", async () => {
    const seeds = await searchMercariListings(CARD, fetcherFor([item(), item()]));
    expect(seeds).toHaveLength(1);
  });

  it("treats a missing seller record as unverified rather than zero", async () => {
    const seeds = await searchMercariListings(CARD, fetcherFor([item({ seller_review_count: 0 })]));
    expect(seeds[0].seller.feedbackCount).toBeNull();
  });

  it("returns no seeds rather than throwing on a malformed or failing provider", async () => {
    const bad = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    const failing = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(searchMercariListings(CARD, bad)).resolves.toEqual([]);
    await expect(searchMercariListings(CARD, failing)).resolves.toEqual([]);
  });
});
