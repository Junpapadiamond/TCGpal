// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComparisonApp } from "@/features/comparison/ComparisonApp";
import type { ComparisonReport, ComparisonRequest } from "@/lib/schemas";
import { normalizeListing, rankListings } from "@/lib/comparison/ranking";

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

  it("selects the Nami P4 image and immediately searches that exact print", async () => {
    const p2 = {
      id: "OP01-016_p2",
      name: "Nami",
      setName: "One Piece Card Game 2nd Anniversary Complete Guide",
      setCode: "OP-01",
      cardNumber: "OP01-016",
      language: "EN",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016_p2.png",
      rarity: "R",
      variant: "Alternate Art (P2)",
      confidence: "medium" as const,
      matchReasons: ["Card name matches."],
    };
    const p4 = {
      ...p2,
      id: "OP01-016_p4",
      setName: "Awakening Of The New Era",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016_p4.png",
      rarity: "SP CARD",
      variant: "Special Art (P4)",
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as ComparisonRequest;
      requests.push(request);
      const report: ComparisonReport = requests.length === 1
        ? {
            ...reportFor(request),
            status: "needs_confirmation",
            identityCandidates: [p2, p4],
          }
        : {
            ...reportFor(request),
            confirmedCard: p4,
          };
      return new Response(JSON.stringify(report), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Nami SP" } });
    const form = query.closest("form")!;
    fireEvent.click(within(form).getByRole("button", { name: /Find exact card|Compare exact listings/ }));

    const p4Control = await screen.findByRole("button", {
      name: /Select Nami OP01-016 Special Art \(P4\)/,
    });
    fireEvent.click(p4Control);

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].confirmedCardId).toBe("OP01-016_p4");
    expect(requests[1].buyer.desiredCondition).toBe("Near Mint");
    expect(screen.queryByRole("button", { name: /Rank live listings/ })).toBeNull();
  });

  it("shows the confirmed reference art beside the seller listing photo", async () => {
    const confirmedCard = {
      id: "OP01-016_p4",
      name: "Nami",
      setName: "Awakening Of The New Era",
      setCode: "OP-05",
      cardNumber: "OP01-016",
      language: "EN",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016_p4.png",
      rarity: "SP CARD",
      variant: "Special Art (P4)",
      confidence: "high" as const,
      matchReasons: ["User confirmed this version."],
      printIdentity: {
        canonicalPrintId: "OP01-016_p4",
        familyId: "OP01-016",
        game: "onePiece" as const,
        setName: "Awakening Of The New Era",
        setCode: "OP-05",
        collectorNumber: "OP01-016",
        rarity: "SP CARD",
        variantLabel: "Special Art (P4)",
        imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016_p4.png",
        catalogVerified: true,
      },
    };
    const listing = normalizeListing({
      listing: {
        id: "ebay-nami-sp",
        marketplace: "eBay",
        url: "https://www.ebay.com/itm/123456789012",
        title: "Nami OP01-016 SP Special Art",
        cardId: confirmedCard.id,
        matchConfidence: "high",
        matchReasons: ["Name and collector number match."],
        active: true,
        raw: true,
        currency: "USD",
        price: 120,
        shipping: 5,
        claimedCondition: "Near Mint",
        imageUrl: "https://i.ebayimg.com/images/g/nami/s-l1600.jpg",
        seller: {
          feedbackPercentage: 99.8,
          feedbackCount: 1200,
          returnsAccepted: true,
          topRated: true,
          buyerProtection: true,
          subRatings: null,
        },
        evidence: {
          photoCount: 8,
          frontBackExplicit: true,
          closeupsExplicit: true,
          surfaceExplicit: false,
          identityExplicit: true,
          substantiveConditionNotes: true,
          missing: [],
        },
        observedAt: "2026-07-11T00:00:00.000Z",
        demo: false,
        userSupplied: false,
      },
      buyer: { country: "US", postalCode: "10001", taxRate: 0.08, desiredCondition: "Near Mint" },
      marketPrice: 130,
      confirmedCard,
      cardLanguage: "EN",
    });
    const alternative = {
      ...listing,
      id: "ebay-nami-sp-alternative",
      title: "Nami OP01-016 P4 SP alternate seller",
      imageUrl: "https://i.ebayimg.com/images/g/nami-alternative/s-l1600.jpg",
      price: 150,
      preTaxTotal: 155,
      estimatedTax: 12.4,
      estimatedLandedCost: 167.4,
      priceScore: Math.max(0, listing.priceScore - 20),
      valueScore: Math.max(0, listing.valueScore - 10),
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as ComparisonRequest;
      requests.push(request);
      const report: ComparisonReport = {
        ...reportFor(request),
        confirmedCard,
        candidates: [listing, alternative],
        rankedChoices: rankListings([listing, alternative], { marketPrice: 130 }),
        outcome: "best_buy",
        identityContractVersion: 2,
      };
      return new Response(JSON.stringify(report), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Nami SP OP01-016" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: /Find exact card|Compare exact listings/ }));

    expect(await screen.findAllByAltText("Confirmed card reference: Nami OP01-016 Special Art (P4)")).toHaveLength(2);
    expect(screen.getByAltText("Listing evidence photo: Nami OP01-016 SP Special Art")).toBeTruthy();
    expect(screen.getAllByText("Awakening Of The New Era · OP01-016 · SP CARD · Special Art (P4)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("The listing names the uniquely identifiable selected print class.").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Compare 1 other eligible listing"));
    expect(screen.getByAltText("Listing evidence photo: Nami OP01-016 P4 SP alternate seller")).toBeTruthy();
    expect(screen.getAllByAltText("Confirmed card reference: Nami OP01-016 Special Art (P4)")).toHaveLength(2);
  });

  it("shows an unresolved same-number listing as Inspect First, never as the buy", async () => {
    const confirmedCard = {
      id: "OP01-016_p2",
      name: "Nami",
      setName: "One Piece Card Game 2nd Anniversary Complete Guide",
      setCode: "OP-01",
      cardNumber: "OP01-016",
      language: "EN",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016_p2.png",
      rarity: "R",
      variant: "Alternate Art (P2)",
      confidence: "high" as const,
      matchReasons: ["User confirmed this version."],
      printIdentity: {
        canonicalPrintId: "OP01-016_p2",
        familyId: "OP01-016",
        game: "onePiece" as const,
        setName: "One Piece Card Game 2nd Anniversary Complete Guide",
        setCode: "OP-01",
        collectorNumber: "OP01-016",
        rarity: "R",
        variantLabel: "Alternate Art (P2)",
        imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016_p2.png",
        catalogVerified: true,
      },
    };
    const listing = normalizeListing({
      listing: {
        id: "ebay-generic-alt",
        marketplace: "eBay",
        url: "https://www.ebay.com/itm/123456789013",
        title: "Nami OP01-016 Alternate Art Parallel",
        cardId: confirmedCard.id,
        matchConfidence: "high",
        matchReasons: ["Name and number match."],
        active: true,
        raw: true,
        currency: "USD",
        price: 90,
        shipping: 5,
        claimedCondition: "Near Mint",
        imageUrl: "https://i.ebayimg.com/images/g/nami-alt/s-l1600.jpg",
        seller: { feedbackPercentage: 99, feedbackCount: 500, returnsAccepted: true, topRated: false, buyerProtection: true, subRatings: null },
        evidence: { photoCount: 4, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: false, substantiveConditionNotes: false, missing: ["Exact print not stated"] },
        observedAt: "2026-07-11T00:00:00.000Z",
        demo: false,
        userSupplied: false,
      },
      buyer: { country: "US", postalCode: "10001", taxRate: 0.08, desiredCondition: "Near Mint" },
      marketPrice: 100,
      confirmedCard,
      cardLanguage: "EN",
    });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as ComparisonRequest;
      requests.push(request);
      return new Response(JSON.stringify({
        ...reportFor(request),
        status: "partial",
        confirmedCard,
        candidates: [listing],
        outcome: "inspect_first",
        inspectListingId: listing.id,
        identityContractVersion: 2,
      } satisfies ComparisonReport), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Nami OP01-016 P2" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: /Find exact card|Compare exact listings/ }));

    expect(await screen.findByRole("heading", { name: "Best inspect lead" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Inspect listing" })).toBeTruthy();
    expect(screen.queryByText("Our pick")).toBeNull();
  });

  it("offers real next actions and keeps an English abstention reason out of 中文", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as ComparisonRequest;
      requests.push(request);
      return new Response(JSON.stringify({
        ...reportFor(request),
        status: "partial",
        outcome: "next_moves",
        inspectListingId: null,
        identityContractVersion: 2,
        abstention: {
          reason: "Found listings, but none matched the selected SP print.",
          foundCount: 2,
          variantExcludedCount: 2,
          suggestedCardId: null,
          suggestedLabel: null,
        },
      } satisfies ComparisonReport), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Nami OP01-016 SP" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: /Find exact card|Compare exact listings/ }));

    expect(await screen.findByRole("button", { name: "Refine search" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry sources" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Paste a listing" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(await screen.findByRole("heading", { name: "暂时没有可信的购买建议" })).toBeTruthy();
    expect(screen.queryByText("Found listings, but none matched the selected SP print.")).toBeNull();
  });
});
