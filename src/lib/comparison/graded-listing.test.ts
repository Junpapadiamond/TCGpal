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
    "Mew ex graded 9",
    "Mew ex grading slab",
    "Mew ex slabbed card",
  ])("detects %s", (title) => {
    expect(isGradedListing(title)).toBe(true);
  });

  it.each([
    "Mew ex 232/091 ungraded raw",
    "Mew ex 232/091 Near Mint",
    "TAG TEAM GX raw card",
    "Ace of Spades promo card",
  ])("does not classify raw title %s as graded", (title) => {
    expect(isGradedListing(title)).toBe(false);
  });
});
