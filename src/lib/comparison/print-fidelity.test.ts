import { describe, expect, it } from "vitest";
import { findOnePieceCatalogVariants } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";
import {
  assessPrintFidelity,
  PRINT_IDENTITY_EXCLUDE_RATIO,
  PRINT_IDENTITY_REVIEW_RATIO,
} from "@/lib/comparison/print-fidelity";

const namiPrints = findOnePieceCatalogVariants("OP01-016").map((card) =>
  mapOnePieceCardToIdentity(card, { confidence: "high", matchReasons: ["test"] }),
);
const kidAndKillerPrints = findOnePieceCatalogVariants("EB01-003").map((card) =>
  mapOnePieceCardToIdentity(card, { confidence: "high", matchReasons: ["test"] }),
);
const gearFivePrints = findOnePieceCatalogVariants("OP05-119").map((card) =>
  mapOnePieceCardToIdentity(card, { confidence: "high", matchReasons: ["test"] }),
);
const op13LuffyPrints = findOnePieceCatalogVariants("OP13-118").map((card) =>
  mapOnePieceCardToIdentity(card, { confidence: "high", matchReasons: ["test"] }),
);
const lawPrints = findOnePieceCatalogVariants("OP10-119").map((card) =>
  mapOnePieceCardToIdentity(card, { confidence: "high", matchReasons: ["test"] }),
);
const robinPrints = findOnePieceCatalogVariants("EB03-055").map((card) =>
  mapOnePieceCardToIdentity(card, { confidence: "high", matchReasons: ["test"] }),
);

describe("exact-print fidelity", () => {
  it("accepts seller-visible Manga evidence for the unique Trafalgar Law manga print", () => {
    const manga = lawPrints.find((card) => card.id === "OP10-119_p2")!;
    const titles = [
      "Trafalgar Law (119) (Manga) OP10-119 Royal Blood Foil",
      "Trafalgar Law MANGA OP10-119 Royal Blood Foil",
      "One Piece Card Game Trafalgar Law MANGA Character Card OP10-119 Royal Blood EN",
      "2025 One Piece Trafalgar Law Manga Alternate Art #OP10-119 NM",
      "One Piece - Trafalgar Law OP10-119 Alt Art Manga - Royal Blood English",
    ];

    for (const matchText of titles) {
      expect(assessPrintFidelity({
        card: manga,
        matchText,
        listingPrice: 800,
        exactMarketAnchor: 800,
      }), matchText).toMatchObject({ match: "compatible", confidence: "high" });
    }

    expect(assessPrintFidelity({
      card: manga,
      matchText: "Monkey D. Luffy Manga OP10-119 Royal Blood",
      listingPrice: 800,
      exactMarketAnchor: 800,
    }).match).toBe("unknown");
  });

  it("accepts seller-visible SP evidence for the unique Nico Robin Heroines print", () => {
    const special = robinPrints.find((card) => card.id === "EB03-055_p2")!;

    expect(assessPrintFidelity({
      card: special,
      matchText: "Nico Robin EB03-055 SP SR Parallel ONE PIECE Card Heroines edition 2025 - NM",
      listingPrice: 200,
      exactMarketAnchor: 200,
    })).toMatchObject({ match: "compatible", confidence: "high" });
  });

  it("keeps every bundled Nami print as a unique canonical identity", () => {
    expect(namiPrints).toHaveLength(8);
    expect(new Set(namiPrints.map((card) => card.id))).toHaveLength(8);
    expect(new Set(namiPrints.map((card) => card.imageUrl))).toHaveLength(8);
  });

  for (const selected of namiPrints) {
    for (const observed of namiPrints) {
      it(`${selected.id} ${selected.id === observed.id ? "accepts" : "rejects"} explicit ${observed.id} evidence`, () => {
        const result = assessPrintFidelity({
          card: selected,
          matchText: `${observed.name} ${observed.id} ${observed.variant ?? "base print"} ${observed.setName} ${observed.language}`,
          listingPrice: 100,
          exactMarketAnchor: 100,
        });

        if (selected.id === observed.id) {
          expect(["compatible", "exact"]).toContain(result.match);
          expect(result.match).not.toBe("exact");
        } else {
          expect(["compatible", "exact"]).not.toContain(result.match);
        }
      });
    }
  }

  it("does not treat generic alternate-art wording as proof of one Nami alternate print", () => {
    const selected = namiPrints.find((card) => card.id === "OP01-016_p2");
    expect(selected).toBeDefined();

    const result = assessPrintFidelity({
      card: selected!,
      matchText: "Nami OP01-016 Alternate Art Parallel",
      listingPrice: 90,
      exactMarketAnchor: 100,
    });

    expect(result.match).toBe("unknown");
    expect(result.reasons).toContain("one_piece_evidence_not_unique_across_siblings");
  });

  it("ignores seller-stated internal P-numbers as artwork evidence", () => {
    const selected = namiPrints.find((card) => card.id === "OP01-016_p2")!;
    expect(assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016 Alternate Art P2",
      listingPrice: 90,
      exactMarketAnchor: 100,
    }).match).toBe("unknown");
    expect(assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016 Alternate Art P1",
      listingPrice: 90,
      exactMarketAnchor: 100,
    }).match).toBe("unknown");
  });

  it("keeps generic SP wording unresolved without release corroboration", () => {
    const selected = namiPrints.find((card) => card.id === "OP01-016_p4");
    expect(selected).toBeDefined();

    const result = assessPrintFidelity({
      card: selected!,
      matchText: "Nami OP01-016 SP Special Art",
      listingPrice: 100,
      exactMarketAnchor: 100,
    });

    expect(result.match).toBe("unknown");
  });

  it("keeps a plain One Piece name and number unresolved for every sibling print", () => {
    for (const selected of namiPrints) {
      const result = assessPrintFidelity({
        card: selected,
        matchText: "Nami OP01-016",
        listingPrice: 100,
        exactMarketAnchor: 100,
      });

      expect(result.match, selected.id).toBe("unknown");
    }
  });

  it("does not let generic SP plus parallel wording prove an exact print", () => {
    const selected = namiPrints.find((card) => card.id === "OP01-016_p4")!;

    const result = assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016 SP Special Art Parallel",
      listingPrice: 100,
      exactMarketAnchor: 100,
    });

    expect(result.match).toBe("unknown");
    expect(result.reasons).toContain("one_piece_class_evidence_requires_corroboration");
  });

  it("treats explicit generic alternate-art evidence as a known mismatch for selected SP", () => {
    const selected = namiPrints.find((card) => card.id === "OP01-016_p4")!;
    expect(assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016 Alternate Art Parallel",
      listingPrice: 90,
      exactMarketAnchor: 100,
    }).match).toBe("mismatch");
    expect(assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016 Romance Dawn",
      listingPrice: 5,
      exactMarketAnchor: 100,
    }).match).toBe("mismatch");
  });

  it("uses price only as a secondary guard for unresolved print identity", () => {
    const selected = namiPrints.find((card) => card.id === "OP01-016_p4")!;
    const excluded = assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016",
      listingPrice: PRINT_IDENTITY_EXCLUDE_RATIO * 100 - 0.01,
      exactMarketAnchor: 100,
    });
    const inspect = assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016",
      listingPrice: (PRINT_IDENTITY_EXCLUDE_RATIO + PRINT_IDENTITY_REVIEW_RATIO) * 50,
      exactMarketAnchor: 100,
    });

    expect(excluded.priceGuard).toBe("exclude");
    expect(excluded.reasons).toContain("price_far_below_exact_print_anchor");
    expect(inspect.priceGuard).toBe("inspect");
  });

  it("does not let an internal suffix bypass unresolved-print price guards", () => {
    const selected = namiPrints.find((card) => card.id === "OP01-016_p4")!;
    const result = assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016_p4 SP Special Art (P4)",
      listingPrice: 20,
      exactMarketAnchor: 100,
    });

    expect(result.match).toBe("unknown");
    expect(result.priceGuard).toBe("exclude");
  });

  it("does not apply a price identity gate without an exact-print anchor", () => {
    const selected = namiPrints.find((card) => card.id === "OP01-016_p4")!;
    const result = assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016",
      listingPrice: 1,
      exactMarketAnchor: null,
    });

    expect(result.match).toBe("unknown");
    expect(result.priceGuard).toBe("none");
  });

  it("keeps manga, wanted-poster, silver, and gold Gear 5 prints in separate identity facets", () => {
    const manga = gearFivePrints.find((card) => card.id === "OP05-119_p2")!;
    const wanted = gearFivePrints.find((card) => card.id === "OP05-119_p6")!;
    const silver = gearFivePrints.find((card) => card.id === "OP05-119_p7")!;
    const gold = gearFivePrints.find((card) => card.id === "OP05-119_p8")!;

    expect(assessPrintFidelity({ card: manga, matchText: "Gear 5 Luffy OP05-119 Manga Rare", listingPrice: 800, exactMarketAnchor: 800 }).match).toBe("unknown");
    expect(assessPrintFidelity({ card: manga, matchText: `${manga.id} Gear 5 Luffy OP05-119 Manga Rare ${manga.setName} English`, listingPrice: 800, exactMarketAnchor: 800 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: wanted, matchText: `${wanted.id} Gear 5 Luffy OP05-119 Wanted Poster English`, listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: gold, matchText: "Gear 5 Luffy OP05-119 Gold Special Art English", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: gold, matchText: "Gear 5 Luffy OP05-119 Silver Special Art", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("mismatch");
    expect(assessPrintFidelity({ card: silver, matchText: "Gear 5 Luffy OP05-119 Gold Special Art", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("mismatch");
    expect(assessPrintFidelity({ card: gold, matchText: "Gear 5 Luffy OP05-119 SP Special Art", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("unknown");
  });

  it("distinguishes ordinary, super, red-super, and wanted-poster OP13 artwork", () => {
    const ordinary = op13LuffyPrints.find((card) => card.id === "OP13-118_p1")!;
    const superAlt = op13LuffyPrints.find((card) => card.id === "OP13-118_p2")!;
    const redSuperAlt = op13LuffyPrints.find((card) => card.id === "OP13-118_p3")!;
    const wanted = op13LuffyPrints.find((card) => card.id === "OP13-118_p4")!;

    expect(assessPrintFidelity({ card: superAlt, matchText: "Luffy OP13-118 Super Alternate Art", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("unknown");
    expect(assessPrintFidelity({ card: redSuperAlt, matchText: "Luffy OP13-118 Red Super Alternate Art English", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: redSuperAlt, matchText: "Luffy OP13-118 Super Alternate Art", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("unknown");
    expect(assessPrintFidelity({ card: wanted, matchText: `${wanted.id} Luffy OP13-118 Wanted Poster English`, listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: ordinary, matchText: "Luffy OP13-118 Wanted Poster", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("mismatch");
  });

  it("distinguishes tournament-pack and winner siblings that share one release name", () => {
    const prints = findOnePieceCatalogVariants("ST01-012").map((card) =>
      mapOnePieceCardToIdentity(card, { confidence: "high", matchReasons: ["test"] }),
    );
    const pack = prints.find((card) => card.id === "ST01-012_p5")!;
    const winner = prints.find((card) => card.id === "ST01-012_p6")!;
    const generic = "Monkey.D.Luffy ST01-012 Alternate Art 3rd Anniversary Event";

    expect(assessPrintFidelity({ card: pack, matchText: generic, listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("unknown");
    expect(assessPrintFidelity({ card: winner, matchText: generic, listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("unknown");
    expect(assessPrintFidelity({ card: pack, matchText: "Luffy ST01-012 3rd Anniversary Tournament Pack English", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: winner, matchText: "Luffy ST01-012 3rd Anniversary Winner English", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: winner, matchText: "Luffy ST01-012 3rd Anniversary Tournament Pack", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("mismatch");
  });

  it("applies the same family ambiguity rules to another One Piece multi-print card", () => {
    const base = kidAndKillerPrints.find((card) => card.id === "EB01-003")!;
    const special = kidAndKillerPrints.find((card) => card.id === "EB01-003_p5")!;

    expect(assessPrintFidelity({
      card: base,
      matchText: "Kid & Killer EB01-003",
      listingPrice: 20,
      exactMarketAnchor: 20,
    }).match).toBe("unknown");
    expect(assessPrintFidelity({
      card: special,
      matchText: "Kid & Killer EB01-003 SP Special Art Parallel",
      listingPrice: 100,
      exactMarketAnchor: 100,
    }).match).toBe("unknown");
  });

  it("requires Pokémon listing text to prove the selected collector number and card name", () => {
    const pokemon = {
      id: "swsh7-215",
      name: "Umbreon VMAX",
      setName: "Evolving Skies",
      setCode: "SWSH7",
      cardNumber: "215/203",
      language: "English",
      imageUrl: "https://images.pokemontcg.io/swsh7/215_hires.png",
      confidence: "high" as const,
      matchReasons: [],
    };

    expect(assessPrintFidelity({
      card: pokemon,
      matchText: "Umbreon VMAX Evolving Skies",
      listingPrice: 400,
      exactMarketAnchor: 420,
    }).match).toBe("unknown");
    expect(assessPrintFidelity({
      card: pokemon,
      matchText: "Pokemon card 215/203",
      listingPrice: 400,
      exactMarketAnchor: 420,
    }).match).toBe("unknown");
    expect(assessPrintFidelity({
      card: pokemon,
      matchText: "Umbreon VMAX 215/203 Evolving Skies",
      listingPrice: 40,
      exactMarketAnchor: 420,
    })).toMatchObject({ match: "compatible", priceGuard: "none" });
  });

  it("accepts Bubble Mew when the listing uses the official zero-padded denominator", () => {
    const bubbleMew = {
      id: "sv4pt5-232",
      name: "Mew ex",
      setName: "Paldean Fates",
      setCode: "SV4PT5",
      cardNumber: "232/91",
      language: "English",
      imageUrl: "https://images.pokemontcg.io/sv4pt5/232_hires.png",
      confidence: "high" as const,
      matchReasons: [],
    };
    const listingEvidence = [
      "Mew ex 232/091 SV: Paldean Fates NM RAW",
      "Card Number: 232/091",
      "Card Name: Mew Ex",
      "Set: SV: Paldean Fates",
      "Rarity: Special Illustration Rare",
      "Language: English",
    ].join(". ");

    const assessment = assessPrintFidelity({
      card: bubbleMew,
      matchText: listingEvidence,
      listingPrice: 950,
      exactMarketAnchor: 900,
    });

    expect(assessment).toMatchObject({
      match: "compatible",
      confidence: "high",
      reasons: ["pokemon_full_number_and_name_match"],
      priceGuard: "none",
    });
  });

  // 1,628 of 2,634 One Piece collector numbers (61.8%) carry exactly one print.
  // For those there is no sibling to be mistaken for, so the number plus the card
  // name is the whole proof — the same standard classifyPokemonPrintIdentity
  // applies. Measured on 2026-08-10, ST01-001 returned 50 live listings and zero
  // eligible: every plain title fell through to the sibling-marker rules, which
  // cannot be satisfied when the witness set has one member.
  describe("collector numbers with a single catalogued print", () => {
    const singlePrint = (cardNumber: string) => {
      const prints = findOnePieceCatalogVariants(cardNumber);
      expect(prints, `${cardNumber} must have exactly one catalogued print`).toHaveLength(1);
      return mapOnePieceCardToIdentity(prints[0], { confidence: "high", matchReasons: ["test"] });
    };

    it.each([
      ["ST01-001", "One Piece Card Game Monkey.D.Luffy ST01-001 Leader Straw Hat Crew English NM"],
      ["ST01-001", "Monkey D Luffy ST01-001 L Straw Hat Crew OP TCG"],
      ["OP01-009", "One Piece TCG Carrot OP01-009 Romance Dawn Common English"],
    ])("accepts a plain title for %s as proof of the only print", (cardNumber, matchText) => {
      expect(assessPrintFidelity({
        card: singlePrint(cardNumber),
        matchText,
        listingPrice: 4,
        exactMarketAnchor: 4,
      }), matchText).toMatchObject({
        match: "compatible",
        confidence: "high",
        reasons: ["one_piece_single_print_number_is_unambiguous"],
      });
    });

    it("still rejects a listing claiming artwork this number does not have", () => {
      for (const matchText of [
        "Monkey.D.Luffy ST01-001 Alternate Art Straw Hat Crew",
        "Monkey.D.Luffy ST01-001 Manga Rare Straw Hat Crew",
        "Monkey.D.Luffy ST01-001 Gold Straw Hat Crew",
      ]) {
        expect(assessPrintFidelity({
          card: singlePrint("ST01-001"),
          matchText,
          listingPrice: 4,
          exactMarketAnchor: 4,
        }).match, matchText).toBe("mismatch");
      }
    });

    it("still rejects a wrong collector number or a wrong card name", () => {
      for (const matchText of ["Monkey.D.Luffy ST01-002 Straw Hat Crew", "Roronoa Zoro ST01-001 Straw Hat Crew"]) {
        expect(assessPrintFidelity({
          card: singlePrint("ST01-001"),
          matchText,
          listingPrice: 4,
          exactMarketAnchor: 4,
        }).match, matchText).not.toBe("compatible");
      }
    });

    it("leaves multi-print numbers needing positive evidence", () => {
      const nami = namiPrints.find((card) => card.id === "OP01-016")!;

      expect(assessPrintFidelity({
        card: nami,
        matchText: "One Piece Card Game Nami OP01-016 English NM",
        listingPrice: 4,
        exactMarketAnchor: 4,
      })).toMatchObject({ match: "unknown", reasons: ["plain_family_listing_does_not_identify_print"] });
    });
  });
});
