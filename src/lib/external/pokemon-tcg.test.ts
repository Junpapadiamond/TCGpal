import { describe, expect, it, vi } from "vitest";
import { browsePokemonCards, getPokemonCard, searchPokemonCards } from "@/lib/external/pokemon-tcg";

describe("Pokemon TCG API adapter", () => {
  it("builds a safe name query and normalizes card results", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("q")).toBe('name:"Charizard VSTAR"');
      expect(url.searchParams.get("pageSize")).toBe("4");
      expect(url.searchParams.get("select")).toBe("id,name,subtypes,number,rarity,set,images");

      return new Response(
        JSON.stringify({
          data: [
            {
              id: "swsh9-18",
              name: "Charizard VSTAR",
              number: "18",
              rarity: "Rare Holo VSTAR",
              set: {
                name: "Brilliant Stars",
                series: "Sword & Shield",
                images: { symbol: "https://example.com/brilliant-stars-symbol.png" },
              },
              images: { small: "https://example.com/small.png" },
            },
          ],
          count: 1,
          totalCount: 1,
        }),
      );
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({ query: "Charizard VSTAR", pageSize: 4, fetcher });

    expect(result.source).toBe("pokemon-tcg-api");
    expect(result.apiQuery).toBe('name:"Charizard VSTAR"');
    expect(result.cards[0]?.name).toBe("Charizard VSTAR");
    expect(result.cards[0]?.rarity).toBe("Rare Holo VSTAR");
    expect(result.cards[0]?.set?.images?.symbol).toBe("https://example.com/brilliant-stars-symbol.png");
  });

  it("keeps Mew and Mewtwo families separate while preserving explicit combo searches", async () => {
    const seenQueries: string[] = [];
    const payload = {
      data: [
        { id: "mew", name: "Mew ex", number: "1", set: { name: "Test" } },
        { id: "mewtwo", name: "Mewtwo", number: "2", set: { name: "Test" } },
        { id: "combo", name: "Mewtwo & Mew-GX", number: "3", set: { name: "Test" } },
      ],
      count: 3,
      totalCount: 3,
    };
    const fetcher = vi.fn(async (url: URL) => {
      seenQueries.push(url.searchParams.get("q") ?? "");
      return new Response(JSON.stringify(payload));
    }) as unknown as typeof fetch;

    await expect(searchPokemonCards({ query: "Mew", fetcher })).resolves.toMatchObject({
      cards: [{ id: "mew" }],
    });
    await expect(searchPokemonCards({ query: "Mewtwo & Mew-GX", fetcher })).resolves.toMatchObject({
      cards: [{ id: "combo" }],
    });
    expect(seenQueries.at(-1)).toBe("name:mewtwo* name:mew*");
  });

  it("browses cards by page without requiring a query", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("q")).toBeNull();
      expect(url.searchParams.get("page")).toBe("3");
      expect(url.searchParams.get("pageSize")).toBe("24");
      expect(url.searchParams.get("orderBy")).toBe("-set.releaseDate,name");

      return new Response(
        JSON.stringify({
          data: [
            {
              id: "sv1-1",
              name: "Sprigatito",
              number: "1",
              set: { name: "Scarlet & Violet" },
            },
          ],
          count: 1,
          totalCount: 18000,
        }),
      );
    }) as unknown as typeof fetch;

    const result = await browsePokemonCards({ page: 3, pageSize: 24, fetcher });

    expect(result.query).toBe("");
    expect(result.apiQuery).toBe("");
    expect(result.totalCount).toBe(18000);
    expect(result.cards[0]?.name).toBe("Sprigatito");
  });

  it("searches full collector numbers using the API number and printed set total", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("q")).toBe("number:215 set.printedTotal:203 set.id:swsh7");

      return new Response(JSON.stringify({
        data: [
          {
            id: "swsh7-215",
            name: "Umbreon VMAX",
            number: "215",
            set: { id: "swsh7", name: "Evolving Skies", printedTotal: 203 },
          },
        ],
        count: 1,
        totalCount: 1,
      }));
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({
      query: "Umbreon VMAX",
      cardNumber: "215/203",
      setHint: "Evolving Skies / SWSH7",
      fetcher,
    });

    expect(result.cards[0]?.id).toBe("swsh7-215");
  });

  it("drops a bad set hint instead of hiding an exact collector-number match", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      const query = url.searchParams.get("q");
      if (query?.includes("set.ptcgoCode:EVS")) {
        return new Response(JSON.stringify({ data: [], count: 0, totalCount: 0 }));
      }
      expect(query).toBe("number:215 set.printedTotal:203");
      return new Response(JSON.stringify({
        data: [
          {
            id: "swsh7-215",
            name: "Umbreon VMAX",
            number: "215",
            set: { id: "swsh7", name: "Evolving Skies", printedTotal: 203 },
          },
        ],
        count: 1,
        totalCount: 1,
      }));
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({
      query: "Umbreon VMAX",
      cardNumber: "215/203",
      setHint: "EVS",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.cards[0]?.id).toBe("swsh7-215");
  });

  it("continues to a safer name query when an exact-number query fails transiently", async () => {
    const seenQueries: string[] = [];
    const fetcher = vi.fn(async (url: URL) => {
      const query = url.searchParams.get("q") ?? "";
      seenQueries.push(query);
      if (query === "number:232 set.printedTotal:91") {
        return new Response("upstream query failed", { status: 500 });
      }
      expect(query).toBe('name:"Mew ex"');
      return new Response(JSON.stringify({
        data: [{
          id: "sv4pt5-232",
          name: "Mew ex",
          number: "232",
          set: { id: "sv4pt5", name: "Paldean Fates", printedTotal: 91 },
        }],
        count: 1,
        totalCount: 1,
      }));
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({
      query: "Mew ex",
      cardNumber: "232/091",
      fetcher,
    });

    // The exact tier is re-asked once before the ladder gives up its precision;
    // only a second failure loosens the query.
    expect(seenQueries).toEqual([
      "number:232 set.printedTotal:91",
      "number:232 set.printedTotal:91",
      'name:"Mew ex"',
    ]);
    expect(result.cards[0]?.id).toBe("sv4pt5-232");
  });

  it("continues to a safer name query when an exact-number query times out", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      const query = url.searchParams.get("q") ?? "";
      if (query === "number:232 set.printedTotal:91") {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }
      expect(query).toBe('name:"Mew ex"');
      return new Response(JSON.stringify({
        data: [{
          id: "sv4pt5-232",
          name: "Mew ex",
          number: "232",
          set: { id: "sv4pt5", name: "Paldean Fates", printedTotal: 91 },
        }],
        count: 1,
        totalCount: 1,
      }));
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({
      query: "Mew ex",
      cardNumber: "232/091",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.cards[0]?.id).toBe("sv4pt5-232");
  });

  it("stops the query ladder when the Pokemon provider is broadly unavailable", async () => {
    const fetcher = vi.fn(async () => new Response("service unavailable", { status: 503 })) as unknown as typeof fetch;

    await expect(searchPokemonCards({
      query: "Mew ex",
      cardNumber: "232/091",
      fetcher,
    })).rejects.toThrow("503");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not turn a failed exact query into a false no-match when safer queries are empty", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      if (url.searchParams.get("q") === "number:232 set.printedTotal:91") {
        return new Response("upstream query failed", { status: 500 });
      }
      return new Response(JSON.stringify({ data: [], count: 0, totalCount: 0 }));
    }) as unknown as typeof fetch;

    await expect(searchPokemonCards({
      query: "Mew ex",
      cardNumber: "232/091",
      fetcher,
    })).rejects.toThrow("500");
    // Four ladder tiers, and the failing exact tier is asked twice.
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("treats non-numeric collector placeholders as blank and searches card themes", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("q")).toBe(
        'name:"Dialga" (set.name:"Team plasma" OR set.series:"Team plasma" OR subtypes:"Team plasma")',
      );
      return new Response(JSON.stringify({
        data: [
          {
            id: "bw10-65",
            name: "Dialga-EX",
            number: "65",
            subtypes: ["Basic", "EX", "Team Plasma"],
            set: { id: "bw10", name: "Plasma Blast", printedTotal: 101 },
          },
          {
            id: "bw10-99",
            name: "Dialga-EX",
            number: "99",
            subtypes: ["Basic", "EX", "Team Plasma"],
            set: { id: "bw10", name: "Plasma Blast", printedTotal: 101 },
          },
        ],
        count: 2,
        totalCount: 2,
      }));
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({
      query: "Dialga",
      cardNumber: "N",
      setHint: "Team plasma",
      fetcher,
    });

    expect(result.cards.map((card) => card.id)).toEqual(["bw10-65", "bw10-99"]);
  });

  it("builds a relaxation ladder: exact phrase, then wildcard tokens, then loose token", async () => {
    const seen: string[] = [];
    const fetcher = vi.fn(async (url: URL) => {
      seen.push(url.searchParams.get("q") ?? "");
      return new Response(JSON.stringify({ data: [], count: 0, totalCount: 0 }));
    }) as unknown as typeof fetch;

    await searchPokemonCards({ query: "Rayquaza VMAX", fetcher });

    expect(seen).toEqual([
      'name:"Rayquaza VMAX"',
      "name:rayquaza* name:vmax*",
      "name:*rayquaza*",
    ]);
  });

  it("returns the first non-empty tier, so loose input still resolves a card", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      const q = url.searchParams.get("q") ?? "";
      if (q === "name:rayquaza* name:vmax*") {
        return new Response(JSON.stringify({
          data: [{ id: "swsh7-110", name: "Rayquaza VMAX", number: "110", set: { name: "Evolving Skies" } }],
          count: 1,
          totalCount: 1,
        }));
      }
      return new Response(JSON.stringify({ data: [], count: 0, totalCount: 0 }));
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({ query: "Rayquaza VMAX", fetcher });

    expect(result.cards[0]?.id).toBe("swsh7-110");
    // The exact phrase was tried first and came back empty before relaxing.
    expect(result.apiQuery).toBe("name:rayquaza* name:vmax*");
  });

  it("reloads a confirmed card by stable catalog id", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe("/v2/cards/swsh7-215");
      return new Response(JSON.stringify({
        data: {
          id: "swsh7-215",
          name: "Umbreon VMAX",
          number: "215",
          set: { id: "swsh7", name: "Evolving Skies", printedTotal: 203 },
        },
      }));
    }) as unknown as typeof fetch;

    const card = await getPokemonCard({ id: "swsh7-215", fetcher });

    expect(card.name).toBe("Umbreon VMAX");
  });

  it("propagates a caller cancellation into the active Pokemon API fetch", async () => {
    const controller = new AbortController();
    let upstreamSignal: AbortSignal | null = null;
    const fetcher = vi.fn((_url: URL, init?: RequestInit) => {
      upstreamSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        upstreamSignal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        }, { once: true });
      });
    }) as unknown as typeof fetch;

    const pending = searchPokemonCards({
      query: "Charizard",
      fetcher,
      signal: controller.signal,
      timeoutMs: 10_000,
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect((upstreamSignal as AbortSignal | null)?.aborted).toBe(true);
  });

  // A name-only search ("pikachu") asks for 100 candidates so the version picker
  // can show every era of the card. Silently clamping that to 50 dropped the
  // older half of the catalog before the UI ever saw it — and because the API is
  // queried with orderBy=-set.releaseDate, the half that vanished was always the
  // vintage one. The API's own ceiling is 250.
  it("requests the page size the caller asked for, up to the API maximum", async () => {
    const sizes: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      sizes.push(new URL(String(input)).searchParams.get("pageSize") ?? "");
      return { ok: true, status: 200, json: async () => ({ data: [], totalCount: 0 }) } as Response;
    }) as unknown as typeof fetch;

    await searchPokemonCards({ query: "Pikachu", pageSize: 100, relaxed: false, fetcher });
    expect(sizes[0]).toBe("100");

    sizes.length = 0;
    await searchPokemonCards({ query: "Pikachu", pageSize: 9999, relaxed: false, fetcher });
    expect(sizes[0]).toBe("250");
  });

  // The number printed on a Scarlet & Violet promo is zero-padded ("SVP EN 052")
  // while the catalog stores it bare ("52"), and the legacy promos are the other
  // way round ("SWSH050" in the catalog, often typed "SWSH50"). Lucene matches
  // the term exactly, so a single spelling silently returned nothing and the
  // search fell through to a loose name tier that confirms the wrong print.
  it("asks for every zero-padding spelling of a collector number", async () => {
    const queries: string[] = [];
    const fetcher = vi.fn(async (url: URL) => {
      queries.push(url.searchParams.get("q") ?? "");
      return new Response(JSON.stringify({ data: [], count: 0, totalCount: 0 }));
    }) as unknown as typeof fetch;

    await searchPokemonCards({ query: "Mewtwo", cardNumber: "052", setHint: "SVP", relaxed: false, fetcher });

    expect(queries[0]).toContain("number:52");
    expect(queries[0]).toContain("number:052");
    expect(queries[0]).toContain("set.id:svp");
  });

  it("keeps a prefixed promo number matchable in both padding conventions", async () => {
    const queries: string[] = [];
    const fetcher = vi.fn(async (url: URL) => {
      queries.push(url.searchParams.get("q") ?? "");
      return new Response(JSON.stringify({ data: [], count: 0, totalCount: 0 }));
    }) as unknown as typeof fetch;

    await searchPokemonCards({ query: "Charizard V", cardNumber: "SWSH50", relaxed: false, fetcher });

    expect(queries[0]).toContain("number:SWSH50");
    expect(queries[0]).toContain("number:SWSH050");
  });

  // Measured 2026-08-19, pokemontcg.io answered 14 of 24 identical requests with
  // a 500/502 — and a 5xx comes back in about a second. Treating that as "this
  // Lucene query is too expensive" and loosening to the next tier answered a
  // precise "Charizard 4/102" with whatever the newest-first name tier happened
  // to return. A server fault is worth one cheap retry on the same tier first.
  it("retries the precise tier after a fast server error instead of loosening it", async () => {
    const queries: string[] = [];
    const fetcher = vi.fn(async (url: URL) => {
      const apiQuery = url.searchParams.get("q") ?? "";
      queries.push(apiQuery);
      if (queries.length === 1) return new Response("upstream", { status: 500 });
      return new Response(JSON.stringify({
        data: [{
          id: "base1-4",
          name: "Charizard",
          number: "4",
          set: { id: "base1", name: "Base", printedTotal: 102 },
          images: { small: "https://images.pokemontcg.io/base1/4.png" },
        }],
        count: 1,
        totalCount: 1,
      }));
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({ query: "Charizard", cardNumber: "4/102", fetcher });

    expect(result.cards[0]?.id).toBe("base1-4");
    expect(queries).toHaveLength(2);
    expect(queries[0]).toBe(queries[1]);
    expect(queries[1]).toContain("set.printedTotal:102");
  });

  // A timeout means the query itself is too slow, which is exactly what the
  // looser tiers exist for — retrying it would just spend the budget twice.
  it("loosens the tier on a timeout rather than retrying the slow query", async () => {
    const queries: string[] = [];
    const fetcher = vi.fn(async (url: URL) => {
      const apiQuery = url.searchParams.get("q") ?? "";
      queries.push(apiQuery);
      if (queries.length === 1) {
        throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      }
      return new Response(JSON.stringify({
        data: [{
          id: "base1-4",
          name: "Charizard",
          number: "4",
          set: { id: "base1", name: "Base", printedTotal: 102 },
          images: { small: "https://images.pokemontcg.io/base1/4.png" },
        }],
        count: 1,
        totalCount: 1,
      }));
    }) as unknown as typeof fetch;

    await searchPokemonCards({ query: "Charizard", cardNumber: "4/102", fetcher });

    expect(queries).toHaveLength(2);
    expect(queries[0]).not.toBe(queries[1]);
  });

  // A prefixed promo code is globally unique in the catalog, so ANDing the
  // buyer's spelling of the name onto it can only lose the card: "Charizard EX
  // XY121" asked for `number:XY121 name:"Charizard EX"` and got nothing, because
  // the catalog writes that card "Charizard-EX". The ladder then loosened to a
  // name-only tier and offered modern Charizards instead of the promo.
  it("falls back to the prefixed collector code alone before loosening to the name", async () => {
    const queries: string[] = [];
    const fetcher = vi.fn(async (url: URL) => {
      const apiQuery = url.searchParams.get("q") ?? "";
      queries.push(apiQuery);
      if (apiQuery !== "number:XY121") {
        return new Response(JSON.stringify({ data: [], count: 0, totalCount: 0 }));
      }
      return new Response(JSON.stringify({
        data: [{
          id: "xyp-XY121",
          name: "Charizard-EX",
          number: "XY121",
          set: { id: "xyp", name: "XY Black Star Promos", printedTotal: 211, ptcgoCode: "PR-XY" },
        }],
        count: 1,
        totalCount: 1,
      }));
    }) as unknown as typeof fetch;

    const result = await searchPokemonCards({ query: "Charizard EX", cardNumber: "XY121", fetcher });

    expect(result.cards[0]?.id).toBe("xyp-XY121");
    expect(queries[0]).toBe('number:XY121 name:"Charizard EX"');
    expect(queries[1]).toBe("number:XY121");
  });

  // A bare number is not unique — "4" exists in almost every set — so it only
  // ever runs alongside the set total that pins it to one release.
  it("does not search a bare collector number on its own", async () => {
    const queries: string[] = [];
    const fetcher = vi.fn(async (url: URL) => {
      queries.push(url.searchParams.get("q") ?? "");
      return new Response(JSON.stringify({ data: [], count: 0, totalCount: 0 }));
    }) as unknown as typeof fetch;

    await searchPokemonCards({ query: "Charizard", cardNumber: "4/102", relaxed: false, fetcher });

    expect(queries).not.toContain("(number:4 OR number:04 OR number:004)");
  });
});
