import { describe, expect, it } from "vitest";
import { parseSearchIntent, needsSearchInterpretation } from "./search-intent";

describe("buyer search intent", () => {
  it.each([
    "Charizard under $150 in good condition",
    "150块以下的好品相的charizard",
    "我要搜150块一下的好品项的charizard",
    "找一张150美元以内、品相好的喷火龙",
    "Show me near mint Charizard below 150 USD",
    "Charizard NM, budget $150",
    "想找一张150美元以下品相好的老喷",
  ])("extracts an editable card, budget and condition from %s", (query) => {
    expect(parseSearchIntent(query, "pokemon")).toMatchObject({ query: "Charizard", budgetMax: 150, desiredCondition: "Near Mint", issue: null });
    expect(needsSearchInterpretation(query)).toBe(true);
  });
  it("retains collector numbers and uses only a money expression as a budget", () => {
    expect(parseSearchIntent("Charizard 4/102 under $150 LP or better", "pokemon")).toMatchObject({ query: "Charizard 4/102", budgetMax: 150, desiredCondition: "Lightly Played" });
    expect(parseSearchIntent("Pikachu 150/165", "pokemon").budgetMax).toBeNull();
    expect(needsSearchInterpretation("Pikachu 150/165")).toBe(false);
  });
  it.each(["Charizard up to 150", "Charizard at most 150", "Charizard maximum 150", "Charizard 150 or less"])("routes supported money expressions into interpretation: %s", (query) => {
    expect(needsSearchInterpretation(query)).toBe(true);
    expect(parseSearchIntent(query)).toMatchObject({ query: "Charizard", budgetMax: 150 });
  });
  it.each(["喷火龙人民币150以下", "Charizard under 150 CNY", "Charizard under €150"])("does not treat another currency as USD: %s", (query) => {
    expect(parseSearchIntent(query, "pokemon").issue).toBe("currency");
  });
  it("keeps graded searches outside the raw-single flow", () => {
    expect(parseSearchIntent("PSA 10 Charizard under $150", "pokemon").issue).toBe("graded");
  });
  it("does not invent a character for an unspecified card request", () => {
    expect(parseSearchIntent("找150美元以下品相好的卡", "pokemon").issue).toBe("card_required");
  });
  it("preserves language, game and print hints in the cleaned catalog query", () => {
    expect(parseSearchIntent("Luffy OP05-119 under $150 NM", "pokemon")).toMatchObject({ query: "Luffy OP05-119", game: "onePiece" });
    expect(parseSearchIntent("Japanese Charizard under $150", "pokemon").query).toBe("Japanese Charizard");
  });
  it.each(["Charizard not NM under $150", "Charizard between $50 and $150", "Charizard under $150 under $100", "Charizard $150", "不要NM的喷火龙150美元以下"])("asks to clarify unsupported or conflicting constraints: %s", (query) => {
    expect(parseSearchIntent(query).issue).toBe("clarify");
  });
});
