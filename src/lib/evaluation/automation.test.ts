import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cohort from "./real-card-cohort.json";
import { compareAutomationBaseline, reserveDailyRun, selectDailyCards } from "./automation";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const directory = () => { const dir = mkdtempSync(join(tmpdir(), "tcglens-eval-")); dirs.push(dir); return dir; };

describe("bounded recurring evaluation", () => {
  it("covers all twelve cards once in six UTC days, always one of each game", () => {
    const ids = new Set<string>();
    for (let day = 19; day <= 24; day++) {
      const cards = selectDailyCards(cohort.cards, new Date(`2026-10-${day}T14:00:00Z`));
      expect(cards.map(c => c.game)).toEqual(["pokemon", "onePiece"]);
      cards.forEach(c => ids.add(c.id));
    }
    expect(ids.size).toBe(12);
    expect(selectDailyCards(cohort.cards, new Date("2026-10-25T14:00:00Z")))
      .toEqual(selectDailyCards(cohort.cards, new Date("2026-10-19T14:00:00Z")));
  });
  it("reserves before work and never repeats or refunds a failed day", () => {
    const dir = directory();
    const first = reserveDailyRun(dir, new Date("2026-10-19T14:00:00Z"));
    expect(first.status).toBe("reserved");
    expect(reserveDailyRun(dir, new Date("2026-10-19T14:01:00Z")).status).toBe("locked");
    if (first.status === "reserved") first.release();
    expect(reserveDailyRun(dir, new Date("2026-10-19T18:00:00Z")).status).toBe("already_reserved");
    const tomorrow = reserveDailyRun(dir, new Date("2026-10-20T14:00:00Z"));
    expect(tomorrow.status).toBe("reserved");
    if (tomorrow.status === "reserved") tomorrow.release();
  });
  it("fails closed on an abandoned global lock, even across days", () => {
    const dir = directory();
    const first = reserveDailyRun(dir, new Date("2026-10-19T23:59:00Z"));
    expect(reserveDailyRun(dir, new Date("2026-10-20T00:01:00Z")).status).toBe("locked");
    if (first.status === "reserved") first.release();
  });
});

describe("frozen automation baseline", () => {
  const rows = [
    { id: "good", pass: true, actual: { identity: "accept", eligible: true } },
    { id: "known", pass: false, actual: { identity: "accept", eligible: false } },
    { id: "pending", pass: null, actual: { identity: "abstain", eligible: false } },
  ];
  const baseline = { datasetHash: "frozen", rows };
  it("reports the known defect without making every unchanged CI run red", () => {
    expect(compareAutomationBaseline(baseline, baseline)).toEqual({ regressions: [], knownFailures: ["known"], recoveries: [] });
  });
  it("fails when a passing case regresses or an existing failure becomes unsafe", () => {
    const current = { ...baseline, rows: rows.map(r => ({ ...r, pass: r.id === "good" ? false : r.pass,
      actual: { ...r.actual, eligible: r.id === "known" ? true : r.actual.eligible } })) };
    expect(compareAutomationBaseline(baseline, current).regressions).toEqual(["good", "known"]);
  });
  it("rejects changed labels, missing or duplicate rows instead of accepting a new baseline", () => {
    expect(() => compareAutomationBaseline(baseline, { ...baseline, datasetHash: "edited" })).toThrow();
    expect(() => compareAutomationBaseline(baseline, { ...baseline, rows: rows.slice(1) })).toThrow();
    expect(() => compareAutomationBaseline(baseline, { ...baseline, rows: [rows[0], rows[0], rows[2]] })).toThrow();
  });
  it("records a recovered known failure", () => {
    const current = { ...baseline, rows: rows.map(r => r.id === "known" ? { ...r, pass: true } : r) };
    expect(compareAutomationBaseline(baseline, current).recoveries).toEqual(["known"]);
  });
});
