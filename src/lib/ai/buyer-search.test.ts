import { describe, expect, it, vi } from "vitest";
import { interpretBuyerSearch, resolveBuyerSearch } from "./buyer-search";
import { parseSearchIntent } from "@/lib/comparison/search-intent";
import type { AiProvider } from "./provider";

describe("buyer search orchestration", () => {
  it("uses AI for meaning while keeping the stated numeric ceiling authoritative", async () => {
    const completeJson = vi.fn().mockResolvedValue({ data: { ...parseSearchIntent("Charizard under $150 NM"), query: "Charizard", budgetMax: 900 }, model: "test", provider: "test" });
    const result = await interpretBuyerSearch("想找一张150美元以下品相好的老喷", "pokemon", { provider: { completeJson } as AiProvider });
    expect(result).toMatchObject({ query: "Charizard", budgetMax: 150, desiredCondition: "Near Mint", source: "ai" });
    expect(completeJson.mock.calls[0][0]).toMatchObject({ timeoutMs: 8000, reasoningEffort: "low" });
  });
  it("falls back to working deterministic intent when the model fails", async () => {
    const completeJson = vi.fn().mockRejectedValue(new Error("timeout"));
    expect(await interpretBuyerSearch("150块以下的好品相的charizard", "pokemon", { provider: { completeJson } as AiProvider })).toMatchObject({ query: "Charizard", budgetMax: 150, source: "fallback", issue: null });
  });
  it("does not spend a model or catalog request on unsupported currency", async () => {
    const provider = { completeJson: vi.fn() } as AiProvider;
    expect(await interpretBuyerSearch("人民币150以下Charizard", "pokemon", { provider })).toMatchObject({ issue: "currency" });
    expect(provider.completeJson).not.toHaveBeenCalled();
  });
  it("does not let a model silently remove an exact collector number", async () => {
    const provider = { completeJson: vi.fn().mockResolvedValue({ data: parseSearchIntent("Charizard under $150") }) } as AiProvider;
    expect(await interpretBuyerSearch("Charizard 4/102 under $150", "pokemon", { provider })).toMatchObject({ query: "Charizard 4/102", source: "fallback" });
  });
  it("does not confuse the buyer's language with the card language or invent a print", async () => {
    const provider = { completeJson: vi.fn().mockResolvedValue({ data: { ...parseSearchIntent("Charizard under $150"), query: "charizard language:chinese" } }) } as AiProvider;
    expect(await interpretBuyerSearch("我要搜150块以下的好品相的Charizard", "pokemon", { provider })).toMatchObject({ query: "Charizard", source: "fallback", issue: null });
  });
  it("returns the version gallery for budget queries without marketplace comparisons", async () => {
    const card = { id: "charizard", name: "Charizard", setName: "Base", setCode: "BASE", cardNumber: "4/102", language: "English", confidence: "high" as const, matchReasons: [] };
    const identify = vi.fn().mockResolvedValue({ identityContractVersion: 1, status: "resolved", candidates: [card], confirmedCard: card, warnings: [], generatedAt: "2026-09-28T00:00:00Z" });
    const prices = vi.fn().mockResolvedValue({ cards: [card], checked: 1 });
    const response = await resolveBuyerSearch({ query: "Charizard under $150 NM", interpretQuery: true }, { identify, prices, provider: null });
    expect(identify.mock.calls[0][0]).toMatchObject({ query: "Charizard", cardHint: { name: "", game: "pokemon" } });
    expect(response).toMatchObject({ status: "needs_confirmation", confirmedCard: null, searchIntent: { budgetMax: 150 }, priceCoverage: { checked: 1, total: 1 } });
  });
});
