import { describe, expect, it } from "vitest";
import { classifyPokemonName } from "@/lib/external/pokemon-name-match";

describe("Pokémon name matching", () => {
  it.each([
    ["Mew", "Mew", "exact"],
    ["Mew", "Mew ex", "form"],
    ["Mew", "Shining Mew", "form"],
    ["Mew", "Mewtwo", "unrelated"],
    ["Mew", "Mewtwo & Mew-GX", "unrelated"],
    ["Mewtwo", "M Mewtwo-EX", "form"],
    ["Mewtwo", "Armored Mewtwo", "form"],
    ["Mewtwo", "Team Rocket’s Mewtwo", "form"],
    ["Mewtwo", "Mewtwo Spirit Link", "unrelated"],
    ["Eevee", "Eevee & Snorlax-GX", "unrelated"],
    ["Umbreon", "Umbreon & Darkrai-GX", "unrelated"],
    ["Mewtwo & Mew-GX", "Mewtwo & Mew-GX", "exact"],
  ] as const)("classifies %s against %s", (requested, candidate, expected) => {
    expect(classifyPokemonName(requested, candidate)).toBe(expected);
  });
});
