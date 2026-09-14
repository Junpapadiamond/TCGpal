import { describe, expect, it } from "vitest";
import { mercariRequestAllowed, mercariRobotsAllowed } from "./mercari-browser";

describe("bounded Mercari browser transport", () => {
  it("rejects private hosts, tracking navigation, account pages, unsafe protocols and foreign documents", () => {
    for (const url of ["http://www.mercari.com/search/", "https://127.0.0.1/", "https://www.mercari.com.evil.test/search/", "https://www.mercari.com/account/", "https://www.mercari.com/us/item/m1/?ref=search", "https://example.com/"]) {
      expect(mercariRequestAllowed(url, "document")).toBe(false);
    }
    expect(mercariRequestAllowed("https://www.mercari.com/search/?keyword=Pikachu", "document")).toBe(true);
    expect(mercariRequestAllowed("https://www.mercari.com/us/item/m1/", "document")).toBe(true);
  });
  it("honors explicit robot exclusions and rejects invalid robot responses", () => {
    expect(mercariRobotsAllowed("User-agent: *\nDisallow: /search", "https://www.mercari.com/search/?keyword=Pikachu")).toBe(false);
    expect(mercariRobotsAllowed("User-agent: *\nDisallow: /*?ref=\n", "https://www.mercari.com/us/item/m1/")).toBe(true);
    expect(() => mercariRobotsAllowed("<html>Access denied</html>", "https://www.mercari.com/search/")).toThrow(/robots/);
  });
});
