import { describe, expect, it } from "vitest";
import { buildReceiptSummaryLine } from "./receipt-summary";

describe("buildReceiptSummaryLine", () => {
  it("compresses sources, market reference, freshness, and time without internal counts", () => {
    const line = buildReceiptSummaryLine({
      liveSources: "eBay",
      marketMid: 1303,
      marketAsOf: "2026-07-08T00:00:00.000Z",
      observedTime: "11:20 PM",
      lang: "en",
    });

    expect(line).toContain("eBay");
    expect(line).toContain("$1,303.00");
    expect(line).toMatch(/Jul|7\/8|Jul 8/);
    expect(line).toContain("11:20 PM");
    expect(line).not.toMatch(/\d+ excluded/);
  });

  it("renders the same facts in Chinese", () => {
    const line = buildReceiptSummaryLine({
      liveSources: "eBay",
      marketMid: 1303,
      marketAsOf: "2026-07-08T00:00:00.000Z",
      observedTime: "23:20",
      lang: "zh",
    });

    expect(line).toContain("eBay");
    expect(line).toContain("$1,303.00");
    // The anchor names its source: beside a live-source segment a bare 市价
    // reads as if the marketplace produced it.
    expect(line).toContain("TCGplayer 市价");
    expect(line).toContain("23:20");
    expect(line).not.toMatch(/已排除 \d+ 条/);
  });

  // Guardrail: every result shows its sources and timestamp — even folded, even
  // when nothing live returned and no market reference resolved.
  it("keeps the source status and timestamp when no live source or market exists", () => {
    const line = buildReceiptSummaryLine({
      liveSources: "",
      marketMid: null,
      marketAsOf: null,
      observedTime: "11:20 PM",
      lang: "en",
    });

    expect(line.toLowerCase()).toContain("no live source");
    expect(line.toLowerCase()).toContain("no tcgplayer market reference");
    expect(line).toContain("11:20 PM");
    expect(line).not.toContain("excluded");
  });

  it("omits the as-of date for catalog-approximate market references", () => {
    const line = buildReceiptSummaryLine({
      liveSources: "eBay",
      marketMid: 42.5,
      marketAsOf: null,
      observedTime: "9:05 AM",
      lang: "en",
    });

    expect(line).toContain("$42.50");
    expect(line).not.toContain("(as of");
  });
});
