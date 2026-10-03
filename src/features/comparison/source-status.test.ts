import { describe, expect, it } from "vitest";
import { sourceStatusLabel } from "./source-status";
import type { ComparisonPlatformResult } from "@/lib/schemas";

const source: ComparisonPlatformResult = { id: "whatnot", marketplace: "Whatnot", label: "Whatnot", sourceMode: "third_party_provider", configured: true, status: "fallback", count: 0, detail: "" };

describe("buyer-facing source status", () => {
  it.each(["Cross-market pilot budget reached; this source is paused.", "Paid source paused: configuration review", "HTTP 503"])("keeps internal source details out of the buyer message: %s", (detail) => {
    expect(sourceStatusLabel({ ...source, detail }, "en")).toBe("Temporarily unavailable");
    expect(sourceStatusLabel({ ...source, detail }, "zh")).toBe("暂时无法读取");
  });
  it("distinguishes unconnected and successfully checked sources", () => {
    expect(sourceStatusLabel({ ...source, configured: false, status: "skipped" }, "en")).toBe("Manual check only");
    expect(sourceStatusLabel({ ...source, status: "complete", count: 2 }, "en")).toBe("2 found");
  });
});
