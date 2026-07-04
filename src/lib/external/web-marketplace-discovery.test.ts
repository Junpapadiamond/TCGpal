import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverWebMarketplaceLinks } from "@/lib/external/web-marketplace-discovery";
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

describe("web marketplace discovery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips without configured Exa or Tavily keys", async () => {
    vi.stubEnv("EXA_API_KEY", "");
    vi.stubEnv("TAVILY_API_KEY", "");
    const fetcher = vi.fn();

    const result = await discoverWebMarketplaceLinks({ card, fetcher: fetcher as unknown as typeof fetch });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.results).toEqual([]);
    expect(result.warnings[0]).toContain("skipped");
  });

  it("returns unverified URL discoveries and merges providers by URL", async () => {
    vi.stubEnv("EXA_API_KEY", "exa-test");
    vi.stubEnv("TAVILY_API_KEY", "tavily-test");
    vi.stubEnv("WEB_DISCOVERY", "1");

    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("exa.ai")) {
        return new Response(JSON.stringify({
          results: [
            { title: "Mercari Umbreon VMAX Evolving Skies listing", url: "https://www.mercari.com/us/item/m123/" },
            { title: "Wrong host should be filtered", url: "https://example.com/item/nope" },
          ],
        }));
      }
      return new Response(JSON.stringify({
        results: [
          { title: "Mercari Umbreon VMAX Evolving Skies listing", url: "https://www.mercari.com/us/item/m123/" },
        ],
      }));
    });

    const result = await discoverWebMarketplaceLinks({
      card,
      fetcher: fetcher as unknown as typeof fetch,
      now: () => new Date("2026-07-04T00:00:00.000Z"),
    });

    const mercari = result.results.find((item) => item.url === "https://www.mercari.com/us/item/m123");
    expect(mercari).toBeTruthy();
    expect(mercari?.marketplace).toBe("Mercari");
    expect(mercari?.listingLike).toBe(true);
    expect(mercari?.providers.sort()).toEqual(["exa", "tavily"]);
    expect(mercari?.note).toContain("Experimental web discovery");
    expect(result.results.some((item) => item.url.includes("example.com"))).toBe(false);
  });
});
