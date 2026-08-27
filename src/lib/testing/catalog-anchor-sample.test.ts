import { describe, expect, it } from "vitest";
import { fetchCatalogAnchorSample } from "@/lib/testing/catalog-anchor-sample";

// The sample walks one card per catalogued set against a provider that answers
// roughly half of its requests with a 5xx. Left unbounded it simply runs until
// something else kills it, and being killed is the one outcome that cannot say
// whether coverage regressed or the provider was having a bad hour.
function catalogFetcher(setCount: number, onSetRequest?: () => void) {
  const sets = Array.from({ length: setCount }, (_, i) => ({
    id: `set${i}`,
    name: `Set ${i}`,
    printedTotal: 100,
    total: 100,
  }));
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/sets?")) {
      return new Response(JSON.stringify({ data: sets }), { status: 200 });
    }
    onSetRequest?.();
    const id = url.match(/set\.id:(set\d+)/)?.[1] ?? "set0";
    return new Response(
      JSON.stringify({ data: [{ id: `${id}-1`, name: "Pikachu", number: "58", set: sets.find((s) => s.id === id) }] }),
      { status: 200 },
    );
  }) as typeof fetch;
}

describe("catalog anchor sample", () => {
  it("reads every set when it has the time", async () => {
    const sample = await fetchCatalogAnchorSample({ fetcher: catalogFetcher(4) });
    expect(sample.sets).toHaveLength(4);
    expect(sample.cards).toHaveLength(4);
    expect(sample.truncated).toBe(false);
  });

  it("stops at its deadline and says the walk was cut short", async () => {
    let requests = 0;
    const fetcher = catalogFetcher(50, () => {
      requests += 1;
    });
    const sample = await fetchCatalogAnchorSample({
      fetcher,
      // Two sets' worth of budget, then the clock is past the deadline.
      deadline: () => requests >= 2,
    });
    expect(sample.truncated).toBe(true);
    expect(sample.cards.length).toBeLessThan(50);
    expect(requests).toBeLessThanOrEqual(3);
  });

  it("keeps the sets it could not read separate from the ones it never tried", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/sets?")) {
        return new Response(JSON.stringify({ data: [{ id: "set0", name: "Set 0" }] }), { status: 200 });
      }
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
    const sample = await fetchCatalogAnchorSample({ fetcher });
    expect(sample.unreadableSets).toEqual(["set0"]);
    expect(sample.truncated).toBe(false);
  });
});

describe("catalog anchor sample cache", () => {
  it("skips the fetch for sets it already has enough cards for", async () => {
    let requests = 0;
    const fetcher = catalogFetcher(3, () => {
      requests += 1;
    });
    const cache = {
      set0: [{ id: "set0-1", name: "Pikachu", setName: "Set 0", setCode: "SET0", cardNumber: "58/102" }],
      set1: [{ id: "set1-1", name: "Mew", setName: "Set 1", setCode: "SET1", cardNumber: "8/102" }],
    };
    const sample = await fetchCatalogAnchorSample({ fetcher, cache });
    expect(sample.cards).toHaveLength(3);
    // Only the uncached set costs a request; the set list itself is not counted.
    expect(requests).toBe(1);
    expect(sample.cacheMisses).toEqual(["set2"]);
  });

  it("refetches a set whose cached card no longer matches the catalogue", async () => {
    const fetcher = catalogFetcher(1);
    const sample = await fetchCatalogAnchorSample({
      fetcher,
      cache: { set0: [{ id: "", name: "", setName: "", setCode: "", cardNumber: "" }] },
    });
    expect(sample.cards[0].name).toBe("Pikachu");
    expect(sample.cacheMisses).toEqual(["set0"]);
  });

  it("reports a fresh sample for every set so the cache can be rewritten", async () => {
    const sample = await fetchCatalogAnchorSample({ fetcher: catalogFetcher(2) });
    expect(Object.keys(sample.cacheable)).toEqual(["set0", "set1"]);
    expect(sample.cacheable.set0[0].name).toBe("Pikachu");
  });
});
