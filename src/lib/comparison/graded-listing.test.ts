import { describe, expect, it } from "vitest";
import { isGradedListing } from "@/lib/comparison/graded-listing";

describe("graded-listing detection", () => {
  it.each([
    "Mew ex 232/091 PSA 10",
    "Nami OP01-016 BGS9.5",
    "Luffy OP05-119 CGC: 9",
    "Umbreon VMAX SGC#10",
    "Charizard ACE-9 Mint",
    "Mew ex 232/091 TAG 8.5",
    "Nami OP01-016 CGC Pristine 10",
    "Nami OP01-016 CGC Perfect 10",
    "Zoro OP01-025 BGS Black Label 10",
    "Robin EB03-055 ACE Mint 10",
    "Luffy OP05-119 TAG Gem Mint 10",
    "Luffy OP05-119 AGS 10 Gem Mint",
    "Mew ex graded 9",
    "Mew ex grading slab",
    "Mew ex slabbed card",
    "Pokemon Pikachu 025/165 151 Reverse Holo EN 2023 60HP Graded",
    "Pikachu 25/165 graded Near Mint",
    "Pikachu not graded by PSA, CGC 9",
    "Pikachu not yet graded, PSA 9",
    "Pikachu could be graded, PSA 9",
  ])("detects %s", (title) => {
    expect(isGradedListing(title)).toBe(true);
  });

  it.each([
    "Mew ex 232/091 ungraded raw",
    "Mew ex 232/091 Near Mint",
    "TAG TEAM GX raw card",
    "Ace of Spades promo card",
    "Pikachu 25/165 not graded",
    "Pikachu 25/165 not yet graded",
    "Pikachu 25/165 never graded",
    "Pikachu 25/165 never been graded",
    "Pikachu 25/165 non-graded raw card",
    "Pikachu 25/165 ready to be graded",
    "Pikachu 25/165 to be graded",
    "Pikachu 25/165 ready to get graded",
    "Pikachu 25/165 can be graded",
    "Pikachu 25/165 could be graded",
    "Pikachu 25/165 will be graded",
    "Pikachu 25/165 should be graded",
    "Pikachu 25/165 ready for grading",
    "Pikachu 25/165 graded candidate",
    "Pikachu 25/165 PSA 10 candidate, not graded",
  ])("does not classify raw title %s as graded", (title) => {
    expect(isGradedListing(title)).toBe(false);
  });
});
