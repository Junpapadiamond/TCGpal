import { describe, expect, it } from "vitest";
import { assessPrintFidelity } from "@/lib/comparison/print-fidelity";
import { findOnePieceCatalogVariants } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";

const ACCEPTED = new Set(["exact", "compatible"]);
const sealedFamilies = ["EB01-006", "OP09-004", "OP09-051", "OP09-093", "OP13-119", "OP13-120"];

describe("sealed catalog-family holdout", () => {
  it("has zero sibling substitutions across six families not used to design the rules", () => {
    let substitutions = 0;
    let acceptedExact = 0;
    let exactExamples = 0;

    for (const family of sealedFamilies) {
      const siblings = findOnePieceCatalogVariants(family).map((print) =>
        mapOnePieceCardToIdentity(print, { confidence: "high", matchReasons: ["sealed holdout"] }),
      );
      expect(siblings.length, family).toBeGreaterThan(1);

      for (const observed of siblings) {
        exactExamples += 1;
        const evidence = [
          observed.id,
          observed.name,
          observed.cardNumber,
          observed.setName,
          observed.rarity ?? "",
          observed.variant ?? "base print",
          ...(observed.collectorAliases ?? []),
          ...(observed.exactMarkers ?? []),
          ...(observed.treatments ?? []),
          "English",
        ].filter(Boolean).join(" ");

        for (const selected of siblings) {
          const assessment = assessPrintFidelity({
            card: selected,
            matchText: evidence,
            listingPrice: 100,
            exactMarketAnchor: null,
          });
          if (!ACCEPTED.has(assessment.match)) continue;
          if (selected.id === observed.id) acceptedExact += 1;
          else substitutions += 1;
        }
      }
    }

    expect(exactExamples).toBeGreaterThan(0);
    expect(acceptedExact).toBeGreaterThan(0);
    expect(substitutions).toBe(0);
  });
});
