import { describe, expect, it } from "vitest";

import {
  KILL_PRECISION,
  SHIP_PRECISION,
  classifyRow,
  enrichmentSuppression,
  parseSheet,
  partitionSample,
  poolBlockers,
  renderSheet,
  scoreByCard,
  scorePrecision,
  toSheetRow,
} from "./base-print-sample.mjs";

const exclude = (code, category) => ({ code, category, disposition: "exclude", message: code });
const review = (code, category) => ({ code, category, disposition: "review", message: code });

function candidate(overrides = {}) {
  return {
    id: "v1|1|0",
    url: "https://www.ebay.com/itm/1",
    title: "Nami OP01-016 Romance Dawn",
    price: 42,
    shipping: 4,
    preTaxTotal: 46,
    printMatch: "unknown",
    printMatchConfidence: "low",
    printMatchReasons: ["no_sibling_marker_found"],
    claimedCondition: "Near Mint",
    listingLanguage: null,
    evidence: { photoCount: 6 },
    eligible: false,
    eligibilityIssues: [exclude("identity_unverified", "identity")],
    ...overrides,
  };
}

describe("classifyRow", () => {
  it("counts a row blocked only by print proof as one that would flip", () => {
    expect(classifyRow(candidate())).toBe("would-flip");
  });

  it("does not count an eligible row", () => {
    expect(classifyRow(candidate({ printMatch: "compatible", eligible: true, eligibilityIssues: [] }))).toBe(
      "not-print-blocked",
    );
  });

  it("does not count a row whose print was assessed as a different sibling", () => {
    const row = candidate({
      printMatch: "mismatch",
      eligibilityIssues: [exclude("identity_sibling_mismatch", "identity")],
    });
    expect(classifyRow(row)).toBe("not-print-blocked");
  });

  // The whole point of the partition: relaxing print proof cannot sell a graded
  // slab or a row with unknown shipping, so those rows say nothing about whether
  // the relaxed rule picks the right artwork.
  it("sets aside a row that another exclusion would block anyway", () => {
    const row = candidate({
      eligibilityIssues: [
        exclude("identity_unverified", "identity"),
        exclude("excluded_product_type", "product"),
      ],
    });
    expect(classifyRow(row)).toBe("blocked-anyway");
  });

  it("treats the exact-print price guard as a separate blocker, not as print proof", () => {
    const row = candidate({
      eligibilityIssues: [
        exclude("identity_unverified", "identity"),
        exclude("identity_price_guard", "price"),
      ],
    });
    expect(classifyRow(row)).toBe("blocked-anyway");
  });

  // "review" never removes a row from the comparison, so it must not remove it
  // from the sample either.
  it("keeps a row carrying only review-disposition issues alongside the print block", () => {
    const row = candidate({
      eligibilityIssues: [
        exclude("identity_unverified", "identity"),
        review("language_unverified", "language"),
      ],
    });
    expect(classifyRow(row)).toBe("would-flip");
  });
});

describe("partitionSample", () => {
  it("splits the candidates and names what else blocks the set-aside rows", () => {
    const result = partitionSample([
      candidate({ id: "a" }),
      candidate({ id: "b" }),
      candidate({
        id: "c",
        eligibilityIssues: [
          exclude("identity_unverified", "identity"),
          exclude("shipping_unknown", "cost"),
        ],
      }),
      candidate({ id: "d", printMatch: "compatible", eligible: true, eligibilityIssues: [] }),
    ]);

    expect(result.wouldFlip.map((row) => row.id)).toEqual(["a", "b"]);
    expect(result.blockedAnyway.map((row) => row.id)).toEqual(["c"]);
    expect(result.otherBlockers).toEqual({ shipping_unknown: 1 });
  });
});

describe("toSheetRow", () => {
  it("carries the facts needed to adjudicate a listing without re-running the report", () => {
    const row = toSheetRow(candidate());
    expect(row).toMatchObject({
      id: "v1|1|0",
      url: "https://www.ebay.com/itm/1",
      title: "Nami OP01-016 Romance Dawn",
      preTaxTotal: 46,
      photoCount: 6,
      claimedCondition: "Near Mint",
      printMatchReasons: ["no_sibling_marker_found"],
      verdict: "",
    });
  });
});

describe("renderSheet / parseSheet", () => {
  const sheet = () =>
    renderSheet({
      target: "https://lenstcg.com",
      generatedAt: "2026-08-11T00:00:00.000Z",
      cards: [
        {
          label: "Nami OP01-016",
          confirmedCardId: "OP01-016",
          found: 50,
          printMatchTally: { unknown: 13, mismatch: 37 },
          wouldFlip: [toSheetRow(candidate({ id: "a" })), toSheetRow(candidate({ id: "b" }))],
          blockedAnyway: [],
          otherBlockers: {},
        },
      ],
    });

  it("writes one adjudication row per candidate with an empty verdict cell", () => {
    const markdown = sheet();
    expect(markdown).toContain("Nami OP01-016");
    expect(markdown).toContain("https://www.ebay.com/itm/1");
    expect(markdown.match(/^\| a \|/m)).not.toBeNull();
    expect(markdown).toContain(`ship at >=${SHIP_PRECISION * 100}%`);
  });

  it("round-trips a filled verdict back out of the markdown", () => {
    const filled = sheet().replace("| a |  |", "| a | base |").replace("| b |  |", "| b | sibling |");
    expect(parseSheet(filled)).toEqual([
      { id: "a", verdict: "base", card: "Nami OP01-016 (OP01-016)" },
      { id: "b", verdict: "sibling", card: "Nami OP01-016 (OP01-016)" },
    ]);
  });

  it("ignores rows the reviewer left blank", () => {
    const filled = sheet().replace("| a |  |", "| a | base |");
    expect(parseSheet(filled)).toEqual([{ id: "a", verdict: "base", card: "Nami OP01-016 (OP01-016)" }]);
  });

  // eBay item ids contain pipes ("v1|1|0"), which would otherwise split a cell.
  it("attributes each row to the card heading above it", () => {
    const markdown = renderSheet({
      target: "t",
      generatedAt: "2026-08-11T00:00:00.000Z",
      cards: [
        {
          label: "Nami OP01-016",
          confirmedCardId: "OP01-016",
          found: 1,
          printMatchTally: { unknown: 1 },
          wouldFlip: [toSheetRow(candidate({ id: "a" }))],
          blockedAnyway: [],
          otherBlockers: {},
        },
        {
          label: "Shanks OP09-001",
          confirmedCardId: "OP09-001",
          found: 1,
          printMatchTally: { unknown: 1 },
          wouldFlip: [toSheetRow(candidate({ id: "z" }))],
          blockedAnyway: [],
          otherBlockers: {},
        },
      ],
    });
    const filled = markdown.replace("| a |  |", "| a | base |").replace("| z |  |", "| z | sibling |");
    expect(parseSheet(filled)).toEqual([
      { id: "a", verdict: "base", card: "Nami OP01-016 (OP01-016)" },
      { id: "z", verdict: "sibling", card: "Shanks OP09-001 (OP09-001)" },
    ]);
  });

  it("survives a pipe inside the listing id and title", () => {
    const markdown = renderSheet({
      target: "t",
      generatedAt: "2026-08-11T00:00:00.000Z",
      cards: [
        {
          label: "Nami OP01-016",
          confirmedCardId: "OP01-016",
          found: 1,
          printMatchTally: { unknown: 1 },
          wouldFlip: [toSheetRow(candidate({ id: "v1|1|0", title: "Nami | OP01-016" }))],
          blockedAnyway: [],
          otherBlockers: {},
        },
      ],
    });
    const filled = markdown.replace("|  |", "| base |");
    expect(parseSheet(filled)).toEqual([
      { id: "v1|1|0", verdict: "base", card: "Nami OP01-016 (OP01-016)" },
    ]);
  });

  it("rejects a verdict outside the allowed vocabulary", () => {
    const filled = sheet().replace("| a |  |", "| a | probably? |");
    expect(() => parseSheet(filled)).toThrow(/probably\?/);
  });

  // Why a row was called a sibling is the evidence that makes the sample
  // reviewable later; without it the sheet records only a tally.
  it("keeps a reviewer's note alongside the verdict", () => {
    const filled = sheet().replace("| a |  |  |", "| a | sibling | manga panel border visible |");
    expect(parseSheet(filled)).toEqual([
      { id: "a", verdict: "sibling", card: "Nami OP01-016 (OP01-016)", notes: "manga panel border visible" },
    ]);
  });

  it("omits the notes key entirely when the reviewer left it empty", () => {
    const filled = sheet().replace("| a |  |  |", "| a | base |  |");
    expect(parseSheet(filled)).toEqual([
      { id: "a", verdict: "base", card: "Nami OP01-016 (OP01-016)" },
    ]);
  });

  it("warns about the detail budget when unstated condition dominates the set-aside rows", () => {
    const markdown = renderSheet({
      target: "https://lenstcg.com",
      generatedAt: "2026-08-11T00:00:00.000Z",
      cards: [
        {
          label: "Nami OP01-016",
          confirmedCardId: "OP01-016",
          found: 50,
          printMatchTally: { unknown: 30 },
          wouldFlip: [toSheetRow(candidate({ id: "a" }))],
          blockedAnyway: [],
          otherBlockers: { condition_unstated: 22, shipping_unknown: 2 },
        },
      ],
    });
    expect(markdown).toContain("EBAY_DETAIL_BUDGET");
    expect(markdown).toMatch(/22 of the 24 set-aside rows/);
  });

  it("does not warn when no row was set aside for an unstated condition", () => {
    expect(sheet()).not.toContain("EBAY_DETAIL_BUDGET");
  });
});

describe("scorePrecision", () => {
  it("ships when every adjudicated row is the base print", () => {
    const result = scorePrecision(Array.from({ length: 10 }, () => "base"));
    expect(result.strictPrecision).toBe(1);
    expect(result.decision).toBe("ship");
  });

  it("kills below the kill threshold", () => {
    const verdicts = [...Array(7).fill("base"), ...Array(3).fill("sibling")];
    const result = scorePrecision(verdicts);
    expect(result.strictPrecision).toBeCloseTo(0.7);
    expect(result.decision).toBe("kill");
  });

  it("returns neither verdict between the kill and ship thresholds", () => {
    const verdicts = [...Array(85).fill("base"), ...Array(15).fill("sibling")];
    const result = scorePrecision(verdicts);
    expect(result.strictPrecision).toBeCloseTo(0.85);
    expect(result.decision).toBe("inconclusive");
  });

  // An unreviewable listing is not evidence that the rule works. Counting it as
  // a pass is how a sample talks itself into shipping.
  it("counts an unclear row against strict precision and reports it separately", () => {
    const verdicts = [...Array(9).fill("base"), "unclear"];
    const result = scorePrecision(verdicts);
    expect(result.strictPrecision).toBeCloseTo(0.9);
    expect(result.lenientPrecision).toBe(1);
    expect(result.unclear).toBe(1);
  });

  it("refuses to score an empty sample", () => {
    expect(scorePrecision([]).decision).toBe("no-sample");
  });

  it("exposes the thresholds it judged against", () => {
    expect(SHIP_PRECISION).toBe(0.9);
    expect(KILL_PRECISION).toBe(0.8);
  });
});

describe("poolBlockers", () => {
  it("sums the set-aside blockers across every card", () => {
    expect(poolBlockers([
      { otherBlockers: { condition_unstated: 4, shipping_unknown: 1 } },
      { otherBlockers: { condition_unstated: 6 } },
    ])).toEqual({ condition_unstated: 10, shipping_unknown: 1 });
  });
});

describe("enrichmentSuppression", () => {
  // The eBay detail budget is 12 of 50 by default, and per D-DETAIL-BUDGET 57.3%
  // of unenriched rows state no condition. Those rows leave the denominator for a
  // reason that has nothing to do with print proof, so a small adjudicable set
  // must not be read as "the rule frees no supply".
  it("flags condition_unstated as the dominant set-aside cause", () => {
    const result = enrichmentSuppression({ condition_unstated: 22, shipping_unknown: 3 });
    expect(result).toMatchObject({ count: 22, dominant: true });
    expect(result.share).toBeCloseTo(22 / 25);
  });

  it("reports it without claiming dominance when something else leads", () => {
    const result = enrichmentSuppression({ condition_unstated: 2, excluded_product_type: 9 });
    expect(result).toMatchObject({ count: 2, dominant: false });
  });

  it("stays silent when no row was set aside for an unstated condition", () => {
    expect(enrichmentSuppression({ excluded_product_type: 4 })).toBeNull();
    expect(enrichmentSuppression({})).toBeNull();
  });
});

describe("scoreByCard", () => {
  // Pooling three cards can report a shippable number while one card is a
  // coin flip. D-OP-BASE-PROOF names three cards, so each gets its own read.
  it("scores each card separately as well as pooled", () => {
    const rows = [
      ...Array(10).fill({ card: "Nami OP01-016", verdict: "base" }),
      ...Array(5).fill({ card: "Shanks OP09-001", verdict: "base" }),
      ...Array(5).fill({ card: "Shanks OP09-001", verdict: "sibling" }),
    ];

    const result = scoreByCard(rows);

    expect(result.pooled.total).toBe(20);
    expect(result.pooled.strictPrecision).toBeCloseTo(0.75);
    expect(result.pooled.decision).toBe("kill");
    expect(result.byCard["Nami OP01-016"].decision).toBe("ship");
    expect(result.byCard["Shanks OP09-001"].strictPrecision).toBeCloseTo(0.5);
    expect(result.byCard["Shanks OP09-001"].decision).toBe("kill");
  });

  it("reports an empty sheet as no-sample rather than a precision", () => {
    const result = scoreByCard([]);
    expect(result.pooled.decision).toBe("no-sample");
    expect(result.byCard).toEqual({});
  });
});
