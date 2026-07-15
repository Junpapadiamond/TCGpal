import { describe, expect, it } from "vitest";
import { assessPrintFidelity } from "@/lib/comparison/print-fidelity";
import { findOnePieceCatalogVariants } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";

const ACCEPTED = new Set(["exact", "compatible"]);
const corpusFamilies = [
  "EB03-053",
  "EB03-055",
  "OP01-016",
  "OP01-025",
  "OP05-119",
  "OP06-118",
  "OP07-053",
  "OP09-027",
  "ST01-012",
];

function candidate(printId: string) {
  const entry = corpusFamilies
    .flatMap((family) => findOnePieceCatalogVariants(family))
    .find((print) => (print.card_image_id ?? print.card_set_id).toUpperCase() === printId.toUpperCase());
  if (!entry) throw new Error(`Missing bundled print ${printId}`);
  return mapOnePieceCardToIdentity(entry, { confidence: "high", matchReasons: ["test"] });
}

function classify(printId: string, title: string) {
  return assessPrintFidelity({
    card: candidate(printId),
    matchText: title,
    listingPrice: 100,
    exactMarketAnchor: null,
  });
}

describe("One Piece all-sibling positive proof", () => {
  it.each([
    ["EB03-055_p2", "Nico Robin EB03-055 SR One Piece Heroines Edition English NM"],
    ["EB03-053_p2", "Nami EB03-053 One Piece Heroines Edition Near Mint English"],
    ["OP01-016_p4", "Nami OP01-016 SP English 1st Anniversary One Piece Card Game NM"],
    ["OP06-118_p2", "Roronoa Zoro OP06-118 SEC Wings of the Captain English NM"],
  ])("does not accept confirmed false positive %s", (printId, title) => {
    expect(ACCEPTED.has(classify(printId, title).match)).toBe(false);
  });

  it("ignores bare and fully-qualified internal suffixes without corroboration", () => {
    expect(classify("OP01-016_p4", "Nami OP01-016 P4").match).toBe("unknown");
    expect(classify("OP01-016_p4", "Nami OP01-016_p4").match).toBe("unknown");
    expect(classify("OP01-016_p4", "Nami OP01-016 P1").match).toBe("unknown");
  });

  for (const family of corpusFamilies) {
    const siblings = findOnePieceCatalogVariants(family).map((print) =>
      mapOnePieceCardToIdentity(print, { confidence: "high", matchReasons: ["matrix"] }),
    );
    for (const observed of siblings) {
      const observedEvidence = [
        observed.name,
        observed.cardNumber,
        observed.setName,
        observed.rarity ?? "",
        (observed.variant ?? "base print").replace(/\s*\([PR]\d+\)\s*/gi, " "),
        ...(observed.collectorAliases ?? []),
        ...(observed.exactMarkers ?? []),
        ...(observed.treatments ?? []),
        observed.language,
      ].filter(Boolean).join(" ");
      for (const selected of siblings.filter((print) => print.id !== observed.id)) {
        it(`${family}: ${observed.id} evidence never admits sibling ${selected.id}`, () => {
          const assessment = assessPrintFidelity({
            card: selected,
            matchText: observedEvidence,
            listingPrice: 100,
            exactMarketAnchor: null,
          });
          expect(ACCEPTED.has(assessment.match), `${assessment.match}: ${assessment.reasons.join(",")}`).toBe(false);
        });
      }
    }
  }
});
