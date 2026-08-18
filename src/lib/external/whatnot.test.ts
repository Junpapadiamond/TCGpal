import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasWhatnotCredentials,
  parseWhatnotSubtitle,
  searchWhatnotListings,
  whatnotListingUrl,
} from "@/lib/external/whatnot";
import type { CardIdentityCandidate } from "@/lib/schemas";

const CARD: CardIdentityCandidate = {
  id: "swsh7-215",
  name: "Umbreon VMAX",
  setName: "Evolving Skies",
  setCode: "swsh7",
  cardNumber: "215/203",
  language: "English",
  imageUrl: null,
  confidence: "high",
  matchReasons: [],
};

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: "TGlzdGluZ05vZGU6MjE0NzcwOTMxMQ==",
    title: "Umbreon VMAX 215/203 - Evolving Skies",
    subtitle: "Near Mint ∙ Evolving Skies",
    description: "",
    publicStatus: "ACTIVE",
    transactionType: "BUY_IT_NOW",
    quantity: 1,
    price: { amountSafe: 240000, currency: "USD" },
    user: { username: "trainerdtcg", sellerRating: { overall: 5, numReviews: 579 } },
    images: [{ url: "https://images.whatnot.com/a", label: "Front" }, { url: "https://images.whatnot.com/b", label: "Back" }],
    ...overrides,
  };
}

function fetcherFor(items: unknown[]) {
  return vi.fn(async () => new Response(JSON.stringify(items), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("Whatnot subtitle facets", () => {
  it("reads the condition facet into the TCGlens condition vocabulary", () => {
    expect(parseWhatnotSubtitle("Near Mint ∙ Evolving Skies").condition).toBe("Near Mint");
    expect(parseWhatnotSubtitle("Light Played ∙ Base Set").condition).toBe("Lightly Played");
    expect(parseWhatnotSubtitle("Moderately Played").condition).toBe("Moderately Played");
    expect(parseWhatnotSubtitle("Damaged").condition).toBe("Damaged");
  });

  it("treats Mint as Near Mint rather than inventing a better grade", () => {
    expect(parseWhatnotSubtitle("Mint ∙ Evolving Skies").condition).toBe("Near Mint");
  });

  it("is vocabulary-driven, not positional: a number in the set slot is not a condition", () => {
    const parsed = parseWhatnotSubtitle("Mint ∙ 095/203");
    expect(parsed.condition).toBe("Near Mint");
    expect(parsed.setName).toBeNull();
  });

  it("flags graded and sealed facets instead of guessing a condition", () => {
    expect(parseWhatnotSubtitle("Graded ∙ Evolving Skies").graded).toBe(true);
    expect(parseWhatnotSubtitle("New ∙ English").sealed).toBe(true);
    expect(parseWhatnotSubtitle("Graded ∙ Evolving Skies").condition).toBeNull();
  });

  it("extracts the language facet", () => {
    expect(parseWhatnotSubtitle("Near Mint ∙ Japanese").language).toBe("Japanese");
    expect(parseWhatnotSubtitle("Near Mint ∙ Evolving Skies").language).toBeNull();
  });

  it("returns empty facets for a missing subtitle", () => {
    expect(parseWhatnotSubtitle("").condition).toBeNull();
  });
});

describe("Whatnot listing URL", () => {
  it("builds a listing URL from the node id", () => {
    expect(whatnotListingUrl("TGlzdGluZ05vZGU6MjE0NzcwOTMxMQ==")).toBe(
      "https://www.whatnot.com/listing/TGlzdGluZ05vZGU6MjE0NzcwOTMxMQ==",
    );
  });
});

describe("Whatnot credentials gate", () => {
  const original = process.env.WHATNOT_APIFY_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.WHATNOT_APIFY_TOKEN;
    else process.env.WHATNOT_APIFY_TOKEN = original;
  });

  it("is off without a token and on with one", () => {
    delete process.env.WHATNOT_APIFY_TOKEN;
    expect(hasWhatnotCredentials()).toBe(false);
    process.env.WHATNOT_APIFY_TOKEN = "apify_api_test";
    expect(hasWhatnotCredentials()).toBe(true);
  });
});

describe("Whatnot search adapter", () => {
  beforeEach(() => {
    process.env.WHATNOT_APIFY_TOKEN = "apify_api_test";
  });
  afterEach(() => {
    delete process.env.WHATNOT_APIFY_TOKEN;
    vi.restoreAllMocks();
  });

  it("never reports a shipping cost, because Whatnot does not publish one before checkout", async () => {
    const seeds = await searchWhatnotListings(CARD, fetcherFor([listing()]));
    expect(seeds).toHaveLength(1);
    expect(seeds[0].shipping).toBeNull();
  });

  it("converts the price from cents and keeps USD", async () => {
    const seeds = await searchWhatnotListings(CARD, fetcherFor([listing()]));
    expect(seeds[0].price).toBe(2400);
    expect(seeds[0].currency).toBe("USD");
  });

  it("maps the structured condition facet onto the seller claim", async () => {
    const seeds = await searchWhatnotListings(CARD, fetcherFor([listing()]));
    expect(seeds[0].claimedCondition).toBe("Near Mint");
  });

  it("marks a graded slab as not raw so the product gate excludes it", async () => {
    const seeds = await searchWhatnotListings(
      CARD,
      fetcherFor([listing({ subtitle: "Graded ∙ Evolving Skies", title: "Umbreon VMAX 215/203 PSA 10" })]),
    );
    expect(seeds[0].raw).toBe(false);
  });

  it("drops auctions and inactive listings, which are not comparable buy-now inventory", async () => {
    const seeds = await searchWhatnotListings(
      CARD,
      fetcherFor([
        listing({ id: "a", transactionType: "AUCTION" }),
        listing({ id: "b", publicStatus: "SOLD" }),
        listing({ id: "c" }),
      ]),
    );
    expect(seeds.map((seed) => seed.id)).toEqual(["whatnot-c"]);
  });

  it("de-duplicates listings repeated across queries", async () => {
    const seeds = await searchWhatnotListings(CARD, fetcherFor([listing(), listing()]));
    expect(seeds).toHaveLength(1);
  });

  it("carries seller track record across as trust signals", async () => {
    const seeds = await searchWhatnotListings(CARD, fetcherFor([listing()]));
    expect(seeds[0].seller.feedbackPercentage).toBe(100);
    expect(seeds[0].seller.feedbackCount).toBe(579);
  });

  it("counts photos and notes explicit front/back evidence", async () => {
    const seeds = await searchWhatnotListings(CARD, fetcherFor([listing()]));
    expect(seeds[0].evidence.photoCount).toBe(2);
    expect(seeds[0].evidence.frontBackExplicit).toBe(true);
  });

  it("surfaces the language facet for the deterministic language gate", async () => {
    const seeds = await searchWhatnotListings(CARD, fetcherFor([listing({ subtitle: "Near Mint ∙ Japanese" })]));
    expect(seeds[0].listingLanguage).toBe("Japanese");
  });

  it("returns no seeds rather than throwing when the provider payload is malformed", async () => {
    const bad = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    await expect(searchWhatnotListings(CARD, bad)).resolves.toEqual([]);
  });

  it("returns no seeds when the provider errors", async () => {
    const failing = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(searchWhatnotListings(CARD, failing)).resolves.toEqual([]);
  });

  it("never calls the provider without a token", async () => {
    delete process.env.WHATNOT_APIFY_TOKEN;
    const spy = fetcherFor([listing()]);
    await expect(searchWhatnotListings(CARD, spy)).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
