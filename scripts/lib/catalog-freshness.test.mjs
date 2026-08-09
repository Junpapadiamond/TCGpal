import { describe, expect, it } from "vitest";
import {
  applyReleaseTiming,
  assessGroupCoverage,
  buildNumberIndex,
  countBackfilledGroups,
  isReleaseDate,
  matchPokemonSet,
  normalizeCardNumber,
  normalizeSetName,
  numberedProducts,
  selectRecentGroups,
  summarizeReport,
} from "./catalog-freshness.mjs";

function group(overrides = {}) {
  return {
    groupId: 1,
    name: "Some Set",
    abbreviation: "SS",
    isSupplemental: false,
    publishedOn: "2026-07-31T00:00:00",
    ...overrides,
  };
}

function product(number, name = "Card") {
  return {
    productId: 1,
    name,
    extendedData: number ? [{ name: "Number", value: number }] : [],
  };
}

describe("backfill detection", () => {
  it("treats an exact-midnight publishedOn as a real release date", () => {
    expect(isReleaseDate("2026-07-31T00:00:00")).toBe(true);
  });

  it("treats a wall-clock publishedOn as a catalog write, not a release", () => {
    expect(isReleaseDate("2026-08-08T20:00:05.7457608Z")).toBe(false);
  });

  it("catches a small backfill batch, which a shared-timestamp count would miss", () => {
    // The 2004 EX Trainer Kits were re-stamped 2026-08-08 in a batch of two.
    const groups = [
      group({ groupId: 1, publishedOn: "2026-08-08T20:00:05.9067351Z" }),
      group({ groupId: 2, publishedOn: "2026-08-08T20:00:05.9067351Z" }),
      group({ groupId: 3, publishedOn: "2026-07-31T00:00:00" }),
    ];
    expect(countBackfilledGroups(groups)).toBe(2);
  });

  it("never counts many same-day releases as a backfill", () => {
    const groups = Array.from({ length: 9 }, (_, index) =>
      group({ groupId: index, publishedOn: "2023-01-20T00:00:00" }));
    expect(countBackfilledGroups(groups)).toBe(0);
  });
});

describe("recent group selection", () => {
  const now = new Date("2026-08-09T00:00:00Z");

  it("keeps groups published inside the lookback window", () => {
    const recent = selectRecentGroups([
      group({ groupId: 1, publishedOn: "2026-07-31T00:00:00" }),
      group({ groupId: 2, publishedOn: "2019-03-01T00:00:00" }),
    ], { now, lookbackDays: 240 });
    expect(recent.map((entry) => entry.groupId)).toEqual([1]);
  });

  it("keeps unreleased sets so an announced set is visible before street date", () => {
    const recent = selectRecentGroups([
      group({ groupId: 3, publishedOn: "2026-09-16T00:00:00" }),
    ], { now, lookbackDays: 240 });
    expect(recent.map((entry) => entry.groupId)).toEqual([3]);
  });

  it("drops backfilled legacy groups so the report stays actionable", () => {
    const recent = selectRecentGroups([
      group({ groupId: 4, publishedOn: "2026-08-08T20:00:05.7457608Z" }),
      group({ groupId: 5, publishedOn: "2026-07-31T00:00:00" }),
    ], { now, lookbackDays: 240 });
    expect(recent.map((entry) => entry.groupId)).toEqual([5]);
  });

  it("sorts newest last so the report reads chronologically", () => {
    const recent = selectRecentGroups([
      group({ groupId: 6, publishedOn: "2026-07-31T00:00:00" }),
      group({ groupId: 7, publishedOn: "2026-06-12T00:00:00" }),
    ], { now, lookbackDays: 240 });
    expect(recent.map((entry) => entry.groupId)).toEqual([7, 6]);
  });
});

describe("card number coverage", () => {
  it("normalizes punctuation and case so OP16-001 matches op16 001", () => {
    expect(normalizeCardNumber("OP16-001")).toBe("OP16001");
    expect(normalizeCardNumber(" op16 001 ")).toBe("OP16001");
    expect(normalizeCardNumber("")).toBe("");
    expect(normalizeCardNumber(null)).toBe("");
  });

  it("skips sealed products that carry no printed number", () => {
    const products = [
      product(null, "The World's Strongest Warriors Booster Box"),
      product("OP17-001", "Shanks"),
    ];
    expect(numberedProducts(products)).toEqual([{ number: "OP17-001", name: "Shanks" }]);
  });

  it("reports a group whose singles are not catalogued yet as pending, not missing", () => {
    // OP-17 on 2026-08-09: the group exists with sealed product only.
    const assessment = assessGroupCoverage(
      group({ name: "The World's Strongest Warriors" }),
      [product(null, "Booster Box")],
      buildNumberIndex([{ card_set_id: "OP16-001" }]),
    );
    expect(assessment.status).toBe("pending-singles");
    expect(assessment.numbered).toBe(0);
  });

  it("flags a set the catalog cannot resolve at all", () => {
    const assessment = assessGroupCoverage(
      group({ name: "The Time of Battle" }),
      [product("OP16-001"), product("OP16-002")],
      buildNumberIndex([{ card_set_id: "OP15-001" }]),
    );
    expect(assessment.status).toBe("missing");
    expect(assessment.resolved).toBe(0);
    expect(assessment.missingNumbers).toEqual(["OP16-001", "OP16-002"]);
  });

  it("reports partial coverage when only some prints resolve", () => {
    const assessment = assessGroupCoverage(
      group(),
      [product("OP16-001"), product("OP16-002")],
      buildNumberIndex([{ card_set_id: "OP16-001" }]),
    );
    expect(assessment.status).toBe("partial");
    expect(assessment.resolved).toBe(1);
    expect(assessment.missingNumbers).toEqual(["OP16-002"]);
  });

  it("counts a reprint deck as covered when its numbers belong to older sets", () => {
    // ST-31 ships OP01-016 / ST21-001 reprints; a set-name check would
    // false-alarm here, a number check must not.
    const assessment = assessGroupCoverage(
      group({ name: "Starter Deck 31: RED Monkey.D.Luffy" }),
      [product("OP01-016"), product("ST21-001")],
      buildNumberIndex([{ card_set_id: "OP01-016" }, { card_set_id: "ST21-001" }]),
    );
    expect(assessment.status).toBe("covered");
    expect(assessment.missingNumbers).toEqual([]);
  });

  it("counts each distinct number once when parallels repeat it", () => {
    const assessment = assessGroupCoverage(
      group(),
      [product("OP16-001", "Ace"), product("OP16-001", "Ace (Alternate Art)")],
      buildNumberIndex([]),
    );
    expect(assessment.numbered).toBe(1);
    expect(assessment.missingNumbers).toEqual(["OP16-001"]);
  });
});

describe("release timing", () => {
  const now = new Date("2026-08-09T00:00:00Z");

  it("downgrades an unreleased set's gap to pending-release", () => {
    const assessment = { status: "missing", publishedOn: "2026-09-16T00:00:00" };
    expect(applyReleaseTiming(assessment, now).status).toBe("pending-release");
  });

  it("leaves a released set's gap failing", () => {
    const assessment = { status: "missing", publishedOn: "2026-07-31T00:00:00" };
    expect(applyReleaseTiming(assessment, now).status).toBe("missing");
  });

  it("does not relabel a covered set", () => {
    const assessment = { status: "covered", publishedOn: "2026-09-16T00:00:00" };
    expect(applyReleaseTiming(assessment, now).status).toBe("covered");
  });
});

describe("pokemon english set matching", () => {
  it("strips the TCGplayer set code prefix before comparing", () => {
    expect(normalizeSetName("ME05: Pitch Black")).toBe("pitch black");
    expect(normalizeSetName("Pitch Black")).toBe("pitch black");
  });

  it("matches a TCGCSV group to the pokemontcg.io set that backs it", () => {
    expect(matchPokemonSet("ME05: Pitch Black", ["Pitch Black", "Chaos Rising"])).toBe("Pitch Black");
  });

  it("returns null rather than guessing when no set matches", () => {
    expect(matchPokemonSet("ME: 30th Celebration", ["Pitch Black"])).toBeNull();
  });
});

describe("report summary", () => {
  const ok = { category: "One Piece", status: "covered" };

  it("fails when a supported catalog cannot resolve a released set", () => {
    expect(summarizeReport([ok, { category: "One Piece", status: "missing" }]).ok).toBe(false);
    expect(summarizeReport([ok, { category: "One Piece", status: "partial" }]).ok).toBe(false);
  });

  it("passes on pending singles, which are upstream timing not our staleness", () => {
    expect(summarizeReport([ok, { category: "One Piece", status: "pending-singles" }]).ok).toBe(true);
  });

  it("passes on a set nobody has printed yet", () => {
    expect(summarizeReport([ok, { category: "One Piece", status: "pending-release" }]).ok).toBe(true);
  });

  it("passes on unsupported categories so a known gap is not a recurring failure", () => {
    // Japanese Pokemon has no adapter at all; that is a roadmap item, and
    // failing the weekly check on it every week would train the alarm away.
    const summary = summarizeReport([ok, { category: "Pokemon Japan", status: "unsupported" }]);
    expect(summary.ok).toBe(true);
    expect(summary.counts.unsupported).toBe(1);
  });
});
