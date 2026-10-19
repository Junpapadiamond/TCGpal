import { describe, expect, it } from "vitest";
import { selectEvaluationModel, reviewWithModels } from "./model-routing";
import { evaluateAccuracy } from "./card-accuracy";
import dataset from "./card-accuracy-dataset.json";

describe("offline evaluation model routing", () => {
  it("chooses from configured strong models by recent successful schema responses", () => {
    const history = [{ model: "claude-opus-4-8", status: "unavailable" as const }, { model: "claude-sonnet-4-6", status: "provisional" as const }];
    expect(selectEvaluationModel(["claude-opus-4-8", "claude-sonnet-4-6"], history)).toBe("claude-sonnet-4-6");
    expect(() => selectEvaluationModel(["claude-haiku-4-5"], [])).toThrow(/strong/i);
    expect(() => selectEvaluationModel(["gpt-6-mini"], [])).toThrow(/strong/i);
    expect(selectEvaluationModel(["gpt-6", "gpt-5.5"], [])).toBe("gpt-6");
  });

  it("makes one selected model call and records failure without retries or label changes", async () => {
    const result = evaluateAccuracy(dataset, "tuning");
    const before = JSON.stringify(result);
    const calls: string[] = [];
    const response = await reviewWithModels(result, ["claude-opus-4-8", "claude-sonnet-4-6"], [], model => {
      calls.push(model); return { completeJson: async () => { throw new Error("upstream unavailable"); } };
    });
    expect(calls).toEqual(["claude-opus-4-8"]);
    expect(response.triage.status).toBe("unavailable");
    expect(response.history.at(-1)?.model).toBe("claude-opus-4-8");
    expect(JSON.stringify(result)).toBe(before);
    expect(selectEvaluationModel(["claude-opus-4-8", "claude-sonnet-4-6"], response.history)).toBe("claude-sonnet-4-6");
  });
});
