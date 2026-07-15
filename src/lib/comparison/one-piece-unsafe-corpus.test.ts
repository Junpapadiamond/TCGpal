import { describe, expect, it } from "vitest";
import { assessPrintFidelity } from "@/lib/comparison/print-fidelity";
import { findOnePieceCatalogVariant } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";
import corpus from "@/lib/comparison/one-piece-unsafe-corpus.json";

const ACCEPTED = new Set(["exact", "compatible"]);

describe("pending-review One Piece unsafe acceptance corpus", () => {
  it("keeps all 271 historical unsafe acceptances out of exact and compatible", () => {
    expect(corpus.sourceStatus).toBe("pendingHumanReview");
    expect(corpus.fixtures).toHaveLength(271);
    expect(corpus.fixtures.filter((fixture) => fixture.severity === "substitution")).toHaveLength(224);
    expect(corpus.fixtures.filter((fixture) => fixture.severity === "unrelated_accept")).toHaveLength(39);
    expect(corpus.fixtures.filter((fixture) => fixture.severity === "uncertain_accept")).toHaveLength(8);

    const unsafe = corpus.fixtures.flatMap((fixture) => {
      const print = findOnePieceCatalogVariant(fixture.printId);
      if (!print) throw new Error(`Missing bundled print ${fixture.printId}`);
      const assessment = assessPrintFidelity({
        card: mapOnePieceCardToIdentity(print, { confidence: "high", matchReasons: ["corpus"] }),
        matchText: fixture.title,
        listingPrice: fixture.priceUsd,
        exactMarketAnchor: null,
      });
      return ACCEPTED.has(assessment.match) ? [{ fixture, assessment }] : [];
    });

    expect(unsafe).toEqual([]);
  });
});
