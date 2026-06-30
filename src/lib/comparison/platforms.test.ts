import { describe, expect, it } from "vitest";
import {
  runPlatformFanout,
  type PlatformAgent,
  type PlatformSeed,
} from "@/lib/comparison/platforms";
import type { BuyerContext, CardIdentityCandidate, Marketplace } from "@/lib/schemas";

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

const buyer: BuyerContext = { country: "US", postalCode: "10001", taxRate: 0.08, desiredCondition: "Unknown" };
const fetcher = (async () => {
  throw new Error("agents are mocked; no network");
}) as unknown as typeof fetch;

function seed(id: string, marketplace: Marketplace): PlatformSeed {
  return {
    id,
    marketplace,
    url: null,
    title: `${card.name} ${card.cardNumber}`,
    cardId: card.id,
    matchConfidence: "high",
    matchReasons: [],
    active: true,
    raw: true,
    currency: "USD",
    price: 1200,
    shipping: 0,
    claimedCondition: "Near Mint",
    imageUrl: null,
    seller: { feedbackPercentage: 99, feedbackCount: 100, returnsAccepted: true, topRated: false, buyerProtection: true },
    evidence: { photoCount: 3, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: true, substantiveConditionNotes: false, missing: [] },
    observedAt: new Date().toISOString(),
    demo: false,
  };
}

function mockAgent(overrides: Partial<PlatformAgent> & Pick<PlatformAgent, "id" | "marketplace">): PlatformAgent {
  return {
    label: `${overrides.marketplace} adapter`,
    requiredEnv: [`${overrides.id.toUpperCase()}_KEY`],
    isConfigured: () => true,
    search: async () => [],
    ...overrides,
  };
}

describe("platform fan-out", () => {
  it("aggregates seeds from every configured agent and reports each as complete", async () => {
    const agents = [
      mockAgent({ id: "ebay", marketplace: "eBay", search: async () => [seed("ebay-1", "eBay")] }),
      mockAgent({ id: "mock", marketplace: "TCGplayer", search: async () => [seed("tcg-1", "TCGplayer"), seed("tcg-2", "TCGplayer")] }),
    ];

    const result = await runPlatformFanout({ card, buyer, fetcher, agents });

    expect(result.configuredCount).toBe(2);
    expect(result.seeds.map((s) => s.id).sort()).toEqual(["ebay-1", "tcg-1", "tcg-2"]);
    expect(result.results.filter((r) => r.status === "complete")).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it("skips unconfigured agents without a warning, but still lists them", async () => {
    const agents = [
      mockAgent({ id: "ebay", marketplace: "eBay", search: async () => [seed("ebay-1", "eBay")] }),
      mockAgent({ id: "merc", marketplace: "Mercari", isConfigured: () => false }),
    ];

    const result = await runPlatformFanout({ card, buyer, fetcher, agents });

    expect(result.configuredCount).toBe(1);
    expect(result.seeds).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    const mercari = result.results.find((r) => r.id === "merc");
    expect(mercari?.status).toBe("skipped");
    expect(mercari?.configured).toBe(false);
  });

  it("isolates a failing agent so a healthy one still returns listings", async () => {
    const agents = [
      mockAgent({ id: "ebay", marketplace: "eBay", search: async () => { throw new Error("429 rate limited"); } }),
      mockAgent({ id: "good", marketplace: "TCGplayer", search: async () => [seed("tcg-1", "TCGplayer")] }),
    ];

    const result = await runPlatformFanout({ card, buyer, fetcher, agents });

    expect(result.seeds.map((s) => s.id)).toEqual(["tcg-1"]);
    expect(result.warnings.some((w) => w.includes("429 rate limited"))).toBe(true);
    const ebay = result.results.find((r) => r.id === "ebay");
    expect(ebay?.status).toBe("fallback");
    expect(result.configuredCount).toBe(2);
  });

  it("reports configuredCount 0 when nothing is connected (caller does demo fallback)", async () => {
    const agents = [mockAgent({ id: "ebay", marketplace: "eBay", isConfigured: () => false })];
    const result = await runPlatformFanout({ card, buyer, fetcher, agents });
    expect(result.configuredCount).toBe(0);
    expect(result.seeds).toEqual([]);
  });
});
