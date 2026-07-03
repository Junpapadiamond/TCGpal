import { describe, expect, it } from "vitest";
import { runPlatformAdapters, type PlatformAdapter } from "@/lib/external/adapter";
import { demoListingSeeds } from "@/lib/comparison/fixtures";
import type { BuyerContext, CardIdentityCandidate } from "@/lib/schemas";

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

const buyer: BuyerContext = {
  country: "US",
  postalCode: "10001",
  taxRate: null,
  desiredCondition: "Unknown",
};

const input = { card, buyer, fetcher: fetch };

function adapter(partial: Partial<PlatformAdapter> & Pick<PlatformAdapter, "platform" | "search">): PlatformAdapter {
  return { isConfigured: () => true, ...partial };
}

describe("platform adapter fan-out", () => {
  it("keeps partial results when one source fails", async () => {
    const result = await runPlatformAdapters([
      adapter({
        platform: "eBay",
        search: async () => { throw new Error("eBay authentication failed with 401."); },
      }),
      adapter({
        platform: "TCGplayer",
        search: async () => ({ seeds: [demoListingSeeds[0]], asOf: "2026-07-02T20:06:28.000Z" }),
      }),
    ], input);

    expect(result.seeds).toHaveLength(1);
    expect(result.statuses.map((status) => status.status)).toEqual(["failed", "ok"]);
    expect(result.statuses[0].note).toContain("401");
    expect(result.statuses[1].count).toBe(1);
    expect(result.statuses[1].asOf).toBe("2026-07-02T20:06:28.000Z");
  });

  it("marks unconfigured sources without calling them", async () => {
    let called = false;
    const result = await runPlatformAdapters([
      adapter({
        platform: "eBay",
        isConfigured: () => false,
        search: async () => { called = true; return { seeds: [], asOf: null }; },
      }),
    ], input);

    expect(called).toBe(false);
    expect(result.statuses[0].status).toBe("not_configured");
  });

  it("shows a source that found nothing as empty, not hidden", async () => {
    const result = await runPlatformAdapters([
      adapter({ platform: "TCGplayer", search: async () => ({ seeds: [], asOf: null }) }),
    ], input);
    expect(result.statuses[0].status).toBe("empty");
    expect(result.statuses[0].count).toBe(0);
  });

  it("reports robots/access-control blocks as blocked, not failed", async () => {
    const robotsError = new Error("Reddit robots.txt disallows this public search page.");
    robotsError.name = "UniversalListingBlockedError";
    const result = await runPlatformAdapters([
      adapter({ platform: "Reddit", search: async () => { throw robotsError; } }),
      adapter({ platform: "Mercari", search: async () => { throw new Error("Public search page responded with 403."); } }),
    ], input);

    expect(result.statuses.map((status) => status.status)).toEqual(["blocked", "blocked"]);
  });

  it("enforces the per-source hard timeout", async () => {
    const result = await runPlatformAdapters([
      adapter({
        platform: "eBay",
        search: () => new Promise(() => { /* never resolves */ }),
      }),
      adapter({
        platform: "TCGplayer",
        search: async () => ({ seeds: [demoListingSeeds[1]], asOf: null }),
      }),
    ], input, { hardTimeoutMs: 30 });

    expect(result.statuses[0].status).toBe("failed");
    expect(result.statuses[0].note).toContain("timed out");
    expect(result.seeds).toHaveLength(1);
  });
});
