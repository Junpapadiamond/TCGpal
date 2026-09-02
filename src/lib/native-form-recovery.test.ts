import { describe, expect, it } from "vitest";
import { parseNativeFormSubmit } from "@/lib/native-form-recovery";

describe("parseNativeFormSubmit", () => {
  it("recovers the query from a form the browser submitted itself", () => {
    // The landing search box lives in a real GET form with no action, so an
    // Enter pressed before React hydrates reloads the page with the fields in
    // the URL and the buyer's query gone. Reading it back turns a dead reload
    // into the search they asked for.
    const parsed = parseNativeFormSubmit(new URLSearchParams("heroQuery=Umbreon+ex+161%2F131&game=pokemon&postalCode=10001"));
    expect(parsed).toEqual({ query: "Umbreon ex 161/131", game: "pokemon", postalCode: "10001" });
  });

  it("ignores a URL that did not come from that form", () => {
    expect(parseNativeFormSubmit(new URLSearchParams("receipt=abc"))).toBeNull();
    expect(parseNativeFormSubmit(new URLSearchParams(""))).toBeNull();
  });

  it("ignores a blank query, which is a submit with nothing to search for", () => {
    expect(parseNativeFormSubmit(new URLSearchParams("heroQuery=+&postalCode="))).toBeNull();
  });

  it("keeps an unrecognised game out of the form state", () => {
    const parsed = parseNativeFormSubmit(new URLSearchParams("heroQuery=Nami+OP01-016&game=magic"));
    expect(parsed).toEqual({ query: "Nami OP01-016", game: null, postalCode: null });
  });

  it("drops a ZIP that is not a US ZIP rather than feeding it back into the form", () => {
    const parsed = parseNativeFormSubmit(new URLSearchParams("heroQuery=Nami&postalCode=not-a-zip"));
    expect(parsed?.postalCode).toBeNull();
  });
});
