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
    expect(result.game).toBe("pokemon"); // SWSH promo codes exist only in Pokémon
  });

  it("parses a plain fraction-style collector number the same as the multi-field form would", () => {
    const result = parseCardQuery("Umbreon VMAX 215/203");
    expect(result.name).toBe("Umbreon VMAX");
    expect(result.cardNumber).toBe("215/203");
    expect(result.language).toBe("");
    expect(result.variant).toBe("");
    expect(result.game).toBe("pokemon"); // fraction collector numbers exist only in Pokémon
  });

  it("maps the common Moonbreon nickname to the exact Pokémon print", () => {
    const result = parseCardQuery("Japanese moonbreon");
    expect(result.game).toBe("pokemon");
    expect(result.name).toBe("Umbreon VMAX");
    expect(result.cardNumber).toBe("215/203");
    expect(result.language).toBe("Japanese");
    expect(result.variant).toBe("Alternate Art");
  });

  it("prefers the fraction pattern over the letter-prefix pattern when both could apply", () => {
    const result = parseCardQuery("TG23/TG30 Umbreon VMAX");
    expect(result.cardNumber).toBe("TG23/TG30");
  });

  it("leaves name empty when the whole query is structured tokens (still resolvable by code alone)", () => {
    const result = parseCardQuery("OP01-024");
    expect(result.cardNumber).toBe("OP01-024");
    expect(result.name).toBe("");
    expect(result.game).toBe("onePiece"); // OP set codes exist only in One Piece
  });

  it("infers One Piece from an OP/ST/EB code without the words 'one piece'", () => {
    expect(parseCardQuery("Monkey.D.Luffy OP01-024").game).toBe("onePiece");
    expect(parseCardQuery("Zoro ST01-004").game).toBe("onePiece");
    expect(parseCardQuery("Shanks EB01-006").game).toBe("onePiece");
  });

  it("parses a bare One Piece set code as a set filter, not a broken card number", () => {
    const result = parseCardQuery("Luffy op15");
    expect(result.name).toBe("Luffy");
    expect(result.setCode).toBe("OP-15");
    expect(result.cardNumber).toBe("");
    expect(result.game).toBe("onePiece");
  });

  it("zero-pads a single-digit set code to match the catalog's OP-01 format", () => {
    expect(parseCardQuery("Luffy op1").setCode).toBe("OP-01");
  });

  it("still parses a full collector number normally when a set code is also present", () => {
    const result = parseCardQuery("Luffy OP01-024");
    expect(result.cardNumber).toBe("OP01-024");
    expect(result.setCode).toBe("");
  });

  it("preserves One Piece collector treatments as distinct variant facets", () => {
    expect(parseCardQuery("Luffy manga").variant).toBe("Manga Art");
    expect(parseCardQuery("Luffy sp").variant).toBe("SP");
    expect(parseCardQuery("gold Gear 5 Luffy OP05-119").variant).toBe("Gold");
    expect(parseCardQuery("silver Luffy OP05-119").variant).toBe("Silver");
    expect(parseCardQuery("Luffy wanted poster").variant).toBe("Wanted Poster");
    expect(parseCardQuery("Luffy red super alt").variant).toBe("Red Super Alternate Art");
    expect(parseCardQuery("Koby treasure cup OP11-119").variant).toBe("Treasure Cup");
    expect(parseCardQuery("Luffy anniversary OP01-016").variant).toBe("Anniversary");
    expect(parseCardQuery("Luffy tournament winner ST01-012").variant).toBe("Tournament Winner");
  });

  it("parses natural event-release language without leaving tier words in the card name", () => {
    expect(parseCardQuery("3rd anniversary winner Luffy ST01-012")).toMatchObject({
      name: "Luffy",
      variant: "Tournament Winner",
      cardNumber: "ST01-012",
    });
    expect(parseCardQuery("Luffy Regional Champion OP03-123")).toMatchObject({
      name: "Luffy",
      variant: "Regional Champion",
      cardNumber: "OP03-123",
    });
    expect(parseCardQuery("Luffy signature OP05-119").variant).toBe("Signature");
    expect(parseCardQuery("Luffy serial numbered OP05-119").variant).toBe("Serial Numbered");
    expect(parseCardQuery("Luffy stamped OP05-119").variant).toBe("Stamped");
    expect(parseCardQuery("Luffy serialized OP07-119").variant).toBe("Serialized");
    expect(parseCardQuery("signed Luffy ST01-012").variant).toBe("Signed");
    expect(parseCardQuery("textured Yamato OP01-121").variant).toBe("Textured");
  });

  it("routes iconic One Piece character plus SP language to the One Piece catalog", () => {
    expect(parseCardQuery("Nami SP")).toMatchObject({ game: "onePiece", name: "Nami", variant: "SP" });
    expect(parseCardQuery("Luffy manga")).toMatchObject({ game: "onePiece", name: "Luffy", variant: "Manga Art" });
  });

  it("keeps ambiguous promo codes game-neutral", () => {
    // P-096 exists in both games' promo numbering; a wrong guess is worse than none.
    expect(parseCardQuery("Luffy P-096").game).toBeNull();
  });

  it("does not false-positive a language token from ordinary text", () => {
    const result = parseCardQuery("Charizard Base Set 4/102");
    expect(result.game).toBe("pokemon");
    expect(result.language).toBe("");
    expect(result.name).toBe("Charizard Base Set");
  });

  it("recognizes a short rarity code so 'sp' narrows to the special/parallel print", () => {
    const result = parseCardQuery("Luffy sp");
    expect(result.name).toBe("Luffy");
    expect(result.variant).toBe("SP");
  });

  it("expands the SIR abbreviation to its full Pokémon rarity name", () => {
    const result = parseCardQuery("Pikachu sir");
    expect(result.name).toBe("Pikachu");
    expect(result.variant).toBe("Special Illustration Rare");
  });

  it("prefers a full variant phrase over a short rarity code when both could apply", () => {
    const result = parseCardQuery("Charizard Alternate Art");
    expect(result.variant).toBe("Alternate Art");
  });

  it("does not treat 'sr' inside an ordinary word as a rarity code", () => {
    const result = parseCardQuery("Sriracha the Pikachu");
    expect(result.variant).toBe("");
  });
});
