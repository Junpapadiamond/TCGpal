import { describe, expect, it } from "vitest";
import { assessPriceRecall, triagePriceOpportunities } from "./price-recall";

const observation = { id: "luffy", observedAt: "2026-09-28T06:33:18.527Z", sourceUrl: "https://www.ebay.com/itm/198615396354",
  baselineTotal: 38.98, itemPrice: 5.02, shipping: 0, buyerFee: 0, conditionCompatible: true,
  identityCompatible: true, eligible: true, newToPrimary: true, acquisitionStatus: "complete" as const, humanReviewed: false };
describe("bounded price recall evidence", () => {
  it("records a rule-passing opportunity with exact cost math, never a human-confirmed saving", () => {
    expect(assessPriceRecall(observation)).toMatchObject({ status: "provisional_miss", total: 5.02, gap: 33.96, humanConfirmed: false });
  });
  it("keeps missing charges and source failures inconclusive", () => {
    expect(assessPriceRecall({ ...observation, shipping: null }).status).toBe("inconclusive");
    expect(assessPriceRecall({ ...observation, buyerFee: null }).status).toBe("inconclusive");
    expect(assessPriceRecall({ ...observation, baselineTotal: null }).status).toBe("inconclusive");
    expect(assessPriceRecall({ ...observation, acquisitionStatus: "failed" }).status).toBe("inconclusive");
  });
  it("does not call a wrong print, incompatible condition, or already retrieved cheaper row a miss", () => {
    for (const patch of [{ identityCompatible: false }, { conditionCompatible: false }, { eligible: false }, { newToPrimary: false }]) {
      expect(assessPriceRecall({ ...observation, ...patch }).status).toBe("not_a_miss");
    }
    expect(assessPriceRecall({ ...observation, itemPrice: 50 }).status).toBe("no_miss_in_sample");
  });
  it("only sends tuning opportunities to the agent and rejects invented case IDs", async () => {
    let sent = "";
    const provider = { completeJson: async (input: { user: unknown }) => {
      sent = JSON.stringify(input.user);
      return { data: { findings: [{ caseId: "made-up", proposal: "change query", nextTest: "replay" }] }, model: "test", provider: "test" };
    } };
    const rows = [{ ...observation, split: "tuning", cardId: "OP05-119", historical: true },
      { ...observation, id: "hidden-case", split: "held_out", cardId: "OP09-001", historical: false }];
    expect((await triagePriceOpportunities(rows, provider as never)).status).toBe("rejected");
    expect(sent).not.toContain("hidden-case");
    expect(sent).not.toContain("ebay.com");
    expect(sent).toContain("historical");
  });
});
