import { describe, expect, it } from "vitest";
import { defaultComparisonFormValues } from "./comparison-form-state";
import { applySearchExample, pickSearchExamples, SEARCH_EXAMPLES } from "./search-examples";

describe("search examples", () => {
  it.each(["pokemon", "onePiece"] as const)("offers six distinct %s searches and changes all six on refresh", (game) => {
    const first = pickSearchExamples(game, [], () => 0.4);
    const second = pickSearchExamples(game, first.map((item) => item.id), () => 0.4);
    expect(first).toHaveLength(6);
    expect(second).toHaveLength(6);
    expect(new Set(first.map((item) => item.query)).size).toBe(6);
    expect([...first, ...second].every((item) => item.game === game)).toBe(true);
    expect(second.every((item) => !first.some((previous) => previous.id === item.id))).toBe(true);
  });

  it("keeps offering usable examples when stored ids are obsolete or cover the whole pool", () => {
    const all = SEARCH_EXAMPLES.map((item) => item.id);
    expect(pickSearchExamples("pokemon", ["obsolete", ...all], () => 0)).toHaveLength(6);
  });

  it("clears facts from the previous card while retaining the buyer's preferences", () => {
    const example = SEARCH_EXAMPLES.find((item) => item.query === "Pikachu 58/102")!;
    const next = applySearchExample({
      ...defaultComparisonFormValues,
      cardName: "Charizard", setCode: "BASE", cardNumber: "4/102",
      heroQuery: "Charizard 4/102", url: "https://www.ebay.com/itm/123456789012",
      price: "150", listingTitle: "Old listing", game: "onePiece",
      postalCode: "10001", taxRatePercent: "8", preferredRole: "safest_listing",
      desiredCondition: "Moderately Played",
    }, example);
    expect(next).toMatchObject({
      heroQuery: "Pikachu 58/102", game: "pokemon",
      cardName: "", setCode: "", cardNumber: "", url: "", price: "", listingTitle: "",
      postalCode: "10001", taxRatePercent: "8", preferredRole: "safest_listing", desiredCondition: "Moderately Played",
    });
  });

  it("applies an example's stated minimum condition without treating it as a listing claim", () => {
    const example = SEARCH_EXAMPLES.find((item) => item.query === "Charizard")!;
    expect(applySearchExample(defaultComparisonFormValues, example)).toMatchObject({
      heroQuery: "Charizard", desiredCondition: "Lightly Played", claimedCondition: "Unknown",
    });
  });
});
