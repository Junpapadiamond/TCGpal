// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { comparisonReportSchema, type ComparisonRequest } from "@/lib/schemas";
import { buildStandardComparisonRequest, STANDARD_COMPARISON_FLOW_CARDS } from "@/lib/testing/standard-comparison-flow";
import { CrossMarketSearch } from "./CrossMarketSearch";
import { setLanguage } from "./i18n";

const request = buildStandardComparisonRequest(STANDARD_COMPARISON_FLOW_CARDS[0]);
const report = comparisonReportSchema.parse({
  status: "complete", request, confirmedCard: null, identityCandidates: [], candidates: [],
  rankedChoices: [], references: [], narrative: { summary: "No comparable listings.", cautions: [] },
  warnings: [], trace: [], platforms: [], webDiscoveries: [], demoMode: false,
  generatedAt: "2026-11-05T00:00:00.000Z",
});

describe("changing cross-market selection", () => {
  beforeEach(() => act(() => setLanguage("en")));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("keeps the current result while editing and searches only after an explicit click", async () => {
    const requests: ComparisonRequest[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      const selected = JSON.parse(String(init.body));
      requests.push(selected);
      return Response.json({ ...report, request: selected });
    }));
    render(<CrossMarketSearch report={report} initialResult={{ ...report, request: { ...request, marketScope: "cross", marketplaces: ["Whatnot"] } }} />);
    expect(screen.getByRole("region", { name: "Whatnot prices" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "eBay prices" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change markets" }));
    const selector = screen.getByRole("group", { name: "Markets to search" });
    expect(within(selector).getByRole("button", { name: "Whatnot", pressed: true })).toBeTruthy();
    fireEvent.click(within(selector).getByRole("button", { name: "Mercari" }));
    expect(requests).toHaveLength(0);
    expect(screen.getByRole("region", { name: "Whatnot prices" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search selected markets" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    await screen.findByRole("region", { name: "Mercari prices" });
    expect(requests[0].marketplaces).toEqual(["Whatnot", "Mercari"]);
    expect(screen.queryByRole("group", { name: "Markets to search" })).toBeNull();
    act(() => setLanguage("zh"));
    expect(screen.getByRole("button", { name: "更改平台" })).toBeTruthy();
    expect(requests).toHaveLength(1);
  });
});
