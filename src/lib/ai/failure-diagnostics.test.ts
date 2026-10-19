import { describe, expect, it } from "vitest";
import { safeAiFailure } from "./failure-diagnostics";
describe("safe model diagnostics", () => {
  it("separates gateway, auth, timeout and invalid outputs without leaking messages", () => {
    for (const [message, code, httpStatus] of [
      ["Anthropic 502: secret-body", "upstream", 502], ["Anthropic 401: secret-key", "authentication", 401],
      ["AI output failed card_accuracy_triage validation: private input", "schema_validation", undefined],
    ] as const) {
      const result = safeAiFailure(new Error(message));
      expect(result.code).toBe(code); expect(result.httpStatus).toBe(httpStatus);
      expect(JSON.stringify(result)).not.toMatch(/secret|private/);
    }
    expect(safeAiFailure(new DOMException("aborted", "AbortError")).code).toBe("timeout");
    expect(safeAiFailure(new SyntaxError("private output")).code).toBe("invalid_json");
  });
});
