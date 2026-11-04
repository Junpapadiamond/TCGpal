import { describe, expect, it } from "vitest";
import { hasSelectedEbayVariationIdentity } from "./ebay-selected-variation-identity";
import type { CardIdentityCandidate } from "@/lib/schemas";
import { findOnePieceCatalogVariants } from "./one-piece-catalog";
import { mapOnePieceCardToIdentity } from "./one-piece-tcg";

const card: CardIdentityCandidate = { id: "swsh11-186", name: "Giratina V", setName: "Lost Origin",
  setCode: "SWSH11", cardNumber: "186/196", language: "English", imageUrl: null,
  confidence: "high", matchReasons: [] };
const requestedItemId = "v1|364533494574|634039152482";
const detail = { itemId: requestedItemId, title: "Pokemon Lost Origin Singles Choose Your Card",
  price: { value: "820.99", currency: "USD" }, localizedAspects: [
    { name: "Card Name", value: "Giratina V" }, { name: "Card Number", value: "186/196" },
    { name: "Set", value: "Lost Origin" }, { name: "Parallel/Variant", value: "Alternate Art" },
  ] };
const input = { requestedItemId, detail, card };

describe("selected eBay variation detail identity", () => {
  it("accepts exact structured identity from the matching selected child's detail", () => {
    expect(hasSelectedEbayVariationIdentity(input)).toBe(true);
    expect(hasSelectedEbayVariationIdentity({ ...input, detail: { ...detail, localizedAspects:
      detail.localizedAspects.map(aspect => aspect.name === "Card Number" ? { ...aspect, value: "0186/0196" } : aspect),
    } })).toBe(true);
  });

  it.each(["Pokemon Lost Origin Pick Your Card", "Pokemon Lost Origin Select Your Singles"])("accepts an explicit selection title: %s", title => {
    expect(hasSelectedEbayVariationIdentity({ ...input, detail: { ...detail, title } })).toBe(true);
  });

  it.each([
    "Charizard 186/196",
    "Pokemon Lost Origin Singles",
    "Pikachu Raichu Pichu Pokemon Card! Holo/Reverse Holo Rare EX VMAX Full Art Cards",
    "Pick your Pikachu / Raichu / Pichu - 30th included",
  ])("does not replace a non-selection title using different structured claims: %s", title => {
    expect(hasSelectedEbayVariationIdentity({ ...input, detail: { ...detail, title } })).toBe(false);
  });

  it("never restores an unfetched summary, ordinary parent or a different returned child", () => {
    expect(hasSelectedEbayVariationIdentity({ ...input, detail: null })).toBe(false);
    const parentId = "v1|364533494574|0";
    expect(hasSelectedEbayVariationIdentity({ ...input, requestedItemId: parentId, detail: { ...detail, itemId: parentId } })).toBe(false);
    expect(hasSelectedEbayVariationIdentity({ ...input, detail: { ...detail, itemId: "v1|364533494574|634039152483" } })).toBe(false);
  });

  it.each(["Card Name", "Card Number", "Set"])("requires the actual detail's %s field", field => {
    expect(hasSelectedEbayVariationIdentity({ ...input, detail: { ...detail,
      localizedAspects: detail.localizedAspects.filter(aspect => aspect.name !== field),
    } })).toBe(false);
  });

  it.each([
    ["Card Name", "Giratina VSTAR"], ["Card Number", "185/196"], ["Set", "Evolving Skies"],
  ])("rejects a conflicting structured %s", (field, value) => {
    expect(hasSelectedEbayVariationIdentity({ ...input, detail: { ...detail,
      localizedAspects: detail.localizedAspects.map(aspect => aspect.name === field ? { ...aspect, value } : aspect),
    } })).toBe(false);
  });

  it.each([
    ["Card Name", "Giratina VSTAR"], ["Card Number", "185/196"], ["Set", "Evolving Skies"],
  ])("does not merge multiple %s claims into matching proof", (name, value) => {
    expect(hasSelectedEbayVariationIdentity({ ...input, detail: { ...detail,
      localizedAspects: [...detail.localizedAspects, { name, value }],
    } })).toBe(false);
  });

  it("does not let a correct detail number erase an explicitly wrong title number", () => {
    expect(hasSelectedEbayVariationIdentity({ ...input, detail: { ...detail,
      title: "Giratina V 185/196 Lost Origin",
    } })).toBe(false);
    expect(hasSelectedEbayVariationIdentity({ ...input, detail: { ...detail,
      title: "Giratina V 185/196 or 186/196 Lost Origin",
    } })).toBe(false);
  });

  it("retains the existing print helper's release veto", () => {
    expect(hasSelectedEbayVariationIdentity({ ...input, detail: { ...detail,
      title: "Giratina V Celebrations Classic Collection",
    } })).toBe(false);
  });

  it("still requires the selected One Piece artwork's distinguishing evidence", () => {
    const law = findOnePieceCatalogVariants("OP10-119")
      .map(source => mapOnePieceCardToIdentity(source, { confidence: "high", matchReasons: [] }))
      .find(row => row.id === "OP10-119_p2")!;
    expect(law).toBeDefined();
    const aspects = [{ name: "Card Name", value: law.name }, { name: "Card Number", value: law.cardNumber },
      { name: "Set", value: law.setName }];
    const selected = { ...detail, title: "One Piece Royal Blood Singles Choose Your Card", localizedAspects: aspects };
    expect(hasSelectedEbayVariationIdentity({ ...input, card: law, detail: selected })).toBe(false);
    expect(hasSelectedEbayVariationIdentity({ ...input, card: law, detail: { ...selected,
      localizedAspects: [...aspects, { name: "Parallel/Variant", value: "Manga" }],
    } })).toBe(true);
  });
});
