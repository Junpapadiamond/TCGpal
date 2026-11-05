import { describe, expect, it } from "vitest";
import { isExcludedProduct } from "./product-type";

describe("explicit multiple-copy offers", () => {
  it.each([
    "4x Portgas D. Ace OP07-053 Promo Tournament Pack 2024 - One Piece TCG English NM",
    "x4 Nami OP01-016 Near Mint",
    "Pikachu 58/102 4 x Near Mint",
    "10× Tony Tony.Chopper ST01-006 NM",
  ])("excludes a bundle from the single-card comparison: %s", title => {
    expect(isExcludedProduct({ title })).toBe(true);
  });
  it.each([
    "1x Nami OP01-016 Near Mint", "Nami OP01-016 NM",
    "Charizard LV.X 143/147", "Mewtwo EX 163/162",
    "Tony Tony.Chopper ST01-006 Gift Collection 2023",
  ])("preserves ordinary single-card names and numbers: %s", title => {
    expect(isExcludedProduct({ title })).toBe(false);
  });
});

describe("explicit product alterations", () => {
  it.each([
    '"GHOST" Pikachu 25/165 Reverse Holo - NM - Sun Bleached 1.5 Years',
    "Pikachu 25/165 Sun-Bleached Reverse Holo",
    "Pikachu 25/165 not sun bleached, custom altered art",
    "Pikachu 25/165 never sun-bleached, actual sun bleached card",
  ])("excludes the seller-declared altered card: %s", title => {
    expect(isExcludedProduct({ title })).toBe(true);
  });

  it.each([
    "Pikachu Sun & Moon 42/149 Near Mint",
    "Blue-Eyes White Dragon Ghost Rare",
    "Bleach TCG Ichigo Kurosaki raw single",
    "Pikachu 25/165 Reverse Holo Near Mint",
    "Pikachu 25/165 not sun bleached",
    "Pikachu 25/165 never sun-bleached",
    "Pikachu 25/165 has never been sun bleached",
  ])("does not treat an ordinary set, rarity or franchise as alteration: %s", title => {
    expect(isExcludedProduct({ title })).toBe(false);
  });
});

describe("product exclusions observed in the frozen Pikachu search", () => {
  it.each([
    "Pokemon Pikachu 25/165 151 Non-Holo 3 Card Lot",
    "Sealed Promo Pokemon Together Pikachu 25/165 Stamped 151 Center 2023 Mint",
    "Pikachu 25/165 (2025 Holiday Calendar) Stamped Sealed | Scarlet & Violet 151",
    "Pokémon Card! Sealed Stamp Promo Pokémon Center EX Holo Choose Your Cards!",
    "6 Sealed Card Pokémon Holiday Pikachu 25/165 Eevee 133/165 Snowflake Promo",
  ])("retains the raw-single boundary for %s", title => {
    expect(isExcludedProduct({ title })).toBe(true);
  });
});
