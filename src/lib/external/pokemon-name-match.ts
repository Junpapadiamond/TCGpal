export type PokemonNameMatch = "exact" | "form" | "related" | "unrelated";

const formWords = new Set([
  "ex", "gx", "v", "vmax", "vstar", "radiant", "shining", "armored", "dark", "light",
  "m", "team", "rocket", "rockets", "star", "delta", "species",
]);

export function classifyPokemonName(requested: string, candidate: string): PokemonNameMatch {
  const query = normalize(requested);
  const name = normalize(candidate);
  if (!query || !name) return "unrelated";
  if (query === name) return "exact";

  const queryIsCombo = isCombo(query);
  const candidateIsCombo = isCombo(name);
  if (queryIsCombo !== candidateIsCombo) return "unrelated";
  if (/\bspirit link\b|\btrainer\b|\bsupporter\b|\bstadium\b/.test(name)
    && !/\bspirit link\b|\btrainer\b|\bsupporter\b|\bstadium\b/.test(query)) {
    return "unrelated";
  }

  const queryTokens = tokens(query);
  const candidateTokens = tokens(name);
  if (queryIsCombo) {
    return queryTokens.every((token) => candidateTokens.includes(token)) ? "form" : "unrelated";
  }

  const coreQuery = queryTokens.filter((token) => !formWords.has(token));
  const coreCandidate = candidateTokens.filter((token) => !formWords.has(token));
  if (coreQuery.length > 0 && coreQuery.every((token) => coreCandidate.includes(token))) return "form";

  const overlap = coreQuery.filter((token) => coreCandidate.includes(token)).length;
  return overlap > 0 && overlap / Math.max(coreQuery.length, coreCandidate.length) >= 0.75
    ? "related"
    : "unrelated";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[’']/g, "").replace(/[-.]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return value.split(/[^a-z0-9]+/).filter(Boolean);
}

function isCombo(value: string) {
  return /\s(?:&|and)\s/.test(value);
}
