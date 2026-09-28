// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SearchCoverage } from "./SearchCoverage";
import type { RecallCoverage } from "@/lib/schemas";

afterEach(cleanup);
const coverage: RecallCoverage = {
  marketplace: "eBay", attempts: [{ kind: "keyword", value: "Mew ex 232/91", status: "complete", returnedCount: 50, usdCount: 49 }],
  query: { kind: "keyword", value: "Mew ex 232/91" }, status: "inconclusive", observedAt: "2026-09-28T12:00:00.000Z",
  returnedCount: 10, newCount: 3, comparableCount: 0, unresolvedCount: 2, baselineCheapestTotal: 100, listing: null, excluded: [],
};
describe("receipt search coverage", () => {
  it("shows insufficient evidence and bounded counts without claiming complete recall", () => {
    render(<SearchCoverage coverage={[coverage]} lang="en" />);
    expect(screen.getByText("Search check: more evidence needed")).toBeTruthy();
    expect(screen.getByText(/10 sampled · 3 new · 0 comparable · 2 unresolved/)).toBeTruthy();
    expect(screen.getByText(/50 returned · 49 USD/)).toBeTruthy();
    expect(screen.getByText(/does not prove that the search is complete/)).toBeTruthy();
  });
  it("localizes a failed probe and preserves historical receipts without diagnostics", () => {
    const view = render(<SearchCoverage coverage={[{ ...coverage, status: "failed" }]} lang="zh" />);
    expect(screen.getByText("搜索抽查未完成")).toBeTruthy();
    view.rerender(<SearchCoverage lang="zh" />);
    expect(view.container.textContent).toBe("");
  });
});
