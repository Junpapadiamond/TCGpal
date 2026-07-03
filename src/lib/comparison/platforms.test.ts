import { describe, expect, it } from "vitest";
import {
  ebayPlatformAgent,
  getPlatformAgents,
  runPlatformFanout,
  searchPlatformWithTimeout,
  summarizePlatformOutcome,
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
    userSupplied: false,
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
    sourceMode: "official_api",
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

  it("round-trips sourceMode through the sources-panel result", async () => {
    const agents = [mockAgent({ id: "ebay", marketplace: "eBay", sourceMode: "official_api", search: async () => [seed("ebay-1", "eBay")] })];
    const result = await runPlatformFanout({ card, buyer, fetcher, agents });
    expect(result.results[0]?.sourceMode).toBe("official_api");
  });

  it("times out a hung agent so it cannot stall the fan-out", async () => {
    const agent = mockAgent({ id: "hung", marketplace: "eBay", search: () => new Promise<PlatformSeed[]>(() => {}) });
    await expect(searchPlatformWithTimeout(agent, { card, buyer, fetcher }, 10)).rejects.toThrow(/timed out/);
  });

  it("builds the same result/trace shape for success and failure (shared builder)", () => {
    const agent = mockAgent({ id: "ebay", marketplace: "eBay" });
    const ok = summarizePlatformOutcome({ agent, seeds: [seed("a", "eBay")] });
    expect(ok.result.status).toBe("complete");
    expect(ok.result.count).toBe(1);
    expect(ok.trace.status).toBe("complete");
    expect(ok.warning).toBeUndefined();

    const bad = summarizePlatformOutcome({ agent, error: "boom" });
    expect(bad.result.status).toBe("fallback");
    expect(bad.trace.status).toBe("fallback");
    expect(bad.warning).toContain("boom");
    expect(bad.seeds).toEqual([]);
  });
});

describe("default registry (roadmap adapters)", () => {
  it("keeps eBay as the one configured-by-default (real) agent", () => {
    const agents = getPlatformAgents();
    expect(agents).toContain(ebayPlatformAgent);
    expect(ebayPlatformAgent.sourceMode).toBe("official_api");
  });

  it("registers roadmap marketplaces behind the same interface, all self-gated off until wired", async () => {
    const agents = getPlatformAgents();
    const roadmap = agents.filter((agent) => agent.id !== "ebay" && agent.id !== "tcgplayer");

    // Proves the fanout/UI are provider-agnostic today: every roadmap agent implements
    // search() and is registered, but none is configured, so none joins a real fan-out.
    expect(roadmap.length).toBeGreaterThan(0);
    for (const agent of roadmap) {
      expect(agent.isConfigured()).toBe(false);
      await expect(agent.search({ card, buyer, fetcher })).resolves.toEqual([]);
    }

    const result = await runPlatformFanout({ card, buyer, fetcher: fetcher as unknown as typeof fetch, agents: [ebayPlatformAgent, ...roadmap] });
    expect(result.configuredCount).toBe(0); // eBay unconfigured too (no env creds in this test)
    const skipped = result.results.filter((r) => r.status === "skipped");
    expect(skipped.length).toBe(1 + roadmap.length);
  });

  it("serves TCGplayer as a live keyless agent backed by the TCGCSV daily dump", () => {
    const tcgplayer = getPlatformAgents().find((agent) => agent.id === "tcgplayer");
    expect(tcgplayer?.sourceMode).toBe("cached_index");
    expect(tcgplayer?.requiredEnv).toEqual([]);
    expect(tcgplayer?.isConfigured()).toBe(true);
  });
});
