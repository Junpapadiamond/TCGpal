import { afterEach, describe, expect, it, vi } from "vitest";
import { isMercariDirectEnabled, parseMercariObservations, searchMercariDirect } from "./mercari-direct";
import type { CardIdentityCandidate } from "@/lib/schemas";

const card: CardIdentityCandidate = { id: "base1-58", name: "Pikachu", cardNumber: "58/102", setCode: "base1", setName: "Base Set", language: "English", imageUrl: null, confidence: "high", matchReasons: [] };
const now = new Date("2026-09-14T21:00:00.000Z");
const url = "https://www.mercari.com/us/item/m12345678901/";
function observation(changes: Record<string, unknown> = {}, extras = {}) {
  const values = { title: "Pikachu 58/102 Base Set Unlimited NM", itemPrice: 3.1, currency: "USD", shippingCost: 0.49, buyerFee: 0.12,
    conditionClaim: "Good", description: "Card only", availability: "active", imageUrls: ["https://u-mercari-images.mercdn.net/photos/m123_1.jpg"], ...changes };
  return { label: "mercari-page", status: "observed", sourceUrl: url, observedAt: now.toISOString(), conflicts: [],
    fields: Object.fromEntries(Object.entries(values).map(([k, value]) => [k, { value, evidence: `DOM ${k}`, sourceUrl: url, observedAt: now.toISOString(), acquisitionMethod: "browser-dom", confidence: "high" }])), ...extras };
}
afterEach(() => vi.unstubAllEnvs());
describe("direct Mercari production facts", () => {
  it("preserves observed dollars, fee, timestamp and unknown seller signals", () => {
    const [seed] = parseMercariObservations([observation()], card, now);
    expect(seed).toMatchObject({ price: 3.1, shipping: 0.49, buyerFee: 0.12, claimedCondition: "Near Mint", active: true, demo: false,
      userSupplied: false, observedAt: now.toISOString(), seller: { feedbackCount: null, feedbackPercentage: null } });
  });
  it("never maps merchandise Like new or Good to a card grade; missing fees remain null", () => {
    const [seed] = parseMercariObservations([observation({ title: "Pikachu 58/102", conditionClaim: "Like new", buyerFee: null, shippingCost: null })], card, now);
    expect(seed.claimedCondition).toBe("Unknown"); expect(seed.buyerFee).toBeNull(); expect(seed.shipping).toBeNull();
  });
  it("discards sold, blocked, contradictory, non-USD, or unknown-price pages", () => {
    for (const row of [observation({ availability: "sold" }), observation({}, { status: "blocked" }), observation({}, { conflicts: ["itemPrice"] }),
      observation({ currency: "JPY" }), observation({ itemPrice: null }), observation({ availability: "unknown" })]) {
      expect(parseMercariObservations([row], card, now)).toEqual([]);
    }
  });
  it("rejects stale/research evidence and cross-page fact provenance", () => {
    expect(() => parseMercariObservations([observation({}, { observedAt: "2026-09-13T21:00:00Z" })], card, now)).toThrow(/stale/);
    expect(() => parseMercariObservations([observation({}, { label: "frontier-research" })], card, now)).toThrow(/schema/);
    const row = observation(); row.fields.itemPrice.sourceUrl = "https://www.mercari.com/us/item/m999/";
    expect(() => parseMercariObservations([row], card, now)).toThrow(/provenance/);
  });
  it("keeps graded and wrong-language description evidence out of eligible raw English inventory", () => {
    const [graded] = parseMercariObservations([observation({ description: "Japanese PSA 10 card" })], card, now);
    expect(graded.raw).toBe(false); expect(graded.matchAspectText).toContain("Japanese");
  });
  it("enables the direct adapter on Vercel with an explicit kill switch, independently of Apify", () => {
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("MERCARI_DIRECT_ENABLED", "");
    expect(isMercariDirectEnabled()).toBe(true);
    vi.stubEnv("MERCARI_DIRECT_ENABLED", "0"); expect(isMercariDirectEnabled()).toBe(false);
  });
  it("returns a collector access failure instead of caching empty success", async () => {
    vi.stubEnv("MERCARI_DIRECT_ENABLED", "1");
    const collect = vi.fn().mockRejectedValue(new Error("Mercari access restricted (HTTP 403)."));
    const input = { card, buyer: { country: "US", postalCode: "10001", desiredCondition: "Unknown", taxRate: null }, fetcher: vi.fn() } as never;
    await expect(searchMercariDirect(input, { collect })).rejects.toThrow(/403/);
    await expect(searchMercariDirect(input, { collect })).rejects.toThrow(/403/);
    expect(collect).toHaveBeenCalledTimes(2);
  });
});
