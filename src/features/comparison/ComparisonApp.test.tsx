// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComparisonApp } from "@/features/comparison/ComparisonApp";
import type { ComparisonReport, ComparisonRequest } from "@/lib/schemas";

vi.mock("@/lib/analytics", () => ({
  initializeAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}));

function reportFor(request: ComparisonRequest): ComparisonReport {
  return {
    status: "complete",
    request,
    identityCandidates: [],
    confirmedCard: null,
    candidates: [],
    rankedChoices: [],
    references: [],
    narrative: { summary: "No comparable listings.", cautions: [] },
    warnings: [],
    trace: [],
    platforms: [],
    webDiscoveries: [],
    demoMode: false,
    generatedAt: "2026-07-11T00:00:00.000Z",
  };
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe("comparison condition controls", () => {
  let requests: ComparisonRequest[];

  beforeEach(() => {
    requests = [];
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as ComparisonRequest;
      requests.push(request);
      return new Response(JSON.stringify(reportFor(request)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(performance.now()), 0)
    ));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the active minimum before search and submits a refined condition", async () => {
    render(<ComparisonApp />);

    const refineButton = screen.getByRole("button", {
      name: /Refine the search.+Minimum seller-stated condition.+Near Mint/i,
    });
    fireEvent.click(refineButton);

    const condition = screen.getByRole("combobox", { name: "Minimum seller-stated condition" });
    fireEvent.change(condition, { target: { value: "Lightly Played" } });

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Pikachu 025/165" } });
    const form = query.closest("form");
    expect(form).not.toBeNull();
    fireEvent.click(within(form as HTMLFormElement).getByRole("button", {
      name: /Find exact card|Compare exact listings/,
    }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].buyer.desiredCondition).toBe("Lightly Played");
    const editButton = await screen.findByRole("button", { name: /Edit/i });
    expect(editButton.textContent).toContain("Lightly Played");
  });

  it("lets a buyer change the applied condition from result Edit", async () => {
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Pikachu 025/165" } });
    const form = query.closest("form");
    expect(form).not.toBeNull();
    fireEvent.click(within(form as HTMLFormElement).getByRole("button", {
      name: /Find exact card|Compare exact listings/,
    }));

    await waitFor(() => expect(requests).toHaveLength(1));
    const editButton = await screen.findByRole("button", { name: /Edit/i });
    expect(editButton.textContent).toContain("Near Mint");
    fireEvent.click(editButton);

    const condition = screen.getByRole("combobox", { name: "Minimum seller-stated condition" }) as HTMLSelectElement;
    expect(condition.value).toBe("Near Mint");
    fireEvent.change(condition, { target: { value: "Moderately Played" } });

    const editForm = condition.closest("form");
    expect(editForm).not.toBeNull();
    fireEvent.click(within(editForm as HTMLFormElement).getByRole("button", {
      name: "Compare exact listings",
    }));

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].buyer.desiredCondition).toBe("Moderately Played");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Edit/i }).textContent).toContain("Moderately Played");
    });
  });
});
