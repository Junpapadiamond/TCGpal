import { describe, expect, it, vi } from "vitest";
import { runCloudEvaluation, type CloudDependencies } from "./cloud-runner";
import frozen from "./real-card-dataset.json";
import { accuracyDatasetSchema } from "./card-accuracy";

function deps() {
  const cases = accuracyDatasetSchema.parse(frozen).cases.filter(c => c.split === "tuning")
    .map(c => ({ ...c, expected: null, labelStatus: "pending" as const }));
  const d: CloudDependencies = {
    reserve: vi.fn(async () => "reserved" as const), load: vi.fn(async () => null),
    save: vi.fn(async () => {}), release: vi.fn(async () => {}),
    sample: vi.fn(async card => ({ id: card.id, status: "complete", candidateCount: 10,
      observedAt: "2026-10-20T13:00:00Z", coverage: [],
      cases: cases.filter(c => c.game === card.game).slice(0, 8) })),
    review: vi.fn(async () => ({ status: "provisional", findings: [] })),
    wait: vi.fn(async () => {}),
  };
  return d;
}
describe("cloud daily allowance", () => {
  it("reserves before two fixed game samples and one tuning-only review", async () => {
    const d = deps();
    const result = await runCloudEvaluation("daily", new Date("2026-10-20T13:00:00Z"), d);
    expect(result.status).toBe("ok");
    expect(d.sample).toHaveBeenCalledTimes(2);
    expect(d.wait).toHaveBeenCalledWith(31000);
    expect(d.review).toHaveBeenCalledTimes(1);
    const rows = vi.mocked(d.review).mock.calls[0][0];
    expect(rows.every(r => r.split === "tuning" && r.expected === null)).toBe(true);
    expect(rows.filter(r => r.game === "pokemon")).toHaveLength(6);
    expect(rows.filter(r => r.game === "onePiece")).toHaveLength(6);
    expect(d.save).toHaveBeenCalledTimes(1);
    expect(d.release).toHaveBeenCalledTimes(1);
  });
  it("does not repeat a reserved day, even without a completed result", async () => {
    const d = deps(); d.reserve = vi.fn(async () => "already_reserved" as const);
    expect((await runCloudEvaluation("daily", new Date("2026-10-20"), d)).status).toBe("already_reserved");
    expect(d.sample).not.toHaveBeenCalled(); expect(d.review).not.toHaveBeenCalled();
  });
  it("fails closed when shared storage is unavailable", async () => {
    const d = deps(); d.reserve = vi.fn(async () => { throw new Error("storage"); });
    await expect(runCloudEvaluation("daily", new Date("2026-10-20"), d)).rejects.toThrow("storage");
    expect(d.sample).not.toHaveBeenCalled();
  });
  it("preserves the spent local migration-day allowance", async () => {
    const d = deps();
    expect((await runCloudEvaluation("daily", new Date("2026-10-19"), d)).status).toBe("migration_day_spent");
    expect(d.reserve).not.toHaveBeenCalled(); expect(d.sample).not.toHaveBeenCalled();
  });
  it("never sends held-out samples to AI", async () => {
    const d = deps();
    await runCloudEvaluation("daily", new Date("2026-10-22"), d);
    expect(d.sample).toHaveBeenCalledTimes(2); expect(d.review).not.toHaveBeenCalled();
  });
  it("manual verification uses frozen observations without acquiring inventory", async () => {
    const d = deps();
    const r = await runCloudEvaluation("verify", new Date("2026-10-19"), d);
    expect(r.mode).toBe("verify"); expect(d.sample).not.toHaveBeenCalled();
    expect(d.review).toHaveBeenCalledTimes(1);
  });
  it("keeps source/model failures inconclusive and never retries", async () => {
    const d = deps(); d.sample = vi.fn(async () => { throw new Error("source"); });
    expect((await runCloudEvaluation("daily", new Date("2026-10-20"), d)).status).toBe("inconclusive");
    expect(d.sample).toHaveBeenCalledTimes(2); expect(d.review).not.toHaveBeenCalled();
  });
  it("retains acquired evidence if model setup or history loading fails", async () => {
    const d = deps(); d.review = vi.fn(async () => { throw new Error("model setup"); });
    const report = await runCloudEvaluation("daily", new Date("2026-10-20"), d);
    expect(report.status).toBe("inconclusive"); expect(report.cards).toHaveLength(2);
    expect(report.ai.status).toBe("unavailable"); expect(d.save).toHaveBeenCalledTimes(1);
  });
});
