import { config } from "dotenv";
import { describe, expect, it } from "vitest";
import { searchWhatnotListings } from "@/lib/external/whatnot";
import type { CardIdentityCandidate } from "@/lib/schemas";

// Live provider check: `npm run review:whatnot-live`.
//
// Skipped unless WHATNOT_LIVE_REVIEW=1, so the hermetic suite never depends on a
// live service. .env.local is loaded here rather than in the shared vitest setup
// on purpose — loading real credentials for every test would let hermetic tests
// start reaching live providers by accident.
config({ path: ".env.local", quiet: true });

const requested = process.env.WHATNOT_LIVE_REVIEW === "1";
const token = Boolean(process.env.WHATNOT_APIFY_TOKEN);

// Asking for a live run and silently getting a skip reads as "it passed". When
// the run was explicitly requested, a missing token is a failure with a fix.
describe.skipIf(!requested)("Whatnot live provider credentials", () => {
  it("has a token to run against", () => {
    expect(
      token,
      "WHATNOT_APIFY_TOKEN is not set. Add it to .env.local or pass it inline.",
    ).toBe(true);
  });
});

const enabled = requested && token;

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

describe.skipIf(!enabled)("Whatnot live provider", () => {
  it("returns usable buy-now seeds for a real card", async () => {
    const started = Date.now();
    const seeds = await searchWhatnotListings(CARD, fetch);
    const elapsed = Date.now() - started;

    console.log(`\n  ${seeds.length} seeds in ${(elapsed / 1000).toFixed(1)}s`);
    for (const seed of seeds.slice(0, 8)) {
      console.log(
        `   $${seed.price.toFixed(2).padStart(8)} | ${seed.claimedCondition.padEnd(18)} | raw=${String(seed.raw).padEnd(5)} | ` +
        `${String(seed.seller.feedbackCount ?? "-").padStart(5)} rev | ${seed.title.slice(0, 40)}`,
      );
    }

    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      expect(seed.marketplace).toBe("Whatnot");
      expect(seed.currency).toBe("USD");
      expect(seed.price).toBeGreaterThan(0);
      // The invariant that matters: never a fabricated shipping number.
      expect(seed.shipping).toBeNull();
      expect(seed.url).toMatch(/^https:\/\/www\.whatnot\.com\/listing\//);
      expect(seed.demo).toBe(false);
    }
  }, 60000);
});
