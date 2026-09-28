import { describe, expect, it } from "vitest";
import { buildRecallCoverage } from "./recall-probe";
import { normalizeListing } from "./ranking";
import { buyerContextSchema, cardIdentityCandidateSchema, listingSeedSchema } from "@/lib/schemas";

const card = cardIdentityCandidateSchema.parse({ id: "sv4pt5-232", name: "Mew ex", setName: "Paldean Fates", setCode: "sv4pt5", cardNumber: "232/91", language: "English", confidence: "high", matchReasons: [], marketMid: 100 });
const buyer = buyerContextSchema.parse({ desiredCondition: "Near Mint" });
const seed = (id: string, price: number, extra = {}) => listingSeedSchema.parse({
  id, marketplace: "eBay", url: `https://www.ebay.com/itm/${id}`, title: "Mew ex 232/091 Near Mint", cardId: card.id,
  price, shipping: 0, claimedCondition: "Near Mint", active: true, raw: true, currency: "USD", matchConfidence: "high", matchReasons: [],
  seller: {}, evidence: {}, observedAt: "2026-09-28T12:00:00.000Z", demo: false, userSupplied: false, ...extra,
});
const baseline = [normalizeListing({ listing: seed("baseline", 100), buyer, confirmedCard: card, marketPrice: 100 })];
function coverage(rows = [seed("new", 80)], extra = {}) {
  return buildRecallCoverage({ card, buyer, baseline, observation: { marketplace: "eBay", attempts: [], status: "complete", query: { kind: "keyword", value: "Mew ex 232/091" }, observedAt: "2026-09-28T12:00:00.000Z", returnedCount: rows.length, seeds: rows, ...extra } });
}

describe("bounded recall evidence", () => {
  it("flags only a new complete-cost match below the baseline cheapest, without mutating the baseline", () => {
    expect(coverage()).toMatchObject({ status: "cheaper_found", baselineCheapestTotal: 100, newCount: 1, comparableCount: 1, listing: { id: "new", preTaxTotal: 80 } });
    expect(baseline.map(row => row.id)).toEqual(["baseline"]);
    expect(coverage([seed("baseline", 70)])).toMatchObject({ status: "no_cheaper_found", newCount: 0, listing: null });
  });
  it("compares against Cheapest rather than Best Value and includes shipping", () => {
    expect(coverage([seed("new", 80, { shipping: 30 })])).toMatchObject({ status: "no_cheaper_found", comparableCount: 1 });
    expect(coverage([seed("equal", 90, { shipping: 10 })])).toMatchObject({ status: "no_cheaper_found" });
  });
  it.each([
    { shipping: null }, { buyerFee: null, buyerFeeStatus: "unknown" }, { claimedCondition: "Unknown", title: "Mew ex 232/091" },
  ])("marks incomplete evidence inconclusive: %j", extra => {
    expect(coverage([seed("new", 80, extra)])).toMatchObject({ status: "inconclusive", listing: null, unresolvedCount: 1 });
  });
  it.each([
    { title: "Mew ex 232/091 gold metal card" }, { price: 1 }, { title: "Mew ex 231/091 Near Mint" },
    { claimedCondition: "Lightly Played" }, { active: false }, { title: "Mew ex 232/091 PSA 10", raw: false },
  ])("retains deterministic exclusions: %j", extra => {
    expect(coverage([seed("new", 80, extra)])).toMatchObject({ status: "no_cheaper_found", comparableCount: 0, listing: null });
  });
  it("does not call an additional match cheaper when the baseline abstained", () => {
    expect(buildRecallCoverage({ card, buyer, baseline: [], observation: { marketplace: "eBay", attempts: [], status: "complete", query: { kind: "keyword", value: "Mew ex 232/091" }, observedAt: "2026-09-28T12:00:00.000Z", returnedCount: 1, seeds: [seed("new", 80)] } })).toMatchObject({ status: "additional_match", baselineCheapestTotal: null, listing: { id: "new" } });
  });
  it("keeps failure separate from a successful negative sample", () => {
    expect(coverage([], { status: "failed" })).toMatchObject({ status: "failed", listing: null });
  });
});
