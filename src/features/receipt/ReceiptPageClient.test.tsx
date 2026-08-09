// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://lenstcg.com/r/0123456789abcdef0123456789abcdef" }

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "@/features/comparison/i18n";
import { buildStandardComparisonRequest, STANDARD_COMPARISON_FLOW_CARDS } from "@/lib/testing/standard-comparison-flow";
import type { ComparisonSnapshot } from "@/lib/comparison/report-snapshot";
import {
  classifyReceiptReferrer,
  formatReceiptChoiceLabel,
  formatReceiptCondition,
  formatReceiptIdentityNote,
  ReceiptPageClient,
} from "./ReceiptPageClient";

const trackEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }));

function snapshot(): ComparisonSnapshot {
  return {
    id: "0123456789abcdef0123456789abcdef",
    report: {
      status: "complete",
      request: buildStandardComparisonRequest(STANDARD_COMPARISON_FLOW_CARDS[0]),
      identityCandidates: [],
      confirmedCard: null,
      candidates: [],
      rankedChoices: [],
      references: [],
      narrative: { summary: "No trustworthy buy yet.", cautions: [] },
      warnings: [],
      trace: [],
      platforms: [],
      webDiscoveries: [],
      outcome: "next_moves",
      demoMode: false,
      generatedAt: "2026-08-09T08:30:00.000Z",
    },
    savedAt: "2026-08-09T08:31:00.000Z",
    expiresAt: "2026-09-08T08:31:00.000Z",
  };
}

describe("receipt page interactions", () => {
  const clipboard = { writeText: vi.fn(async () => undefined) };

  beforeEach(() => {
    setLanguage("en");
    trackEvent.mockClear();
    clipboard.writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
  });

  afterEach(() => cleanup());

  it("copies the stable receipt URL and renders the same receipt in Chinese", async () => {
    render(<ReceiptPageClient snapshot={snapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy receipt" }));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith(window.location.href));
    expect(trackEvent).toHaveBeenCalledWith("receipt_link_copied");

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(screen.getByRole("heading", { name: "决策凭证" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "重新查在售商品" })).toBeTruthy();
    const noBuyLabel = screen.getAllByText(/^暂时没有能放心买的/).find((element) => element.tagName === "STRONG");
    expect(noBuyLabel?.textContent).toBe("暂时没有能放心买的。");
  });

  it("classifies only a coarse referrer category", () => {
    expect(classifyReceiptReferrer("", "https://lenstcg.com")).toBe("direct");
    expect(classifyReceiptReferrer("https://www.reddit.com/r/PokemonTCG", "https://lenstcg.com")).toBe("reddit");
    expect(classifyReceiptReferrer("https://discord.com/channels/1/2", "https://lenstcg.com")).toBe("discord");
    expect(classifyReceiptReferrer("https://example.com/post", "https://lenstcg.com")).toBe("other");
  });

  it("localizes condition labels and hides machine-only identity reason codes", () => {
    expect(formatReceiptCondition("Near Mint", "zh")).toBe("近全新（NM）");
    expect(formatReceiptCondition("Lightly Played", "zh")).toBe("微瑕（LP）");
    expect(formatReceiptCondition("Lightly Played", "en")).toBe("Lightly Played");
    expect(formatReceiptChoiceLabel({ role: "best_value", label: "Best value" }, "zh")).toBe("最划算");
    expect(formatReceiptIdentityNote("print_identity_not_assessed")).toBeNull();
    expect(formatReceiptIdentityNote("Collector number and card name match.")).toBe("Collector number and card name match.");
  });
});
