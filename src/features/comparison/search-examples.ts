import type { ConditionClaim, TcgGame } from "@/lib/schemas";
import { resetForNewCardSearch, type ComparisonForm } from "./comparison-form-state";

export type SearchExample = {
  id: string;
  game: TcgGame;
  query: string;
  desiredCondition?: Exclude<ConditionClaim, "Unknown">;
};

// Search starters, never inventory, trending claims, or pre-confirmed prints.
// Natural-language starters go through intent parsing before catalog lookup.
// Plain queries may also set the visible condition control directly.
export const SEARCH_EXAMPLES: readonly SearchExample[] = [
  { id: "pokemon-charizard", game: "pokemon", query: "Charizard", desiredCondition: "Lightly Played" },
  { id: "pokemon-pikachu", game: "pokemon", query: "Pikachu 58/102" },
  { id: "pokemon-umbreon", game: "pokemon", query: "Umbreon VMAX 215/203" },
  { id: "pokemon-mew", game: "pokemon", query: "Mew ex 232/091" },
  { id: "pokemon-gengar", game: "pokemon", query: "Gengar", desiredCondition: "Near Mint" },
  { id: "pokemon-lugia", game: "pokemon", query: "Lugia V" },
  { id: "pokemon-rayquaza", game: "pokemon", query: "Rayquaza VMAX" },
  { id: "pokemon-dragonite", game: "pokemon", query: "Dragonite V" },
  { id: "pokemon-greninja", game: "pokemon", query: "Greninja Gold Star SWSH144" },
  { id: "pokemon-eevee", game: "pokemon", query: "Eevee" },
  { id: "pokemon-espeon", game: "pokemon", query: "Espeon V" },
  { id: "pokemon-gardevoir", game: "pokemon", query: "Gardevoir ex" },
  { id: "pokemon-mewtwo", game: "pokemon", query: "Mewtwo" },
  { id: "pokemon-snorlax", game: "pokemon", query: "Snorlax", desiredCondition: "Lightly Played" },
  { id: "pokemon-sylveon", game: "pokemon", query: "Sylveon VMAX" },
  { id: "pokemon-blastoise", game: "pokemon", query: "Blastoise" },
  { id: "pokemon-charizard-budget", game: "pokemon", query: "Charizard under $150 in good condition" },
  { id: "pokemon-pikachu-budget", game: "pokemon", query: "Pikachu under $50 NM" },
  { id: "onePiece-luffy", game: "onePiece", query: "Luffy OP05-119", desiredCondition: "Near Mint" },
  { id: "onePiece-luffy-budget", game: "onePiece", query: "Luffy under $150 NM" },
  { id: "onePiece-nami-budget", game: "onePiece", query: "Nami under $50 LP" },
  { id: "onePiece-nami", game: "onePiece", query: "Nami OP01-016" },
  { id: "onePiece-zoro", game: "onePiece", query: "Roronoa Zoro OP06-118" },
  { id: "onePiece-shanks", game: "onePiece", query: "Shanks" },
  { id: "onePiece-hancock", game: "onePiece", query: "Boa Hancock", desiredCondition: "Lightly Played" },
  { id: "onePiece-ace", game: "onePiece", query: "Portgas.D.Ace" },
  { id: "onePiece-law", game: "onePiece", query: "Trafalgar Law" },
  { id: "onePiece-sanji", game: "onePiece", query: "Sanji" },
  { id: "onePiece-robin", game: "onePiece", query: "Nico Robin" },
  { id: "onePiece-chopper", game: "onePiece", query: "Tony Tony Chopper" },
  { id: "onePiece-sabo", game: "onePiece", query: "Sabo" },
  { id: "onePiece-yamato", game: "onePiece", query: "Yamato" },
  { id: "onePiece-reiju", game: "onePiece", query: "Vinsmoke Reiju" },
  { id: "onePiece-perona", game: "onePiece", query: "Perona", desiredCondition: "Near Mint" },
  { id: "onePiece-brook", game: "onePiece", query: "Brook" },
  { id: "onePiece-katakuri", game: "onePiece", query: "Charlotte Katakuri" },
];

export function pickSearchExamples(
  game: TcgGame,
  previousIds: readonly string[] = [],
  random: () => number = Math.random,
): SearchExample[] {
  const pool = SEARCH_EXAMPLES.filter((item) => item.game === game);
  const fresh = pool.filter((item) => !previousIds.includes(item.id));
  const candidates = fresh.length >= 6 ? fresh : pool;
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [candidates[index], candidates[other]] = [candidates[other], candidates[index]];
  }
  return candidates.slice(0, 6);
}

export function applySearchExample(values: ComparisonForm, example: SearchExample): ComparisonForm {
  return {
    ...resetForNewCardSearch(values),
    heroQuery: example.query,
    game: example.game,
    desiredCondition: example.desiredCondition ?? values.desiredCondition,
  };
}
