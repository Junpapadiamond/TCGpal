import { describe, expect, it } from "vitest";
import { parseCardQuery } from "@/lib/comparison/query-parser";

describe("parseCardQuery", () => {
  it("parses a One Piece Japanese promo query", () => {
    const result = parseCardQuery("P-096 One Piece Japanese Promo");
    expect(result.cardNumber).toBe("P-096");
    expect(result.game).toBe("onePiece");
    expect(result.language).toBe("Japanese");
    expect(result.variant).toBe("Promo");
    expect(result.gradingClaim).toBe("");
  });

  it("parses a graded Pokémon query, capturing the grading claim without inventing a game", () => {
    const result = parseCardQuery("Greninja Gold Star SWSH144 PSA 10");
    expect(result.name).toBe("Greninja");
    expect(result.variant).toBe("Gold Star");
    expect(result.cardNumber).toBe("SWSH144");
    expect(result.gradingClaim.toLowerCase()).toBe("psa 10");
    expect(result.game).toBeNull(); // "Greninja" alone is not a confident game signal
  });

  it("parses a plain fraction-style collector number the same as the multi-field form would", () => {
    const result = parseCardQuery("Umbreon VMAX 215/203");
    expect(result.name).toBe("Umbreon VMAX");
    expect(result.cardNumber).toBe("215/203");
    expect(result.language).toBe("");
    expect(result.variant).toBe("");
    expect(result.game).toBeNull();
  });

  it("prefers the fraction pattern over the letter-prefix pattern when both could apply", () => {
    const result = parseCardQuery("TG23/TG30 Umbreon VMAX");
    expect(result.cardNumber).toBe("TG23/TG30");
  });

  it("leaves name empty when the whole query is structured tokens (still resolvable by code alone)", () => {
    const result = parseCardQuery("OP01-024");
    expect(result.cardNumber).toBe("OP01-024");
    expect(result.name).toBe("");
  });

  it("does not false-positive a game or language token from ordinary text", () => {
    const result = parseCardQuery("Charizard Base Set 4/102");
    expect(result.game).toBeNull();
    expect(result.language).toBe("");
    expect(result.name).toBe("Charizard Base Set");
  });
});
