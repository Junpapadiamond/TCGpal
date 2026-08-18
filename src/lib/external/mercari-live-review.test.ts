import { config } from "dotenv";
import { describe, expect, it } from "vitest";
import { searchMercariListings } from "@/lib/external/mercari";
import type { CardIdentityCandidate } from "@/lib/schemas";

// Live provider check: `npm run review:mercari-live`. See the Whatnot live
// review for why .env.local is loaded here rather than in the shared setup.
config({ path: ".env.local", quiet: true });

const requested = process.env.MERCARI_LIVE_REVIEW === "1";
const token = Boolean(process.env.MERCARI_APIFY_TOKEN);

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

describe.skipIf(!requested)("Mercari live provider credentials", () => {
  it("has a token to run against", () => {
    expect(token, "MERCARI_APIFY_TOKEN is not set. Add it to .env.local.").toBe(true);
  });
});

describe.skipIf(!(requested && token))("Mercari live provider", () => {
  it("returns usable on-sale seeds for a real card", async () => {
    const seeds = await searchMercariListings(CARD, fetch);
    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      expect(seed.marketplace).toBe("Mercari");
      expect(seed.currency).toBe("USD");
      expect(seed.price).toBeGreaterThan(0);
      // The invariant: never a fabricated shipping number, and never a card
      // grade invented from Mercari's general-goods condition vocabulary.
      expect(seed.shipping).toBeNull();
      expect(seed.url).toMatch(/^https:\/\/www\.mercari\.com\//);
      expect(seed.demo).toBe(false);
    }
  }, 120000);
});
