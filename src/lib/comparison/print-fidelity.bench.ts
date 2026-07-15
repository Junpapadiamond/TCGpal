import { bench, describe } from "vitest";
import { assessPrintFidelity } from "@/lib/comparison/print-fidelity";
import { findOnePieceCatalogVariants } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";

const print = findOnePieceCatalogVariants("OP01-016")
  .find((candidate) => candidate.card_image_id === "OP01-016_p4");
if (!print) throw new Error("Missing OP01-016_p4 benchmark fixture.");

const card = mapOnePieceCardToIdentity(print, {
  confidence: "high",
  matchReasons: ["benchmark fixture"],
});
const matchText = "Nami OP01-016 SP Awakening Of The New Era English Near Mint";

describe("exact-print classifier", () => {
  bench("classifies a variant-heavy One Piece listing", () => {
    assessPrintFidelity({
      card,
      matchText,
      listingPrice: 130,
      exactMarketAnchor: 125,
    });
  });
});
