import { describe, expect, it } from "vitest";
import { evaluateFirecrawlExperiment, evaluateFirecrawlObservation } from "@/lib/frontier-research/firecrawl-harness";
import type { CardIdentityCandidate } from "@/lib/schemas";

const card: CardIdentityCandidate = {
  id: "swsh7-215",
  name: "Umbreon VMAX",
  setName: "Evolving Skies",
  setCode: "SWSH7",
  cardNumber: "215/203",
  language: "English",
  imageUrl: null,
  confidence: "high",
  matchReasons: [],
};

describe("Firecrawl frontier observation harness", () => {
  it("advances a page-observed exact listing to a pre-tax cost-comparable result", () => {
    const result = evaluateFirecrawlObservation({
      fixture: {
        id: "mercari-us-01",
        platform: "Mercari US",
        url: "https://www.mercari.com/us/item/m123",
        card,
        expectedIdentity: "exact",
        expectedFacts: {},
      },
      observation: {
        fixtureId: "mercari-us-01",
        sourceUrl: "https://www.mercari.com/us/item/m123",
        observedAt: "2026-07-31T08:00:00.000Z",
        acquisitionMethod: "firecrawl-scrape-json",
        status: "observed",
        durationMs: 1200,
        costUsd: 0.01,
        accessNotes: [],
        fields: {
          title: field("Umbreon VMAX 215/203 Evolving Skies", "Listing heading"),
          cardName: field("Umbreon VMAX", "Title names the card"),
          collectorNumber: field("215/203", "Title shows the full number"),
          setName: field("Evolving Skies", "Title names the set"),
          variant: field(null, null, "low"),
          itemPrice: field(100, "$100 item price"),
          currency: field("USD", "US dollar symbol and locale"),
          shippingCost: field(8, "$8 shipping"),
          tax: field(null, null, "low"),
          availability: field("available", "Add to cart control is present"),
          condition: field("Near Mint", "Seller-stated condition"),
          sellerEvidence: field("Marketplace seller panel is visible", "Seller panel", "medium"),
        },
      },
    });

    expect(result.evidenceState).toBe("cost-comparable");
    expect(result.identity.match).toBe("compatible");
    expect(result.comparableCost).toEqual({ currency: "USD", preTaxTotal: 108, taxKnown: false });
    expect(result.fields.itemPrice).toMatchObject({
      sourceUrl: "https://www.mercari.com/us/item/m123",
      observedAt: "2026-07-31T08:00:00.000Z",
      acquisitionMethod: "firecrawl-scrape-json",
      extractedValue: 100,
    });
  });

  it("scores factual precision and refuses to count a sibling print as identity-checked", () => {
    const siblingCard: CardIdentityCandidate = {
      id: "OP01-016_p4",
      name: "Nami",
      setName: "Anime 25th Collection",
      setCode: "OP01",
      cardNumber: "OP01-016",
      language: "English",
      imageUrl: null,
      artworkClass: "special",
      confidence: "high",
      matchReasons: [],
    };
    const exactFixture = {
      id: "mercari-us-01",
      platform: "Mercari US",
      url: "https://www.mercari.com/us/item/m123",
      card,
      expectedIdentity: "exact" as const,
      expectedFacts: { itemPrice: 100, currency: "USD", availability: "available" },
    };
    const siblingFixture = {
      id: "yahoo-jp-01",
      platform: "Yahoo Auctions JP",
      url: "https://page.auctions.yahoo.co.jp/jp/auction/a123",
      card: siblingCard,
      expectedIdentity: "sibling" as const,
      expectedFacts: { itemPrice: 1200, currency: "JPY", availability: "available" },
    };

    const report = evaluateFirecrawlExperiment({
      manifest: {
        experimentId: "firecrawl-2026-07-31",
        label: "frontier-research",
        owner: "Founder",
        reviewDate: "2026-08-03",
        observerConfig: {
          endpoint: "/scrape",
          format: "json",
          storeInCache: false,
          redactPII: true,
          proxy: "basic",
        },
        thresholds: {
          pageObservedRate: 0.8,
          factualPrecision: 0.95,
          costComparableRate: 0.5,
          medianLatencyMs: 8000,
          maxCostUsd: 1,
        },
        fixtures: [exactFixture, siblingFixture],
      },
      observations: [
        observation(exactFixture, {
          title: field("Umbreon VMAX 215/203 Evolving Skies", "Listing heading"),
          cardName: field("Umbreon VMAX", "Title names the card"),
          collectorNumber: field("215/203", "Full collector number"),
          setName: field("Evolving Skies", "Set name"),
          itemPrice: field(100, "$100 item price"),
          currency: field("USD", "US dollar locale"),
          shippingCost: field(8, "$8 shipping"),
          availability: field("available", "Add to cart"),
        }, 1200, 0.01),
        observation(siblingFixture, {
          title: field("Nami OP01-016 1st Anniversary", "Listing heading"),
          cardName: field("Nami", "Title names Nami"),
          collectorNumber: field("OP01-016", "Collector number"),
          setName: field("1st Anniversary", "Listing names a sibling release"),
          itemPrice: field(1200, "1,200 yen price"),
          currency: field("JPY", "Yen symbol"),
          shippingCost: field(null, null, "low"),
          availability: field("available", "Bid control"),
        }, 1800, 0.01),
      ].reverse(),
    });

    expect(report.summary).toMatchObject({
      totalFixtures: 2,
      pageObservedRate: 1,
      factualPrecision: 1,
      knownSiblingSubstitutions: 0,
      costComparableRate: 0.5,
      medianLatencyMs: 1500,
      totalCostUsd: 0.02,
    });
    expect(report.results[1]).toMatchObject({ evidenceState: "page-observed", identity: { match: "mismatch" } });
    expect(report.gates.overall).toBe(true);
  });

  it("keeps model-defaulted shipping and tax as unknown instead of fabricating zero cost", () => {
    const result = evaluateFirecrawlObservation({
      fixture: {
        id: "whatnot-01",
        platform: "Whatnot",
        url: "https://www.whatnot.com/listing/abc",
        card,
        expectedIdentity: "exact",
        expectedFacts: {},
      },
      observation: observation({ id: "whatnot-01", url: "https://www.whatnot.com/listing/abc" }, {
        title: field("Umbreon VMAX 215/203 Evolving Skies", "Listing heading"),
        cardName: field("Umbreon VMAX", "Title names the card"),
        collectorNumber: field("215/203", "Full collector number"),
        setName: field("Evolving Skies", "Set name"),
        itemPrice: field(96, "$96 item price"),
        currency: field("USD", "Dollar price"),
        shippingCost: field(0, "Shipping is not specified, defaulting to zero.", "low"),
        tax: field(0, "Taxes are mentioned but not specified, defaulting to zero.", "low"),
        availability: field("available", "1 available"),
      }, 1100, 0.01),
    });

    expect(result.evidenceState).toBe("identity-checked");
    expect(result.comparableCost).toBeNull();
    expect(result.fields.shippingCost.extractedValue).toBeNull();
    expect(result.fields.tax.extractedValue).toBeNull();
  });

  it("rejects a schema-shaped example payload instead of treating it as page evidence", () => {
    const result = evaluateFirecrawlObservation({
      fixture: {
        id: "snkrdunk-01",
        platform: "SNKRDUNK",
        url: "https://snkrdunk.com/apparels/310224",
        card,
        expectedIdentity: "exact",
        expectedFacts: {},
      },
      observation: observation({ id: "snkrdunk-01", url: "https://snkrdunk.com/apparels/310224" }, {
        title: field("Example Product Title", "Displayed prominently at the top of the page."),
        cardName: field("Example Product Card", "Listed in the card section."),
        collectorNumber: field("12345", "Product specifications."),
        setName: field("Example Set Name", "Product details."),
        itemPrice: field(19.99, "Clearly stated next to the product image."),
        currency: field("USD", "Indicated near the price."),
        shippingCost: field(5, "Shipping details."),
        tax: field(1.5, "Price breakdown."),
        availability: field("available", "Marked as in stock."),
      }, 13_600, 0.03),
    });

    expect(result.evidenceState).toBe("link-only");
    expect(result.identity.match).toBe("unknown");
    expect(result.fields.itemPrice.extractedValue).toBeNull();
    expect(result.criticNotes).toContain("Discarded schema-shaped placeholder payload.");
  });

  it("normalizes N/A sentinels and generic seller boilerplate back to unknown", () => {
    const result = evaluateFirecrawlObservation({
      fixture: {
        id: "shops-01",
        platform: "Card Rush",
        url: "https://www.cardrush-op.jp/product/1222",
        card,
        expectedIdentity: "uncertain",
        expectedFacts: {},
      },
      observation: observation({ id: "shops-01", url: "https://www.cardrush-op.jp/product/1222" }, {
        title: field("Umbreon VMAX 215/203 Evolving Skies", "Product title"),
        setName: field("N/A", "Set name not explicitly provided.", "low"),
        condition: field("N/A", "Condition not explicitly stated.", "low"),
        sellerEvidence: field(
          "Generic signals of professional selling evident through the layout.",
          "Page structure reflects an organized online marketplace environment.",
          "medium",
        ),
      }, 1000, 0.01),
    });

    expect(result.fields.setName.extractedValue).toBeNull();
    expect(result.fields.condition.extractedValue).toBeNull();
    expect(result.fields.sellerEvidence.extractedValue).toBeNull();
  });

  it("scores raw extractor precision separately from deterministic critic coverage", () => {
    const fixture = {
      id: "yahoo-jp-01",
      platform: "Yahoo Auctions JP",
      url: "https://auctions.yahoo.co.jp/jp/auction/a123",
      card,
      expectedIdentity: "uncertain" as const,
      expectedFacts: {
        title: "Umbreon VMAX 215/203",
        itemPrice: 39_000,
        currency: "JPY",
        availability: "sold",
      },
    };
    const report = evaluateFirecrawlExperiment({
      manifest: {
        experimentId: "raw-precision",
        label: "frontier-research",
        owner: "Founder",
        reviewDate: "2026-08-03",
        observerConfig: {
          endpoint: "/scrape",
          format: "json",
          storeInCache: false,
          redactPII: true,
          proxy: "basic",
        },
        thresholds: {
          pageObservedRate: 0.8,
          factualPrecision: 0.95,
          costComparableRate: 0.6,
          medianLatencyMs: 8000,
          maxCostUsd: 1,
        },
        fixtures: [fixture],
      },
      observations: [observation(fixture, {
        title: field("Example Product Title", "Visible on page"),
        itemPrice: field(19.99, "Price shown"),
        currency: field("USD", "Currency shown"),
        availability: field("available", "In stock"),
      }, 13_000, 0.03)],
    });

    expect(report.summary).toMatchObject({
      factualLabels: 4,
      factualPredictions: 4,
      factualCoverage: 1,
      factualPrecision: 0,
    });
    expect(report.results[0].evidenceState).toBe("link-only");
  });
});

function field(
  value: string | number | null,
  evidence: string | null,
  confidence: "high" | "medium" | "low" = "high",
) {
  return { value, evidence, confidence };
}

function observation(
  fixture: { id: string; url: string },
  overrides: Partial<Record<
    "title" | "cardName" | "collectorNumber" | "setName" | "variant" | "itemPrice" | "currency" | "shippingCost" | "tax" | "availability" | "condition" | "sellerEvidence",
    ReturnType<typeof field>
  >>,
  durationMs: number,
  costUsd: number,
) {
  return {
    fixtureId: fixture.id,
    sourceUrl: fixture.url,
    observedAt: "2026-07-31T08:00:00.000Z",
    acquisitionMethod: "firecrawl-scrape-json" as const,
    status: "observed" as const,
    durationMs,
    costUsd,
    accessNotes: [],
    fields: {
      title: field(null, null, "low"),
      cardName: field(null, null, "low"),
      collectorNumber: field(null, null, "low"),
      setName: field(null, null, "low"),
      variant: field(null, null, "low"),
      itemPrice: field(null, null, "low"),
      currency: field(null, null, "low"),
      shippingCost: field(null, null, "low"),
      tax: field(null, null, "low"),
      availability: field(null, null, "low"),
      condition: field(null, null, "low"),
      sellerEvidence: field(null, null, "low"),
      ...overrides,
    },
  };
}
