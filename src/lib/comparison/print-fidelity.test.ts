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

describe("exact-print fidelity", () => {
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
          matchText: `${observed.id} ${observed.variant ?? "base print"} ${observed.setName}`,
          listingPrice: 100,
          exactMarketAnchor: 100,
        });

        expect(result.match).toBe(selected.id === observed.id ? "exact" : "mismatch");
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
    expect(result.reasons).toContain("multiple_siblings_share_researched_artwork");
  });

  it("uses a seller-stated P-number without parentheses as exact sibling evidence", () => {
    const selected = namiPrints.find((card) => card.id === "OP01-016_p2")!;
    expect(assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016 Alternate Art P2",
      listingPrice: 90,
      exactMarketAnchor: 100,
    }).match).toBe("exact");
    expect(assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016 Alternate Art P1",
      listingPrice: 90,
      exactMarketAnchor: 100,
    }).match).toBe("mismatch");
  });

  it("accepts SP wording as compatible when the selected card number has one SP print", () => {
    const selected = namiPrints.find((card) => card.id === "OP01-016_p4");
    expect(selected).toBeDefined();

    const result = assessPrintFidelity({
      card: selected!,
      matchText: "Nami OP01-016 SP Special Art",
      listingPrice: 100,
      exactMarketAnchor: 100,
    });

    expect(result.match).toBe("compatible");
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

  it("recognizes exact SP wording even when the title also calls it a parallel", () => {
    const selected = namiPrints.find((card) => card.id === "OP01-016_p4")!;

    const result = assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016 SP Special Art Parallel",
      listingPrice: 100,
      exactMarketAnchor: 100,
    });

    expect(result.match).toBe("compatible");
    expect(result.reasons).toContain("listing_names_unique_researched_artwork");
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

  it("never rejects an explicitly exact print solely because it is a bargain", () => {
    const selected = namiPrints.find((card) => card.id === "OP01-016_p4")!;
    const result = assessPrintFidelity({
      card: selected,
      matchText: "Nami OP01-016_p4 SP Special Art (P4)",
      listingPrice: 20,
      exactMarketAnchor: 100,
    });

    expect(result.match).toBe("exact");
    expect(result.priceGuard).toBe("none");
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
    expect(assessPrintFidelity({ card: manga, matchText: `Gear 5 Luffy OP05-119 Manga Rare ${manga.setName}`, listingPrice: 800, exactMarketAnchor: 800 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: wanted, matchText: "Gear 5 Luffy OP05-119 Wanted Poster", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: gold, matchText: "Gear 5 Luffy OP05-119 Gold Special Art", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: gold, matchText: "Gear 5 Luffy OP05-119 Silver Special Art", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("mismatch");
    expect(assessPrintFidelity({ card: silver, matchText: "Gear 5 Luffy OP05-119 Gold Special Art", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("mismatch");
    expect(assessPrintFidelity({ card: gold, matchText: "Gear 5 Luffy OP05-119 SP Special Art", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("unknown");
  });

  it("distinguishes ordinary, super, red-super, and wanted-poster OP13 artwork", () => {
    const ordinary = op13LuffyPrints.find((card) => card.id === "OP13-118_p1")!;
    const superAlt = op13LuffyPrints.find((card) => card.id === "OP13-118_p2")!;
    const redSuperAlt = op13LuffyPrints.find((card) => card.id === "OP13-118_p3")!;
    const wanted = op13LuffyPrints.find((card) => card.id === "OP13-118_p4")!;

    expect(assessPrintFidelity({ card: superAlt, matchText: "Luffy OP13-118 Super Alternate Art", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: redSuperAlt, matchText: "Luffy OP13-118 Red Super Alternate Art", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: redSuperAlt, matchText: "Luffy OP13-118 Super Alternate Art", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("mismatch");
    expect(assessPrintFidelity({ card: wanted, matchText: "Luffy OP13-118 Wanted Poster", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
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
    expect(assessPrintFidelity({ card: pack, matchText: "Luffy ST01-012 3rd Anniversary Tournament Pack", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
    expect(assessPrintFidelity({ card: winner, matchText: "Luffy ST01-012 3rd Anniversary Winner", listingPrice: 100, exactMarketAnchor: 100 }).match).toBe("compatible");
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
    }).match).toBe("compatible");
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
});
