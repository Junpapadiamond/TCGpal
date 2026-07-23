// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComparisonApp, PrintIdentitySummary } from "@/features/comparison/ComparisonApp";
import { setLanguage, useLang } from "@/features/comparison/i18n";
import type { CardIdentityCandidate, ComparisonReport, ComparisonRequest, NormalizedListing } from "@/lib/schemas";
import { normalizeListing, rankListings } from "@/lib/comparison/ranking";
import { parseCardQuery } from "@/lib/comparison/query-parser";
import { findOnePieceCatalogVariant } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";

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

function identityResponse(candidates: CardIdentityCandidate[], status: "resolved" | "needs_confirmation" = "resolved") {
  return {
    identityContractVersion: 1 as const,
    status,
    candidates,
    confirmedCard: status === "resolved" ? candidates[0] ?? null : null,
    warnings: [],
    generatedAt: "2026-07-12T00:00:00.000Z",
  };
}

function identityForQuery(query: string): CardIdentityCandidate {
  const parsed = parseCardQuery(query);
  return {
    id: parsed.cardNumber || "test-card",
    name: parsed.name || query,
    setName: "Test set",
    setCode: parsed.setCode || "TEST",
    cardNumber: parsed.cardNumber || "1/1",
    language: "English",
    imageUrl: "https://images.pokemontcg.io/base1/1.png",
    confidence: "high",
    matchReasons: ["Test catalog match."],
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
    window.history.replaceState(null, "", "/");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    setLanguage("en");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as ComparisonRequest;
      if (String(input).endsWith("/api/agent/card-identity")) {
        return new Response(JSON.stringify(identityResponse([identityForQuery(String(request.query))])), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
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

  it("opens a gallery-shaped identity state without comparison language for a name-only search", async () => {
    let resolveIdentity!: (response: Response) => void;
    const identityResponse = new Promise<Response>((resolve) => { resolveIdentity = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/agent/card-identity")) return identityResponse;
      throw new Error("listing comparison must not start before confirmation");
    }));
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Pikachu" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: "Browse card versions" }));

    expect(await screen.findByRole("heading", { name: "Finding Pikachu versions" })).toBeTruthy();
    expect(screen.queryByText(/validating the comparison/i)).toBeNull();
    expect(screen.queryByText(/marketplace evidence/i)).toBeNull();

    resolveIdentity(new Response(JSON.stringify({
      identityContractVersion: 1,
      status: "needs_confirmation",
      candidates: [{
        id: "sv5-18",
        name: "Pikachu",
        setName: "Paldean Fates",
        setCode: "SV5",
        cardNumber: "18/91",
        language: "English",
        imageUrl: "https://images.pokemontcg.io/sv5/18.png",
        confidence: "medium",
        matchReasons: ["Card name matches."],
      }],
      confirmedCard: null,
      warnings: [],
      generatedAt: "2026-07-12T00:00:00.000Z",
    }), { headers: { "Content-Type": "application/json" } }));

    expect(await screen.findByRole("heading", { name: "Choose your Pikachu" })).toBeTruthy();
  });

  it("ignores a stale Mew response after a newer Mewtwo search", async () => {
    const resolvers = new Map<string, (response: Response) => void>();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).endsWith("/api/agent/card-identity")) throw new Error("unexpected comparison");
      const body = JSON.parse(String(init?.body)) as { query: string };
      return new Promise<Response>((resolve) => resolvers.set(body.query, resolve));
    }));
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Mew" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: "Browse card versions" }));
    await screen.findByRole("heading", { name: "Finding Mew versions" });
    fireEvent.click(screen.getByRole("button", { name: "New search" }));
    const nextQuery = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(nextQuery, { target: { value: "Mewtwo" } });
    fireEvent.click(within(nextQuery.closest("form")!).getByRole("button", { name: "Browse card versions" }));

    await waitFor(() => expect(resolvers.has("Mewtwo")).toBe(true));
    resolvers.get("Mewtwo")!(new Response(JSON.stringify(identityResponse([identityForQuery("Mewtwo")], "needs_confirmation")), { headers: { "Content-Type": "application/json" } }));
    expect(await screen.findByRole("heading", { name: "Choose your Mewtwo" })).toBeTruthy();
    resolvers.get("Mew")!(new Response(JSON.stringify(identityResponse([identityForQuery("Mew")], "needs_confirmation")), { headers: { "Content-Type": "application/json" } }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Choose your Mew" })).toBeNull());
  });

  it("does not multiply a server-side identity failure with a second client retry", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).endsWith("/api/agent/card-identity")) throw new Error("unexpected comparison");
      return new Response(JSON.stringify({ error: "The card catalog is temporarily unavailable." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Charizard" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: "Browse card versions" }));

    expect(await screen.findByText("The card catalog is temporarily unavailable.")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("mounts cards in a collapsed identity group only after the group opens", async () => {
    const candidates = Array.from({ length: 8 }, (_, index): CardIdentityCandidate => ({
      id: `card-${index}`,
      name: `Pikachu print ${index + 1}`,
      setName: `Set ${Math.floor(index / 2) + 1}`,
      setCode: `S${Math.floor(index / 2) + 1}`,
      cardNumber: `${index + 1}/100`,
      language: "English",
      imageUrl: null,
      confidence: "low",
      matchReasons: ["Broad name match."],
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(
      identityResponse(candidates, "needs_confirmation"),
    ), { headers: { "Content-Type": "application/json" } })));
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Pikachu" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: "Browse card versions" }));
    expect(await screen.findByRole("heading", { name: /Choose your Pikachu print 1/i })).toBeTruthy();

    expect(screen.getByText("Pikachu print 1")).toBeTruthy();
    expect(screen.getByText("Pikachu print 4")).toBeTruthy();
    expect(screen.queryByText("Pikachu print 5")).toBeNull();

    fireEvent.click(screen.getByText("Set 3", { selector: "summary" }));

    expect(await screen.findByText("Pikachu print 5")).toBeTruthy();
    expect(screen.getByText("Pikachu print 6")).toBeTruthy();
    expect(screen.queryByText("Pikachu print 7")).toBeNull();
  });

  it("restores the filled search and confirmation steps through browser history", async () => {
    const pushed: Array<{ state: unknown; url: string | URL | null | undefined }> = [];
    const replaced: Array<{ state: unknown; url: string | URL | null | undefined }> = [];
    const originalPush = window.history.pushState.bind(window.history);
    const originalReplace = window.history.replaceState.bind(window.history);
    vi.spyOn(window.history, "pushState").mockImplementation((state, unused, url) => {
      pushed.push({ state, url });
      originalPush(state, unused, url);
    });
    vi.spyOn(window.history, "replaceState").mockImplementation((state, unused, url) => {
      replaced.push({ state, url });
      originalReplace(state, unused, url);
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(
      identityResponse([identityForQuery("Mew")], "needs_confirmation"),
    ), { headers: { "Content-Type": "application/json" } })));
    render(<ComparisonApp />);
    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Mew" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: "Browse card versions" }));
    expect(await screen.findByRole("heading", { name: "Choose your Mew" })).toBeTruthy();

    const confirmation = pushed.find((entry) => String(entry.url).includes("step=confirmation"));
    const searchState = [...replaced, ...pushed].find((entry) => String(entry.url).includes("step=search"))?.state;
    expect(searchState).toBeTruthy();
    window.dispatchEvent(new PopStateEvent("popstate", { state: searchState }));
    await waitFor(() => expect((screen.getByRole("textbox", { name: "Search for a card" }) as HTMLInputElement).value).toBe("Mew"));
    expect(confirmation).toBeTruthy();
    window.dispatchEvent(new PopStateEvent("popstate", { state: confirmation!.state }));
    expect(await screen.findByRole("heading", { name: "Choose your Mew" })).toBeTruthy();
  });

  it("bypasses the gallery for one proven print and anchors the comparison loader to that artwork", async () => {
    let resolveComparison!: (response: Response) => void;
    const comparisonResponse = new Promise<Response>((resolve) => { resolveComparison = resolve; });
    const exactCard: CardIdentityCandidate = {
      id: "swsh7-215",
      name: "Umbreon VMAX",
      setName: "Evolving Skies",
      setCode: "SWSH7",
      cardNumber: "215/203",
      language: "English",
      imageUrl: "https://images.pokemontcg.io/swsh7/215.png",
      confidence: "high",
      matchReasons: ["Collector number matches."],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/agent/card-identity")) {
        return new Response(JSON.stringify({
          identityContractVersion: 1,
          status: "resolved",
          candidates: [exactCard],
          confirmedCard: exactCard,
          warnings: [],
          generatedAt: "2026-07-12T00:00:00.000Z",
        }), { headers: { "Content-Type": "application/json" } });
      }
      if (String(input).endsWith("/api/agent/listing-compare")) {
        requests.push(JSON.parse(String(init?.body)) as ComparisonRequest);
        return comparisonResponse;
      }
      throw new Error(`unexpected request ${String(input)}`);
    }));
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Umbreon VMAX 215/203" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: "Compare exact listings" }));

    expect(await screen.findByRole("heading", { name: "Comparing listings for Umbreon VMAX" })).toBeTruthy();
    expect(screen.getByAltText("Umbreon VMAX 215/203")).toBeTruthy();
    const cardMotion = screen.getByTestId("confirmed-card-motion");
    const motionImages = Array.from(cardMotion.querySelectorAll("img"));
    expect(motionImages).toHaveLength(4);
    const motionSources = motionImages.map((image) => {
      const src = image.getAttribute("src") ?? "";
      return new URL(src, window.location.href).searchParams.get("url") ?? src;
    });
    expect(new Set(motionSources).size).toBe(1);
    expect(motionSources[0]).toContain("swsh7/215.png");
    expect(motionImages.filter((image) => image.getAttribute("alt"))).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: /Choose your/i })).toBeNull();
    await waitFor(() => expect(requests[0]?.confirmedCardId).toBe("swsh7-215"));

    resolveComparison(new Response(JSON.stringify({
      ...reportFor(requests[0]),
      confirmedCard: exactCard,
    }), { headers: { "Content-Type": "application/json" } }));
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
      name: /Browse card versions|Find exact card|Compare exact listings/,
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
      name: /Browse card versions|Find exact card|Compare exact listings/,
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

  it("labels a set-only One Piece query in result Edit as browsing card versions", async () => {
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Nami OP01-016" } });
    fireEvent.click(within(query.closest("form") as HTMLFormElement).getByRole("button", {
      name: "Compare exact listings",
    }));

    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", { name: /Edit/i }));

    const editQuery = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(editQuery, { target: { value: "luffy op01" } });

    const editForm = editQuery.closest("form");
    expect(editForm).not.toBeNull();
    expect(within(editForm as HTMLFormElement).getByRole("button", {
      name: "Browse card versions",
    })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(within(editForm as HTMLFormElement).getByRole("button", {
      name: "浏览卡片版本",
    })).toBeTruthy();
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as ComparisonRequest;
      if (String(input).endsWith("/api/agent/card-identity")) {
        return new Response(JSON.stringify(identityResponse([p2, p4], "needs_confirmation")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      requests.push(request);
      const report: ComparisonReport = { ...reportFor(request), confirmedCard: p4 };
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
    fireEvent.click(within(form).getByRole("button", { name: /Browse card versions|Compare exact listings/ }));

    const p4Control = await screen.findByRole("button", {
      name: /Select Nami OP01-016 Special Art \(P4\)/,
    });
    fireEvent.click(p4Control);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].confirmedCardId).toBe("OP01-016_p4");
    expect(requests[0].buyer.desiredCondition).toBe("Near Mint");
    expect(screen.queryByRole("button", { name: /Rank live listings/ })).toBeNull();
  });

  it("renders researched manga, silver, and gold labels and submits the exact gold print", async () => {
    const user = userEvent.setup();
    const candidates = ["OP05-119_p2", "OP05-119_p7", "OP05-119_p8"].map((id) => {
      const card = findOnePieceCatalogVariant(id);
      if (!card) throw new Error(`Missing bundled print ${id}.`);
      return mapOnePieceCardToIdentity(card, { confidence: "medium", matchReasons: ["Card name matches."] });
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as ComparisonRequest;
      if (String(input).endsWith("/api/agent/card-identity")) {
        return new Response(JSON.stringify(identityResponse(candidates, "needs_confirmation")), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      requests.push(request);
      return new Response(JSON.stringify({
        ...reportFor(request),
        status: "partial",
        confirmedCard: candidates.find((candidate) => candidate.id === request.confirmedCardId) ?? null,
      } satisfies ComparisonReport), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Gear 5 Luffy OP05-119" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: /Browse card versions|Compare exact listings/ }));

    expect(await screen.findByRole("button", { name: /Select Monkey.D.Luffy OP05-119 Manga Art/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Select Monkey.D.Luffy OP05-119 Silver Special Art/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "中文" }));
    expect(screen.getByText("Manga Art")).toBeTruthy();
    expect(screen.getByText("Silver Special Art")).toBeTruthy();
    expect(screen.getByText("Gold Special Art")).toBeTruthy();
    expect(screen.getByAltText(/Monkey.D.Luffy · OP05-119 · Gold Special Art · A Fist Of Divine Speed/i)).toBeTruthy();
    const gold = screen.getByRole("button", { name: /Monkey.D.Luffy OP05-119 Gold Special Art/ });
    gold.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].confirmedCardId).toBe("OP05-119_p8");
    expect(screen.getByRole("button", { name: /Gold Special Art/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "EN" }));
  });

  it("renders precise special-print evidence reasons in English and Chinese", async () => {
    const user = userEvent.setup();
    const card = mapOnePieceCardToIdentity(findOnePieceCatalogVariant("OP05-119_p8")!, {
      confidence: "high",
      matchReasons: [],
    });
    const listing = {
      printMatchReasons: [
        "listing_names_selected_print_treatment",
        "listing_names_different_print_treatment",
        "listing_omits_selected_print_treatment",
      ],
    } as NormalizedListing;
    function Harness({ confirmedCard }: { confirmedCard: CardIdentityCandidate }) {
      const { setLang } = useLang();
      return <>
        <button type="button" onClick={() => setLang("zh")}>中文测试</button>
        <button type="button" onClick={() => setLang("en")}>English test</button>
        <PrintIdentitySummary listing={listing} confirmedCard={confirmedCard} />
      </>;
    }

    render(<Harness confirmedCard={card} />);
    expect(screen.getByText("The listing names the selected print treatment.")).toBeTruthy();
    expect(screen.getByText("The listing names a different foil or color treatment.")).toBeTruthy();
    expect(screen.getByText("The listing does not state the selected print treatment.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "中文测试" }));
    expect(screen.getByText("商品明确写出了已选版本的特殊工艺。")).toBeTruthy();
    expect(screen.getByText("商品写的是不同的闪膜或颜色工艺。")).toBeTruthy();
    expect(screen.getByText("商品没有写明已选版本的特殊工艺。")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "English test" }));
  });

  it("shows seller listing photos without repeating the confirmed reference art beside them", async () => {
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
        artworkClass: null,
        treatments: [],
        originalSetCode: "OP-05",
        releaseName: "Awakening Of The New Era",
        releaseCode: null,
        releaseChannel: "booster" as const,
        releaseProvenance: "unknown" as const,
        competitionTier: null,
        collectorAliases: [],
        exactMarkers: [],
        metadataRevision: null,
        tcgplayerProductId: null,
        tcgplayerGroupId: null,
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
        listingLanguage: "English",
        matchAspectText: "Language: English. Set: Awakening Of The New Era. Rarity: SP CARD. Features: Special Art",
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as ComparisonRequest;
      if (String(input).endsWith("/api/agent/card-identity")) {
        return new Response(JSON.stringify(identityResponse([confirmedCard])), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      requests.push(request);
      const report: ComparisonReport = {
        ...reportFor(request),
        confirmedCard,
        candidates: [listing, alternative],
        rankedChoices: rankListings([listing, alternative], { marketPrice: 130 }),
        outcome: "best_buy",
        identityContractVersion: 4,
      };
      return new Response(JSON.stringify(report), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Nami SP OP01-016" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: /Browse card versions|Compare exact listings/ }));

    expect(await screen.findByAltText("Listing photo: Nami OP01-016 SP Special Art")).toBeTruthy();
    expect(screen.queryByAltText("Confirmed card reference: Nami OP01-016 Special Art (P4)")).toBeNull();
    expect(screen.getAllByText("Awakening Of The New Era · OP01-016 · SP CARD · Special Art (P4)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("The listing evidence uniquely identifies the selected print.").length).toBeGreaterThan(0);
    const hero = screen.getByRole("article", { name: "Best-supported buy" });
    expect(hero.querySelector(":scope > div")?.className.split(" ")).toContain("grid-cols-[72px_minmax(0,1fr)]");
    expect(hero.querySelector(":scope > div")?.className).toContain("sm:grid-cols-[72px_minmax(0,1fr)]");

    fireEvent.click(screen.getByText("Compare 1 other eligible listing"));
    expect(screen.getByAltText("Listing photo: Nami OP01-016 P4 SP alternate seller")).toBeTruthy();
    expect(screen.queryByAltText("Confirmed card reference: Nami OP01-016 Special Art (P4)")).toBeNull();
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
        artworkClass: null,
        treatments: [],
        originalSetCode: "OP-01",
        releaseName: "One Piece Card Game 2nd Anniversary Complete Guide",
        releaseCode: null,
        releaseChannel: "anniversary" as const,
        releaseProvenance: "promotion" as const,
        competitionTier: null,
        collectorAliases: [],
        exactMarkers: [],
        metadataRevision: null,
        tcgplayerProductId: null,
        tcgplayerGroupId: null,
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
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as ComparisonRequest;
      if (String(input).endsWith("/api/agent/card-identity")) {
        return new Response(JSON.stringify(identityResponse([confirmedCard])), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      requests.push(request);
      return new Response(JSON.stringify({
        ...reportFor(request),
        status: "partial",
        confirmedCard,
        candidates: [listing],
        outcome: "inspect_first",
        inspectListingId: listing.id,
        identityContractVersion: 4,
      } satisfies ComparisonReport), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Nami OP01-016 P2" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: /Browse card versions|Compare exact listings/ }));

    expect(await screen.findByRole("heading", { name: "Best inspect lead" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Inspect listing" })).toBeTruthy();
    expect(screen.getByAltText("Listing photo: Nami OP01-016 Alternate Art Parallel")).toBeTruthy();
    expect(screen.queryByAltText("Confirmed card reference: Nami OP01-016 Alternate Art (P2)")).toBeNull();
    expect(screen.getByText("Review the seller's photos and verify the live page before deciding.", { exact: false })).toBeTruthy();
    expect(screen.queryByText("Our pick")).toBeNull();
  });

  it("offers real next actions and keeps an English abstention reason out of 中文", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as ComparisonRequest;
      if (String(input).endsWith("/api/agent/card-identity")) {
        return new Response(JSON.stringify(identityResponse([identityForQuery(String(request.query))])), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      requests.push(request);
      return new Response(JSON.stringify({
        ...reportFor(request),
        status: "partial",
        outcome: "next_moves",
        inspectListingId: null,
        identityContractVersion: 4,
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
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: /Browse card versions|Compare exact listings/ }));

    expect(await screen.findByRole("button", { name: "Refine search" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry sources" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Paste a listing" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(await screen.findByRole("heading", { name: "暂时没有可信的购买建议" })).toBeTruthy();
    expect(screen.queryByText("Found listings, but none matched the selected SP print.")).toBeNull();
  });
});
