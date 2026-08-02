import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MethodPage from "./page";

describe("method page", () => {
  it("renders the trust contract instead of redirecting to a missing home-page anchor", () => {
    const html = renderToStaticMarkup(<MethodPage />);

    expect(html).toContain("How Lens TCG compares listings");
    expect(html).toContain("What the market reference means");
    expect(html).toContain("Why listings are excluded");
    expect(html).toContain("What Lens TCG does not do");
    expect(html).toContain("Saved receipts and privacy");
  });
});
