import { describe, expect, it } from "vitest";
import { normalizeListing } from "@/lib/comparison/ranking";
import { findOnePieceCatalogVariant } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";
import corpus from "@/lib/comparison/one-piece-unsafe-corpus.json";

describe("pending-review One Piece unsafe acceptance corpus", () => {
  it("keeps all historical unrelated products out at the complete eligibility boundary", () => {
    expect(corpus.sourceStatus).toBe("pendingHumanReview");
    expect(corpus.fixtures).toHaveLength(271);
    expect(corpus.fixtures.filter((fixture) => fixture.severity === "substitution")).toHaveLength(224);
    expect(corpus.fixtures.filter((fixture) => fixture.severity === "unrelated_accept")).toHaveLength(39);
    expect(corpus.fixtures.filter((fixture) => fixture.severity === "uncertain_accept")).toHaveLength(8);

    const unsafe = corpus.fixtures.filter((fixture) => fixture.severity === "unrelated_accept").flatMap((fixture) => {
      const print = findOnePieceCatalogVariant(fixture.printId);
      if (!print) throw new Error(`Missing bundled print ${fixture.printId}`);
      const card = mapOnePieceCardToIdentity(print, { confidence: "high", matchReasons: ["corpus"] });
      const listing = normalizeListing({
        listing: {
          id: `${fixture.family}-${fixture.rowIndex}`,
          marketplace: "eBay",
          url: null,
          title: fixture.title,
          cardId: card.id,
          matchConfidence: "high",
          matchReasons: ["corpus"],
          active: true,
          raw: true,
          currency: "USD",
          price: fixture.priceUsd,
          shipping: 0,
          claimedCondition: "Near Mint",
          imageUrl: null,
          seller: { feedbackPercentage: null, feedbackCount: null, returnsAccepted: null, topRated: null, buyerProtection: null, subRatings: null },
          evidence: { photoCount: 0, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: false, substantiveConditionNotes: false, missing: [] },
          observedAt: "2026-07-15T00:00:00.000Z",
          demo: false,
          userSupplied: false,
        },
        buyer: { country: "US", postalCode: "", taxRate: null, desiredCondition: "Near Mint" },
        confirmedCard: card,
        cardLanguage: "English",
      });
      return listing.eligible ? [{ fixture, listing }] : [];
    });

    expect(unsafe).toEqual([]);
  });
});
