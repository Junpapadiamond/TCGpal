import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCardIdentityCandidates, runListingComparison } from "./listing-compare";
import { comparisonRequestSchema } from "@/lib/schemas";
import { clearComparisonCache } from "@/lib/comparison/report-cache";
import { clearCrosswalkCache } from "@/lib/comparison/crosswalk";
import { getPokemonCardFromSnapshot } from "@/lib/external/pokemon-catalog-snapshot";

afterEach(() => { vi.useRealTimers(); clearComparisonCache(); clearCrosswalkCache(); });

const request = comparisonRequestSchema.parse({ sourceListing: { marketplace: "eBay" }, buyer: {}, cardHint: { name: "Pikachu", cardNumber: "58/102" } });

function slowCatalog() {
  return vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    if (!String(url).includes("api.pokemontcg.io")) return Promise.reject(new Error("No network in tests"));
    return new Promise<Response>((_, reject) => {
      if (init?.signal?.aborted) { reject(init.signal.reason); return; }
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
  });
}

describe("bounded catalog recovery", () => {
  it("serves a verified cached report without repeating catalog acquisition", async () => {
    const confirmed = { ...request, confirmedCardId: "base1-58" };
    const firstFetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("api.pokemontcg.io")) return Response.json({ data: getPokemonCardFromSnapshot("base1-58") });
      throw new Error("No external network");
    });
    const first = await runListingComparison(confirmed, { fetcher: firstFetcher });
    const secondFetcher = vi.fn(async () => { throw new Error("Cached reports must not reacquire identity"); });
    const second = await runListingComparison(confirmed, { fetcher: secondFetcher });
    expect(secondFetcher).not.toHaveBeenCalled();
    expect(second.generatedAt).toBe(first.generatedAt);
  });
  it("returns known versions within 1.5s of a stalled live catalog", async () => {
    vi.useFakeTimers();
    const fetcher = slowCatalog();
    let settled = false;
    const result = resolveCardIdentityCandidates(request, { fetcher }).then(value => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(1600);
    try {
      expect(settled).toBe(true);
      expect((await result).confirmedCard?.id).toBe("base1-58");
      expect((await result).warnings.join(" ")).toContain("snapshot");
    } finally { await vi.advanceTimersByTimeAsync(40_000); }
  });

  it("recovers the confirmed ID directly without another name search", async () => {
    vi.useFakeTimers();
    const fetcher = slowCatalog();
    let settled = false;
    const result = runListingComparison({ ...request, confirmedCardId: "base1-58" }, { fetcher, agents: [] })
      .then(value => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(1600);
    try {
      expect(settled).toBe(true);
      expect((await result).confirmedCard?.id).toBe("base1-58");
      expect(fetcher.mock.calls.filter(([url]) => String(url).includes("api.pokemontcg.io"))).toHaveLength(1);
    } finally { await vi.advanceTimersByTimeAsync(40_000); }
  });

  it("does not turn user cancellation into snapshot fallback", async () => {
    const controller = new AbortController();
    const pending = resolveCardIdentityCandidates(request, { fetcher: slowCatalog(), signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await assertion;
  });
});
