// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRail,
  ComparisonApp,
  DEFAULT_MARQUEE_CARDS,
  mergeRecentCarouselCard,
  PrintIdentitySummary,
  type RecentCarouselCard,
} from "@/features/comparison/ComparisonApp";
import { setLanguage, useLang } from "@/features/comparison/i18n";
import type { CardIdentityCandidate, ComparisonReport, ComparisonRequest, NormalizedListing } from "@/lib/schemas";
import { normalizeListing, rankListings } from "@/lib/comparison/ranking";
import { parseCardQuery } from "@/lib/comparison/query-parser";
import { findOnePieceCatalogVariant } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";
import { demoListingSeeds } from "@/lib/comparison/fixtures";
import { buildStandardComparisonRequest, STANDARD_COMPARISON_FLOW_CARDS } from "@/lib/testing/standard-comparison-flow";
import { markResultShown, trackEvent } from "@/lib/analytics";

vi.mock("@/lib/analytics", () => ({
  initializeAnalytics: vi.fn(),
  trackEvent: vi.fn(),
  markResultShown: vi.fn(),
  // Bucketing itself is unit-tested in analytics.test.ts; here we only prove the
  // result timestamp is marked and the bucket reaches the click event.
  timeToOpenBucket: vi.fn(() => "under_10s"),
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

function carouselCard(id: string, source: "recent" | "curated"): RecentCarouselCard {
  return {
    id: `${source}-${id}`,
    game: "pokemon",
    name: `${source} ${id}`,
    setName: "Test set",
    setCode: "TEST",
    cardNumber: id,
    imageUrl: `https://images.pokemontcg.io/base1/${id}.png`,
    lastSeenAt: source === "recent" ? 1 : 0,
  };
}

describe("landing rail helpers", () => {
  const curated = Array.from({ length: 8 }, (_, index) => carouselCard(String(index + 1), "curated"));

  it("shows curated chase cards when the buyer has no history", () => {
    const rail = buildRail([], curated);
    expect(rail).toHaveLength(8);
    expect(rail.every((item) => item.source === "chase")).toBe(true);
  });

  it("leads with the cards the buyer actually checked, newest first", () => {
    const recent = [carouselCard("a", "recent"), carouselCard("b", "recent")];
    const rail = buildRail(recent, curated);

    expect(rail.slice(0, 2).map((item) => item.card.id)).toEqual(["recent-a", "recent-b"]);
    expect(rail.slice(0, 2).every((item) => item.source === "recent")).toBe(true);
  });

  it("fills the rest of the rail with curated cards", () => {
    const rail = buildRail([carouselCard("a", "recent")], curated);
    expect(rail).toHaveLength(9);
    expect(rail.filter((item) => item.source === "chase")).toHaveLength(8);
  });

  it("never repeats one recent card to pad the rail", () => {
    // The share-based blend cycled a single recent card into four slots, which
    // read as a stutter rather than as history.
    const rail = buildRail([carouselCard("a", "recent")], curated);
    expect(rail.filter((item) => item.card.id === "recent-a")).toHaveLength(1);
  });

  it("keeps a checked card out of the curated filler it duplicates", () => {
    const alsoCurated = { ...curated[0]!, id: "recent-dupe", lastSeenAt: 5 };
    const rail = buildRail([alsoCurated], curated);

    expect(rail).toHaveLength(8);
    expect(rail[0]?.card.id).toBe("recent-dupe");
    expect(rail[0]?.source).toBe("recent");
  });

  it("dedupes a checked card against its curated twin across set-code vocabularies", () => {
    // The catalog calls Twilight Masquerade "SV6"; the curated entry uses the
    // TCGplayer code "TWM". Keying on the set code showed the card twice.
    const curatedGreninja = {
      ...carouselCard("214/167", "curated"),
      name: "Greninja ex",
      setName: "Twilight Masquerade",
      setCode: "TWM",
      cardNumber: "214/167",
    };
    const checkedGreninja = {
      ...curatedGreninja,
      id: "sv6-214",
      setCode: "SV6",
      lastSeenAt: 9,
    };

    const rail = buildRail([checkedGreninja], [curatedGreninja, ...curated]);

    expect(rail.filter((item) => item.card.name === "Greninja ex")).toHaveLength(1);
    expect(rail[0]?.source).toBe("recent");
    expect(rail[0]?.card.setCode).toBe("SV6");
  });

  it("keeps the complete unique history so the loop can repeat without a short cap", () => {
    const recent = Array.from({ length: 40 }, (_, index) => carouselCard(String(index), "recent"));
    expect(buildRail(recent, curated)).toHaveLength(48);
  });

  it("accepts official One Piece card art in the rolling rail", () => {
    const onePieceCard: RecentCarouselCard = {
      id: "OP05-119_p2",
      game: "onePiece",
      name: "Monkey.D.Luffy",
      setName: "Awakening Of The New Era",
      setCode: "OP-05",
      cardNumber: "OP05-119",
      imageUrl: "https://en.onepiece-cardgame.com/images/cardlist/card/OP05-119_p2.png",
      lastSeenAt: 0,
    };

    expect(buildRail([onePieceCard], [])).toMatchObject([{
      card: { id: "OP05-119_p2", imageUrl: onePieceCard.imageUrl },
      source: "recent",
    }]);
  });

  it("dedupes the same searched print even when its result id changes", () => {
    const first = carouselCard("pikachu", "recent");
    const refreshed = { ...first, id: "catalog-pikachu", lastSeenAt: 2 };
    expect(mergeRecentCarouselCard([first], refreshed)).toHaveLength(1);
    expect(mergeRecentCarouselCard([first], refreshed)[0]?.id).toBe("catalog-pikachu");
  });

  it("seeds the landing rail with the requested iconic Pokémon and One Piece cards", () => {
    expect(DEFAULT_MARQUEE_CARDS).toHaveLength(8);
    expect(DEFAULT_MARQUEE_CARDS.map((card) => card.name)).toEqual([
      "Umbreon VMAX",
      "Charizard",
      "Pikachu",
      "Giratina V",
      "Mewtwo & Mew-GX",
      "Monkey.D.Luffy",
      "Roronoa Zoro",
      "Nami",
    ]);
    expect(DEFAULT_MARQUEE_CARDS.filter((card) => card.game === "pokemon")).toHaveLength(5);
    expect(DEFAULT_MARQUEE_CARDS.filter((card) => card.game === "onePiece")).toHaveLength(3);
    expect(DEFAULT_MARQUEE_CARDS.filter((card) => card.game === "onePiece").map((card) => card.variant)).toEqual([
      "Manga Art",
      "Manga Art",
      "Manga Art",
    ]);
    expect(DEFAULT_MARQUEE_CARDS.at(-1)).toMatchObject({ id: "OP01-016_p8", name: "Nami" });
  });

  it("drops cards with no usable image rather than rendering a hole", () => {
    const broken = { ...carouselCard("broken", "recent"), imageUrl: null };
    const rail = buildRail([broken], curated);
    expect(rail.some((item) => item.card.id === "recent-broken")).toBe(false);
  });
});

describe("comparison condition controls", () => {
  let requests: ComparisonRequest[];

  beforeEach(() => {
    requests = [];
    vi.mocked(trackEvent).mockClear();
    vi.mocked(markResultShown).mockClear();
    window.history.replaceState(null, "", "/");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    setLanguage("en");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/comparison-snapshots")) {
        return new Response(JSON.stringify({
          receiptId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          savedAt: "2026-07-31T10:00:00.000Z",
          expiresAt: "2026-08-30T10:00:00.000Z",
          durable: false,
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
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

  it("keeps the default screen focused on one promise and the core search controls", async () => {
    // This asserts static copy, not typewriter timing. Under full-suite load the
    // animation can start before the locale assertion; reduced motion makes the
    // same accessible static placeholder deterministic without changing product behavior.
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    render(<ComparisonApp />);

    expect(screen.getByRole("heading", { name: "Find the best listing for your exact card." })).toBeTruthy();
    expect(screen.queryByText("Live raw singles—or a clear pass.")).toBeNull();
    expect(screen.getByText("Pokémon & One Piece · raw singles · U.S. listings")).toBeTruthy();

    const query = screen.getByRole("textbox", { name: "Search for a card" }) as HTMLInputElement;
    expect(query.placeholder).toBe("Charizard 4/102 · Luffy OP01-003 · SWSH144");
    expect(screen.getByRole("button", { name: "Browse card versions" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Paste listing" })).toBeNull();
    expect(screen.queryByText(/paste marketplace links back/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Filters.+Near Mint/i })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Pokémon TCG" }).getAttribute("src")).toContain("logo-pokemon-tcg.png");
    expect(screen.getByRole("img", { name: "One Piece Card Game" }).getAttribute("src")).toContain("logo-one-piece-card-game.png");

    fireEvent.click(screen.getByRole("button", { name: /One Piece.*Beta/i }));
    expect(screen.getByText("One Piece coverage is in beta and may be less stable.")).toBeTruthy();
    expect(trackEvent).toHaveBeenCalledWith("game_selected", { game: "onePiece" });

    expect(screen.queryByText("Find the card")).toBeNull();
    expect(screen.queryByText("Which card are you checking?")).toBeNull();
    expect(screen.queryByText(/Name plus number is fastest/i)).toBeNull();
    expect(screen.queryByText(/Treating this as a plain name search/i)).toBeNull();
    expect(screen.queryByText("We understood:")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(await screen.findByRole("heading", { name: "认准你要的那张卡，挑出最值得买的一件。" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "搜索卡片" }) as HTMLInputElement).placeholder).toBe("Charizard 4/102 · Luffy OP01-003 · SWSH144");
    expect(screen.queryByRole("button", { name: "粘贴链接" })).toBeNull();
    expect(screen.getByText("One Piece 仍在 Beta 阶段，覆盖稳定性可能稍弱。")).toBeTruthy();
    expect(screen.getByRole("button", { name: /筛选.+近全新/i })).toBeTruthy();
  });

  it("renders each curated card once without stored history, never repeating one to fill slots", async () => {
    render(<ComparisonApp />);

    const rail = screen.getByRole("region", { name: "Cards you can check" });
    await waitFor(() => expect(within(rail).getAllByRole("button", { name: /^Check / })).toHaveLength(8));
    const accessibleCards = within(rail).getAllByRole("button", { name: /^Check / });
    expect(accessibleCards.every((button) => button.getAttribute("data-rail-source") === "chase")).toBe(true);

    const labels = accessibleCards.map((button) => button.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps the cloned loop out of the a11y tree while leaving it clickable", async () => {
    render(<ComparisonApp />);

    const rail = screen.getByRole("region", { name: "Cards you can check" });
    await waitFor(() => expect(within(rail).getAllByRole("button", { name: /^Check / })).toHaveLength(8));
    const accessibleCards = within(rail).getAllByRole("button", { name: /^Check / });

    const images = Array.from(rail.querySelectorAll("img"));
    expect(images).toHaveLength(DEFAULT_MARQUEE_CARDS.length * 2);
    expect(images.every((image) => image.getAttribute("loading") === "eager")).toBe(true);

    const clones = rail.querySelectorAll('button[data-clone="true"]');
    expect(clones).toHaveLength(accessibleCards.length);
    expect(Array.from(clones).every((button) => button.getAttribute("tabindex") === "-1")).toBe(true);
    expect(Array.from(clones).every((button) => button.getAttribute("aria-hidden") === "true")).toBe(true);
    // The clone half is on screen for half of every loop. It stayed inert to
    // the pointer, so hovering it paused the rail and showed no check button.
    expect(Array.from(clones).every((button) => !button.hasAttribute("disabled"))).toBe(true);
    expect(accessibleCards.every((button) => !button.hasAttribute("data-clone") && !button.hasAttribute("aria-hidden"))).toBe(true);
  });

  it("shows a card the buyer checked once, as history, not twice alongside its curated twin", async () => {
    window.localStorage.setItem("tcgpal:recent-confirmed-cards", JSON.stringify([{
      id: "curated-swsh7-215",
      game: "pokemon",
      name: "Umbreon VMAX",
      setName: "Evolving Skies",
      setCode: "SWSH7",
      cardNumber: "215/203",
      imageUrl: "https://images.pokemontcg.io/swsh7/215_hires.png",
      lastSeenAt: 1,
    }]));

    render(<ComparisonApp />);

    await waitFor(() => {
      const cards = screen.getAllByRole("button", { name: "Check Umbreon VMAX, Evolving Skies 215/203" });
      expect(cards).toHaveLength(1);
      expect(cards[0]?.getAttribute("data-rail-source")).toBe("recent");
    });
  });

  it("leads the rail with the most recently checked card", async () => {
    window.localStorage.setItem("tcgpal:recent-confirmed-cards", JSON.stringify([{
      id: "sv6-214",
      game: "pokemon",
      name: "Greninja ex",
      setName: "Twilight Masquerade",
      setCode: "TWM",
      cardNumber: "214/167",
      imageUrl: "https://images.pokemontcg.io/sv6/214_hires.png",
      lastSeenAt: 9,
    }]));

    render(<ComparisonApp />);

    await waitFor(() => {
      const cards = screen.getAllByRole("button", { name: /^Check / });
      expect(cards[0]?.getAttribute("data-rail-source")).toBe("recent");
      expect(cards[0]?.getAttribute("aria-label")).toContain("Greninja ex");
    });
  });

  it("drops a stored recent card with no renderable image instead of rendering a hole", async () => {
    window.localStorage.setItem("tcgpal:recent-confirmed-cards", JSON.stringify([{
      id: "recent-without-image",
      game: "pokemon",
      name: "Recent without image",
      setName: "Test set",
      setCode: "TEST",
      cardNumber: "1/1",
      imageUrl: null,
      lastSeenAt: 1,
    }]));

    render(<ComparisonApp />);
    await act(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    });

    const cards = screen.getAllByRole("button", { name: /^Check / });
    expect(cards).toHaveLength(8);
    expect(cards.some((card) => card.getAttribute("aria-label")?.includes("Recent without image"))).toBe(false);
  });

  it("starts the normal comparison flow from a rail card with its explicit catalog key", async () => {
    render(<ComparisonApp />);

    const card = screen.getAllByRole("button", { name: "Check Umbreon VMAX, Evolving Skies 215/203" })[0]!;
    fireEvent.click(card);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.query).toBe("Umbreon VMAX 215/203");
    expect(requests[0]?.cardHint).toMatchObject({
      game: "pokemon",
      name: "Umbreon VMAX",
      setCode: "SWSH7",
      cardNumber: "215/203",
    });
    expect(vi.mocked(trackEvent)).toHaveBeenCalledWith("rail_card_clicked", {
      game: "pokemon",
      source: "chase",
    });
  });

  it("runs the search when the buyer presses Enter in the card box", async () => {
    // Typing a query and hitting Enter is how most visitors use a search box. It
    // was reported doing nothing at all on the live site — twice — while the
    // button worked, so this asserts the keystroke itself, not the button.
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Umbreon ex 161/131" } });
    fireEvent.keyDown(query, { key: "Enter" });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.query).toBe("Umbreon ex 161/131");
  });

  it("runs the search on Enter from the results edit panel too", async () => {
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Charizard 4/102" } });
    fireEvent.keyDown(query, { key: "Enter" });
    await waitFor(() => expect(requests).toHaveLength(1));

    const editToggle = await waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>('button[aria-controls="results-edit-panel"]');
      if (!button) throw new Error("results header not shown yet");
      return button;
    });
    fireEvent.click(editToggle);

    const editQuery = await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('#results-edit-panel input[name="heroQuery"]');
      if (!input) throw new Error("edit panel not open yet");
      return input;
    });
    fireEvent.change(editQuery, { target: { value: "Nami OP01-016" } });
    fireEvent.keyDown(editQuery, { key: "Enter" });

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]?.query).toBe("Nami OP01-016");
  });

  it("lets an IME finish composing instead of searching for a half-typed query", async () => {
    // Enter confirms the candidate characters in every CJK input method; the
    // 中文 flow is a supported path, so that keystroke is not ours to take.
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "皮卡丘" } });
    fireEvent.keyDown(query, { key: "Enter", isComposing: true });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toHaveLength(0);
  });

  it("includes the landing ZIP in the first comparison request", async () => {
    render(<ComparisonApp />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search for a card" }), {
      target: { value: "Charizard 4/102" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Delivery ZIP" }), {
      target: { value: "10001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Compare exact listings" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.buyer.postalCode).toBe("10001");
    expect(requests[0]?.buyer.taxRate).toBe(0.0852);
  });

  it("does not silently restore a stale manual tax override for the same ZIP", async () => {
    localStorage.setItem("tcgpal:buyer", JSON.stringify({
      postalCode: "10001",
      taxRatePercent: "10",
    }));
    render(<ComparisonApp />);

    await waitFor(() => expect((screen.getByRole("textbox", { name: "Delivery ZIP" }) as HTMLInputElement).value).toBe("10001"));
    fireEvent.change(screen.getByRole("textbox", { name: "Search for a card" }), {
      target: { value: "Mew ex 232/091" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Compare exact listings" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.buyer.taxRate).toBe(0.0852);
    expect(JSON.parse(localStorage.getItem("tcgpal:buyer") ?? "{}")).toEqual({ postalCode: "10001" });
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
        marketMid: 412.5,
      }],
      confirmedCard: null,
      warnings: [],
      generatedAt: "2026-07-12T00:00:00.000Z",
    }), { headers: { "Content-Type": "application/json" } }));

    expect(await screen.findByRole("heading", { name: "Choose your Pikachu" })).toBeTruthy();
    expect(screen.getByText("$412.50 market reference")).toBeTruthy();
    expect(screen.queryByText("Medium confidence")).toBeNull();

    fireEvent.error(screen.getByAltText("Pikachu · 18/91 · Paldean Fates"));
    expect(screen.getByText("Image unavailable")).toBeTruthy();
    expect(screen.getAllByText("#18/91").length).toBeGreaterThan(0);
  });

  it("turns a catalog miss into a recovery state with an edit-search action", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/agent/card-identity")) {
        return new Response(JSON.stringify({
          identityContractVersion: 1,
          status: "not_found",
          candidates: [],
          confirmedCard: null,
          warnings: [],
          generatedAt: "2026-07-31T10:00:00.000Z",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error("listing comparison must not run after a catalog miss");
    }));
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Not A Real Card 999/999" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: "Compare exact listings" }));

    expect(await screen.findByRole("heading", { name: "No card match yet" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit search" }));
    expect(screen.getByRole("textbox", { name: "Search for a card" })).toBeTruthy();
  });

  it("retries a temporarily unavailable catalog lookup without making the buyer retype", async () => {
    const exactCard = identityForQuery("Mew ex 232/091");
    let attempts = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).endsWith("/api/agent/card-identity")) throw new Error("unexpected comparison");
      attempts += 1;
      if (attempts === 1) {
        return new Response(JSON.stringify({
          identityContractVersion: 1,
          status: "unavailable",
          candidates: [],
          confirmedCard: null,
          warnings: ["Pokémon catalog lookup unavailable: The operation timed out."],
          generatedAt: "2026-07-31T10:00:00.000Z",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify(identityResponse([exactCard], "needs_confirmation")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<ComparisonApp />);

    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Mew ex 232/091" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: "Compare exact listings" }));

    expect(await screen.findByRole("heading", { name: "Card catalog needs another try" })).toBeTruthy();
    const retry = await screen.findByRole("button", { name: "Retry card catalog" });
    fireEvent.click(retry);

    expect(await screen.findByRole("heading", { name: "Choose your Mew ex" })).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
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

  // Every set group is open on arrival: collapsing charged a click per set to
  // reveal, most often, a single card, and a closed row shows only a set name,
  // which is not how a buyer recognises a print. Cost is controlled by painting
  // off-screen groups lazily, not by leaving them unmounted — so every card is in
  // the DOM and findable by browser search from the moment the picker renders.
  it("opens every identity group and mounts all of its cards for scrolling", async () => {
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

    for (let print = 1; print <= 8; print += 1) {
      expect(screen.getByText(`Pikachu print ${print}`), `print ${print}`).toBeTruthy();
    }
    expect(screen.getByText("Showing 8 catalog matches")).toBeTruthy();

    // Open, but still collapsible for anyone who wants to fold a long set away.
    const groups = document.querySelectorAll("details:has(> summary[id^='identity-set-'])");
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) expect((group as HTMLDetailsElement).open).toBe(true);

    // The grid defers paint to the browser as the buyer scrolls, which is what
    // makes opening everything affordable.
    const grid = groups[0]?.querySelector("div[style*='content-visibility']");
    expect(grid, "each group's grid opts into lazy paint").toBeTruthy();
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
    fireEvent.error(screen.getByAltText("Umbreon VMAX 215/203"));
    expect(screen.getByText("Image unavailable")).toBeTruthy();
    expect(screen.getByText("215/203")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Choose your/i })).toBeNull();
    await waitFor(() => expect(requests[0]?.confirmedCardId).toBe("swsh7-215"));

    resolveComparison(new Response(JSON.stringify({
      ...reportFor(requests[0]),
      confirmedCard: exactCard,
    }), { headers: { "Content-Type": "application/json" } }));
  });

  it("resolves a result journey URL to the newest matching receipt without rerunning the pipeline", async () => {
    const request = buildStandardComparisonRequest(STANDARD_COMPARISON_FLOW_CARDS[0]);
    const savedReport = {
      ...reportFor(request),
      confirmedCard: identityForQuery("Umbreon VMAX 215/203"),
      outcome: "next_moves" as const,
    };
    const receiptId = "0123456789abcdef0123456789abcdef";
    window.history.replaceState(null, "", "/?query=Umbreon+VMAX+215%2F203&game=pokemon&step=result&condition=Near+Mint&card=swsh7-215");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/comparison-snapshots?")) {
        return new Response(JSON.stringify({
          snapshot: {
            id: receiptId,
            report: savedReport,
            savedAt: "2026-07-31T10:00:00.000Z",
            expiresAt: "2026-08-30T10:00:00.000Z",
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`comparison pipeline must not rerun: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ComparisonApp />);

    expect(await screen.findByText(/Saved comparison/i)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("card=swsh7-215");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("condition=Near%20Mint");
  });

  it("restores a saved result without rerunning the comparison pipeline", async () => {
    const request = buildStandardComparisonRequest(STANDARD_COMPARISON_FLOW_CARDS[0]);
    const savedReport = {
      ...reportFor(request),
      confirmedCard: identityForQuery("Umbreon VMAX 215/203"),
      outcome: "next_moves" as const,
    };
    const receiptId = "0123456789abcdef0123456789abcdef";
    window.history.replaceState(null, "", `/?receipt=${receiptId}`);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/comparison-snapshots?")) {
        return new Response(JSON.stringify({
          snapshot: {
            id: receiptId,
            report: savedReport,
            savedAt: "2026-07-31T10:00:00.000Z",
            expiresAt: "2026-08-30T10:00:00.000Z",
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`comparison pipeline must not rerun: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ComparisonApp />);

    expect(await screen.findByText(/Saved comparison/i)).toBeTruthy();
    expect(screen.getByText(/Prices and availability may have changed/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh live listings" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(screen.getByText(/^已保存的比价/).textContent).toBe("已保存的比价。");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows diagnostics only for a development build with inspect=1", async () => {
    const request = buildStandardComparisonRequest(STANDARD_COMPARISON_FLOW_CARDS[0]);
    const savedReport: ComparisonReport = {
      ...reportFor(request),
      confirmedCard: identityForQuery("Umbreon VMAX 215/203"),
      outcome: "next_moves",
      warnings: ["raw provider warning"],
      trace: [{ step: "validate", actor: "ranking.ts", summary: "full validation trace", status: "complete" }],
      platforms: [{
        id: "ebay",
        marketplace: "eBay",
        label: "eBay Browse",
        sourceMode: "official_api",
        status: "complete",
        configured: true,
        count: 50,
        detail: "provider detail",
      }],
      references: [{
        label: "TCGplayer aggregate",
        status: "used",
        observedAt: "2026-07-31T09:50:00.000Z",
        url: "https://www.tcgplayer.com/product/777",
        note: "reference diagnostic",
        rawLow: 100,
        rawMid: 120,
        rawHigh: 140,
      }],
    };
    const receiptId = "0123456789abcdef0123456789abcdef";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      snapshot: {
        id: receiptId,
        report: savedReport,
        savedAt: "2026-07-31T10:00:00.000Z",
        expiresAt: "2026-08-30T10:00:00.000Z",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    window.history.replaceState(null, "", `/?receipt=${receiptId}&inspect=1`);
    render(<ComparisonApp runtimeEnvironment="development" />);

    const inspector = await screen.findByRole("region", { name: "Development inspector" });
    expect(within(inspector).getByText("raw provider warning")).toBeTruthy();
    expect(within(inspector).getByText("full validation trace")).toBeTruthy();
    expect(within(inspector).getByText("official_api")).toBeTruthy();
    expect(within(inspector).getByText("50")).toBeTruthy();
    expect(within(inspector).getByText("reference diagnostic")).toBeTruthy();
    expect(within(inspector).getByRole("button", { name: "Download diagnostic JSON" })).toBeTruthy();

    cleanup();
    window.history.replaceState(null, "", `/?receipt=${receiptId}&inspect=1`);
    render(<ComparisonApp runtimeEnvironment="production" />);
    await screen.findByText(/Saved comparison/i);
    expect(screen.queryByRole("region", { name: "Development inspector" })).toBeNull();
    expect(screen.queryByText("raw provider warning")).toBeNull();
  });

  it("creates a durable receipt link for a pure card result and shares that URL", async () => {
    const exactCard = {
      ...identityForQuery("Umbreon VMAX 215/203"),
      marketMid: 2000,
      marketSource: "tcgcsv" as const,
      marketAsOf: "2026-07-30T00:00:00.000Z",
      tcgplayerProductId: 777,
      marketUrl: "https://www.tcgplayer.com/product/777",
    };
    const listing = normalizeListing({
      listing: {
        ...demoListingSeeds[0],
        id: "shareable",
        demo: false,
        claimedCondition: "Near Mint",
        observedAt: "2026-07-31T09:45:00.000Z",
      },
      buyer: { country: "US", postalCode: "", taxRate: null, desiredCondition: "Near Mint" },
      marketPrice: 2000,
    });
    expect(listing).toMatchObject({ marketComparable: true, costComplete: true, price: 1225 });
    const receiptId = "fedcba9876543210fedcba9876543210";
    const clipboard = { writeText: vi.fn<(text: string) => Promise<void>>(async () => undefined) };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/agent/card-identity")) {
        return new Response(JSON.stringify(identityResponse([exactCard])), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (String(input).endsWith("/api/agent/listing-compare")) {
        const request = JSON.parse(String(init?.body)) as ComparisonRequest;
        return new Response(JSON.stringify({
          ...reportFor(request),
          confirmedCard: exactCard,
          candidates: [listing],
          rankedChoices: rankListings([listing], { marketPrice: 2000 }),
          narrative: { summary: "One supported buy.", cautions: ["Reference prices can lag behind the live market."] },
          warnings: ["raw provider warning"],
          trace: [{ step: "rank", actor: "ranking.ts", summary: "internal trace", status: "complete" }],
          platforms: [{ id: "ebay", marketplace: "eBay", label: "eBay Browse", sourceMode: "official_api", status: "complete", configured: true, count: 50, detail: "queried" }],
          outcome: "best_buy",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (String(input).endsWith("/api/comparison-snapshots")) {
        return new Response(JSON.stringify({
          receiptId,
          savedAt: "2026-07-31T10:00:00.000Z",
          expiresAt: "2026-08-30T10:00:00.000Z",
          durable: true,
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`unexpected request ${String(input)}`);
    }));

    render(<ComparisonApp />);
    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Umbreon VMAX 215/203" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: "Compare exact listings" }));

    await waitFor(() => expect(window.location.search).toContain(`receipt=${receiptId}`));
    const hero = screen.getByRole("article", { name: "Best-supported buy" });
    expect(within(hero).getByText("Live eBay listing")).toBeTruthy();
    expect(within(hero).getByText(/Observed/)).toBeTruthy();
    expect(within(hero).getByText("Seller-claimed condition: Near Mint")).toBeTruthy();
    expect(within(hero).getByText(/Item price/)).toBeTruthy();
    expect(within(hero).getByText(/Shipping/)).toBeTruthy();
    expect(within(hero).getByText(/Tax not estimated/)).toBeTruthy();
    expect(within(hero).getByText(/item 39% under reference/)).toBeTruthy();
    expect(within(hero).getByText("High confidence")).toBeTruthy();
    expect(screen.getByText("Reference prices can lag behind the live market.")).toBeTruthy();
    expect(screen.queryByText("How we checked: sources, reference pricing, and the validation trace")).toBeNull();
    expect(screen.queryByText("Check the math behind these labels")).toBeNull();
    expect(screen.queryByText("Sources checked")).toBeNull();
    expect(screen.queryByText("Queried")).toBeNull();
    expect(screen.queryByText("50 listings")).toBeNull();
    expect(screen.queryByText("internal trace")).toBeNull();

    fireEvent.click(within(hero).getByRole("button", { name: "Share result" }));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith(`http://localhost/r/${receiptId}`));
    expect(String(clipboard.writeText.mock.calls[0]?.[0])).not.toContain("postalCode");
    expect(trackEvent).toHaveBeenCalledWith("result_shared", { share_method: "url", result_state: "best_buy" });
    await waitFor(() => expect(screen.getByText("Link copied. This receipt expires in 30 days.")).toBeTruthy());
  });

  it("records one landing event per visit so every funnel rate has a denominator", async () => {
    render(<ComparisonApp />);
    await screen.findByRole("textbox", { name: "Search for a card" });
    const landings = vi.mocked(trackEvent).mock.calls.filter(([event]) => event === "app_opened");
    expect(landings).toHaveLength(1);
    // Nothing about the visit beyond the channel trackEvent attaches for itself.
    expect(landings[0]?.[1]).toBeUndefined();
  });

  it("reports the verdict and the decision latency, not just that a comparison finished", async () => {
    const exactCard = {
      ...identityForQuery("Umbreon VMAX 215/203"),
      marketMid: 2000,
      marketSource: "tcgcsv" as const,
      marketAsOf: "2026-07-30T00:00:00.000Z",
      tcgplayerProductId: 777,
      marketUrl: "https://www.tcgplayer.com/product/777",
    };
    const listing = normalizeListing({
      listing: {
        ...demoListingSeeds[0],
        id: "shareable",
        demo: false,
        claimedCondition: "Near Mint",
        observedAt: "2026-07-31T09:45:00.000Z",
      },
      buyer: { country: "US", postalCode: "", taxRate: null, desiredCondition: "Near Mint" },
      marketPrice: 2000,
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/agent/card-identity")) {
        return new Response(JSON.stringify(identityResponse([exactCard])), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (String(input).endsWith("/api/agent/listing-compare")) {
        const request = JSON.parse(String(init?.body)) as ComparisonRequest;
        return new Response(JSON.stringify({
          ...reportFor(request),
          confirmedCard: exactCard,
          candidates: [listing],
          rankedChoices: rankListings([listing], { marketPrice: 2000 }),
          outcome: "best_buy",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ receiptId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", savedAt: "2026-07-31T10:00:00.000Z", expiresAt: "2026-08-30T10:00:00.000Z", durable: false }), { status: 201, headers: { "Content-Type": "application/json" } });
    }));

    render(<ComparisonApp />);
    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Umbreon VMAX 215/203" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: "Compare exact listings" }));

    const hero = await screen.findByRole("article", { name: "Best-supported buy" });
    // Without the verdict on completion, an abstention and a recommendation are
    // indistinguishable in the funnel, so the abstention rate is unmeasurable.
    expect(trackEvent).toHaveBeenCalledWith("comparison_completed", expect.objectContaining({ result_state: "best_buy" }));
    expect(markResultShown).toHaveBeenCalled();

    fireEvent.click(within(hero).getByRole("link", { name: /Review listing/ }));
    expect(trackEvent).toHaveBeenCalledWith("choice_opened", expect.objectContaining({
      choice_role: "best_value",
      time_to_open_bucket: "under_10s",
    }));
  });

  it("copies a text summary when durable receipt storage is unavailable", async () => {
    const exactCard = identityForQuery("Umbreon VMAX 215/203");
    const listing = normalizeListing({
      listing: { ...demoListingSeeds[0], id: "text-share", demo: false, claimedCondition: "Near Mint" },
      buyer: { country: "US", postalCode: "", taxRate: null, desiredCondition: "Near Mint" },
      marketPrice: 2000,
    });
    const clipboard = { writeText: vi.fn<(text: string) => Promise<void>>(async () => undefined) };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/agent/card-identity")) {
        return new Response(JSON.stringify(identityResponse([exactCard])), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (String(input).endsWith("/api/agent/listing-compare")) {
        const request = JSON.parse(String(init?.body)) as ComparisonRequest;
        return new Response(JSON.stringify({
          ...reportFor(request),
          confirmedCard: exactCard,
          candidates: [listing],
          rankedChoices: rankListings([listing], { marketPrice: 2000 }),
          outcome: "best_buy",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (String(input).endsWith("/api/comparison-snapshots")) {
        return new Response(JSON.stringify({
          receiptId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          savedAt: "2026-07-31T10:00:00.000Z",
          expiresAt: "2026-08-30T10:00:00.000Z",
          durable: false,
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`unexpected request ${String(input)}`);
    }));

    render(<ComparisonApp />);
    const query = screen.getByRole("textbox", { name: "Search for a card" });
    fireEvent.change(query, { target: { value: "Umbreon VMAX 215/203" } });
    fireEvent.click(within(query.closest("form")!).getByRole("button", { name: "Compare exact listings" }));

    const hero = await screen.findByRole("article", { name: "Best-supported buy" });
    fireEvent.click(within(hero).getByRole("button", { name: "Share result" }));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalled());
    expect(String(clipboard.writeText.mock.calls[0]?.[0])).toContain("TCGlens result");
    expect(String(clipboard.writeText.mock.calls[0]?.[0])).not.toContain("/r/");
    expect(trackEvent).toHaveBeenCalledWith("result_shared", { share_method: "text", result_state: "best_buy" });
    expect(screen.getByText("Result summary copied.")).toBeTruthy();
  });

  it("shows the active minimum before search and submits a refined condition", async () => {
    render(<ComparisonApp />);

    const refineButton = screen.getByRole("button", {
      name: /Filters.+Minimum seller-stated condition.+Near Mint/i,
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
    await waitFor(() => {
      expect(within(editForm as HTMLFormElement).getByRole("button", {
        name: "浏览全部版本",
      })).toBeTruthy();
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
      name: /Select Nami OP01-016 SP artwork · Awakening Of The New Era/,
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
      if (String(input).endsWith("/api/comparison-snapshots")) {
        return new Response(JSON.stringify({
          receiptId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          savedAt: "2026-07-31T10:00:00.000Z",
          expiresAt: "2026-08-30T10:00:00.000Z",
          durable: false,
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
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

    expect(await screen.findByRole("button", { name: /Select Monkey.D.Luffy OP05-119 Manga artwork/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Select Monkey.D.Luffy OP05-119 Silver · SP artwork/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "中文" }));
    expect(screen.getAllByText(/漫画版 ·/)[0]).toBeTruthy();
    expect(screen.getAllByText(/银色 · SP 特别画面 ·/)[0]).toBeTruthy();
    expect(screen.getAllByText(/金色 · SP 特别画面 ·/)[0]).toBeTruthy();
    expect(screen.getByAltText("Monkey.D.Luffy · OP05-119 · 金色 · SP 特别画面 · 再版 · A Fist Of Divine Speed")).toBeTruthy();
    const gold = screen.getByRole("button", { name: /Monkey.D.Luffy OP05-119 金色 · SP 特别画面/ });
    gold.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].confirmedCardId).toBe("OP05-119_p8");
    expect(screen.getByRole("button", { name: /金色 · SP 特别画面/ })).toBeTruthy();
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
        <PrintIdentitySummary listing={listing} confirmedCard={confirmedCard} compact />
      </>;
    }

    render(<Harness confirmedCard={card} />);
    expect(screen.getByText("The listing names the selected print treatment.")).toBeTruthy();
    expect(screen.getByText("The listing names a different foil or color treatment.")).toBeTruthy();
    expect(screen.getByText("The listing does not state the selected print treatment.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "中文测试" }));
    expect(screen.getByText("商品写出了已选版本的特殊工艺。")).toBeTruthy();
    expect(screen.getByText("商品写的是另一种闪膜或配色工艺。")).toBeTruthy();
    expect(screen.getByText("商品没写明已选版本的特殊工艺。")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "English test" }));
  });

  it("reduces generic compact-row print evidence to an accessible confirmation tag", () => {
    const confirmedCard: CardIdentityCandidate = {
      id: "swshp-SWSH144",
      name: "Greninja Gold Star",
      setName: "SWSH Black Star Promos",
      setCode: "SWSH",
      cardNumber: "SWSH144",
      language: "English",
      imageUrl: "https://images.pokemontcg.io/swshp/SWSH144.png",
      rarity: "Promo",
      confidence: "high",
      matchReasons: ["User confirmed this version."],
    };
    const listing = {
      printMatchReasons: ["pokemon_full_number_and_name_match"],
    } as NormalizedListing;

    render(<PrintIdentitySummary listing={listing} confirmedCard={confirmedCard} compact />);

    expect(screen.getByLabelText("Confirmed print: SWSH Black Star Promos · SWSH144 · Promo").textContent).toContain("✓ print");
    expect(screen.queryByText("Confirmed print:")).toBeNull();
    expect(screen.queryByText("The full collector number and card name identify the selected print.")).toBeNull();
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
        imageUrls: [
          "https://i.ebayimg.com/images/g/nami/s-l1600.jpg",
          "https://i.ebayimg.com/images/g/nami-back/s-l1600.jpg",
          "https://i.ebayimg.com/images/g/nami-closeup/s-l1600.jpg",
        ],
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
      imageUrls: ["https://i.ebayimg.com/images/g/nami-alternative/s-l1600.jpg"],
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
    const openGallery = screen.getByRole("button", { name: "Inspect 3 seller photos: Nami OP01-016 SP Special Art" });
    expect(screen.queryByRole("dialog", { name: "Seller photos" })).toBeNull();
    expect(screen.queryByAltText("Seller photo 2 of 3: Nami OP01-016 SP Special Art")).toBeNull();
    fireEvent.click(openGallery);
    const gallery = screen.getByRole("dialog", { name: "Seller photos" });
    expect(gallery.className.split(" ")).toContain("h-[100dvh]");
    expect(within(gallery).getByText("Seller-provided eBay photos. Lens TCG has not verified condition or authenticity.")).toBeTruthy();
    expect(within(gallery).getByAltText("Seller photo 1 of 3: Nami OP01-016 SP Special Art")).toBeTruthy();
    fireEvent.click(within(gallery).getByRole("button", { name: "Next photo" }));
    const secondPhoto = within(gallery).getByAltText("Seller photo 2 of 3: Nami OP01-016 SP Special Art");
    expect(secondPhoto.getAttribute("src")).toContain("nami-back");
    fireEvent.click(within(gallery).getByRole("button", { name: "Zoom in" }));
    expect(secondPhoto.className).toContain("scale-150");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Seller photos" })).toBeNull();
    expect(document.activeElement).toBe(openGallery);
    expect(screen.queryByAltText("Confirmed card reference: Nami OP01-016 Special Art (P4)")).toBeNull();
    expect(screen.getAllByText("Awakening Of The New Era · OP01-016 · SP CARD · SP artwork · Awakening Of The New Era").length).toBeGreaterThan(0);
    expect(screen.getAllByText("The listing evidence uniquely identifies the selected print.").length).toBeGreaterThan(0);
    const hero = screen.getByRole("article", { name: "Best-supported buy" });
    expect(hero.querySelector(":scope > div")?.className.split(" ")).toContain("grid-cols-[72px_minmax(0,1fr)]");
    expect(hero.querySelector(":scope > div")?.className).toContain("sm:grid-cols-[72px_minmax(0,1fr)]");

    fireEvent.click(screen.getByText("Compare 1 other eligible listing"));
    expect(screen.getByAltText("Listing photo: Nami OP01-016 P4 SP alternate seller")).toBeTruthy();
    const alternativeTitle = screen.getByRole("heading", { name: "Nami OP01-016 P4 SP alternate seller" });
    expect(alternativeTitle.className.split(" ")).not.toContain("truncate");
    expect(screen.getByRole("button", { name: "Ask about listing: Nami OP01-016 P4 SP alternate seller" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Inspect 1 seller photo: Nami OP01-016 P4 SP alternate seller" }));
    const singlePhotoGallery = screen.getByRole("dialog", { name: "Seller photos" });
    expect(within(singlePhotoGallery).getByAltText("Seller photo 1 of 1: Nami OP01-016 P4 SP alternate seller")).toBeTruthy();
    expect(within(singlePhotoGallery).queryByRole("button", { name: "Next photo" })).toBeNull();
    fireEvent.click(within(singlePhotoGallery).getByRole("button", { name: "Close seller photos" }));
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
      const confirmedCard = {
        ...identityForQuery(String(request.query)),
        name: "Nami",
        cardNumber: "OP01-016",
        setCode: "OP-01",
        setName: "Romance Dawn",
        marketMid: 128,
        marketSource: "tcgcsv" as const,
        marketAsOf: "2026-08-08T00:00:00.000Z",
        tcgplayerProductId: 123456,
        marketUrl: "https://www.tcgplayer.com/product/123456",
      };
      return new Response(JSON.stringify({
        ...reportFor(request),
        status: "partial",
        confirmedCard,
        outcome: "next_moves",
        inspectListingId: null,
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
    expect(screen.queryByRole("button", { name: "Paste a listing" })).toBeNull();
    expect(screen.getByText("One Piece Beta")).toBeTruthy();
    expect(screen.getByText("One Piece coverage is in beta and may be less stable.")).toBeTruthy();
    const followUps = screen.getByRole("region", { name: "Check other marketplaces" });
    expect(within(followUps).getByText("Market reference")).toBeTruthy();
    // Mercari and Whatnot are both plain manual checks and share the label.
    expect(within(followUps).getAllByText("Manual check")).toHaveLength(2);
    expect(within(followUps).getByText("Japan manual check")).toBeTruthy();
    // The MANUAL CHECK label is the disclaimer; a "not checked" line repeating it
    // in the fact slot was removed, and that slot now stays empty on rows that
    // carry no fact of their own.
    expect(within(followUps).queryByText("Not checked by TCGlens")).toBeNull();
    expect(within(followUps).getByText(/Prices are bid-driven/)).toBeTruthy();
    expect(within(followUps).getByText(/prices in JPY/)).toBeTruthy();
    expect(within(followUps).getByRole("link", { name: /TCGplayer/ }).getAttribute("href")).toBe("https://www.tcgplayer.com/product/123456");
    const mercariLink = within(followUps).getByRole("link", { name: /Mercari/ });
    expect(mercariLink.getAttribute("href")).toContain("mercari.com/search");
    expect(within(followUps).getByRole("link", { name: /SNKRDUNK/ }).getAttribute("href")).toContain("snkrdunk.com/search");
    // Live-auction supply the buyer may want, on a row that never claims a cost.
    const whatnotLink = within(followUps).getByRole("link", { name: /Whatnot/ });
    expect(whatnotLink.getAttribute("href")).toContain("whatnot.com/search?query=");
    expect(whatnotLink.getAttribute("href")).toContain("OP01-016");
    fireEvent.click(mercariLink);
    expect(trackEvent).toHaveBeenCalledWith("other_marketplace_clicked", { marketplace: "Mercari", game: "onePiece" });
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(await screen.findByRole("heading", { name: "暂时没有能放心买的" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "去其他平台看看" })).toBeTruthy();
    expect(screen.getByText("Mercari（煤炉）")).toBeTruthy();
    expect(screen.queryByText("Found listings, but none matched the selected SP print.")).toBeNull();
  });
});
