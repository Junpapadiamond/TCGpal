import { describe, expect, it } from "vitest";
import { selectEbayDetailTargets } from "./ebay";
import type { CardIdentityCandidate } from "@/lib/schemas";

type Summary = Parameters<typeof selectEbayDetailTargets>[0][number];
const card: CardIdentityCandidate = { id: "swsh11-186", name: "Giratina V", setName: "Lost Origin", setCode: "SWSH11", cardNumber: "186/196", language: "English", imageUrl: null, confidence: "high", matchReasons: [] };
const buyer = { country: "US" as const, postalCode: "", taxRate: null, desiredCondition: "Unknown" as const };
function row(itemId: string, overrides: Partial<Summary> = {}): Summary {
  return { itemId, title: "Giratina V 186/196 Lost Origin Near Mint English", price: { value: "820.99", currency: "USD" },
    shippingOptions: [{ shippingCost: { value: "0", currency: "USD" } }],
    seller: { feedbackPercentage: "100", feedbackScore: 1500 },
    image: { imageUrl: "https://i.ebayimg.com/images/g/first/s-l1600.jpg" },
    additionalImages: Array.from({ length: 5 }, (_, index) => ({ imageUrl: `https://i.ebayimg.com/images/g/photo${index}/s-l1600.jpg` })), ...overrides };
}

describe("bounded eBay detail recall", () => {
  it("checks an established competitive NM offer before low-history high-value offers regardless of item ID", () => {
    const strong = row("v1|377550589972|0");
    const thin = row("v1|100000000001|0", { price: { value: "765.82", currency: "USD" }, seller: { feedbackPercentage: "100", feedbackScore: 64 } });
    const expensive = row("v1|100000000002|0", { price: { value: "1499.99", currency: "USD" }, additionalImages: [] });
    expect(selectEbayDetailTargets([thin, expensive, strong], card, 1, buyer).map(r => r.itemId)).toEqual([strong.itemId]);
  });

  it("can investigate a cheap NM listing with missing shipping without pretending its shipping is free", () => {
    const pikachu = { ...card, id: "sv3pt5-25", name: "Pikachu", setName: "151", setCode: "SV3PT5", cardNumber: "25/165" };
    const cheap = row("v1|336757564424|0", { title: "Pikachu 25/165 151 Near Mint English", price: { value: "1.75", currency: "USD" }, shippingOptions: undefined });
    const costly = row("v1|100000000001|0", { ...cheap, itemId: "v1|100000000001|0", price: { value: "15", currency: "USD" }, shippingOptions: [{ shippingCost: { value: "5", currency: "USD" } }] });
    const result = selectEbayDetailTargets([costly, cheap], pikachu, 1, { ...buyer, desiredCondition: "Near Mint" });
    expect(result[0].itemId).toBe(cheap.itemId);
    expect(result[0].shippingOptions).toBeUndefined();
  });

  it("does not spend remaining detail slots on known product, language or condition conflicts", () => {
    const good = row("good");
    const rows = [good, row("rug", { title: "Giratina V 186/196 Rug" }), row("japanese", { title: "Giratina V 186/196 Japanese" }), row("played", { title: "Giratina V 186/196 Lightly Played English" })];
    expect(selectEbayDetailTargets(rows, card, 12, { ...buyer, desiredCondition: "Near Mint" }).map(r => r.itemId)).toEqual([good.itemId]);
  });

  it("reserves at most one of twelve slots for a concrete selected variation lacking title proof", () => {
    const exact = Array.from({ length: 14 }, (_, index) => row(`v1|1000000000${index.toString().padStart(2, "0")}|0`));
    const variation = row("v1|364533494574|634039152482", { title: "Pokemon Lost Origin Singles Choose Your Card" });
    const otherVariation = row("v1|464533494574|734039152482", { title: variation.title, price: { value: "1000", currency: "USD" } });
    const result = selectEbayDetailTargets([...exact, variation, otherVariation], card, 12, buyer);
    expect(result).toHaveLength(12);
    expect(result.filter(r => r.itemId === variation.itemId || r.itemId === otherVariation.itemId)).toHaveLength(1);
    expect(result.some(r => r.itemId === variation.itemId)).toBe(true);
    expect(new Set(result.map(r => r.itemId)).size).toBe(12);
    expect(selectEbayDetailTargets([...exact, variation, otherVariation].reverse(), card, 12, buyer).map(r => r.itemId)).toEqual(result.map(r => r.itemId));
  });
});
